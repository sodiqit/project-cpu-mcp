import type { Abi, Address, Hash, Hex, Log } from 'viem';

import type { ApiClient } from '../../api/client.js';
import { BuildingKind, BuildingType, CraftRecipeId } from '../../api/types.js';
import { Network } from '../../config/types.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import type { ILogger } from '../../logger/types.js';
import { toCell } from '../../map/cell-view.utils.js';
import { toProjectionConfig } from '../../map/reader.utils.js';
import type { Cell, RawCell, RevealCellReader } from '../../map/types.js';
import {
    type ConfirmedTx,
    type IContractClient,
    type ReadContractParams,
    type TransactionRequest,
    type TxReceipt,
    TxStatus,
    type WalletManager,
    type WalletProvider,
} from '../../wallet/types.js';
import { CellClient } from '../cell.client.js';
import type { AppConfig, IAllowanceService, IAppConfig, ICellClient } from '../types.js';

/**
 * Shared in-memory doubles for the paid-action services (build / reveal / transport / craft), which
 * all take the same `{ api, wallet, appConfig, allowance, logger }` dependencies.
 */

export const CPU_TOKEN = '0x2222222222222222222222222222222222222222';
export const LAND = '0x3333333333333333333333333333333333333333';
export const CPU_HOOK = '0x4444444444444444444444444444444444444444';
export const CELL = '0x5555555555555555555555555555555555555555';
export const CELL_LENS = '0x6666666666666666666666666666666666666666';
export const TRANSPORT = '0x7777777777777777777777777777777777777777';
export const TRADE = '0x8888888888888888888888888888888888888888';
export const WALLET_ADDRESS = '0x000000000000000000000000000000000000dEaD' as Address;
export const APPROVE_HASH = `0x${'c'.repeat(64)}` as Hash;
export const R = `0x${'a'.repeat(64)}` as Hex;
export const S = `0x${'b'.repeat(64)}` as Hex;

export function makeConfig(cpuToken: string = CPU_TOKEN): AppConfig {
    return {
        network: Network.ETHEREUM,
        chainId: 1,
        contracts: {
            land: LAND,
            cpuToken,
            cpuHook: CPU_HOOK,
            cell: CELL,
            cellLens: CELL_LENS,
            transport: TRANSPORT,
            trade: TRADE,
        },
        resources: { 1: 'WCPU', 5: 'Iron', 6: 'Copper', 101: 'Concrete', 102: 'Steel' },
        recipes: [
            {
                id: CraftRecipeId.SmeltSteel,
                name: 'Smelt Steel',
                tier: 2,
                inputs: [{ resourceId: 5, amount: 4 }],
                outputs: [{ resourceId: 102, amount: 2 }],
                durationSec: 60,
                costCpu: '0',
            },
            {
                id: CraftRecipeId.ForgeWcpu,
                name: 'CPU Forge',
                tier: 5,
                inputs: [],
                outputs: [{ resourceId: 1, amount: 1 }],
                durationSec: 3600,
                costCpu: '100',
            },
        ],
        buildings: [
            {
                type: BuildingType.Mine,
                onChainId: 4,
                name: 'Mine',
                kind: BuildingKind.Extractor,
                tier: 1,
                buildCost: '5',
                buildTimeSec: 120,
                buildInputs: [],
                demolishCost: { cpu: '2.5', inputs: [] },
                minableResources: [5, 6],
                recipes: [],
            },
            {
                type: BuildingType.SteelMill,
                onChainId: 11,
                name: 'Steel Mill',
                kind: BuildingKind.Crafter,
                tier: 2,
                buildCost: '20',
                buildTimeSec: 900,
                buildInputs: [{ resourceId: 101, amount: 8 }],
                demolishCost: { cpu: '10', inputs: [{ resourceId: 101, amount: 2 }] },
                minableResources: [],
                recipes: [CraftRecipeId.SmeltSteel],
            },
            {
                type: BuildingType.Hub,
                onChainId: 23,
                name: 'Hub',
                kind: BuildingKind.Hub,
                tier: 1,
                buildCost: '40',
                buildTimeSec: 120,
                buildInputs: [],
                demolishCost: { cpu: '20', inputs: [] },
                minableResources: [],
                recipes: [],
            },
        ],
        reveal: { firstFree: true, reRevealCost: '0' },
        transport: { moveRadius: 1, hubRadius: 3, moveTimePerCellSec: 2, defaultMoveFeePerUnit: '0' },
        trade: { saleBurnPercent: 1, maxSaleFeePercent: 50 },
        storage: { hubStorageMultiplier: 10 },
    };
}

