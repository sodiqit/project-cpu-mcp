import { describe, expect, it } from 'vitest';

import { computeMaturation } from '../process.utils.js';

describe('computeMaturation', () => {
    it('counts whole matured cycles and the time into the current one', () => {
        // 2 full 180s cycles + 30s into the third.
        const m = computeMaturation({ startAt: 1000, durationSec: 180, now: 1000 + 2 * 180 + 30 });
        expect(m.elapsed).toBe(390);
        expect(m.cycles).toBe(2);
        expect(m.nextCycleInSec).toBe(150); // 180 − 30
    });

    it('reports a full cycle until the next batch exactly on a boundary', () => {
        const m = computeMaturation({ startAt: 1000, durationSec: 180, now: 1000 + 3 * 180 });
        expect(m.cycles).toBe(3);
        expect(m.nextCycleInSec).toBe(180);
    });

    it('clamps a future startAt to zero elapsed', () => {
        const m = computeMaturation({ startAt: 5000, durationSec: 180, now: 1000 });
        expect(m.elapsed).toBe(0);
        expect(m.cycles).toBe(0);
        expect(m.nextCycleInSec).toBe(180);
    });

    it('yields no cycles and no next-cycle when the duration is non-positive', () => {
        const m = computeMaturation({ startAt: 1000, durationSec: 0, now: 9999 });
        expect(m.cycles).toBe(0);
        expect(m.nextCycleInSec).toBeNull();
    });
});
