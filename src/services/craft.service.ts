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
import { assertWarehouseHas } from './warehouse.utils.js';
import { CELL_ABI } from '../contracts/cell.abi.js';
import type { ILogger } from '../logger/types.js';
import { computeBatchSchedule, toProcessProgress } from '../map/process.utils.js';
import { settleCraft } from '../map/settle.utils.js';
import { blockedResourceIds } from '../map/storage.utils.js';
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

        // Paid action — refresh, then verify the warehouse holds the per-batch inputs × batches before spending
        // gas, instead of letting startCraft revert InsufficientLiquid after the $CPU approve.
        await this.mapReader.refresh();
        const state = await this.mapReader.readRevealCell(input.tokenId);
        const required = recipe.inputs.map((i) => ({ resourceId: i.resourceId, amount: i.amount * input.batches }));
        assertWarehouseHas(config.resources, state, required, input.tokenId, 'craft');

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
        const state = await this.mapReader.readRevealCell(tokenId);
        if (state === null) {
            throw new Error(`Cell ${tokenId} is not in the current map.`);
        }

        const process = state.process;
        if (process === null || process.kind !== CellProcessKind.Craft) {
            return {
                tokenId,
                active: false,
                serverTime: this.mapReader.getServerTime(),
                recipeId: null,
                batches: 0,
                claimedBatches: 0,
                completedBatches: 0,
                claimableBatches: 0,
                isFinished: false,
                startAt: null,
                durationSec: null,
                endsAtSec: null,
                nextBatchAtSec: null,
                stalled: false,
                blockedResourceIds: [],
            };
        }

        const serverTime = this.mapReader.getServerTime();
        const schedule = computeBatchSchedule({
            durationSec: process.durationSec,
            batches: process.batches,
            claimedBatches: process.claimedBatches,
            startAtSec: process.startAt,
            nowSec: serverTime,
        });
        const config = await this.appConfig.load();
        const outputs = config.recipes.find((r) => r.id === process.recipeId)?.outputs ?? [];
        // Matured batches only bank while every output fits; mirror the on-chain fitByRoom so a blocked
        // output box reports 0 claimable instead of a phantom count (same room shape as mining).
        const settlement = settleCraft({
            outputs,
            maturedBatches: schedule.maturedBatches,
            resources: state.resources,
        });
        const progress = toProcessProgress({
            schedule,
            claimedBatches: process.claimedBatches,
            settledBatches: settlement.settledBatches,
            depleted: settlement.depleted,
            stalled: process.stalled,
        });

        return {
            tokenId,
            active: true,
            serverTime,
            recipeId: process.recipeId,
            batches: process.batches,
            claimedBatches: process.claimedBatches,
            ...progress,
            startAt: process.startAt,
            durationSec: process.durationSec,
            stalled: process.stalled,
            blockedResourceIds: blockedResourceIds(outputs, state.resources),
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
