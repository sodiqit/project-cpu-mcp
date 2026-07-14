import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeMapSocket } from '../../__mocks__/in-memory-socket.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import { MapStore } from '../store.js';
import { MapSync } from '../sync.js';
import { type IMapApi, MapReadiness, type RawCell } from '../types.js';
import { makeCell, makeSnapshot } from './fixtures.js';

class FakeApi implements IMapApi {
    public readonly calls: Array<string> = [];

    constructor(private readonly snapshotCells: Array<RawCell>) {}

    async request<T>(path: string): Promise<{ status: number; data: T }> {
        this.calls.push(path);
        const cells = path.includes('since=') ? [] : this.snapshotCells;
        const data = makeSnapshot({ version: 50, serverTime: 1000, cells }) as T;
        return { status: 200, data };
    }

    getBaseUrl(): string {
        return 'http://test';
    }
}

const GRACE_MS = 1000;
const POLL_MS = 1000;

function setup(snapshotCells: Array<RawCell>): {
    sync: MapSync;
    socket: FakeMapSocket;
    api: FakeApi;
    store: MapStore;
} {
    const store = new MapStore();
    const socket = new FakeMapSocket();
    const api = new FakeApi(snapshotCells);
    const sync = new MapSync({
        store,
        api,
        socketFactory: () => socket,
        logger: new NoopLogger(),
        pollIntervalMs: POLL_MS,
        reconnectGraceMs: GRACE_MS,
    });
    return { sync, socket, api, store };
}

async function waitReady(sync: MapSync): Promise<void> {
    await vi.waitFor(() => expect(sync.getReadiness()).toBe(MapReadiness.Ready));
}

describe('MapSync', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('loads the snapshot and becomes ready', async () => {
        const { sync, store } = setup([makeCell({ tokenId: '1', updated: 50 })]);
        sync.start();
        await waitReady(sync);

        expect(sync.getReadiness()).toBe(MapReadiness.Ready);
        expect(store.size()).toBe(1);
    });

    it('keeps a realtime cell that arrived before an older snapshot', async () => {
        const { sync, socket, store } = setup([makeCell({ tokenId: '1', updated: 50, owner: '0xsnapshot' })]);

        sync.start();
        socket.emitCell(makeCell({ tokenId: '1', updated: 100, owner: '0xlive' }));
        await waitReady(sync);

        expect(store.get('1')?.owner).toBe('0xlive');
    });

    it('resyncs with ?since on a reconnect once a version is known', async () => {
        const { sync, socket, api } = setup([makeCell({ tokenId: '1', updated: 50 })]);
        sync.start();
        await waitReady(sync);

        socket.emitConnect();

        expect(api.calls).toContain('/api/v1/map?since=50');
    });

    it('degrades and polls while the socket stays down', async () => {
        vi.useFakeTimers();
        const { sync, socket, api } = setup([makeCell({ tokenId: '1', updated: 50 })]);
        sync.start();
        await vi.advanceTimersByTimeAsync(0);

        socket.emitDisconnect();
        await vi.advanceTimersByTimeAsync(GRACE_MS);
        expect(sync.getReadiness()).toBe(MapReadiness.Degraded);

        const before = api.calls.length;
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(api.calls.length).toBeGreaterThan(before);
    });

    it('does not throw on a socket error', async () => {
        const { sync, socket } = setup([makeCell({ tokenId: '1', updated: 50 })]);
        sync.start();
        await waitReady(sync);

        expect(() => socket.emitError(new Error('boom'))).not.toThrow();
        expect(sync.getReadiness()).toBe(MapReadiness.Ready);
    });

    it('reports socket connectivity', async () => {
        const { sync, socket } = setup([makeCell({ tokenId: '1', updated: 50 })]);
        sync.start();
        await waitReady(sync);

        socket.emitConnect();
        expect(sync.isSocketConnected()).toBe(true);
        socket.emitDisconnect();
        expect(sync.isSocketConnected()).toBe(false);
    });

    it('manually reconnects after a server-initiated disconnect and resyncs once back', async () => {
        const { sync, socket, api } = setup([makeCell({ tokenId: '1', updated: 50 })]);
        sync.start();
        await waitReady(sync);

        socket.emitDisconnect('io server disconnect');
        expect(socket.reconnectCalls).toBeGreaterThanOrEqual(1);

        socket.emitConnect();
        expect(api.calls).toContain('/api/v1/map?since=50');
        expect(sync.getReadiness()).toBe(MapReadiness.Ready);
        expect(sync.isSocketConnected()).toBe(true);
    });

    it('nudges a reconnect on each poll tick while degraded (backstop)', async () => {
        vi.useFakeTimers();
        const { sync, socket } = setup([makeCell({ tokenId: '1', updated: 50 })]);
        sync.start();
        await vi.advanceTimersByTimeAsync(0);

        // reason 'test' is not server-initiated, so there's no immediate reconnect.
        socket.emitDisconnect();
        await vi.advanceTimersByTimeAsync(GRACE_MS);
        expect(sync.getReadiness()).toBe(MapReadiness.Degraded);

        const before = socket.reconnectCalls;
        await vi.advanceTimersByTimeAsync(POLL_MS);
        expect(socket.reconnectCalls).toBeGreaterThan(before);
    });
});
