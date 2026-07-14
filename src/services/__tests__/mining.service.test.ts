import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, type Address, type Hex, type Log } from 'viem';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BuildingType } from '../../api/types.js';
import { CELL_ABI } from '../../contracts/cell.abi.js';
import { makeCell, makeResource, makeStorage } from '../../map/__tests__/fixtures.js';
import { CellProcessKind, type RawCell } from '../../map/types.js';
import { MiningService } from '../mining.service.js';
import type { AppConfig } from '../types.js';
import { CELL, DEFAULT_SERVER_TIME, makeCellHarness, makeConfig, WALLET_ADDRESS } from './service-fakes.js';

function makeService(opts: Parameters<typeof makeCellHarness>[1] = {}) {
    return makeCellHarness((deps) => new MiningService(deps), opts);
}

function minedLog(resource: number, amount: bigint): Log {
    const topics = encodeEventTopics({ abi: CELL_ABI, eventName: 'ResourceMined', args: { tokenId: 42n } });
    const data = encodeAbiParameters(
        [{ type: 'uint16' }, { type: 'uint64' }, { type: 'uint64' }, { type: 'uint64' }],
        [resource, amount, amount, 0n],
    );
    return { address: CELL as Address, topics, data, ...LOG_META } as unknown as Log;
}

function startedLog(resource: number, durationSec: number, batch: bigint): Log {
    const topics = encodeEventTopics({ abi: CELL_ABI, eventName: 'MiningStarted', args: { tokenId: 42n } });
    const data = encodeAbiParameters(
        [{ type: 'uint16' }, { type: 'uint32' }, { type: 'uint64' }, { type: 'uint64' }],
        [resource, durationSec, batch, 0n],
    );
    return { address: CELL as Address, topics, data, ...LOG_META } as unknown as Log;
}

const LOG_META = {
    blockHash: `0x${'0'.repeat(64)}`,
    blockNumber: 1n,
    logIndex: 0,
    transactionHash: `0x${'0'.repeat(64)}`,
    transactionIndex: 0,
    removed: false,
} as const;

