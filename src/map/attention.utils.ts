import { demolishCooldownEnd, isDepleted } from './map.utils.js';
import { computeBatchProgress, processOutputs } from './process.utils.js';
import { needByResource, warehouseRoom } from './storage.utils.js';
import {
    type AttentionItem,
    AttentionReason,
    type AttentionReport,
    AttentionSeverity,
    type CellResource,
    type Cell,
    CellProcessKind,
    type ProcessOutput,
} from './types.js';

const { Critical, Warning, Info } = AttentionSeverity;

// Each reason has a fixed urgency (how time-sensitive the fact is), used only for ordering — the report
// stays descriptive and suggests no action, leaving what to do to the caller.
const REASON_SEVERITY: Record<AttentionReason, AttentionSeverity> = {
    [AttentionReason.StalledMining]: Critical,
    [AttentionReason.StalledCraft]: Critical,
    [AttentionReason.WarehouseNearFull]: Warning,
    [AttentionReason.DepositDepleted]: Warning,
    [AttentionReason.ProcessFinished]: Warning,
    [AttentionReason.DeliveryReady]: Warning,
    [AttentionReason.Unbuilt]: Info,
    [AttentionReason.DemolishCooldown]: Info,
};

const SEVERITY_RANK: Record<AttentionSeverity, number> = { [Critical]: 0, [Warning]: 1, [Info]: 2 };

export interface BuildAttentionInput {
    ownedCells: Array<Cell> | null;
    version: number;
    serverTime: number;
    nearFullPct: number;
    // recipeId → what one cycle outputs; lets craft signals stay precise without the map layer knowing recipes.
    craftOutputsByRecipe: Record<string, Array<ProcessOutput>>;
    // Building types whose kind is `extractor`; injected so the map layer stays config-agnostic.
    extractorBuildingTypes: Set<string>;
}

// Every item shares this shape; a reason + a few `extra` fields is all that varies.
export function attentionItem(
    loc: { tokenId: string },
    reason: AttentionReason,
    extra: Partial<AttentionItem> = {},
): AttentionItem {
    return {
        tokenId: loc.tokenId,
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

// What one cycle of the active process credits, keyed by resource. Only these boxes can stall or approach
// the cap, so both signals are scoped to them (a static full box does not stall anything).
function cycleNeedByResource(
    cell: Cell,
    craftOutputsByRecipe: Record<string, Array<ProcessOutput>>,
): Map<number, bigint> {
    return cell.process === null ? new Map() : needByResource(processOutputs(cell.process, craftOutputsByRecipe));
}

function isOperationalExtractor(cell: Cell, extractorTypes: Set<string>): boolean {
    const building = cell.building;
    return building !== null && extractorTypes.has(building.type) && cell.ready === true;
}

function finishedProcess(cell: Cell, serverTime: number): boolean {
    const process = cell.process;
    if (process === null) {
        return false;
    }
    return computeBatchProgress({
        durationSec: process.durationSec,
        batches: process.batches,
        claimedBatches: process.claimedBatches,
        startAtSec: process.startAt,
        nowSec: serverTime,
    }).isFinished;
}

function cellItems(cell: Cell, input: BuildAttentionInput): Array<AttentionItem> {
    const items: Array<AttentionItem> = [];
    const need = cycleNeedByResource(cell, input.craftOutputsByRecipe);
    const isCraft = cell.process?.kind === CellProcessKind.Craft;

    // One pass over the boxes this process feeds: one that can't take a whole cycle stalls it, an
    // almost-full one warns.
    for (const resource of cell.resources) {
        const s = resource.storage;
        const needed = need.get(resource.resourceId) ?? 0n;
        if (!s || s.cap === null || needed === 0n) {
            continue;
        }
        const room = warehouseRoom(s);
        if (room !== null && room < needed) {
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

    if (finishedProcess(cell, input.serverTime)) {
        const target = cell.process?.kind === CellProcessKind.Mining ? cell.process.resource : null;
        items.push(attentionItem(cell, AttentionReason.ProcessFinished, { resourceId: target }));
    }
    if (isOperationalExtractor(cell, input.extractorBuildingTypes) && isDepleted(cell)) {
        const target = cell.process?.kind === CellProcessKind.Mining ? cell.process.resource : null;
        items.push(attentionItem(cell, AttentionReason.DepositDepleted, { resourceId: target, depositRemaining: '0' }));
    }
    if (cell.revealCount > 0 && cell.building === null && !cell.revealPending) {
        // A just-demolished cell is empty but can't be rebuilt until its cooldown ends — flag the wait, not a
        // missing building, so the caller isn't told to build somewhere it can't yet.
        const cooldownEnd = demolishCooldownEnd(cell, input.serverTime);
        if (cooldownEnd !== null) {
            items.push(attentionItem(cell, AttentionReason.DemolishCooldown, { arrivalAt: cooldownEnd }));
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
