import { describe, expect, it } from 'vitest';

import { computeBatchProgress } from '../process.utils.js';

const BASE = { durationSec: 180, batches: 10, claimedBatches: 0, startAtSec: 1000 };

const at = (nowSec: number, overrides: Partial<typeof BASE> = {}) =>
    computeBatchProgress({ ...BASE, ...overrides, nowSec });

describe('computeBatchProgress', () => {
    it('counts only whole cycles, ignoring time into the current one', () => {
        const p = at(1000 + 2 * 180 + 30);
        expect(p.completedBatches).toBe(2);
        expect(p.claimableBatches).toBe(2);
        expect(p.nextBatchAtSec).toBe(1000 + 3 * 180);
        expect(p.isFinished).toBe(false);
    });

    it('matures a cycle exactly on its boundary', () => {
        expect(at(1000 + 3 * 180).claimableBatches).toBe(3);
    });

    it('clamps a future cursor to zero elapsed', () => {
        const p = at(500);
        expect(p.claimableBatches).toBe(0);
        expect(p.nextBatchAtSec).toBe(1180);
    });

    it('measures cycles from the advanced cursor rather than subtracting claimedBatches twice', () => {
        const p = at(1000 + 5 * 180, { claimedBatches: 3, startAtSec: 1000 + 3 * 180 });
        expect(p.claimableBatches).toBe(2);
        expect(p.completedBatches).toBe(5);
        expect(p.endsAtSec).toBe(1000 + 3 * 180 + 7 * 180);
    });

    it('caps claimable at the batches left to run, however long it waits', () => {
        const p = at(1000 + 999 * 180, { claimedBatches: 8, startAtSec: 1000 });
        expect(p.claimableBatches).toBe(2);
        expect(p.completedBatches).toBe(10);
        expect(p.isFinished).toBe(true);
        expect(p.nextBatchAtSec).toBeNull();
    });

    it('finishes exactly when the last scheduled cycle matures', () => {
        expect(at(1000 + 9 * 180).isFinished).toBe(false);
        expect(at(1000 + 10 * 180).isFinished).toBe(true);
    });

    it('reads a job predating bounded mining (zero batches) as finished with nothing to claim', () => {
        const p = at(9999, { batches: 0 });
        expect(p.claimableBatches).toBe(0);
        expect(p.completedBatches).toBe(0);
        expect(p.isFinished).toBe(true);
        expect(p.endsAtSec).toBe(1000);
        expect(p.nextBatchAtSec).toBeNull();
    });
});