describe('MiningService.getStatus', () => {
    it('computes claimable from matured cycles, capped by the deposit', async () => {
        const cell = makeCell({
            tokenId: '42',
            owner: WALLET_ADDRESS,
            process: {
                kind: CellProcessKind.Mining,
                resource: 3,
                durationSec: 10,
                batch: 10,
                startAt: 1,
            },
            resources: [{ resourceId: 3, deposit: '500', balance: '0', strength: null, storage: null }],
        });
        const { service } = makeService({ cell });

        const status = await service.getStatus('42');

        expect(status.active).toBe(true);
        expect(status.targetResourceId).toBe(3);
        expect(status.batch).toBe(10);
        expect(status.durationSec).toBe(10);
        expect(status.depositRemaining).toBe('500');
        // Many cycles have matured since startAt=1, so gross output far exceeds the deposit — capped to it.
        expect(status.claimable).toBe('500');
        expect(status.stalled).toBe(false);
    });

    it('matures whole cycles only — a cycle in progress banks nothing', async () => {
        const nowSec = 100_000;
        // Two full 180s cycles plus 30s into the third, measured against the map's server clock.
        const startAt = nowSec - (2 * 180 + 30);
        const cell = makeCell({
            tokenId: '42',
            owner: WALLET_ADDRESS,
            process: {
                kind: CellProcessKind.Mining,
                resource: 3,
                durationSec: 180,
                batch: 77,
                startAt,
            },
            resources: [{ resourceId: 3, deposit: '100000', balance: '0', strength: null, storage: null }],
        });
        const { service } = makeService({ cell, serverTime: nowSec });

        const status = await service.getStatus('42');

        expect(status.cyclesMatured).toBe(2);
        expect(status.claimable).toBe('154'); // 2 × 77
        expect(status.nextBatchInSec).toBe(150); // 180 − 30 into the current cycle
    });

    it('drains the deposit to exactly zero on the final partial cycle', async () => {
        const cell = makeCell({
            tokenId: '42',
            owner: WALLET_ADDRESS,
            // batch 77 but only 100 units left: matured output exceeds the deposit, so claimable is the whole
            // remainder — the final cycle credits < a full batch and the deposit ends at exactly 0.
            process: {
                kind: CellProcessKind.Mining,
                resource: 3,
                durationSec: 180,
                batch: 77,
                startAt: 1,
            },
            resources: [{ resourceId: 3, deposit: '100', balance: '0', strength: null, storage: null }],
        });
        const { service } = makeService({ cell });

        const status = await service.getStatus('42');

        expect(status.claimable).toBe('100');
        expect(status.depositRemaining).toBe('100');
    });

    it('reports zero claimable and stalled when the warehouse is full', async () => {
        const cell = makeCell({
            tokenId: '42',
            owner: WALLET_ADDRESS,
            process: {
                kind: CellProcessKind.Mining,
                resource: 3,
                durationSec: 10,
                batch: 10,
                startAt: 1,
            },
            resources: [
                {
                    resourceId: 3,
                    deposit: '500',
                    balance: '50',
                    strength: null,
                    storage: makeStorage({ used: '50', cap: '50' }),
                },
            ],
        });
        const { service } = makeService({ cell });

        const status = await service.getStatus('42');

        expect(status.stalled).toBe(true);
        expect(status.claimable).toBe('0');
        expect(status.nextBatchInSec).toBeNull();
        expect(status.warehouseUsed).toBe('50');
        expect(status.warehouseCap).toBe('50');
    });

    it('caps claimable at the remaining warehouse room', async () => {
        const cell = makeCell({
            tokenId: '42',
            owner: WALLET_ADDRESS,
            process: {
                kind: CellProcessKind.Mining,
                resource: 3,
                durationSec: 10,
                batch: 10,
                startAt: 1,
            },
            resources: [
                {
                    resourceId: 3,
                    deposit: '500',
                    balance: '80',
                    strength: null,
                    storage: makeStorage({ used: '80', cap: '100' }),
                },
            ],
        });
        const { service } = makeService({ cell });

        const status = await service.getStatus('42');

        // Matured output and deposit both exceed the 20 units of remaining room, so claimable is clamped to room.
        expect(status.claimable).toBe('20');
        expect(status.stalled).toBe(false);
    });

    it('reports inactive when the cell has no mining process', async () => {
        const cell = makeCell({ tokenId: '42', owner: WALLET_ADDRESS });
        const { service } = makeService({ cell });

        const status = await service.getStatus('42');

        expect(status.active).toBe(false);
        expect(status.targetResourceId).toBeNull();
        expect(status.batch).toBeNull();
        expect(status.durationSec).toBeNull();
        expect(status.cyclesMatured).toBe(0);
        expect(status.nextBatchInSec).toBeNull();
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

// A ready Mine (mines Iron=5 / Copper=6 in makeConfig) on an owned cell with an Iron deposit.
function mineCell(overrides: Partial<RawCell> = {}): RawCell {
    return makeCell({
        tokenId: '42',
        owner: WALLET_ADDRESS,
        building: { type: BuildingType.Mine, buildFinishAt: null },
        resources: [makeResource({ resourceId: 5, deposit: '1000' })],
        ...overrides,
    });
}

describe('MiningService.startMining', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts extraction of a valid target on a ready extractor and decodes the cycle', async () => {
        const { service, contracts } = makeService({ cell: mineCell(), logs: [[startedLog(5, 180, 77n)]] });

        const result = await service.startMining({ tokenId: '42', targetResourceId: 5 });

        expect(contracts.sent).toHaveLength(1);
        const call = decodeFunctionData({ abi: CELL_ABI, data: contracts.sent[0]?.data as Hex });
        expect(call.functionName).toBe('startMining');
        expect(call.args).toEqual([42n, 5]);
        expect(result.targetResourceId).toBe(5);
        expect(result.durationSec).toBe(180);
        expect(result.batch).toBe(77);
    });

    it('rejects a target the extractor cannot mine', async () => {
        const { service, contracts } = makeService({ cell: mineCell() });
        await expect(service.startMining({ tokenId: '42', targetResourceId: 102 })).rejects.toThrow(/cannot mine/i);
        expect(contracts.sent).toHaveLength(0);
    });

    it('requires an explicit target when the extractor mines multiple resources', async () => {
        const { service } = makeService({ cell: mineCell() });
        await expect(service.startMining({ tokenId: '42', targetResourceId: null })).rejects.toThrow(
            /pass targetResourceId/i,
        );
    });

    it('auto-picks the sole minable resource when the target is omitted', async () => {
        const config: AppConfig = makeConfig();
        config.buildings = config.buildings.map((b) =>
            b.type === BuildingType.Mine ? { ...b, minableResources: [5] } : b,
        );
        const { service, contracts } = makeService({ cell: mineCell(), config });

        const result = await service.startMining({ tokenId: '42', targetResourceId: null });

        expect(result.targetResourceId).toBe(5);
        expect(contracts.sent).toHaveLength(1);
    });

    it('rejects while the extractor is still under construction', async () => {
        const future = DEFAULT_SERVER_TIME + 3600;
        const cell = mineCell({ building: { type: BuildingType.Mine, buildFinishAt: future } });
        const { service, contracts } = makeService({ cell });
        await expect(service.startMining({ tokenId: '42', targetResourceId: 5 })).rejects.toThrow(
            /still under construction/i,
        );
        expect(contracts.sent).toHaveLength(0);
    });

    it('rejects against the map clock even when the local wall clock reads far past finish', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(4_000_000_000 * 1000));
        const cell = mineCell({ building: { type: BuildingType.Mine, buildFinishAt: 1000 } });
        const { service, contracts } = makeService({ cell, serverTime: 500 });
        await expect(service.startMining({ tokenId: '42', targetResourceId: 5 })).rejects.toThrow(
            /still under construction/i,
        );
        expect(contracts.sent).toHaveLength(0);
    });

    it('accepts against the map clock even when the local wall clock reads before finish', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(0));
        const cell = mineCell({ building: { type: BuildingType.Mine, buildFinishAt: 1000 } });
        const { service, contracts } = makeService({ cell, serverTime: 1000, logs: [[startedLog(5, 180, 77n)]] });
        const result = await service.startMining({ tokenId: '42', targetResourceId: 5 });
        expect(result.targetResourceId).toBe(5);
        expect(contracts.sent).toHaveLength(1);
    });

    it('rejects when the building is a crafter, not an extractor', async () => {
        const cell = mineCell({ building: { type: BuildingType.SteelMill, buildFinishAt: null } });
        const { service } = makeService({ cell });
        await expect(service.startMining({ tokenId: '42', targetResourceId: 5 })).rejects.toThrow(/not an extractor/i);
    });

    it('rejects when the cell has no live deposit for the target', async () => {
        const cell = mineCell({ resources: [makeResource({ resourceId: 5, deposit: '0' })] });
        const { service } = makeService({ cell });
        await expect(service.startMining({ tokenId: '42', targetResourceId: 5 })).rejects.toThrow(/no .*deposit/i);
    });

    it('rejects a start on a cell owned by someone else', async () => {
        const cell = mineCell({ owner: '0xother' });
        const { service } = makeService({ cell });
        await expect(service.startMining({ tokenId: '42', targetResourceId: 5 })).rejects.toThrow(/do not own/i);
    });
});
