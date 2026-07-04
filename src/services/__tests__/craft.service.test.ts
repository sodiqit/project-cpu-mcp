import { decodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';

import {
    type ClaimCraftResponse,
    type CraftProcessStatusResponse,
    CraftProcessStatus,
    CraftRecipeId,
    type PaidCraftSignatureResponse,
    type StartCraftResponse,
} from '../../api/types.js';
import { GAME_SETTLEMENT_ABI } from '../../contracts/game-settlement.abi.js';
import { TxStatus } from '../../wallet/types.js';
import { CraftService } from '../craft.service.js';
import { type CraftInput, CraftResultKind } from '../types.js';
import {
    APPROVE_HASH,
    CPU_TOKEN,
    GAME_SETTLEMENT,
    type Harness,
    type HarnessOptions,
    makeConfig,
    makeHarness,
    R,
    S,
} from './service-fakes.js';

const FORGE: CraftInput = { tokenId: '42', recipeId: CraftRecipeId.ForgeWcpu, batches: 1 };
const POWER: CraftInput = { tokenId: '42', recipeId: CraftRecipeId.GeneratePower, batches: 2 };

function makeFree(overrides: Partial<StartCraftResponse> = {}): StartCraftResponse {
    return {
        uuid: 'u1',
        tokenId: '42',
        recipeId: CraftRecipeId.GeneratePower,
        batches: 2,
        startAt: 1000,
        endsAt: 1060,
        debitedInputs: [{ resourceId: 6, amount: 10 }],
        ...overrides,
    };
}

function makePaid(overrides: Partial<PaidCraftSignatureResponse> = {}): PaidCraftSignatureResponse {
    return {
        uuid: 'u2',
        signId: 7,
        tokenId: '42',
        recipeId: CraftRecipeId.ForgeWcpu,
        batches: 1,
        status: CraftProcessStatus.Pending,
        cpuAmount: '2000',
        deadline: '1700',
        v: 27,
        r: R,
        s: S,
        debitedInputs: [{ resourceId: 100, amount: 50 }],
        ...overrides,
    };
}

function makeService(opts: HarnessOptions): Harness<CraftService> {
    return makeHarness((deps) => new CraftService(deps), opts);
}

describe('CraftService', () => {
    it('starts a free craft without touching the wallet or allowance', async () => {
        const { service, api, wallet, allowance } = makeService({ response: { status: 200, data: makeFree() } });

        const result = await service.craft(POWER);

        expect(api.calls[0]?.path).toBe('/api/v1/craft/42/start');
        expect(api.calls[0]?.body).toEqual({ recipeId: 'generate_power', batches: 2, network: 'ethereum' });
        expect(wallet.sent).toHaveLength(0);
        expect(allowance.calls).toHaveLength(0);
        expect(result.kind).toBe(CraftResultKind.Free);
        if (result.kind !== CraftResultKind.Free) {
            throw new Error('expected free');
        }
        expect(result.uuid).toBe('u1');
        expect(result.endsAt).toBe(1060);
    });

    it('ensures the $CPU allowance, encodes spendCpu, and returns the confirmed paid craft', async () => {
        const { service, allowance, wallet } = makeService({
            response: { status: 200, data: makePaid() },
            approve: APPROVE_HASH,
        });

        const result = await service.craft(FORGE);

        expect(allowance.calls).toEqual([{ token: CPU_TOKEN, spender: GAME_SETTLEMENT, needed: 2000n }]);
        expect(wallet.sent).toHaveLength(1);
        const sent = wallet.sent[0];
        if (sent === undefined) {
            throw new Error('expected one tx');
        }
        expect(sent.to).toBe(GAME_SETTLEMENT);
        const decoded = decodeFunctionData({ abi: GAME_SETTLEMENT_ABI, data: sent.data });
        expect(decoded.functionName).toBe('spendCpu');
        expect(decoded.args).toEqual([7n, 42n, 2000n, 1700n, 27, R, S]);

        if (result.kind !== CraftResultKind.Paid) {
            throw new Error('expected paid');
        }
        expect(result.approveTxHash).toBe(APPROVE_HASH);
        expect(result.signId).toBe(7);
        expect(result.status).toBe(TxStatus.Success);
        expect(result.blockNumber).toBe('100');
    });

    it('reports no approve tx when the allowance already covered the cost', async () => {
        const { service, allowance } = makeService({ response: { status: 200, data: makePaid() }, approve: null });

        const result = await service.craft(FORGE);

        expect(allowance.calls).toHaveLength(1);
        if (result.kind !== CraftResultKind.Paid) {
            throw new Error('expected paid');
        }
        expect(result.approveTxHash).toBeNull();
    });

    it('wraps an on-chain revert with auto-refund guidance (signId + deadline)', async () => {
        const { service } = makeService({ response: { status: 200, data: makePaid() }, receipts: [TxStatus.Reverted] });
        const error = await service.craft(FORGE).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toMatch(/reverted/i);
        expect(message).toMatch(/auto-refund/i);
        expect(message).toMatch(/signId 7/);
        expect(message).toMatch(/deadline 1970-01-01/);
    });

    it('refuses a paid craft when $CPU is not configured and sends no tx', async () => {
        const { service, wallet, allowance } = makeService({
            response: { status: 200, data: makePaid() },
            config: makeConfig(''),
        });
        await expect(service.craft(FORGE)).rejects.toThrow(/not configured/i);
        expect(wallet.sent).toHaveLength(0);
        expect(allowance.calls).toHaveLength(0);
    });

    it('refuses a paid craft when the wallet chainId does not match the config', async () => {
        const { service, wallet } = makeService({ response: { status: 200, data: makePaid() }, walletChainId: 8453 });
        await expect(service.craft(FORGE)).rejects.toThrow(/chain mismatch/i);
        expect(wallet.sent).toHaveLength(0);
    });

    it('explains a 409 pending escrow as awaiting auto-refund', async () => {
        const { service, wallet } = makeService({
            response: { status: 409, data: { message: 'pendingCraftActionExists' } },
        });
        const error = await service.craft(FORGE).catch((e: unknown) => e);
        const message = (error as Error).message;
        expect(message).toMatch(/escrowed/i);
        expect(message).toMatch(/auto-refund/i);
        expect(wallet.sent).toHaveLength(0);
    });

    it('reads craft status via the public endpoint', async () => {
        const processes: Array<CraftProcessStatusResponse> = [
            {
                uuid: 'u1',
                tokenId: '42',
                recipeId: CraftRecipeId.GeneratePower,
                batches: 2,
                status: CraftProcessStatus.Active,
                claimedBatches: 0,
                completedBatches: 1,
                claimableBatches: 1,
                claimableOutputs: [{ resourceId: 101, amount: 10 }],
                startAt: 1000,
                endsAt: 1060,
                nextBatchAt: 1060,
                isFinished: false,
            },
        ];
        const { service, api } = makeService({ response: { status: 200, data: processes } });

        const result = await service.getStatus('42');

        expect(api.calls[0]?.path).toBe('/api/v1/craft/42');
        expect(api.calls[0]?.authenticated).toBe(false);
        expect(result).toEqual(processes);
    });

    it('claims matured outputs (empty claimed is still a success)', async () => {
        const claim: ClaimCraftResponse = { tokenId: '42', claimed: [], processes: [] };
        const { service, api } = makeService({ response: { status: 200, data: claim } });

        const result = await service.claim('42');

        expect(api.calls[0]?.path).toBe('/api/v1/craft/42/claim');
        expect(api.calls[0]?.authenticated).toBe(true);
        expect(result).toEqual(claim);
    });
});
