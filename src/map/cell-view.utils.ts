import {
    type Cell,
    CellProcessKind,
    type CellProcessView,
    type CellProjectionConfig,
    type CellResource,
    type CellResourceStorage,
    type RawCell,
    type RawCellProcessView,
    type RawCellResource,
    type RawCellResourceStorage,
} from './types.js';

const NO_HUB_MULTIPLIER = 1;

function cellReady(cell: RawCell, serverTime: number): boolean | null {
    const building = cell.building;
    if (building === null) {
        return null;
    }
    return building.buildFinishAt === null || serverTime >= building.buildFinishAt;
}

function deriveStorage(storage: RawCellResourceStorage | null, multiplier: number): CellResourceStorage | null {
    if (storage === null) {
        return null;
    }
    if (storage.cap === null) {
        return { ...storage, stalled: false };
    }
    const cap = BigInt(storage.cap) * BigInt(multiplier);
    return { ...storage, cap: cap.toString(), stalled: BigInt(storage.used) >= cap };
}

function deriveResource(resource: RawCellResource, multiplier: number): CellResource {
    return { ...resource, storage: deriveStorage(resource.storage, multiplier) };
}

function stalledResourceIds(resources: Array<CellResource>): Set<number> {
    const ids = new Set<number>();
    for (const resource of resources) {
        if (resource.storage?.stalled === true) {
            ids.add(resource.resourceId);
        }
    }
    return ids;
}

function isProcessStalled(
    process: RawCellProcessView,
    stalled: ReadonlySet<number>,
    craftOutputsByRecipe: Record<string, Array<number>>,
): boolean {
    if (process.kind === CellProcessKind.Mining) {
        return stalled.has(process.resource);
    }
    return (craftOutputsByRecipe[process.recipeId] ?? []).some((resourceId) => stalled.has(resourceId));
}

function deriveProcess(
    process: RawCellProcessView | null,
    resources: Array<CellResource>,
    config: CellProjectionConfig,
): CellProcessView | null {
    if (process === null) {
        return null;
    }
    const stalled = isProcessStalled(process, stalledResourceIds(resources), config.craftOutputsByRecipe);
    return { ...process, stalled };
}

export function toCell(raw: RawCell, serverTime: number, config: CellProjectionConfig): Cell {
    const ready = cellReady(raw, serverTime);
    const activeHub = ready === true && raw.building !== null && config.hubBuildingTypes.has(raw.building.type);
    const resources = raw.resources.map((resource) =>
        deriveResource(resource, activeHub ? config.hubStorageMultiplier : NO_HUB_MULTIPLIER),
    );

    return { ...raw, resources, process: deriveProcess(raw.process, resources, config), ready, activeHub };
}
