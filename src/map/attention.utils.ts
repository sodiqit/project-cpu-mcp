import { isDepleted } from './map.utils.js';
import {
    type AttentionItem,
    AttentionReason,
    type AttentionReport,
    AttentionSeverity,
    type CellResource,
    type CellState,
    CellProcessKind,
} from './types.js';
import { BuildingType } from '../api/types.js';

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
    [AttentionSeverity.Critical]: 0,
    [AttentionSeverity.Warning]: 1,
    [AttentionSeverity.Info]: 2,
};

const SUGGESTED_TOOL: Record<AttentionReason, string> = {
    [AttentionReason.StalledMining]: 'transport',
    [AttentionReason.StalledCraft]: 'transport',
    [AttentionReason.WarehouseNearFull]: 'transport',
    [AttentionReason.DepositDepleted]: 'demolish',
    [AttentionReason.DeliveryReady]: 'finalize_delivery',
    [AttentionReason.Unbuilt]: 'build',
};

const ACTION: Record<AttentionReason, string> = {
    [AttentionReason.StalledMining]:
        'Warehouse is full — mining is stalled. Offload this resource (transport out, create_lot to sell, or craft with it) to resume.',
    [AttentionReason.StalledCraft]:
        'Output warehouse is full — craft batches are paused. Offload this output (transport out or create_lot) to resume.',
    [AttentionReason.WarehouseNearFull]:
        'Warehouse is nearly full — production will stall soon. Offload before it caps.',
    [AttentionReason.DepositDepleted]:
        "Extractor's deposit is exhausted — it can no longer mine. Demolish and redeploy on a fresh deposit.",
    [AttentionReason.DeliveryReady]:
        'Delivery has arrived — finalize_delivery to land the goods and free the reserved space.',
    [AttentionReason.Unbuilt]: 'Cell is revealed but has no building. Build an extractor to start mining.',
};

export interface BuildAttentionInput {
    ownedCells: Array<CellState> | null;
    version: number;
    serverTime: number;
    nearFullPct: number;
    // recipeId → its output resourceIds; lets craft signals stay precise without the map layer knowing recipes.
    craftOutputsByRecipe: Record<string, Array<number>>;
}

function fillPercent(used: bigint, cap: bigint): number {
    if (cap === 0n) {
        return 100;
    }
    return Number((used * 100n) / cap);
}

function storageItem(
    cell: CellState,
    resource: CellResource,
    severity: AttentionSeverity,
    reason: AttentionReason,
): AttentionItem {
    const storage = resource.storage;
    const used = storage?.used ?? '0';
    const cap = storage?.cap ?? null;
    const incomingTransport = storage?.reserved.incomingTransport ?? '0';
    const lots = storage?.reserved.lots ?? '0';
    return {
        tokenId: cell.tokenId,
        x: cell.x,
        y: cell.y,
        severity,
        reason,
        resourceId: resource.resourceId,
        used,
        cap,
        fillPct: cap === null ? null : fillPercent(BigInt(used), BigInt(cap)),
        breakdown: { liquid: resource.balance, incomingTransport, lots },
        depositRemaining: null,
        deliveryId: null,
        arrivalAt: null,
        suggestedTool: SUGGESTED_TOOL[reason],
        action: ACTION[reason],
    };
}

// Resources this cell is actively producing right now: the mining target, or the active craft's outputs.
// Only these can "stall" or approach the cap, so near-full is scoped to them (a static full box does not).
function producedResourceIds(cell: CellState, craftOutputsByRecipe: Record<string, Array<number>>): Set<number> {
    const process = cell.process;
    if (process?.kind === CellProcessKind.Mining) {
        return new Set([process.resource]);
    }
    if (process?.kind === CellProcessKind.Craft) {
        return new Set(craftOutputsByRecipe[process.recipeId] ?? []);
    }
    return new Set();
}

function isNearFull(used: bigint, cap: bigint, pct: number): boolean {
    return used * 100n >= cap * BigInt(pct);
}

// An extractor that is built (not mid-construction) and whose deposits are gone can no longer mine.
function isOperationalExtractor(cell: CellState): boolean {
    return cell.building?.type === BuildingType.Extractor && cell.building.buildFinishAt === null;
}

