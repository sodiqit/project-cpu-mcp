// Shared maturation math for the matured-batch engine: both mining and craft advance in whole cycles of
// `durationSec` from a snapshotted `startAt`. `now` must be the map's `serverTime` (same clock domain as the
// on-chain `startAt`), not the client wall clock — that keeps the estimate skew-free and conservative
// (serverTime <= the block.timestamp of a later claim, so it never over-counts matured cycles).
export interface MaturationInput {
    startAt: number;
    durationSec: number;
    now: number;
}

export interface Maturation {
    elapsed: number;
    // Whole cycles matured since `startAt`; 0 when `durationSec <= 0`.
    cycles: number;
    // Seconds until the next cycle matures; null when `durationSec <= 0`.
    nextCycleInSec: number | null;
}

export function computeMaturation({ startAt, durationSec, now }: MaturationInput): Maturation {
    const elapsed = Math.max(0, now - startAt);
    if (durationSec <= 0) {
        return { elapsed, cycles: 0, nextCycleInSec: null };
    }
    return {
        elapsed,
        cycles: Math.floor(elapsed / durationSec),
        nextCycleInSec: durationSec - (elapsed % durationSec),
    };
}
