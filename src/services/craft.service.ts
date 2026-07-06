import { isAddress, parseEther, parseEventLogs, type Address, type Log } from 'viem';

import { recipeNameFromUint64, recipeNameToUint64 } from './cell.utils.js';
import type {
    AppConfig,
    CraftClaimResult,
    CraftInput,
    CraftOutput,
    CraftServiceOptions,
    CraftStartResult,
    CraftStatusResult,
    IAllowanceService,
    IAppConfig,
    ICellClient,
} from './types.js';
import { CELL_ABI } from '../contracts/cell.abi.js';
import type { ILogger } from '../logger/types.js';
import { CellProcessKind, type RevealCellReader } from '../map/types.js';
import { cpuFromWei } from '../utils/format.utils.js';
import type { IContractClient, WalletManager, WalletProvider } from '../wallet/types.js';

export class CraftService {
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly allowance: IAllowanceService;
    private readonly cellClient: ICellClient;
    private readonly contracts: IContractClient;
    private readonly mapReader: RevealCellReader;
    private readonly logger: ILogger;

    constructor(options: CraftServiceOptions) {
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.allowance = options.allowance;
        this.cellClient = options.cellClient;
        this.contracts = options.contracts;
        this.mapReader = options.mapReader;
        this.logger = options.logger;
    }

    async craft(input: CraftInput): Promise<CraftStartResult> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();
        this.assertChain(config, wallet);

        const cell = this.requireCell(config);
        const recipe = config.recipes.find((r) => r.id === input.recipeId);
        if (recipe === undefined) {
            throw new Error(`Recipe ${input.recipeId} is not available on network ${config.network}.`);
        }

        const totalCostWei = parseEther(recipe.costCpu) * BigInt(input.batches);
        let approveTxHash = null;
        if (totalCostWei > 0n) {
            const cpuToken = this.requireCpuToken(config);
            approveTxHash = await this.allowance.ensureAllowance(cpuToken, cell, totalCostWei);
        }

        this.logger.info('starting craft', {
            tokenId: input.tokenId,
            recipeId: input.recipeId,
            batches: input.batches,
            costCpu: cpuFromWei(totalCostWei.toString()),
        });
        const txHash = await this.cellClient.startCraft({
            cell,
            tokenId: BigInt(input.tokenId),
            recipeId: recipeNameToUint64(input.recipeId),
            batches: input.batches,
        });
        const confirmed = await this.contracts.confirm(txHash, 'Craft transaction');

        return {
            tokenId: input.tokenId,
            recipeId: input.recipeId,
            batches: input.batches,
            costCpu: cpuFromWei(totalCostWei.toString()),
            approveTxHash,
            txHash: confirmed.txHash,
            status: confirmed.status,
            blockNumber: confirmed.blockNumber,
        };
    }

    async claim(tokenId: string): Promise<CraftClaimResult> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();
        this.assertChain(config, wallet);

        const cell = this.requireCell(config);
        this.logger.info('claiming craft outputs', { tokenId });
        const txHash = await this.cellClient.claim({ cell, tokenId: BigInt(tokenId) });
        const confirmed = await this.contracts.confirm(txHash, 'Craft claim');
        const claimed = this.decodeClaimed(confirmed.logs, cell);

        return {
            tokenId,
            recipeId: claimed !== null ? recipeNameFromUint64(claimed.recipeId) : null,
            batches: claimed?.batches ?? 0,
            outputs: claimed?.outputs ?? [],
            txHash: confirmed.txHash,
            status: confirmed.status,
            blockNumber: confirmed.blockNumber,
        };
    }

    async getStatus(tokenId: string): Promise<CraftStatusResult> {
        await this.mapReader.refresh();
        const state = this.mapReader.readRevealCell(tokenId);
        if (state === null) {
            throw new Error(`Cell ${tokenId} is not in the current map.`);
        }

        const process = state.process;
        if (process === null || process.kind !== CellProcessKind.Craft) {
            return {
                tokenId,
                active: false,
                recipeId: null,
                batches: 0,
                claimedBatches: 0,
                maturedBatches: 0,
                claimableBatches: 0,
                startAt: null,
                durationSec: null,
            };
        }

        const nowSec = Math.floor(Date.now() / 1000);
        const elapsed = Math.max(0, nowSec - process.startAt);
        const matured =
            process.durationSec > 0
                ? Math.min(process.batches, Math.floor(elapsed / process.durationSec))
                : process.batches;
        const claimableBatches = Math.max(0, matured - process.claimedBatches);

        return {
            tokenId,
            active: true,
            recipeId: process.recipeId,
            batches: process.batches,
            claimedBatches: process.claimedBatches,
            maturedBatches: matured,
            claimableBatches,
            startAt: process.startAt,
            durationSec: process.durationSec,
        };
    }

    private decodeClaimed(
        logs: Array<Log>,
        cell: Address,
    ): { recipeId: bigint; batches: number; outputs: Array<CraftOutput> } | null {
        const events = parseEventLogs({ abi: CELL_ABI, eventName: 'CraftClaimed', logs });
        const event = events.find((e) => e.address.toLowerCase() === cell.toLowerCase());
        if (event === undefined) {
            return null;
        }
        const outputs = event.args.outputResources.map((resourceId, i) => ({
            resourceId,
            amount: (event.args.outputAmounts[i] ?? 0n).toString(),
        }));
        return { recipeId: event.args.recipeId, batches: event.args.batches, outputs };
    }

    private assertChain(config: AppConfig, wallet: WalletManager): void {
        if (config.chainId !== wallet.getChainId()) {
            throw new Error(
                `Chain mismatch: the chain config is chainId ${config.chainId} but the wallet is on ${wallet.getChainId()}. Check NETWORK.`,
            );
        }
    }

    private requireCell(config: AppConfig): Address {
        const cell = config.contracts.cell;
        if (!isAddress(cell, { strict: false })) {
            throw new Error(`Cell contract is not configured for network ${config.network}; cannot craft.`);
        }
        return cell;
    }

    private requireCpuToken(config: AppConfig): Address {
        const cpuToken = config.contracts.cpuToken;
        if (!isAddress(cpuToken, { strict: false })) {
            throw new Error(`$CPU token is not configured for network ${config.network}; cannot pay for craft.`);
        }
        return cpuToken;
    }
}
