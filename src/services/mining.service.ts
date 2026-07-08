import { isAddress, parseEventLogs, type Address, type Log } from 'viem';

import type {
    AppConfig,
    MiningClaimResult,
    MiningServiceOptions,
    MiningStatusResult,
    StartMiningInput,
    StartMiningResult,
    IAppConfig,
    ICellClient,
} from './types.js';
import { BuildingKind, type BuildingView } from '../api/types.js';
import { CELL_ABI } from '../contracts/cell.abi.js';
import type { ILogger } from '../logger/types.js';
import { capByRoom } from '../map/storage.utils.js';
import { CellProcessKind, type CellState, type RevealCellReader } from '../map/types.js';
import { formatUnixSeconds, resourceLabel } from '../utils/format.utils.js';
import type { IContractClient, WalletProvider } from '../wallet/types.js';

export class MiningService {
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly cellClient: ICellClient;
    private readonly contracts: IContractClient;
    private readonly mapReader: RevealCellReader;
    private readonly logger: ILogger;

    constructor(options: MiningServiceOptions) {
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.cellClient = options.cellClient;
        this.contracts = options.contracts;
        this.mapReader = options.mapReader;
        this.logger = options.logger;
    }

    async getStatus(tokenId: string): Promise<MiningStatusResult> {
        await this.mapReader.refresh();
        const state = this.mapReader.readRevealCell(tokenId);
        if (state === null) {
            throw new Error(`Cell ${tokenId} is not in the current map.`);
        }

        const process = state.process;
        if (process === null || process.kind !== CellProcessKind.Mining) {
            return {
                tokenId,
                active: false,
                targetResourceId: null,
                rate: null,
                startAt: null,
                claimable: '0',
                depositRemaining: '0',
                stalled: false,
                warehouseUsed: null,
                warehouseCap: null,
            };
        }

        const resource = state.resources.find((r) => r.resourceId === process.resource) ?? null;
        const deposit = resource?.deposit ?? '0';
        const storage = resource?.storage ?? null;
        const nowSec = BigInt(Math.floor(Date.now() / 1000));
        const startAt = BigInt(process.startAt);
        const elapsed = nowSec > startAt ? nowSec - startAt : 0n;
        const accrued = BigInt(process.rate) * elapsed;
        const depositRemaining = BigInt(deposit);

        // On-chain the miner banks min(accrued, deposit, room); mirror that so a full box reports ~0
        // claimable instead of a phantom amount.
        const bankable = accrued < depositRemaining ? accrued : depositRemaining;
        const claimable = capByRoom(bankable, storage);

        return {
            tokenId,
            active: true,
            targetResourceId: process.resource,
            rate: process.rate,
            startAt: process.startAt,
            claimable: claimable.toString(),
            depositRemaining: deposit,
            stalled: process.stalled,
            warehouseUsed: storage?.used ?? null,
            warehouseCap: storage?.cap ?? null,
        };
    }

    async claim(tokenId: string): Promise<MiningClaimResult> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();
        if (config.chainId !== wallet.getChainId()) {
            throw new Error(
                `Chain mismatch: the chain config is chainId ${config.chainId} but the wallet is on ${wallet.getChainId()}. Check NETWORK.`,
            );
        }

        const cell = config.contracts.cell;
        if (!isAddress(cell, { strict: false })) {
            throw new Error(`Cell contract is not configured for network ${config.network}; cannot claim.`);
        }

        this.logger.info('claiming mined resources', { tokenId });
        const txHash = await this.cellClient.claim({ cell, tokenId: BigInt(tokenId) });
        const confirmed = await this.contracts.confirm(txHash, 'Mining claim');
        const mined = this.decodeMined(confirmed.logs, cell);