function cellItems(cell: CellState, input: BuildAttentionInput): Array<AttentionItem> {
    const items: Array<AttentionItem> = [];
    const produced = producedResourceIds(cell, input.craftOutputsByRecipe);
    const process = cell.process;

    if (process?.kind === CellProcessKind.Mining && process.stalled) {
        const resource = cell.resources.find((r) => r.resourceId === process.resource);
        if (resource) {
            items.push(storageItem(cell, resource, AttentionSeverity.Critical, AttentionReason.StalledMining));
        }
    }

    if (process?.kind === CellProcessKind.Craft && process.stalled) {
        for (const resource of cell.resources) {
            if (produced.has(resource.resourceId) && resource.storage?.stalled === true) {
                items.push(storageItem(cell, resource, AttentionSeverity.Critical, AttentionReason.StalledCraft));
            }
        }
    }

    for (const resource of cell.resources) {
        const storage = resource.storage;
        if (
            storage !== null &&
            storage.cap !== null &&
            !storage.stalled &&
            produced.has(resource.resourceId) &&
            isNearFull(BigInt(storage.used), BigInt(storage.cap), input.nearFullPct)
        ) {
            items.push(storageItem(cell, resource, AttentionSeverity.Warning, AttentionReason.WarehouseNearFull));
        }
    }

    if (isOperationalExtractor(cell) && isDepleted(cell)) {
        items.push({
            tokenId: cell.tokenId,
            x: cell.x,
            y: cell.y,
            severity: AttentionSeverity.Warning,
            reason: AttentionReason.DepositDepleted,
            resourceId: process?.kind === CellProcessKind.Mining ? process.resource : null,
            used: null,
            cap: null,
            fillPct: null,
            breakdown: null,
            depositRemaining: '0',
            deliveryId: null,
            arrivalAt: null,
            suggestedTool: SUGGESTED_TOOL[AttentionReason.DepositDepleted],
            action: ACTION[AttentionReason.DepositDepleted],
        });
    }

    if (cell.revealCount > 0 && cell.building === null && !cell.revealPending) {
        items.push({
            tokenId: cell.tokenId,
            x: cell.x,
            y: cell.y,
            severity: AttentionSeverity.Info,
            reason: AttentionReason.Unbuilt,
            resourceId: null,
            used: null,
            cap: null,
            fillPct: null,
            breakdown: null,
            depositRemaining: null,
            deliveryId: null,
            arrivalAt: null,
            suggestedTool: SUGGESTED_TOOL[AttentionReason.Unbuilt],
            action: ACTION[AttentionReason.Unbuilt],
        });
    }

    return items;
}

function countBySeverity(items: Array<AttentionItem>): Record<AttentionSeverity, number> {
    const counts: Record<AttentionSeverity, number> = {
        [AttentionSeverity.Critical]: 0,
        [AttentionSeverity.Warning]: 0,
        [AttentionSeverity.Info]: 0,
    };
    for (const item of items) {
        counts[item.severity] += 1;
    }
    return counts;
}

// Most-urgent first, then a stable tokenId tiebreak so callers get a deterministic ordering.
export function sortAttentionItems(items: Array<AttentionItem>): Array<AttentionItem> {
    return [...items].sort((a, b) => {
        const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        return rank !== 0 ? rank : a.tokenId.localeCompare(b.tokenId);
    });
}

export function buildAttentionReport(input: BuildAttentionInput): AttentionReport {
    if (input.ownedCells === null) {
        return {
            ownerKnown: false,
            version: input.version,
            serverTime: input.serverTime,
            counts: countBySeverity([]),
            items: [],
            note: null,
        };
    }
    const items = sortAttentionItems(input.ownedCells.flatMap((cell) => cellItems(cell, input)));
    return {
        ownerKnown: true,
        version: input.version,
        serverTime: input.serverTime,
        counts: countBySeverity(items),
        items,
        note: null,
    };
}

// Fold tool-layer items (delivery-ready, sourced from the deliveries endpoint) into a map-derived report,
// re-sorting and re-counting so the merged result stays ordered and consistent.
export function withExtraItems(
    report: AttentionReport,
    extraItems: Array<AttentionItem>,
    note: string | null,
): AttentionReport {
    const items = sortAttentionItems([...report.items, ...extraItems]);
    return { ...report, items, counts: countBySeverity(items), note };
}
