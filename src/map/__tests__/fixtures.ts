import {
    type CellProcessCraftView,
    type CellProcessMiningView,
    type CellResource,
    type CellResourceStorage,
    type CellState,
    CellProcessKind,
    type MapSnapshotResponse,
} from '../types.js';

export function makeStorage(overrides: Partial<CellResourceStorage> = {}): CellResourceStorage {
    return {
        used: '0',
        cap: '100',
        reserved: { incomingTransport: '0', lots: '0' },
        stalled: false,
        ...overrides,
    };
}

export function makeResource(overrides: Partial<CellResource> = {}): CellResource {
    return {
        resourceId: 1,
        deposit: '0',
        balance: '0',
        strength: null,
        storage: null,
        ...overrides,
    };
}

export function makeMiningProcess(overrides: Partial<CellProcessMiningView> = {}): CellProcessMiningView {
    return {
        kind: CellProcessKind.Mining,
        resource: 1,
        durationSec: 180,
        batch: 77,
        startAt: 0,
        stalled: false,
        ...overrides,
    };
}

export function makeCraftProcess(overrides: Partial<CellProcessCraftView> = {}): CellProcessCraftView {
    return {
        kind: CellProcessKind.Craft,
        recipeId: 'recipe',
        batches: 1,
        claimedBatches: 0,
        durationSec: 60,
        startAt: 0,
        stalled: false,
        ...overrides,
    };
}

export function makeCell(overrides: Partial<CellState> = {}): CellState {
    return {
        tokenId: '1',
        owner: '0xowner',
        revealCount: 0,
        revealPending: false,
        resources: [],
        building: null,
        demolishFinishAt: null,
        transitFeeOverrides: null,
        saleFeeOverrides: null,
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
