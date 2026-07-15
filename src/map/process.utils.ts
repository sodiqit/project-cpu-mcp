import { CellProcessKind, type ProcessOutput, type RawCellProcessView } from './types.js';

export function processOutputs(
    process: RawCellProcessView,
    craftOutputsByRecipe: Record<string, Array<ProcessOutput>>,
): Array<ProcessOutput> {
    if (process.kind === CellProcessKind.Mining) {
        return [{ resourceId: process.resource, amount: process.yieldPerCycle }];
    }
    return craftOutputsByRecipe[process.recipeId] ?? [];
}

export interface BatchProgressInput {
    durationSec: number;
    batches: number;
    claimedBatches: number;
    startAtSec: number;
    nowSec: number;
}

export interface BatchProgress {
    completedBatches: number;
    claimableBatches: number;
    isFinished: boolean;
    endsAtSec: number;
    nextBatchAtSec: number | null;
}

export function computeBatchProgress({
    durationSec,
    batches,
    claimedBatches,
    startAtSec,
    nowSec,
}: BatchProgressInput): BatchProgress {
    const remaining = Math.max(0, batches - claimedBatches);
    const elapsedSec = Math.max(0, nowSec - startAtSec);
    const matured = durationSec > 0 ? Math.floor(elapsedSec / durationSec) : remaining;
    const claimableBatches = Math.min(matured, remaining);
    const isFinished = matured >= remaining;

    return {
        completedBatches: claimedBatches + claimableBatches,
        claimableBatches,
        isFinished,
        endsAtSec: startAtSec + remaining * durationSec,
        nextBatchAtSec: isFinished ? null : startAtSec + (claimableBatches + 1) * durationSec,
    };
}
