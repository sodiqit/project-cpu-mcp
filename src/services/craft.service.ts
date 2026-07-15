import { isAddress, parseEther, parseEventLogs, type Address, type Hash, type Log } from 'viem';

import { MAX_APPROVE_AMOUNT } from './allowance.constants.js';
import { decodeBurnedCpu, feeWeiOf } from './burn.utils.js';
import { recipeNameFromUint64, recipeNameToUint64 } from './cell.utils.js';
import {
    type AppConfig,
    type CraftClaimResult,
    type CraftInput,
    type CraftOutput,
    type CraftServiceOptions,
    type CraftStartResult,
    type CraftStatusResult,
    type ModeCostView,
    type ModeSwitchCharge,
    type IAllowanceService,
    type IAppConfig,
    type ICellClient,
    ModeCostKind,
} from './types.js';
import { assertWarehouseHas } from './warehouse.utils.js';
import type { CraftRecipeId } from '../api/types.js';
import { CELL_ABI } from '../contracts/cell.abi.js';
import type { ILogger } from '../logger/types.js';
import { modeCost } from '../map/mode.utils.js';
import { processOutputs } from '../map/process.utils.js';
import { toSettleConfig } from '../map/reader.utils.js';
import { cellProcessProgress } from '../map/settle.utils.js';
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

        const recipeCostWei = parseEther(recipe.costCpu) * BigInt(input.batches);
        const tokenId = BigInt(input.tokenId);
        const targetRecipe = recipeNameToUint64(input.recipeId);
        const view = config.buildings.find((b) => b.type === state?.building?.type) ?? null;
        const { mode, exact } = await this.readChainMode(cell, tokenId, state?.building?.modeRecipeId ?? null);
        const cost = modeCost(view, mode, targetRecipe);
        const approveTxHash = await this.approve(config, cell, recipeCostWei, cost);

        this.logger.info('starting craft', {
            tokenId: input.tokenId,
            recipeId: input.recipeId,
            batches: input.batches,
            costCpu: cpuFromWei(recipeCostWei.toString()),
            switchCost: cost,
            switchCostExact: exact,
        });
        const txHash = await this.cellClient.startCraft({
            cell,
            tokenId,
            recipeId: targetRecipe,
            batches: input.batches,
        });
        const confirmed = await this.contracts.confirm(txHash, 'Craft transaction');

        return {
            tokenId: input.tokenId,
            recipeId: input.recipeId,
            batches: input.batches,
            costCpu: cpuFromWei(recipeCostWei.toString()),
            modeSwitch: this.chargeOf(config, cost, exact, confirmed.logs, recipeCostWei),
            approveTxHash,
            txHash: confirmed.txHash,
            status: confirmed.status,
            blockNumber: confirmed.blockNumber,
        };
    }

    // Same reasoning as the mining start: the mode is verified on-chain because an understated fee cannot
    // revert against an unbounded allowance, and a failed read never blocks the start.
    private async readChainMode(
        cell: Address,
        tokenId: bigint,
        fallback: string | null,
    ): Promise<{ mode: bigint | null; exact: boolean }> {
        try {
            const view = await this.cellClient.readCellView(cell, tokenId);
            return { mode: view.modeRecipeId === 0n ? null : view.modeRecipeId, exact: true };
        } catch (error) {
            this.logger.warn('could not read the cell mode on-chain — pricing the switch off the map', {
                tokenId: tokenId.toString(),
                error,
            });
            // Hashed rather than looked up by name, so a recipe this client does not know still compares.
            return { mode: fallback === null ? null : recipeNameToUint64(fallback as CraftRecipeId), exact: false };
        }
    }

    // The contract burns `recipe cost × batches + fee` in one call, so one allowance covers both.
    private async approve(
        config: AppConfig,
        cell: Address,
        recipeCostWei: bigint,
        cost: ModeCostView,
    ): Promise<Hash | null> {
        const totalWei = recipeCostWei + feeWeiOf(cost);
        if (totalWei === 0n && cost.kind !== ModeCostKind.Unknown) {
            return null;
        }
        const cpuToken = this.requireCpuToken(config);
        const needed = cost.kind === ModeCostKind.Unknown ? MAX_APPROVE_AMOUNT : totalWei;
        return this.allowance.ensureAllowance(cpuToken, cell, needed);
    }

    private chargeOf(
        config: AppConfig,
        cost: ModeCostView,
        exact: boolean,
        logs: Array<Log>,
        recipeCostWei: bigint,
    ): ModeSwitchCharge {
        const cpuToken = config.contracts.cpuToken;
        if (!isAddress(cpuToken, { strict: false })) {
            return { cost, exact, burnedCpu: null };
        }
        const burned = decodeBurnedCpu(logs, cpuToken, this.wallet.get().getAddress());
        return { cost, exact, burnedCpu: cpuFromWei((burned - recipeCostWei).toString()) };
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
            claimedBatches: claimed?.claimedBatches ?? null,
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
        const config = await this.appConfig.load();
        const settleConfig = toSettleConfig(config);
        const { progress } = cellProcessProgress(state, process, serverTime, settleConfig);
        const outputs = processOutputs(process, settleConfig.craftOutputsByRecipe);

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
    ): { recipeId: bigint; batches: number; claimedBatches: number; outputs: Array<CraftOutput> } | null {
        const events = parseEventLogs({ abi: CELL_ABI, eventName: 'CraftClaimed', logs });
        const event = events.find((e) => e.address.toLowerCase() === cell.toLowerCase());
        if (event === undefined) {
            return null;
        }
        const outputs = event.args.outputResources.map((resourceId, i) => ({
            resourceId,
            amount: (event.args.outputAmounts[i] ?? 0n).toString(),
        }));
        return {
            recipeId: event.args.recipeId,
            batches: event.args.batches,
            claimedBatches: event.args.claimedBatches,
            outputs,
        };
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
