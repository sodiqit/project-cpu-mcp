import { isAddress, parseEventLogs, type Address, type Log } from 'viem';

import type { MiningClaimResult, MiningServiceOptions, MiningStatusResult, IAppConfig, ICellClient } from './types.js';
import { CELL_ABI } from '../contracts/cell.abi.js';
import type { ILogger } from '../logger/types.js';
import { CellProcessKind, type RevealCellReader } from '../map/types.js';
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

        // On-chain the miner banks min(accrued, deposit, room) where room = cap − used; mirror that so a
        // full box reports ~0 claimable instead of a phantom amount. A null cap means uncapped (no room limit).
        let claimable = accrued < depositRemaining ? accrued : depositRemaining;
        if (storage !== null && storage.cap !== null) {
            const used = BigInt(storage.used);
            const cap = BigInt(storage.cap);
            const room = cap > used ? cap - used : 0n;
            if (room < claimable) {
                claimable = room;
            }
        }

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

    private decodeMined(logs: Array<Log>, cell: Address): { resource: number; amount: bigint } | null {
        const events = parseEventLogs({ abi: CELL_ABI, eventName: 'ResourceMined', logs });
        const event = events.find((e) => e.address.toLowerCase() === cell.toLowerCase());
        if (event === undefined) {
            return null;
        }
        return { resource: event.args.resource, amount: event.args.amount };
    }
}