export class FakeAppConfig implements IAppConfig {
    constructor(private readonly config: AppConfig) {}
    async load(): Promise<AppConfig> {
        return this.config;
    }
}

export interface RecordedCall {
    method: string;
    path: string;
    body: unknown;
    authenticated: boolean;
}

export class FakeApi {
    public readonly calls: Array<RecordedCall> = [];
    constructor(private readonly response: { status: number; data: unknown }) {}

    async authenticatedRequest(
        path: string,
        options: { method: string; body: unknown } | null = null,
    ): Promise<{ status: number; data: unknown }> {
        this.calls.push({ method: options?.method ?? 'GET', path, body: options?.body ?? null, authenticated: true });
        return this.response;
    }

    async request(
        path: string,
        options: { method: string; body: unknown } | null = null,
    ): Promise<{ status: number; data: unknown }> {
        this.calls.push({ method: options?.method ?? 'GET', path, body: options?.body ?? null, authenticated: false });
        return this.response;
    }
}

export class FakeAllowance implements IAllowanceService {
    public readonly calls: Array<{ token: string; spender: string; needed: bigint }> = [];
    constructor(private readonly result: Hash | null | Error = null) {}
    async ensureAllowance(token: Address, spender: Address, needed: bigint): Promise<Hash | null> {
        this.calls.push({ token, spender, needed });
        if (this.result instanceof Error) {
            throw this.result;
        }
        return this.result;
    }
}

export class FakeWallet implements WalletManager, WalletProvider {
    public readonly sent: Array<TransactionRequest> = [];
    public readonly reads: Array<ReadContractParams> = [];
    private receiptIndex = 0;

    constructor(
        private readonly chainId: number,
        private readonly receipts: Array<TxStatus> = [],
        private readonly usedSignId: boolean = false,
    ) {}

    get(): WalletManager {
        return this;
    }
    isReady(): boolean {
        return true;
    }
    getAddress(): Address {
        return WALLET_ADDRESS;
    }
    getChainId(): number {
        return this.chainId;
    }
    async sendTransaction(tx: TransactionRequest): Promise<Hash> {
        this.sent.push(tx);
        return `0x${String(this.sent.length).padStart(64, '0')}` as Hash;
    }
    async waitForReceipt(hash: Hash): Promise<TxReceipt> {
        const status = this.receipts[this.receiptIndex] ?? TxStatus.Success;
        this.receiptIndex += 1;
        return { status, transactionHash: hash, blockNumber: 100n, logs: [] };
    }
    async readContract(params: ReadContractParams): Promise<unknown> {
        this.reads.push(params);
        return this.usedSignId;
    }
    async getBalance(): Promise<bigint> {
        return 0n;
    }
    async signMessage(): Promise<Hex> {
        return '0x';
    }
}

/** The common dependency bundle every paid-action service constructor accepts. */
export interface PaidServiceOptions {
    api: ApiClient;
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    logger: ILogger;
}

export type HarnessOptions = { response: { status: number; data: unknown } } & Partial<{
    receipts: Array<TxStatus>;
    walletChainId: number;
    usedSignId: boolean;
    config: AppConfig;
    approve: Hash | null | Error;
}>;

export interface Harness<T> {
    service: T;
    api: FakeApi;
    wallet: FakeWallet;
    allowance: FakeAllowance;
}

