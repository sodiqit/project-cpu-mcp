import { buildAttentionReport } from './attention.utils.js';
import { buildResourceIndex, classifyNeighbors, filterCells, hexDistance, summarizeMap } from './map.utils.js';
import type { MapStore } from './store.js';
import {
    type AttentionReport,
    type CellInspection,
    type CellState,
    type EnrichedCell,
    type MapChanges,
    type MapQuery,
    type MapQueryResult,
    MapReadiness,
    type MapReaderOptions,
    MapScope,
    type MapStatus,
    type ResourceIndex,
} from './types.js';

export interface AttentionOptions {
    nearFullPct: number;
    craftOutputsByRecipe: Record<string, Array<number>>;
    extractorBuildingTypes: Set<string>;
}

const LOADING_NOTE = 'Map is still loading; data may be incomplete. Retry shortly.';

// Read side over the store: filters, enriches with neighbours, and shapes the agent-facing payloads.
// Pure with respect to I/O — it never touches the socket or network, only the store and status view.
export class MapReader {
    private readonly store: MapStore;
    private readonly status: MapStatus;

    constructor(options: MapReaderOptions) {
        this.store = options.store;
        this.status = options.status;
    }

    query(query: MapQuery): MapQueryResult {
        const ownedCells = query.ownerAddress === null ? null : this.store.getByOwner(query.ownerAddress);
        const summary = summarizeMap({
            readiness: this.status.getReadiness(),
            socketConnected: this.status.isSocketConnected(),
            version: this.store.getLatestUpdated(),
            serverTime: this.store.getServerTime(),
            totalCells: this.store.size(),
            ownedCells,
        });
        const resourceIndex: ResourceIndex | null = ownedCells === null ? null : buildResourceIndex(ownedCells);
        const note = this.status.getReadiness() === MapReadiness.Loading ? LOADING_NOTE : null;

        if (query.scope === MapScope.Summary) {
            return { summary, scope: query.scope, resourceIndex, cells: [], returnedCells: 0, note };
        }

        const cells = filterCells(this.store.values(), query).map((cell) => this.enrich(cell, query.ownerAddress));
        return { summary, scope: query.scope, resourceIndex, cells, returnedCells: cells.length, note };
    }

    inspectCell(tokenId: string, ownerAddress: string | null): CellInspection | null {
        const cell = this.store.get(tokenId);
        if (cell === null) {
            return null;
        }

        const enriched = this.enrich(cell, ownerAddress);
        const neighbors: Array<CellState> = [];
        for (const ref of enriched.neighbors) {
            if (ref.tokenId === null) {
                continue;
            }
            const neighbor = this.store.get(ref.tokenId);
            if (neighbor !== null) {
                neighbors.push(neighbor);
            }
        }

        return { cell: enriched, neighbors, distanceFromMine: this.nearestOwnedDistance(cell, ownerAddress) };
    }

    readRevealCell(tokenId: string): CellState | null {
        return this.store.get(tokenId);
    }

    attention(ownerAddress: string | null, options: AttentionOptions): AttentionReport {
        const ownedCells = ownerAddress === null ? null : this.store.getByOwner(ownerAddress);
        return buildAttentionReport({
            ownedCells,
            version: this.store.getLatestUpdated(),
            serverTime: this.store.getServerTime(),
            nearFullPct: options.nearFullPct,
            craftOutputsByRecipe: options.craftOutputsByRecipe,
            extractorBuildingTypes: options.extractorBuildingTypes,
        });
    }

    refresh(): Promise<void> {
        return this.status.resyncNow();
    }

    getChanges(sinceVersion: number, ownerAddress: string | null): MapChanges {
        const changed = this.store.changedSince(sinceVersion).map((cell) => this.enrich(cell, ownerAddress));
        return {
            version: this.store.getLatestUpdated(),
            serverTime: this.store.getServerTime(),
            changed,
            changedCount: changed.length,
        };
    }

    private enrich(cell: CellState, ownerAddress: string | null): EnrichedCell {
        return {
            ...cell,
            neighbors: classifyNeighbors(cell, (x, y) => this.store.getByCoord(x, y), ownerAddress),
        };
    }

    private nearestOwnedDistance(cell: CellState, ownerAddress: string | null): number | null {
        if (ownerAddress === null) {
            return null;
        }
        let nearest: number | null = null;
        for (const owned of this.store.getByOwner(ownerAddress)) {
            if (owned.tokenId === cell.tokenId) {
                continue;
            }
            const distance = hexDistance(cell.x, cell.y, owned.x, owned.y);
            if (nearest === null || distance < nearest) {
                nearest = distance;
            }
        }
        return nearest;
    }
}
