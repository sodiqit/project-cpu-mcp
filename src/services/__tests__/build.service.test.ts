import { decodeFunctionData, parseEther, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';

import { BuildingType } from '../../api/types.js';
import { CELL_ABI } from '../../contracts/cell.abi.js';
import { makeCell } from '../../map/__tests__/fixtures.js';
import { CellProcessKind } from '../../map/types.js';
import { TxStatus } from '../../wallet/types.js';
import { BuildService } from '../build.service.js';
import type { BuildInput } from '../types.js';
import {
    APPROVE_HASH,
    CELL,
    CPU_TOKEN,
    type FakeContractClient,
    makeCellHarness,
    makeConfig,
    WALLET_ADDRESS,
} from './service-fakes.js';

const EXTRACTOR: BuildInput = { tokenId: '42', buildingType: BuildingType.Extractor, targetResourceId: 3 };

function makeService(opts: Parameters<typeof makeCellHarness>[1] = {}) {
    return makeCellHarness((deps) => new BuildService(deps), opts);
}

function decodeSent(
    contracts: FakeContractClient,
    index: number,
): { functionName: string; args: ReadonlyArray<unknown> } {
    const tx = contracts.sent[index];
    if (tx === undefined) {
        throw new Error(`expected a tx at index ${index}`);
    }
    return decodeFunctionData({ abi: CELL_ABI, data: tx.data as Hex });
}

describe('BuildService', () => {
    it('approves $CPU to the Cell, places the extractor, then starts mining', async () => {
        const { service, contracts, allowance } = makeService({ approve: APPROVE_HASH });

        const result = await service.build(EXTRACTOR);

        expect(allowance.calls).toEqual([{ token: CPU_TOKEN, spender: CELL, needed: parseEther('2000') }]);
        expect(contracts.sent).toHaveLength(2);
        expect(contracts.sent[0]?.to).toBe(CELL);

        const place = decodeSent(contracts, 0);
        expect(place.functionName).toBe('place');
        expect(place.args).toEqual([42n, 1]);

        const mining = decodeSent(contracts, 1);
        expect(mining.functionName).toBe('startMining');
        expect(mining.args).toEqual([42n, 3]);

        expect(result.approveTxHash).toBe(APPROVE_HASH);
        expect(result.buildTxHash).not.toBeNull();
        expect(result.miningTxHash).not.toBeNull();
        expect(result.alreadyBuilt).toBe(false);
        expect(result.buildCost).toBe('2000');
    });

    it('builds a hub with a null target and sends no mining tx', async () => {
        const { service, contracts, allowance } = makeService();

        const result = await service.build({ tokenId: '42', buildingType: BuildingType.Hub, targetResourceId: null });

        expect(allowance.calls[0]?.needed).toBe(parseEther('5000'));
        expect(contracts.sent).toHaveLength(1);
        const place = decodeSent(contracts, 0);
        expect(place.functionName).toBe('place');
        expect(place.args).toEqual([42n, 2]);
        expect(result.miningTxHash).toBeNull();
    });

    it('skips place and only starts mining when the extractor is already built', async () => {
        const cell = makeCell({
            tokenId: '42',
            owner: WALLET_ADDRESS,
            building: { type: BuildingType.Extractor, buildFinishAt: null },
        });
        const { service, contracts, allowance } = makeService({ cell });

        const result = await service.build(EXTRACTOR);

        expect(allowance.calls).toHaveLength(0);
        expect(contracts.sent).toHaveLength(1);
        expect(decodeSent(contracts, 0).functionName).toBe('startMining');
        expect(result.alreadyBuilt).toBe(true);
        expect(result.buildTxHash).toBeNull();
        expect(result.buildCost).toBe('0');
    });

    it('reports no approve tx when the allowance already covered the cost', async () => {
        const { service, allowance } = makeService({ approve: null });
        const result = await service.build(EXTRACTOR);
        expect(allowance.calls).toHaveLength(1);
        expect(result.approveTxHash).toBeNull();
    });

    it('refuses when $CPU is not configured', async () => {
        const { service, contracts, allowance } = makeService({ config: makeConfig('') });
        await expect(service.build(EXTRACTOR)).rejects.toThrow(/not configured/i);
        expect(contracts.sent).toHaveLength(0);
        expect(allowance.calls).toHaveLength(0);
    });

    it('rejects a build on a cell owned by someone else', async () => {
        const cell = makeCell({ tokenId: '42', owner: '0xother' });
        const { service, contracts } = makeService({ cell });
        await expect(service.build(EXTRACTOR)).rejects.toThrow(/do not own/i);
        expect(contracts.sent).toHaveLength(0);
    });

    it('rejects a build while a process is active', async () => {
        const cell = makeCell({
            tokenId: '42',
            owner: WALLET_ADDRESS,
            process: { kind: CellProcessKind.Mining, resource: 3, rate: 10, startAt: 1, stalled: false },
        });
        const { service, contracts } = makeService({ cell });
        await expect(service.build(EXTRACTOR)).rejects.toThrow(/active .*process/i);
        expect(contracts.sent).toHaveLength(0);
    });

    it('wraps an on-chain revert of the place', async () => {
        const { service } = makeService({ receipts: [TxStatus.Reverted] });
        await expect(service.build(EXTRACTOR)).rejects.toThrow(/build transaction reverted/i);
    });

    it('refuses when the wallet chainId does not match the chain config', async () => {
        const { service, contracts } = makeService({ walletChainId: 8453 });
        await expect(service.build(EXTRACTOR)).rejects.toThrow(/chain mismatch/i);
        expect(contracts.sent).toHaveLength(0);
    });

    it('demolishes a building', async () => {
        const cell = makeCell({ tokenId: '42', owner: WALLET_ADDRESS });
        const { service, contracts } = makeService({ cell });

        const result = await service.demolish({ tokenId: '42' });

        expect(contracts.sent).toHaveLength(1);
        expect(decodeSent(contracts, 0).functionName).toBe('demolish');
        expect(result.status).toBe(TxStatus.Success);
        expect(result.blockNumber).toBe('100');
    });
});
