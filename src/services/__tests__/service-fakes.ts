import type { Address, Hash, Hex } from 'viem';

import type { ApiClient } from '../../api/client.js';
import { Network } from '../../config/types.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import type { ILogger } from '../../logger/types.js';
import {
    type ReadContractParams,
    type TransactionRequest,
    type TxReceipt,
    TxStatus,
    type WalletManager,
    type WalletProvider,
} from '../../wallet/types.js';
import type { AppConfig, IAllowanceService, IAppConfig } from '../types.js';

/**
 * Shared in-memory doubles for the paid-action services (build / reveal / transport / craft), which
 * all take the same `{ api, wallet, appConfig, allowance, logger }` dependencies.
 */

export const GAME_SETTLEMENT = '0x1111111111111111111111111111111111111111';
export const CPU_TOKEN = '0x2222222222222222222222222222222222222222';
export const LAND = '0x3333333333333333333333333333333333333333';
export const CPU_HOOK = '0x4444444444444444444444444444444444444444';
export const WALLET_ADDRESS = '0x000000000000000000000000000000000000dEaD' as Address;
export const APPROVE_HASH = `0x${'c'.repeat(64)}` as Hash;
export const R = `0x${'a'.repeat(64)}` as Hex;
export const S = `0x${'b'.repeat(64)}` as Hex;

export function makeConfig(cpuToken: string = CPU_TOKEN): AppConfig {
    return {
        network: Network.ETHEREUM,
        chainId: 1,
        contracts: { land: LAND, cpuToken, gameSettlement: GAME_SETTLEMENT, cpuHook: CPU_HOOK },
        resources: { 3: 'Silica' },
        recipes: [],
        buildings: [],
        reveal: { firstFree: true, reRevealCost: '0' },
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
        return { status, transactionHash: hash, blockNumber: 100n };
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
