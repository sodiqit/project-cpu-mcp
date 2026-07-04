import type { CellState, MapSnapshotResponse } from '../types.js';

export function makeCell(overrides: Partial<CellState> = {}): CellState {
    return {
        tokenId: '1',
        x: 0,
        y: 0,
        owner: '0xowner',
        revealCount: 0,
        revealPending: false,
        resources: [],
        building: null,
        transitFeePerUnit: null,
        process: null,
        updated: 1,
        ...overrides,
    };
}

export function makeSnapshot(overrides: Partial<MapSnapshotResponse> = {}): MapSnapshotResponse {
    return {
        serverTime: 1000,
        version: 50,
        cells: [],
        ...overrides,
    };
}
