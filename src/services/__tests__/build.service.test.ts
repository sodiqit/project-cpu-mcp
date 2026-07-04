import { decodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';

import { BuildingType, type BuildSignatureResponse } from '../../api/types.js';
import { GAME_SETTLEMENT_ABI } from '../../contracts/game-settlement.abi.js';
import { TxStatus } from '../../wallet/types.js';
import { BuildService } from '../build.service.js';
import type { BuildInput } from '../types.js';
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

const EXTRACTOR: BuildInput = { tokenId: '42', buildingType: BuildingType.Extractor, targetResourceId: 3 };

function makeSig(overrides: Partial<BuildSignatureResponse> = {}): BuildSignatureResponse {
    return { signId: 7, tokenId: '42', cpuAmount: '2000', deadline: '1700', v: 27, r: R, s: S, ...overrides };
}

function makeService(opts: HarnessOptions): Harness<BuildService> {
    return makeHarness((deps) => new BuildService(deps), opts);
}

describe('BuildService', () => {
    it('ensures the $CPU allowance, encodes spendCpu, and returns the confirmed build', async () => {
        const { service, api, wallet, allowance } = makeService({
            response: { status: 200, data: makeSig() },
            approve: APPROVE_HASH,
        });

        const result = await service.build(EXTRACTOR);

        expect(api.calls[0]?.path).toBe('/api/v1/build');
        expect(api.calls[0]?.body).toEqual({
            tokenId: '42',
            network: 'ethereum',
            buildingType: 'extractor',
            targetResourceId: 3,
        });
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

        expect(result.approveTxHash).toBe(APPROVE_HASH);
        expect(result.buildingType).toBe(BuildingType.Extractor);
        expect(result.targetResourceId).toBe(3);
        expect(result.status).toBe(TxStatus.Success);
        expect(result.blockNumber).toBe('100');
    });

    it('builds a hub with a null target resource', async () => {
        const { service, api, wallet } = makeService({
            response: { status: 200, data: makeSig({ cpuAmount: '5000' }) },
        });

        const result = await service.build({ tokenId: '42', buildingType: BuildingType.Hub, targetResourceId: null });

        expect(api.calls[0]?.body).toEqual({
            tokenId: '42',
            network: 'ethereum',
            buildingType: 'hub',
            targetResourceId: null,
        });
        const sent = wallet.sent[0];
        if (sent === undefined) {
            throw new Error('expected one tx');
        }
        const decoded = decodeFunctionData({ abi: GAME_SETTLEMENT_ABI, data: sent.data });
        expect(decoded.functionName).toBe('spendCpu');
        expect(result.buildingType).toBe(BuildingType.Hub);
        expect(result.targetResourceId).toBeNull();
    });

    it('reports no approve tx when the allowance already covered the cost', async () => {
        const { service, allowance } = makeService({ response: { status: 200, data: makeSig() }, approve: null });

        const result = await service.build(EXTRACTOR);

        expect(allowance.calls).toHaveLength(1);
        expect(result.approveTxHash).toBeNull();
    });

    it('refuses before reserving the intent when $CPU is not configured', async () => {
        const { service, api, wallet, allowance } = makeService({
            response: { status: 200, data: makeSig() },
            config: makeConfig(''),
        });
        await expect(service.build(EXTRACTOR)).rejects.toThrow(/not configured/i);
        expect(api.calls).toHaveLength(0);
        expect(wallet.sent).toHaveLength(0);
        expect(allowance.calls).toHaveLength(0);
    });

    it('wraps an on-chain revert with retry guidance (signId + deadline)', async () => {
        const { service } = makeService({ response: { status: 200, data: makeSig() }, receipts: [TxStatus.Reverted] });
        const error = await service.build(EXTRACTOR).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Error);
        const message = (error as Error).message;
        expect(message).toMatch(/reverted/i);
        expect(message).toMatch(/re-run build/i);
        expect(message).toMatch(/signId 7/);
        expect(message).toMatch(/valid until 1970-01-01/);
    });

    it('wraps an approve failure with retry guidance and sends no build tx', async () => {
        const { service, wallet } = makeService({
            response: { status: 200, data: makeSig() },
            approve: new Error('Approve transaction reverted on-chain (tx 0xabc).'),
        });
        await expect(service.build(EXTRACTOR)).rejects.toThrow(/approve transaction reverted/i);
        await expect(service.build(EXTRACTOR)).rejects.toThrow(/re-run build/i);
        expect(wallet.sent).toHaveLength(0);
    });

    it('surfaces an API error and sends no transaction', async () => {
        const { service, wallet, allowance } = makeService({
            response: { status: 409, data: { message: 'NotCellOwner' } },
        });
        await expect(service.build(EXTRACTOR)).rejects.toThrow(/NotCellOwner/);
        expect(wallet.sent).toHaveLength(0);
        expect(allowance.calls).toHaveLength(0);
    });

    it('refuses when the wallet chainId does not match the chain config', async () => {
        const { service, api, wallet } = makeService({
            response: { status: 200, data: makeSig() },
            walletChainId: 8453,
        });
        await expect(service.build(EXTRACTOR)).rejects.toThrow(/chain mismatch/i);
        expect(api.calls).toHaveLength(0);
        expect(wallet.sent).toHaveLength(0);
    });
});
