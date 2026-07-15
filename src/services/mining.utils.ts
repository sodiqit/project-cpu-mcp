import { fitBatchesByRoom } from '../map/storage.utils.js';
import type { CellResource } from '../map/types.js';

export function veinDrawPerCycle(yieldPerCycle: number, veinDrainPercent: number): number {
    const scaled = Math.floor((yieldPerCycle * veinDrainPercent) / 100);
    return scaled === 0 ? 1 : scaled;
}

export interface MiningSettleInput {
    resourceId: number;
    yieldPerCycle: number;
    drawPerCycle: number;
    claimableBatches: number;
    depositRemaining: bigint;
    resources: ReadonlyArray<CellResource>;
}

export interface MiningSettlement {
    settledBatches: number;
    minedUnits: bigint;
    drainedUnits: bigint;
}

export function settleMining({
    resourceId,
    yieldPerCycle,
    drawPerCycle,
    claimableBatches,
    depositRemaining,
    resources,
}: MiningSettleInput): MiningSettlement {
    const draw = BigInt(drawPerCycle);
    const fitByRoom = fitBatchesByRoom([{ resourceId, amount: yieldPerCycle }], resources);
    const fitByDeposit = Number((depositRemaining + draw - 1n) / draw);

    const settledBatches = Math.min(claimableBatches, fitByRoom ?? claimableBatches, fitByDeposit);
    const wouldDrain = BigInt(settledBatches) * draw;
    const drainedUnits = wouldDrain > depositRemaining ? depositRemaining : wouldDrain;

    return { settledBatches, drainedUnits, minedUnits: (drainedUnits * BigInt(yieldPerCycle)) / draw };
}
