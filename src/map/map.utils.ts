import { z } from 'zod';

import { HEX_NEIGHBOR_OFFSETS } from './constants.js';
import {
    type CellState,
    cellStateSchema,
    CellProcessKind,
    type MapCellStatusCounts,
    type MapQuery,
    MapReadiness,
    MapScope,
    type ParsedSnapshot,
    type MapSummary,
    type NeighborRef,
    NeighborRelation,
    type ResourceIndex,
} from './types.js';

// The snapshot envelope is parsed strictly (a malformed serverTime/version is a real protocol error), but each
// cell is parsed tolerantly below — mirrors the socket path, which already drops rather than throws on one cell.
const snapshotEnvelopeSchema = z.object({
    serverTime: z.number(),
    version: z.number(),
    cells: z.array(z.unknown()),
});

// The single apply-if-newer predicate — shared by every write path so dedup stays consistent.
export function isNewer(incoming: CellState, held: CellState | null): boolean {
    return held === null || incoming.updated > held.updated;
}

export function hexDistance(ax: number, ay: number, bx: number, by: number): number {
    return (Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(ax + ay - bx - by)) / 2;
}

export function parseCellState(raw: unknown): CellState | null {
    const result = cellStateSchema.safeParse(raw);
    return result.success ? result.data : null;
}

export function parseSnapshot(raw: unknown): ParsedSnapshot {
    const envelope = snapshotEnvelopeSchema.parse(raw);
    const cells: Array<CellState> = [];
    let dropped = 0;
    for (const rawCell of envelope.cells) {
        const cell = parseCellState(rawCell);
        if (cell === null) {
            dropped += 1;
        } else {
            cells.push(cell);
        }
    }
    return { snapshot: { serverTime: envelope.serverTime, version: envelope.version, cells }, dropped };
}

function sameAddress(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}

export function classifyNeighbors(
    cell: CellState,
    getByCoord: (x: number, y: number) => CellState | null,
    ownerAddress: string | null,
): Array<NeighborRef> {
    return HEX_NEIGHBOR_OFFSETS.map(([dx, dy]) => {
        const x = cell.x + dx;
        const y = cell.y + dy;
        const neighbor = getByCoord(x, y);

        if (neighbor === null) {
            return { x, y, tokenId: null, relation: NeighborRelation.Empty };
        }

        const relation =
            ownerAddress !== null && sameAddress(neighbor.owner, ownerAddress)
                ? NeighborRelation.Owned
                : NeighborRelation.Other;

        return { x, y, tokenId: neighbor.tokenId, relation };
    });
}

// Groups resources by id while keeping each location, so the agent can answer "where is resource X"
// without scanning every cell.
export function buildResourceIndex(cells: Array<CellState>): ResourceIndex {
    const index: ResourceIndex = {};

    for (const cell of cells) {
        for (const resource of cell.resources) {
            const key = String(resource.resourceId);
            const location = {
                tokenId: cell.tokenId,
                x: cell.x,
                y: cell.y,
                deposit: resource.deposit,
                balance: resource.balance,
            };
            const existing = index[key];
            if (existing) {
                existing.push(location);
            } else {
                index[key] = [location];
            }
        }
    }

    return index;
}

function matchesQuery(cell: CellState, query: MapQuery): boolean {
    switch (query.scope) {
        case MapScope.All:
            return true;
        case MapScope.Mine:
            return query.ownerAddress !== null && sameAddress(cell.owner, query.ownerAddress);
        case MapScope.Around:
            return (
                query.around !== null &&
                hexDistance(cell.x, cell.y, query.around.x, query.around.y) <= query.around.radius
            );
        case MapScope.Cells:
            return query.tokenIds !== null && query.tokenIds.includes(cell.tokenId);
        case MapScope.Summary:
            return false;
    }
}

export function filterCells(cells: Iterable<CellState>, query: MapQuery): Array<CellState> {
    const result: Array<CellState> = [];
    for (const cell of cells) {
        if (matchesQuery(cell, query)) {
            result.push(cell);
        }
    }
    return result;
}

// A cell counts as depleted only after a reveal — an unrevealed cell has no deposits yet.
export function isDepleted(cell: CellState): boolean {
    return cell.revealCount > 0 && cell.resources.length > 0 && cell.resources.every((r) => r.deposit === '0');
}

// A just-demolished cell is empty (building === null) but locked from rebuilding until demolishFinishAt. Returns
// that end timestamp while the cooldown is active, else null — callers get the value without a second null-check.
export function demolishCooldownEnd(cell: CellState, serverTime: number): number | null {
    return cell.demolishFinishAt !== null && cell.demolishFinishAt > serverTime ? cell.demolishFinishAt : null;
}

function countStatuses(cells: Array<CellState>): MapCellStatusCounts {
    let idle = 0;
    let mining = 0;
    let crafting = 0;

    for (const cell of cells) {
        const isMining = cell.process?.kind === CellProcessKind.Mining;
        const isCrafting = cell.process?.kind === CellProcessKind.Craft;
        if (isMining) {
            mining += 1;
        }
        if (isCrafting) {
            crafting += 1;
        }
        if (cell.revealCount > 0 && !isMining && !isCrafting) {
            idle += 1;
        }
    }

    return { idle, mining, crafting };
}

export interface SummarizeInput {
    readiness: MapReadiness;
    socketConnected: boolean;
    version: number;
    serverTime: number;
    totalCells: number;
    ownedCells: Array<CellState> | null;
}

export function summarizeMap(input: SummarizeInput): MapSummary {
    const { ownedCells } = input;

    return {
        version: input.version,
        serverTime: input.serverTime,
        readiness: input.readiness,
        socketConnected: input.socketConnected,
        totalCells: input.totalCells,
        myCells: ownedCells === null ? null : ownedCells.length,
        myCellsByStatus: ownedCells === null ? null : countStatuses(ownedCells),
        depletedDeposits: ownedCells === null ? null : ownedCells.filter(isDepleted).length,
        stalledCells: ownedCells === null ? null : ownedCells.filter((c) => c.process?.stalled === true).length,
    };
}
