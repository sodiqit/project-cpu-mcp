import { z } from 'zod';

import type { MapStore } from './store.js';
import type { ILogger } from '../logger/types.js';

// Wire schemas validated at the network edge, so malformed payloads are rejected before they reach
// the store. Units that the types can't express: `version`/`updated` are epoch MILLISECONDS,
// `serverTime`/`startAt` are unix SECONDS, amounts are decimal strings, `x`/`y` are axial hex.
export const cellResourceSchema = z.object({
    resourceId: z.number(),
    deposit: z.string(),
    balance: z.string(),
});

export const cellBuildingViewSchema = z.object({
    type: z.string(),
    targetResourceId: z.number().nullable(),
});

export const cellMiningViewSchema = z.object({
    targetResourceId: z.number(),
    tier: z.number(),
    startAt: z.number(),
});

export const cellCraftViewSchema = z.object({
    uuid: z.string(),
    recipeId: z.string(),
    batches: z.number(),
    claimedBatches: z.number(),
    status: z.string(),
    startAt: z.number().nullable(),
});

export const cellStateSchema = z.object({
    tokenId: z.string(),
    x: z.number(),
    y: z.number(),
    owner: z.string(),
    revealCount: z.number(),
    resources: z.array(cellResourceSchema),
    building: cellBuildingViewSchema.nullable(),
    // Per-unit $CPU a foreign mover pays to route through this cell (decimal string); populated for
    // Hubs, null otherwise. Lets the agent rank hubs by cost without a per-route quote. Defaults to
    // null so a client that updates before the backend ships the field still parses cells.
    transitFeePerUnit: z.string().nullable().default(null),
    mining: cellMiningViewSchema.nullable(),
    crafting: z.array(cellCraftViewSchema),
    updated: z.number(),
});

export const mapSnapshotResponseSchema = z.object({
    serverTime: z.number(),
    version: z.number(),
    cells: z.array(cellStateSchema),
});

export type CellResource = z.infer<typeof cellResourceSchema>;
export type CellBuildingView = z.infer<typeof cellBuildingViewSchema>;
export type CellMiningView = z.infer<typeof cellMiningViewSchema>;
export type CellCraftView = z.infer<typeof cellCraftViewSchema>;
export type CellState = z.infer<typeof cellStateSchema>;
export type MapSnapshotResponse = z.infer<typeof mapSnapshotResponseSchema>;

export enum MapScope {
    Summary = 'summary',
    Mine = 'mine',
    Around = 'around',
    Cells = 'cells',
    All = 'all',
}

export enum MapReadiness {
    Loading = 'loading',
    Ready = 'ready',
    Degraded = 'degraded',
    Stopped = 'stopped',
}

export enum NeighborRelation {
    Owned = 'owned',
    Other = 'other',
    Empty = 'empty',
}

export interface SocketLifecycleHandlers {
    onConnect: () => void;
    onDisconnect: (reason: string) => void;
    onError: (error: Error) => void;
    onCellUpdate: (cell: CellState) => void;
}

// Abstraction over the realtime socket so tests can drive lifecycle events with a fake.
export interface ISocketClient {
    connect(handlers: SocketLifecycleHandlers): void;
    isConnected(): boolean;
    // Re-establish the connection after a server-initiated disconnect, which socket.io does not
    // auto-recover from (it detaches the socket from its manager). Idempotent / safe to call when
    // already connected or reconnecting.
    reconnect(): void;
    disconnect(): void;
}

export interface CreateMapSocketInput {
    baseUrl: string;
    logger: ILogger;
}

export type MapSocketFactory = (input: CreateMapSocketInput) => ISocketClient;

// Narrow view of the HTTP client the manager needs, so tests can inject a fake without a real one.
export interface IMapApi {
    request<T>(path: string): Promise<{ status: number; data: T }>;
    getBaseUrl(): string;
}

// Read-only lifecycle view the reader needs for its summary — implemented by MapSync.
export interface MapStatus {
    getReadiness(): MapReadiness;
    isSocketConnected(): boolean;
}

export interface MapSyncOptions {
    store: MapStore;
    api: IMapApi;
    socketFactory: MapSocketFactory;
    logger: ILogger;
    pollIntervalMs: number;
    reconnectGraceMs: number;
}

export interface MapReaderOptions {
    store: MapStore;
    status: MapStatus;
}

export interface AroundQuery {
    x: number;
    y: number;
    radius: number;
}

export interface MapQuery {
    scope: MapScope;
    tokenIds: Array<string> | null;
    around: AroundQuery | null;
    ownerAddress: string | null;
}

export interface NeighborRef {
    x: number;
    y: number;
    tokenId: string | null;
    relation: NeighborRelation;
}

export interface EnrichedCell extends CellState {
    neighbors: Array<NeighborRef>;
}

export interface ResourceLocation {
    tokenId: string;
    x: number;
    y: number;
    deposit: string;
    balance: string;
}

export type ResourceIndex = Record<string, Array<ResourceLocation>>;

export interface MapCellStatusCounts {
    idle: number;
    mining: number;
    crafting: number;
}

export interface MapSummary {
    version: number;
    serverTime: number;
    readiness: MapReadiness;
    socketConnected: boolean;
    totalCells: number;
    // null when the wallet address is unknown — the "mine"-scoped figures can't be computed.
    myCells: number | null;
    myCellsByStatus: MapCellStatusCounts | null;
    depletedDeposits: number | null;
}

export interface MapQueryResult {
    summary: MapSummary;
    scope: MapScope;
    resourceIndex: ResourceIndex | null;
    cells: Array<EnrichedCell>;
    returnedCells: number;
    note: string | null;
}

export interface CellInspection {
    cell: EnrichedCell;
    neighbors: Array<CellState>;
    distanceFromMine: number | null;
}

export interface MapChanges {
    version: number;
    serverTime: number;
    changed: Array<EnrichedCell>;
    changedCount: number;
}
