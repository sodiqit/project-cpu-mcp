import { describe, expect, it } from 'vitest';

import {
    buildResourceIndex,
    classifyNeighbors,
    filterCells,
    hexDistance,
    isNewer,
    parseCellState,
    summarizeMap,
} from '../map.utils.js';
import { type CellState, CellProcessKind, MapReadiness, MapScope, type MapQuery, NeighborRelation } from '../types.js';
import { makeCell } from './fixtures.js';

function query(overrides: Partial<MapQuery>): MapQuery {
    return { scope: MapScope.All, tokenIds: null, around: null, ownerAddress: null, ...overrides };
}

describe('isNewer', () => {
    it('is true when nothing is held', () => {
        expect(isNewer(makeCell({ updated: 1 }), null)).toBe(true);
    });

    it('is true only for a strictly greater updated', () => {
        const held = makeCell({ updated: 100 });
        expect(isNewer(makeCell({ updated: 101 }), held)).toBe(true);
        expect(isNewer(makeCell({ updated: 100 }), held)).toBe(false);
        expect(isNewer(makeCell({ updated: 99 }), held)).toBe(false);
    });
});

describe('hexDistance', () => {
    it('is zero for the same coordinate', () => {
        expect(hexDistance(2, -3, 2, -3)).toBe(0);
    });

    it('is one for adjacent hexes', () => {
        expect(hexDistance(0, 0, 1, 0)).toBe(1);
        expect(hexDistance(0, 0, 0, 1)).toBe(1);
        expect(hexDistance(0, 0, -1, 1)).toBe(1);
    });

    it('is symmetric', () => {
        expect(hexDistance(0, 0, 3, -1)).toBe(hexDistance(3, -1, 0, 0));
    });
});

describe('parseCellState', () => {
    it('returns the cell for a valid payload', () => {
        expect(parseCellState(makeCell())).not.toBeNull();
    });

    it('returns null for invalid payloads', () => {
        expect(parseCellState({})).toBeNull();
        expect(parseCellState(makeCell({ updated: 'soon' as unknown as number }))).toBeNull();
    });
});

describe('classifyNeighbors', () => {
    it('labels each of the six neighbours owned / other / empty (case-insensitive owner)', () => {
        const grid = new Map<string, CellState>([
            ['1,0', makeCell({ tokenId: 'a', x: 1, y: 0, owner: '0xME' })],
            ['0,1', makeCell({ tokenId: 'b', x: 0, y: 1, owner: '0xrival' })],
        ]);
        const getByCoord = (x: number, y: number): CellState | null => grid.get(`${x},${y}`) ?? null;

        const refs = classifyNeighbors(makeCell({ x: 0, y: 0 }), getByCoord, '0xme');

        expect(refs).toHaveLength(6);
        expect(refs.filter((r) => r.relation === NeighborRelation.Owned)).toHaveLength(1);
        expect(refs.filter((r) => r.relation === NeighborRelation.Other)).toHaveLength(1);
        expect(refs.filter((r) => r.relation === NeighborRelation.Empty)).toHaveLength(4);
    });
});

describe('buildResourceIndex', () => {
    it('groups resources by id while keeping each location', () => {
        const cells = [
            makeCell({
                tokenId: '1',
                resources: [
                    { resourceId: 1, deposit: '10', balance: '5', strength: 3, storage: null },
                    { resourceId: 2, deposit: '0', balance: '3', strength: null, storage: null },
                ],
            }),
            makeCell({
                tokenId: '2',
                x: 1,
                y: 0,
                resources: [{ resourceId: 1, deposit: '0', balance: '7', strength: null, storage: null }],
            }),
        ];

        const index = buildResourceIndex(cells);

        expect(index['1']).toHaveLength(2);
        expect(index['2']).toHaveLength(1);
        expect(index['1']?.[0]?.tokenId).toBe('1');
    });
});

describe('filterCells', () => {
    const cells = [
        makeCell({ tokenId: '1', x: 0, y: 0, owner: '0xme' }),
        makeCell({ tokenId: '2', x: 2, y: 0, owner: '0xRival' }),
        makeCell({ tokenId: '3', x: 5, y: 0, owner: '0xme' }),
    ];

    it('returns everything for scope=all', () => {
        expect(filterCells(cells, query({ scope: MapScope.All }))).toHaveLength(3);
    });

    it('returns nothing for scope=summary', () => {
        expect(filterCells(cells, query({ scope: MapScope.Summary }))).toHaveLength(0);
    });

    it('matches owner case-insensitively for scope=mine', () => {
        const result = filterCells(cells, query({ scope: MapScope.Mine, ownerAddress: '0xME' }));
        expect(result.map((c) => c.tokenId)).toEqual(['1', '3']);
    });

    it('includes the radius boundary for scope=around', () => {
        const result = filterCells(cells, query({ scope: MapScope.Around, around: { x: 0, y: 0, radius: 2 } }));
        expect(result.map((c) => c.tokenId)).toEqual(['1', '2']);
    });

    it('matches the token set for scope=cells', () => {
        const result = filterCells(cells, query({ scope: MapScope.Cells, tokenIds: ['3'] }));
        expect(result.map((c) => c.tokenId)).toEqual(['3']);
    });
});

describe('summarizeMap', () => {
    const base = {
        readiness: MapReadiness.Ready,
        socketConnected: true,
        version: 50,
        serverTime: 1000,
        totalCells: 4,
    };

    it('leaves owner figures null when the owner is unknown', () => {
        const summary = summarizeMap({ ...base, ownedCells: null });
        expect(summary.myCells).toBeNull();
        expect(summary.myCellsByStatus).toBeNull();
        expect(summary.depletedDeposits).toBeNull();
    });

    it('counts statuses and depleted deposits over owned cells', () => {
        const ownedCells = [
            makeCell({
                tokenId: 'm',
                revealCount: 1,
                process: {
                    kind: CellProcessKind.Mining,
                    resource: 1,
                    durationSec: 180,
                    batch: 77,
                    startAt: 1,
                    stalled: true,
                },
            }),
            makeCell({
                tokenId: 'c',
                revealCount: 1,
                process: {
                    kind: CellProcessKind.Craft,
                    recipeId: 'r',
                    batches: 1,
                    claimedBatches: 0,
                    durationSec: 60,
                    startAt: 1,
                    stalled: false,
                },
            }),
            makeCell({ tokenId: 'i', revealCount: 1 }),
            makeCell({
                tokenId: 'd',
                revealCount: 1,
                resources: [{ resourceId: 1, deposit: '0', balance: '0', strength: null, storage: null }],
            }),
        ];

        const summary = summarizeMap({ ...base, ownedCells });

        expect(summary.myCells).toBe(4);
        expect(summary.myCellsByStatus).toEqual({ idle: 2, mining: 1, crafting: 1 });
        expect(summary.depletedDeposits).toBe(1);
        expect(summary.stalledCells).toBe(1);
    });
});
