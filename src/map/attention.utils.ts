import { isDepleted, isInDemolishCooldown } from './map.utils.js';
import {
    type AttentionItem,
    AttentionReason,
    type AttentionReport,
    AttentionSeverity,
    type CellResource,
    type CellState,
    CellProcessKind,
} from './types.js';

const { Critical, Warning, Info } = AttentionSeverity;

// Each reason has a fixed urgency (how time-sensitive the fact is), used only for ordering — the report
// stays descriptive and suggests no action, leaving what to do to the caller.
const REASON_SEVERITY: Record<AttentionReason, AttentionSeverity> = {
    [AttentionReason.StalledMining]: Critical,
    [AttentionReason.StalledCraft]: Critical,
    [AttentionReason.WarehouseNearFull]: Warning,
    [AttentionReason.DepositDepleted]: Warning,
    [AttentionReason.DeliveryReady]: Warning,
    [AttentionReason.Unbuilt]: Info,
    [AttentionReason.DemolishCooldown]: Info,
};

const SEVERITY_RANK: Record<AttentionSeverity, number> = { [Critical]: 0, [Warning]: 1, [Info]: 2 };

export interface BuildAttentionInput {
    ownedCells: Array<CellState> | null;
    version: number;
    serverTime: number;
    nearFullPct: number;
    // recipeId → its output resourceIds; lets craft signals stay precise without the map layer knowing recipes.
    craftOutputsByRecipe: Record<string, Array<number>>;
    // Building types whose kind is `extractor`; injected so the map layer stays config-agnostic.
    extractorBuildingTypes: Set<string>;
}

// Every item shares this shape; a reason + coords + a few `extra` fields is all that varies.
export function attentionItem(
    loc: { tokenId: string; x: number; y: number },
    reason: AttentionReason,
    extra: Partial<AttentionItem> = {},
): AttentionItem {
    return {
        tokenId: loc.tokenId,
        x: loc.x,
        y: loc.y,
        severity: REASON_SEVERITY[reason],
        reason,
        resourceId: null,
        used: null,
        cap: null,
        fillPct: null,
        breakdown: null,
        depositRemaining: null,
        deliveryId: null,
        arrivalAt: null,
        ...extra,
    };
}

function storageFields(resource: CellResource): Partial<AttentionItem> {
    const s = resource.storage;
    const used = s?.used ?? '0';
    const cap = s?.cap ?? null;
    return {
        resourceId: resource.resourceId,
        used,
        cap,
        fillPct: cap === null || cap === '0' ? null : Number((BigInt(used) * 100n) / BigInt(cap)),
        breakdown: {
            liquid: resource.balance,
            incomingTransport: s?.reserved.incomingTransport ?? '0',
            lots: s?.reserved.lots ?? '0',
        },
    };
}

// Resources this cell is actively producing right now: the mining target, or the active craft's outputs.
// Only these can stall or approach the cap, so near-full is scoped to them (a static full box does not).
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

function isOperationalExtractor(cell: CellState, serverTime: number, extractorTypes: Set<string>): boolean {
    const building = cell.building;
    if (building === null || !extractorTypes.has(building.type)) {
        return false;
    }
    return building.buildFinishAt === null || building.buildFinishAt <= serverTime;
}

function cellItems(cell: CellState, input: BuildAttentionInput): Array<AttentionItem> {
    const items: Array<AttentionItem> = [];
    const produced = producedResourceIds(cell, input.craftOutputsByRecipe);
    const isCraft = cell.process?.kind === CellProcessKind.Craft;

    // One pass over produced, capped boxes: a full one stalls, an almost-full one warns.
    for (const resource of cell.resources) {
        const s = resource.storage;
        if (!s || s.cap === null || !produced.has(resource.resourceId)) {
            continue;
        }
        if (s.stalled) {
            items.push(
                attentionItem(
                    cell,
                    isCraft ? AttentionReason.StalledCraft : AttentionReason.StalledMining,
                    storageFields(resource),
                ),
            );
        } else if (BigInt(s.used) * 100n >= BigInt(s.cap) * BigInt(input.nearFullPct)) {
            items.push(attentionItem(cell, AttentionReason.WarehouseNearFull, storageFields(resource)));
        }
    }

    if (isOperationalExtractor(cell, input.serverTime, input.extractorBuildingTypes) && isDepleted(cell)) {
        const target = cell.process?.kind === CellProcessKind.Mining ? cell.process.resource : null;
        items.push(attentionItem(cell, AttentionReason.DepositDepleted, { resourceId: target, depositRemaining: '0' }));
    }
    if (cell.revealCount > 0 && cell.building === null && !cell.revealPending) {
        // A just-demolished cell is empty but can't be rebuilt until its cooldown ends — flag the wait, not a
        // missing building, so the caller isn't told to build somewhere it can't yet.
        if (isInDemolishCooldown(cell, input.serverTime)) {
            items.push(attentionItem(cell, AttentionReason.DemolishCooldown, { arrivalAt: cell.demolishFinishAt }));
        } else {
            items.push(attentionItem(cell, AttentionReason.Unbuilt));
        }
    }
    return items;
}

function countBySeverity(items: Array<AttentionItem>): Record<AttentionSeverity, number> {
    const counts: Record<AttentionSeverity, number> = { [Critical]: 0, [Warning]: 0, [Info]: 0 };
    for (const item of items) {
        counts[item.severity] += 1;
    }
    return counts;
}

// Most-urgent first, then a stable tokenId tiebreak so callers get a deterministic ordering.
export function sortAttentionItems(items: Array<AttentionItem>): Array<AttentionItem> {
    return [...items].sort(
        (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.tokenId.localeCompare(b.tokenId),
    );
}

export function meetsSeverity(severity: AttentionSeverity, min: AttentionSeverity | null): boolean {
    return min === null || SEVERITY_RANK[severity] <= SEVERITY_RANK[min];
}

export function buildAttentionReport(input: BuildAttentionInput): AttentionReport {
    const cells = input.ownedCells;
    const items = cells === null ? [] : sortAttentionItems(cells.flatMap((cell) => cellItems(cell, input)));
    return {
        ownerKnown: cells !== null,
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
