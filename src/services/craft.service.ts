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
import type { CraftStackView } from '../api/types.js';
import { CELL_ABI } from '../contracts/cell.abi.js';
import type { ILogger } from '../logger/types.js';
import { computeMaturation } from '../map/process.utils.js';
import { warehouseRoom } from '../map/storage.utils.js';
import { type CellResource, CellProcessKind, type RevealCellReader } from '../map/types.js';
import { cpuFromWei } from '../utils/format.utils.js';
import type { IContractClient, WalletManager, WalletProvider } from '../wallet/types.js';

// Whole batches that fit given the room in every output box (min over outputs); null when no output is
// capped (unbounded). Mirrors the on-chain fitByRoom = min(room[out] / outputAmount).
function fitBatchesByRoom(outputs: Array<CraftStackView>, resources: Array<CellResource>): number | null {
    let fit: bigint | null = null;
    for (const out of outputs) {
        const storage = resources.find((r) => r.resourceId === out.resourceId)?.storage ?? null;
        const room = warehouseRoom(storage);
        if (room === null) {
            continue;
        }
        const amount = BigInt(out.amount);
        const batches = amount > 0n ? room / amount : room;
        fit = fit === null || batches < fit ? batches : fit;
    }
    return fit === null ? null : Number(fit);
}

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
                stalled: false,
                blockedResourceIds: [],
            };
        }

        const { cycles } = computeMaturation({
            startAt: process.startAt,
            durationSec: process.durationSec,
            now: this.mapReader.getServerTime(),
        });
        const matured = process.durationSec > 0 ? Math.min(process.batches, cycles) : process.batches;
        const config = await this.appConfig.load();
        const outputs = config.recipes.find((r) => r.id === process.recipeId)?.outputs ?? [];
        // Matured batches only bank while every output fits; mirror the on-chain fitByRoom so a full
        // output box reports 0 claimable instead of a phantom count (same room shape as mining).
        const matureClaimable = Math.max(0, matured - process.claimedBatches);
        const batchesThatFit = fitBatchesByRoom(outputs, state.resources);
        const claimableBatches = batchesThatFit === null ? matureClaimable : Math.min(matureClaimable, batchesThatFit);
        const blockedResourceIds = outputs
            .map((o) => o.resourceId)
            .filter((id) => state.resources.find((r) => r.resourceId === id)?.storage?.stalled === true);

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
            stalled: process.stalled,
            blockedResourceIds,
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