        return {
            tokenId,
            resourceId: mined?.resource ?? null,
            claimedAmount: (mined?.amount ?? 0n).toString(),
            txHash: confirmed.txHash,
            status: confirmed.status,
            blockNumber: confirmed.blockNumber,
        };
    }

    async startMining(input: StartMiningInput): Promise<StartMiningResult> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();
        if (config.chainId !== wallet.getChainId()) {
            throw new Error(
                `Chain mismatch: the chain config is chainId ${config.chainId} but the wallet is on ${wallet.getChainId()}. Check NETWORK.`,
            );
        }

        const cell = config.contracts.cell;
        if (!isAddress(cell, { strict: false })) {
            throw new Error(`Cell contract is not configured for network ${config.network}; cannot start mining.`);
        }

        await this.mapReader.refresh();
        const state = this.mapReader.readRevealCell(input.tokenId);
        const target = this.resolveMiningTarget(config, state, input, wallet.getAddress());

        this.logger.info('starting mining', { tokenId: input.tokenId, target });
        const txHash = await this.cellClient.startMining({ cell, tokenId: BigInt(input.tokenId), target });
        const confirmed = await this.contracts.confirm(txHash, 'Start mining');
        const started = this.decodeStarted(confirmed.logs, cell);

        return {
            tokenId: input.tokenId,
            targetResourceId: target,
            rate: started?.rate ?? null,
            txHash: confirmed.txHash,
            status: confirmed.status,
            blockNumber: confirmed.blockNumber,
        };
    }

    private resolveMiningTarget(
        config: AppConfig,
        state: CellState | null,
        input: StartMiningInput,
        address: string,
    ): number {
        if (state === null) {
            throw new Error(`Cell ${input.tokenId} is not in the current map; reveal it or wait for the map to sync.`);
        }
        if (state.owner.toLowerCase() !== address.toLowerCase()) {
            throw new Error(`You do not own cell ${input.tokenId} (owner ${state.owner}); only the owner can mine.`);
        }
        if (state.building === null) {
            throw new Error(`Cell ${input.tokenId} has no building; build an extractor first, then start mining.`);
        }
        const view = config.buildings.find((b) => b.type === state.building?.type) ?? null;
        if (view === null || view.kind !== BuildingKind.Extractor) {
            const name = view?.name ?? state.building.type;
            throw new Error(
                `The ${name} on cell ${input.tokenId} is not an extractor and cannot mine — crafters run cpu_craft.`,
            );
        }
        if (state.building.buildFinishAt !== null && state.building.buildFinishAt > Math.floor(Date.now() / 1000)) {
            throw new Error(
                `The ${view.name} on cell ${input.tokenId} is still under construction (ready ` +
                    `${formatUnixSeconds(state.building.buildFinishAt)}); start mining once it finishes.`,
            );
        }
        if (state.process !== null) {
            throw new Error(
                `Cell ${input.tokenId} has an active ${state.process.kind} process; ` +
                    `claim or finish it before starting (or switching) mining.`,
            );
        }

        const target = this.pickTarget(view, input.targetResourceId, config);
        const deposit = state.resources.find((r) => r.resourceId === target)?.deposit ?? '0';
        if (BigInt(deposit) === 0n) {
            throw new Error(
                `Cell ${input.tokenId} has no ${resourceLabel(config.resources, target)} deposit to mine ` +
                    `(it may be depleted or was never revealed here).`,
            );
        }
        return target;
    }

    private pickTarget(view: BuildingView, requested: number | null, config: AppConfig): number {
        const minable = view.minableResources;
        if (requested !== null) {
            if (!minable.includes(requested)) {
                const options = minable.map((id) => resourceLabel(config.resources, id)).join(', ');
                throw new Error(
                    `The ${view.name} cannot mine ${resourceLabel(config.resources, requested)}; it mines: ${options}.`,
                );
            }
            return requested;
        }
        const [sole] = minable;
        if (sole !== undefined && minable.length === 1) {
            return sole;
        }
        const options = minable.map((id) => resourceLabel(config.resources, id)).join(', ');
        throw new Error(
            `The ${view.name} can mine multiple resources (${options}); pass targetResourceId to pick one.`,
        );
    }

    private decodeMined(logs: Array<Log>, cell: Address): { resource: number; amount: bigint } | null {
        const events = parseEventLogs({ abi: CELL_ABI, eventName: 'ResourceMined', logs });
        const event = events.find((e) => e.address.toLowerCase() === cell.toLowerCase());
        if (event === undefined) {
            return null;
        }
        return { resource: event.args.resource, amount: event.args.amount };
    }

    private decodeStarted(logs: Array<Log>, cell: Address): { resource: number; rate: number } | null {
        const events = parseEventLogs({ abi: CELL_ABI, eventName: 'MiningStarted', logs });
        const event = events.find((e) => e.address.toLowerCase() === cell.toLowerCase());
        if (event === undefined) {
            return null;
        }
        return { resource: event.args.resource, rate: event.args.rate };
    }
}
