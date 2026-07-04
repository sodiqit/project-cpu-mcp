import { parseEther, type Hash } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NoopLogger } from '../../logger/noop.logger.js';
import type { CellState } from '../../map/types.js';
import {
    type ConfirmedTx,
    type IContractClient,
    type ReadContractParams,
    type TransactionRequest,
    TxStatus,
    type WalletProvider,
} from '../../wallet/types.js';
import { RevealService } from '../reveal.service.js';
import type { AppConfig, ICellClient, IAppConfig, RequestRevealParams } from '../types.js';
import {
    APPROVE_HASH,
    CELL,
    CPU_TOKEN,
    FakeAllowance,
    FakeWallet,
    WALLET_ADDRESS,
    makeConfig,
} from './service-fakes.js';

const REQUEST_HASH = `0x${'e'.repeat(64)}` as Hash;

function revealState(over: Partial<CellState> = {}): CellState {
    return { tokenId: '42', x: 1, y: -2, owner: WALLET_ADDRESS, revealCount: 0, ...over } as unknown as CellState;
}

class FakeAppConfig implements IAppConfig {
    constructor(private readonly config: AppConfig) {}
    async load(): Promise<AppConfig> {
        return this.config;
    }
}

class FakeCellClient implements ICellClient {
    public readonly requests: Array<RequestRevealParams> = [];
    constructor(
        private readonly fee: bigint = 1_000n,
        private readonly quoteError: Error | null = null,
    ) {}
    async quoteRevealFee(): Promise<bigint> {
        if (this.quoteError !== null) {
            throw this.quoteError;
        }
        return this.fee;
    }
    async requestReveal(params: RequestRevealParams): Promise<Hash> {
        this.requests.push(params);
        return REQUEST_HASH;
    }
}

class FakeContractClient implements IContractClient {
    public readonly reads: Array<ReadContractParams> = [];
    public readonly sent: Array<TransactionRequest> = [];
    constructor(private readonly reverts: boolean = false) {}
    async read<T>(params: ReadContractParams): Promise<T> {
        this.reads.push(params);
        return undefined as T;
    }
    async send(tx: TransactionRequest): Promise<Hash> {
        this.sent.push(tx);
        return REQUEST_HASH;
    }
    async confirm(hash: Hash, revertLabel: string): Promise<ConfirmedTx> {
        if (this.reverts) {
            throw new Error(`${revertLabel} reverted on-chain (tx ${hash}).`);
        }
        return { txHash: hash, status: TxStatus.Success, blockNumber: '100', logs: [] };
    }
}

class FakeRevealCellReader {
    public refreshes = 0;
    constructor(
        private state: CellState | null,
        private readonly bumpTo: number | null = null,
    ) {}
    readRevealCell(): CellState | null {
        return this.state;
    }
    async refresh(): Promise<void> {
        this.refreshes += 1;
        if (this.bumpTo !== null && this.state !== null) {
            this.state = { ...this.state, revealCount: this.bumpTo };
        }
    }
}

type HarnessOptions = Partial<{
    config: AppConfig;
    state: CellState | null;
    bumpTo: number | null;
    fee: bigint;
    quoteError: Error | null;
    approve: Hash | null | Error;
    reverts: boolean;
    walletChainId: number;
}>;

function makeReveal(opts: HarnessOptions = {}): {
    service: RevealService;
    wallet: FakeWallet;
    allowance: FakeAllowance;
    cellClient: FakeCellClient;
    contracts: FakeContractClient;
    reader: FakeRevealCellReader;
} {
    const wallet = new FakeWallet(opts.walletChainId ?? 1);
    const allowance = new FakeAllowance(opts.approve ?? null);
    const cellClient = new FakeCellClient(opts.fee ?? 1_000n, opts.quoteError ?? null);
    const contracts = new FakeContractClient(opts.reverts ?? false);
    const reader = new FakeRevealCellReader(opts.state === undefined ? revealState() : opts.state, opts.bumpTo ?? null);
    const service = new RevealService({
        wallet: wallet as unknown as WalletProvider,
        appConfig: new FakeAppConfig(opts.config ?? makeConfig()),
        allowance,
        cellClient,
        contracts,
        mapReader: reader,
        logger: new NoopLogger(),
    });
    return { service, wallet, allowance, cellClient, contracts, reader };
}