/** Wires the fakes into a service built by `create`, returning the service plus the doubles to assert on. */
export function makeHarness<T>(create: (opts: PaidServiceOptions) => T, opts: HarnessOptions): Harness<T> {
    const api = new FakeApi(opts.response);
    const wallet = new FakeWallet(opts.walletChainId ?? 1, opts.receipts ?? [], opts.usedSignId ?? false);
    const allowance = new FakeAllowance(opts.approve ?? null);
    const service = create({
        api: api as unknown as ApiClient,
        wallet: wallet as unknown as WalletProvider,
        appConfig: new FakeAppConfig(opts.config ?? makeConfig()),
        allowance,
        logger: new NoopLogger(),
    });
    return { service, api, wallet, allowance };
}

export class FakeContractClient implements IContractClient {
    public readonly sent: Array<TransactionRequest> = [];
    public readonly reads: Array<ReadContractParams> = [];
    private confirmIndex = 0;

    constructor(
        private readonly receipts: Array<TxStatus> = [],
        private readonly logsByConfirm: Array<Array<Log>> = [],
    ) {}

    async read<T>(params: ReadContractParams): Promise<T> {
        this.reads.push(params);
        return undefined as T;
    }
    async send(tx: TransactionRequest, _errorAbi: Abi | null): Promise<Hash> {
        this.sent.push(tx);
        return `0x${String(this.sent.length).padStart(64, '0')}` as Hash;
    }
    async confirm(hash: Hash, revertLabel: string): Promise<ConfirmedTx> {
        const status = this.receipts[this.confirmIndex] ?? TxStatus.Success;
        const logs = this.logsByConfirm[this.confirmIndex] ?? [];
        this.confirmIndex += 1;
        if (status === TxStatus.Reverted) {
            throw new Error(`${revertLabel} reverted on-chain (tx ${hash}).`);
        }
        return { txHash: hash, status, blockNumber: '100', logs };
    }
}

// A large default so `startAt: 1` fixtures mature far more cycles than any cap — tests that need an exact
// cycle count pass an explicit `serverTime`.
export const DEFAULT_SERVER_TIME = 1_000_000_000;

export class FakeMapReader implements RevealCellReader {
    public refreshed = 0;
    constructor(
        private readonly cell: Cell | null = null,
        private readonly serverTime: number = DEFAULT_SERVER_TIME,
    ) {}
    async readRevealCell(): Promise<Cell | null> {
        return this.cell;
    }
    getServerTime(): number {
        return this.serverTime;
    }
    async refresh(): Promise<void> {
        this.refreshed += 1;
    }
}

export interface CellServiceDeps {
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    cellClient: ICellClient;
    contracts: IContractClient;
    mapReader: RevealCellReader;
    logger: ILogger;
}

export type CellHarnessOptions = Partial<{
    receipts: Array<TxStatus>;
    logs: Array<Array<Log>>;
    walletChainId: number;
    config: AppConfig;
    approve: Hash | null | Error;
    cell: RawCell | null;
    serverTime: number;
}>;

export interface CellHarness<T> {
    service: T;
    wallet: FakeWallet;
    allowance: FakeAllowance;
    contracts: FakeContractClient;
    cellClient: CellClient;
    mapReader: FakeMapReader;
}

export function makeCellHarness<T>(
    create: (deps: CellServiceDeps) => T,
    opts: CellHarnessOptions = {},
): CellHarness<T> {
    const wallet = new FakeWallet(opts.walletChainId ?? 1);
    const allowance = new FakeAllowance(opts.approve ?? null);
    const contracts = new FakeContractClient(opts.receipts ?? [], opts.logs ?? []);
    const cellClient = new CellClient({ contracts, logger: new NoopLogger() });
    const config = opts.config ?? makeConfig();
    const serverTime = opts.serverTime ?? DEFAULT_SERVER_TIME;
    const raw = opts.cell ?? null;
    const mapReader = new FakeMapReader(
        raw === null ? null : toCell(raw, serverTime, toProjectionConfig(config)),
        serverTime,
    );
    const service = create({
        wallet,
        appConfig: new FakeAppConfig(config),
        allowance,
        cellClient,
        contracts,
        mapReader,
        logger: new NoopLogger(),
    });
    return { service, wallet, allowance, contracts, cellClient, mapReader };
}
