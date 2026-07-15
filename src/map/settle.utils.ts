import { FULL_VEIN_DRAIN_PERCENT } from './constants.js';
import { processOutputs } from './process.utils.js';
import { fitBatchesByRoom } from './storage.utils.js';
import { CellProcessKind, type Cell, type CellResource, type ProcessOutput } from './types.js';

export function veinDrawPerCycle(yieldPerCycle: number, veinDrainPercent: number): number {
    const scaled = Math.floor((yieldPerCycle * veinDrainPercent) / 100);
    return scaled === 0 ? 1 : scaled;
}

export interface Settlement {
    settledBatches: number;
    minedUnits: bigint;
    drainedUnits: bigint;
    depleted: boolean;
}

export interface MiningSettleInput {
    resourceId: number;
    yieldPerCycle: number;
    drawPerCycle: number;
    maturedBatches: number;
    depositRemaining: bigint;
    resources: ReadonlyArray<CellResource>;
}

export function settleMining({
    resourceId,
    yieldPerCycle,
    drawPerCycle,
    maturedBatches,
    depositRemaining,
    resources,
}: MiningSettleInput): Settlement {
    const draw = BigInt(drawPerCycle);
    const fitByRoom = fitBatchesByRoom([{ resourceId, amount: yieldPerCycle }], resources);
    const fitByDeposit = Number((depositRemaining + draw - 1n) / draw);

    const settledBatches = Math.min(maturedBatches, fitByRoom ?? maturedBatches, fitByDeposit);
    const wouldDrain = BigInt(settledBatches) * draw;
    const drainedUnits = wouldDrain > depositRemaining ? depositRemaining : wouldDrain;

    return {
        settledBatches,
        drainedUnits,
        minedUnits: (drainedUnits * BigInt(yieldPerCycle)) / draw,
        depleted: depositRemaining - drainedUnits === 0n,
    };
}

export interface CraftSettleInput {
    outputs: ReadonlyArray<ProcessOutput>;
    maturedBatches: number;
    resources: ReadonlyArray<CellResource>;
}

export function settleCraft({ outputs, maturedBatches, resources }: CraftSettleInput): Settlement {
    const fitByRoom = fitBatchesByRoom(outputs, resources);

    return {
        settledBatches: Math.min(maturedBatches, fitByRoom ?? maturedBatches),
        minedUnits: 0n,
        drainedUnits: 0n,
        depleted: false,
    };
}

export interface SettleConfig {
    craftOutputsByRecipe: Record<string, Array<ProcessOutput>>;
    veinDrainPercentByBuilding: Record<string, number>;
}

export function settleCell(cell: Cell, maturedBatches: number, config: SettleConfig): Settlement {
    const process = cell.process;
    if (process === null) {
        return { settledBatches: 0, minedUnits: 0n, drainedUnits: 0n, depleted: false };
    }
    const outputs = processOutputs(process, config.craftOutputsByRecipe);
    if (process.kind !== CellProcessKind.Mining) {
        return settleCraft({ outputs, maturedBatches, resources: cell.resources });
    }
    const drainPercent =
        cell.building === null
            ? FULL_VEIN_DRAIN_PERCENT
            : (config.veinDrainPercentByBuilding[cell.building.type] ?? FULL_VEIN_DRAIN_PERCENT);

    return settleMining({
        resourceId: process.resource,
        yieldPerCycle: process.yieldPerCycle,
        drawPerCycle: veinDrawPerCycle(process.yieldPerCycle, drainPercent),
        maturedBatches,
        depositRemaining: BigInt(cell.resources.find((r) => r.resourceId === process.resource)?.deposit ?? '0'),
        resources: cell.resources,
    });
}