describe('RevealService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('submits a genesis reveal paying the buffered ETH fee, no $CPU touched', async () => {
        const h = makeReveal({ fee: 1_000n, bumpTo: 1 });

        const p = h.service.reveal('42');
        await vi.runAllTimersAsync();
        const result = await p;

        expect(h.allowance.calls).toHaveLength(0);
        expect(h.cellClient.requests).toEqual([{ cell: CELL, x: 1n, y: -2n, value: 1_250n }]);
        expect(result.genesis).toBe(true);
        expect(result.feeWei).toBe('1000');
        expect(result.reRevealCostWei).toBe('0');
        expect(result.approveTxHash).toBeNull();
        expect(result.txHash).toBe(REQUEST_HASH);
        expect(result.blockNumber).toBe('100');
        expect(result.status).toBe(TxStatus.Success);
        expect(result.fulfilled).toBe(true);
    });

    it('approves $CPU to the Cell before a paid re-reveal, then requests', async () => {
        const config = { ...makeConfig(), reveal: { firstFree: true, reRevealCost: '1' } };
        const h = makeReveal({ config, state: revealState({ revealCount: 1 }), approve: APPROVE_HASH, bumpTo: 2 });

        const p = h.service.reveal('42');
        await vi.runAllTimersAsync();
        const result = await p;

        expect(h.allowance.calls).toEqual([{ token: CPU_TOKEN, spender: CELL, needed: parseEther('1') }]);
        expect(h.cellClient.requests).toHaveLength(1);
        expect(result.genesis).toBe(false);
        expect(result.reRevealCostWei).toBe(parseEther('1').toString());
        expect(result.approveTxHash).toBe(APPROVE_HASH);
    });

    it('reports fulfilled=false when deposits do not land within the poll window', async () => {
        const h = makeReveal({ bumpTo: null });

        const p = h.service.reveal('42');
        await vi.runAllTimersAsync();
        const result = await p;

        expect(result.fulfilled).toBe(false);
        expect(h.reader.refreshes).toBeGreaterThan(1);
    });

    it('refuses when the wallet chainId does not match the chain config', async () => {
        const h = makeReveal({ walletChainId: 8453 });
        await expect(h.service.reveal('42')).rejects.toThrow(/chain mismatch/i);
        expect(h.cellClient.requests).toHaveLength(0);
    });

    it('throws when the cell contract is not configured', async () => {
        const config = { ...makeConfig(), contracts: { ...makeConfig().contracts, cell: '' } };
        const h = makeReveal({ config });
        await expect(h.service.reveal('42')).rejects.toThrow(/cell contract is not configured/i);
    });

    it('throws when the cell is not in the map', async () => {
        const h = makeReveal({ state: null });
        await expect(h.service.reveal('42')).rejects.toThrow(/not in the current map/i);
    });

    it('throws when the wallet does not own the cell', async () => {
        const h = makeReveal({ state: revealState({ owner: '0x000000000000000000000000000000000000bEEF' }) });
        await expect(h.service.reveal('42')).rejects.toThrow(/do not own/i);
    });

    it('throws before requesting when $CPU is not configured for a paid re-reveal', async () => {
        const config = {
            ...makeConfig(),
            contracts: { ...makeConfig().contracts, cpuToken: '' },
            reveal: { firstFree: true, reRevealCost: '1' },
        };
        const h = makeReveal({ config, state: revealState({ revealCount: 1 }) });
        await expect(h.service.reveal('42')).rejects.toThrow(/not configured/i);
        expect(h.allowance.calls).toHaveLength(0);
        expect(h.cellClient.requests).toHaveLength(0);
    });

    it('throws when the request tx reverts on-chain', async () => {
        const h = makeReveal({ reverts: true });
        await expect(h.service.reveal('42')).rejects.toThrow(/reverted/i);
    });
});
