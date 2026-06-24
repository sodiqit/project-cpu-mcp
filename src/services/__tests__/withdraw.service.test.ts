import { decodeFunctionData, parseEther, type Hash } from 'viem';
import { describe, expect, it } from 'vitest';

import type { ApiClient } from '../../api/client.js';
import type { WithdrawSignatureResponse } from '../../api/types.js';
import { GAME_SETTLEMENT_ABI } from '../../contracts/game-settlement.abi.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import { TxStatus, type WalletProvider } from '../../wallet/types.js';
import { WithdrawService } from '../withdraw.service.js';
import { FakeAllowance, FakeAppConfig, FakeWallet, GAME_SETTLEMENT, makeConfig, R, S } from './service-fakes.js';

const AMOUNT_WEI = parseEther('100').toString();
const FUTURE = '99999999999';
const PAST = '1700';

function makeSig(overrides: Partial<WithdrawSignatureResponse> = {}): WithdrawSignatureResponse {
    return { signId: 5, tokenId: '42', amount: AMOUNT_WEI, deadline: FUTURE, v: 27, r: R, s: S, ...overrides };
}

interface ApiResult {
    status: number;
    data: unknown;
}

/** Per-path API double — withdraw issues a GET /pending then (only when nothing is pending) a POST. */
class WithdrawApi {
    public readonly calls: Array<{ method: string; path: string; body: unknown }> = [];
    constructor(private readonly byPath: Record<string, ApiResult>) {}

    async authenticatedRequest(
        path: string,
        options: { method: string; body: unknown } | null = null,
    ): Promise<ApiResult> {
        this.calls.push({ method: options?.method ?? 'GET', path, body: options?.body ?? null });
        const res = this.byPath[path];
        if (res === undefined) {
            throw new Error(`unexpected path ${path}`);
        }
        return res;
    }
}

type ServiceOptions = { pending: ApiResult } & Partial<{
    post: ApiResult;
    walletChainId: number;
    usedSignId: boolean;
    receipts: Array<TxStatus>;
    approve: Hash | null | Error;
}>;

function makeService(opts: ServiceOptions): {
    service: WithdrawService;
    api: WithdrawApi;
    wallet: FakeWallet;
    allowance: FakeAllowance;
} {
    const api = new WithdrawApi({
        '/api/v1/cpu/withdraw/pending': opts.pending,
        '/api/v1/cpu/withdraw': opts.post ?? { status: 200, data: null },
    });
    const wallet = new FakeWallet(opts.walletChainId ?? 1, opts.receipts ?? [], opts.usedSignId ?? false);
    const allowance = new FakeAllowance(opts.approve ?? null);
    const service = new WithdrawService({
        api: api as unknown as ApiClient,
        wallet: wallet as unknown as WalletProvider,
        appConfig: new FakeAppConfig(makeConfig()),
        allowance,
        logger: new NoopLogger(),
    });
    return { service, api, wallet, allowance };
}

describe('WithdrawService', () => {
    it('POSTs and submits a fresh withdraw when nothing is pending, minting without an approve', async () => {
        const { service, api, wallet, allowance } = makeService({
            pending: { status: 200, data: { pending: null } },
            post: { status: 200, data: makeSig() },
        });

        const result = await service.withdraw({ tokenId: '42', amount: '100' });

        expect(api.calls.map((c) => c.path)).toEqual(['/api/v1/cpu/withdraw/pending', '/api/v1/cpu/withdraw']);
        // Whole wCPU units go to the API; it returns the wei amount to submit on-chain.
        expect(api.calls[1]?.body).toEqual({ tokenId: '42', network: 'ethereum', amount: '100' });
        expect(allowance.calls).toHaveLength(0); // a mint never approves $CPU

        expect(wallet.sent).toHaveLength(1);
        const sent = wallet.sent[0];
        if (sent === undefined) {
            throw new Error('expected one tx');
        }
        expect(sent.to).toBe(GAME_SETTLEMENT);
        const decoded = decodeFunctionData({ abi: GAME_SETTLEMENT_ABI, data: sent.data });
        expect(decoded.functionName).toBe('withdrawCpu');
        expect(decoded.args).toEqual([5n, 42n, BigInt(AMOUNT_WEI), BigInt(FUTURE), 27, R, S]);

        expect(result.resumed).toBe(false);
        expect(result.approveTxHash).toBeNull();
        expect(result.amount).toBe(AMOUNT_WEI);
        expect(result.status).toBe(TxStatus.Success);
        expect(result.blockNumber).toBe('100');
    });

    it('resumes a matching pending withdraw without re-POSTing', async () => {
        const { service, api, wallet } = makeService({
            pending: { status: 200, data: { pending: makeSig() } },
        });

        const result = await service.withdraw({ tokenId: '42', amount: '100' });

        // Only the pending lookup hits the API — never a second POST that the server would 409.
        expect(api.calls.map((c) => c.path)).toEqual(['/api/v1/cpu/withdraw/pending']);
        // It checks the on-chain used-flag before re-submitting the same signature.
        expect(wallet.reads[0]?.functionName).toBe('usedSignIds');
        expect(wallet.sent).toHaveLength(1);
        const sent = wallet.sent[0];
        if (sent === undefined) {
            throw new Error('expected one tx');
        }
        const decoded = decodeFunctionData({ abi: GAME_SETTLEMENT_ABI, data: sent.data });
        expect(decoded.functionName).toBe('withdrawCpu');
        expect(result.resumed).toBe(true);
    });

    it('refuses to finish a pending withdraw whose args differ from the request', async () => {
        const { service, wallet } = makeService({
            pending: { status: 200, data: { pending: makeSig({ tokenId: '99' }) } },
        });

        await expect(service.withdraw({ tokenId: '42', amount: '100' })).rejects.toThrow(/different withdraw/i);
        expect(wallet.sent).toHaveLength(0);
    });

    it('reports an expired pending withdraw instead of submitting', async () => {
        const { service, wallet } = makeService({
            pending: { status: 200, data: { pending: makeSig({ deadline: PAST }) } },
        });

        await expect(service.withdraw({ tokenId: '42', amount: '100' })).rejects.toThrow(/expired/i);
        expect(wallet.sent).toHaveLength(0);
    });

    it('reports an already-settled pending withdraw (usedSignIds == true)', async () => {
        const { service, wallet } = makeService({
            pending: { status: 200, data: { pending: makeSig() } },
            usedSignId: true,
        });

        await expect(service.withdraw({ tokenId: '42', amount: '100' })).rejects.toThrow(/already settled/i);
        expect(wallet.sent).toHaveLength(0);
    });

    it('surfaces an API error from the POST and sends no transaction', async () => {
        const { service, wallet } = makeService({
            pending: { status: 200, data: { pending: null } },
            post: { status: 400, data: { message: 'withdrawAmountExceedsLimit' } },
        });

        await expect(service.withdraw({ tokenId: '42', amount: '100' })).rejects.toThrow(/withdrawAmountExceedsLimit/);
        expect(wallet.sent).toHaveLength(0);
    });

    it('refuses when the wallet chainId does not match the chain config', async () => {
        const { service, api, wallet } = makeService({
            pending: { status: 200, data: { pending: null } },
            walletChainId: 8453,
        });

        await expect(service.withdraw({ tokenId: '42', amount: '100' })).rejects.toThrow(/chain mismatch/i);
        expect(api.calls).toHaveLength(0);
        expect(wallet.sent).toHaveLength(0);
    });
});
