import { describe, expect, it } from 'vitest';

import { MapReader } from '../reader.js';
import { MapStore } from '../store.js';
import { type Cell, MapReadiness, MapScope, type MapStatus } from '../types.js';
import { makeCell, makeSnapshot } from './fixtures.js';

function status(readiness: MapReadiness = MapReadiness.Ready, connected = true): MapStatus {
    return { getReadiness: () => readiness, isSocketConnected: () => connected, resyncNow: () => Promise.resolve() };
}

function makeReader(cells: Array<Cell>, st: MapStatus = status()): { reader: MapReader; store: MapStore } {
    const store = new MapStore();
    store.applySnapshot(makeSnapshot({ version: 50, serverTime: 1000, cells }));
    return { reader: new MapReader({ store, status: st }), store };
}

describe('MapReader', () => {
    it('filters to owned cells with a resource index and a neighbour graph', () => {
        const { reader } = makeReader([
            makeCell({
                tokenId: '72',
                owner: '0xme',
                updated: 50,
                resources: [{ resourceId: 1, deposit: '10', balance: '0', strength: null, storage: null }],
            }),
            makeCell({ tokenId: '73', owner: '0xrival', updated: 40 }),
        ]);

        const result = reader.query({ scope: MapScope.Mine, tokenIds: null, around: null, ownerAddress: '0xme' });

        expect(result.cells.map((c) => c.tokenId)).toEqual(['72']);
        expect(result.resourceIndex?.['1']).toHaveLength(1);
        expect(result.cells[0]?.neighbors).toHaveLength(6);
        expect(result.cells[0]?.pos).toEqual({ face: 0, i: 1, j: 2 });
        expect(result.summary.myCells).toBe(1);
    });

    it('returns a summary with no cells for scope=summary', () => {
        const { reader } = makeReader([makeCell({ tokenId: '1', owner: '0xme', updated: 50 })]);

        const result = reader.query({ scope: MapScope.Summary, tokenIds: null, around: null, ownerAddress: '0xme' });

        expect(result.cells).toHaveLength(0);
        expect(result.resourceIndex).not.toBeNull();
        expect(result.summary.totalCells).toBe(1);
    });

    it('flags a still-loading map in the note', () => {
        const { reader } = makeReader([makeCell({ tokenId: '1', updated: 50 })], status(MapReadiness.Loading));

        const result = reader.query({ scope: MapScope.All, tokenIds: null, around: null, ownerAddress: null });

        expect(result.note).toMatch(/loading/i);
    });

    it('inspects a cell with expanded neighbours and distance from owned cells', () => {
        const { reader } = makeReader([
            makeCell({ tokenId: '72', owner: '0xrival', updated: 50 }),
            makeCell({ tokenId: '73', owner: '0xme', updated: 50 }),
        ]);

        const inspection = reader.inspectCell('72', '0xme');

        expect(inspection?.distanceFromMine).toBe(1);
        expect(inspection?.neighbors.map((c) => c.tokenId)).toContain('73');
        expect(reader.inspectCell('missing', '0xme')).toBeNull();
    });

    it('reports null distanceFromMine when no owned cell is within the scan cap', () => {
        const { reader } = makeReader([
            makeCell({ tokenId: '72', owner: '0xrival', updated: 50 }),
            makeCell({ tokenId: '25000', owner: '0xme', updated: 50 }),
        ]);

        expect(reader.inspectCell('72', '0xme')?.distanceFromMine).toBeNull();
        expect(reader.inspectCell('72', null)?.distanceFromMine).toBeNull();
    });

    it('returns only cells newer than the version for getChanges', () => {
        const { reader, store } = makeReader([makeCell({ tokenId: '1', updated: 50 })]);
        store.applyCell(makeCell({ tokenId: '2', updated: 120 }));

        const changes = reader.getChanges(50, null);

        expect(changes.changed.map((c) => c.tokenId)).toEqual(['2']);
        expect(changes.version).toBe(120);
    });

    it('reads a reveal cell by tokenId and returns null when absent', () => {
        const { reader } = makeReader([makeCell({ tokenId: '7', revealCount: 3, updated: 50 })]);

        expect(reader.readRevealCell('7')).toMatchObject({ tokenId: '7', revealCount: 3 });
        expect(reader.readRevealCell('missing')).toBeNull();
    });

    it('delegates refresh to the map status resync', async () => {
        let resyncs = 0;
        const st: MapStatus = {
            getReadiness: () => MapReadiness.Ready,
            isSocketConnected: () => true,
            resyncNow: async () => {
                resyncs += 1;
            },
        };
        const { reader } = makeReader([makeCell({ tokenId: '1', updated: 50 })], st);

        await reader.refresh();

        expect(resyncs).toBe(1);
    });
});
