import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, type Address, type Hex, type Log } from 'viem';
import { describe, expect, it } from 'vitest';

import { CELL_ABI } from '../../contracts/cell.abi.js';
import { makeCell } from '../../map/__tests__/fixtures.js';
import { CellProcessKind } from '../../map/types.js';
import { MiningService } from '../mining.service.js';
import { CELL, makeCellHarness, WALLET_ADDRESS } from './service-fakes.js';

function makeService(opts: Parameters<typeof makeCellHarness>[1] = {}) {
    return makeCellHarness((deps) => new MiningService(deps), opts);
}

function minedLog(resource: number, amount: bigint): Log {
    const topics = encodeEventTopics({ abi: CELL_ABI, eventName: 'ResourceMined', args: { tokenId: 42n } });
    const data = encodeAbiParameters(
        [{ type: 'uint16' }, { type: 'uint64' }, { type: 'uint64' }],
        [resource, amount, 0n],
    );
    return {
        address: CELL as Address,
        topics,
        data,
        blockHash: `0x${'0'.repeat(64)}`,
        blockNumber: 1n,
        logIndex: 0,
        transactionHash: `0x${'0'.repeat(64)}`,
        transactionIndex: 0,
        removed: false,
    } as unknown as Log;
}

describe('MiningService.getStatus', () => {
    it('computes claimable from the map process, capped by the deposit', async () => {
        const cell = makeCell({
            tokenId: '42',
            owner: WALLET_ADDRESS,
            process: { kind: CellProcessKind.Mining, resource: 3, rate: 10, startAt: 1 },
            resources: [{ resourceId: 3, deposit: '500', balance: '0', strength: null }],
        });
        const { service } = makeService({ cell });

        const status = await service.getStatus('42');

        expect(status.active).toBe(true);
        expect(status.targetResourceId).toBe(3);
        expect(status.rate).toBe(10);
        expect(status.depositRemaining).toBe('500');
        expect(status.claimable).toBe('500');
    });

    it('reports inactive when the cell has no mining process', async () => {
        const cell = makeCell({ tokenId: '42', owner: WALLET_ADDRESS });
        const { service } = makeService({ cell });

        const status = await service.getStatus('42');

        expect(status.active).toBe(false);
        expect(status.targetResourceId).toBeNull();
        expect(status.claimable).toBe('0');
    });

    it('throws when the cell is not in the map', async () => {
        const { service } = makeService();
        await expect(service.getStatus('42')).rejects.toThrow(/not in the current map/i);
    });
});

describe('MiningService.claim', () => {
    it('sends Cell.claim and decodes the mined amount', async () => {
        const { service, contracts } = makeService({ logs: [[minedLog(3, 120n)]] });

        const result = await service.claim('42');

        expect(contracts.sent).toHaveLength(1);
        const tx = contracts.sent[0];
        if (tx === undefined) {
            throw new Error('expected a claim tx');
        }
        expect(decodeFunctionData({ abi: CELL_ABI, data: tx.data as Hex }).functionName).toBe('claim');
        expect(result.resourceId).toBe(3);
        expect(result.claimedAmount).toBe('120');
    });

    it('reports nothing claimed when no ResourceMined event is emitted', async () => {
        const { service } = makeService();
        const result = await service.claim('42');
        expect(result.resourceId).toBeNull();
        expect(result.claimedAmount).toBe('0');
    });

    it('refuses when the wallet chainId does not match the chain config', async () => {
        const { service, contracts } = makeService({ walletChainId: 8453 });
        await expect(service.claim('42')).rejects.toThrow(/chain mismatch/i);
        expect(contracts.sent).toHaveLength(0);
    });
});
