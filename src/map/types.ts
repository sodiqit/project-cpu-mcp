import { z } from 'zod';

import type { MapStore } from './store.js';
import { BuildingType } from '../api/types.js';
import type { CellCoord } from '../geometry/types.js';
import type { ILogger } from '../logger/types.js';

export enum CellProcessKind {
    Mining = 'mining',
    Craft = 'craft',
}

// Warehouse occupancy for one resource. `used` = liquid + reserved (incoming transport + open lots),
// all plain integer unit counts like `balance`/`deposit` (NOT wei). `cap === null` means uncapped
// (e.g. WCPU) — never full. `stalled` is server-authoritative; do not recompute `used >= cap`.
export const cellResourceStorageSchema = z.object({
    used: z.string(),
    cap: z.string().nullable(),
    reserved: z.object({
        incomingTransport: z.string(),
        lots: z.string(),
    }),
    stalled: z.boolean(),
});

export const cellResourceSchema = z.object({
    resourceId: z.number(),
    deposit: z.string(),
    balance: z.string(),
    strength: z.number().nullable().default(null),
    storage: cellResourceStorageSchema.nullable().default(null),
});

export const cellBuildingViewSchema = z.object({
    type: z.nativeEnum(BuildingType),
    buildFinishAt: z.number().nullable(),
});

export const cellProcessMiningViewSchema = z.object({
    kind: z.literal(CellProcessKind.Mining),
    resource: z.number(),
    // An extractor mines in whole cycles: each `durationSec` cycle yields a fixed `batch` of units.
    durationSec: z.number(),
    batch: z.number(),
    startAt: z.number(),
    // Mirrors the mined resource's warehouse: production halts while its box is full.
    stalled: z.boolean().default(false),
});

export const cellProcessCraftViewSchema = z.object({
    kind: z.literal(CellProcessKind.Craft),
    recipeId: z.string(),
    batches: z.number(),
    claimedBatches: z.number(),
    durationSec: z.number(),
    startAt: z.number(),
    // True when ANY output box is full — a batch is atomic, so one full output stalls the furnace.
    stalled: z.boolean().default(false),
});

export const cellProcessViewSchema = z.discriminatedUnion('kind', [
    cellProcessMiningViewSchema,
    cellProcessCraftViewSchema,
]);

export const cellStateSchema = z.object({
    tokenId: z.string(),
    owner: z.string(),
    revealCount: z.number(),
    revealPending: z.boolean().default(false),
    resources: z.array(cellResourceSchema),
    building: cellBuildingViewSchema.nullable().default(null),
    // Set after a demolish and cleared on rebuild. `demolishFinishAt > serverTime` ⇒ the plot is still in its
    // rebuild cooldown; `building` is null meanwhile, so this is the only signal the cell was just demolished.
    demolishFinishAt: z.number().nullable().default(null),
    transitFeePerUnit: z.string().nullable().default(null),
    process: cellProcessViewSchema.nullable().default(null),
    updated: z.number(),
});

export const mapSnapshotResponseSchema = z.object({
    serverTime: z.number(),
    version: z.number(),
    cells: z.array(cellStateSchema),
});

export type CellResource = z.infer<typeof cellResourceSchema>;
export type CellResourceStorage = z.infer<typeof cellResourceStorageSchema>;
export type CellBuildingView = z.infer<typeof cellBuildingViewSchema>;
export type CellProcessMiningView = z.infer<typeof cellProcessMiningViewSchema>;
export type CellProcessCraftView = z.infer<typeof cellProcessCraftViewSchema>;
export type CellProcessView = z.infer<typeof cellProcessViewSchema>;
export type CellState = z.infer<typeof cellStateSchema>;
export type MapSnapshotResponse = z.infer<typeof mapSnapshotResponseSchema>;

export interface ParsedSnapshot {
    snapshot: MapSnapshotResponse;
    // Cells the tolerant parser skipped (schema-invalid — e.g. an unknown building/recipe id from a newer
    // server); the rest of the snapshot still applies so one bad cell can't brick the whole map.
    dropped: number;
}

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
    resyncNow(): Promise<void>;
}

export interface RevealCellReader {
    readRevealCell(tokenId: string): CellState | null;
    // The map snapshot's server clock — the reference "now" for maturation, same domain as a process `startAt`.
    getServerTime(): number;
    refresh(): Promise<void>;
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
    tokenId: string;
    /** Grid steps (BFS ring number) around the center cell. */
    radius: number;
}

export interface MapQuery {
    scope: MapScope;
    tokenIds: Array<string> | null;
    around: AroundQuery | null;
    ownerAddress: string | null;
}

// The tokenId is always known from the grid; `Empty` means the cell is not in the map (unminted).
export interface NeighborRef {
    tokenId: string;
    relation: NeighborRelation;
}

export interface EnrichedCell extends CellState {
    /** Coarse position on the sphere; a proximity heuristic only — it wraps across face seams. */
    pos: CellCoord;
    neighbors: Array<NeighborRef>;
}

export interface ResourceLocation {
    tokenId: string;
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
    // Owned cells whose active process is stalled (warehouse full). null when the wallet is unknown.
    stalledCells: number | null;
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
    /** Grid steps (BFS) to the nearest owned cell; null when the wallet is unknown or it is farther than the scan cap. */
    distanceFromMine: number | null;
}

export interface MapChanges {
    version: number;
    serverTime: number;
    changed: Array<EnrichedCell>;
    changedCount: number;
}

export enum AttentionSeverity {
    Critical = 'critical',
    Warning = 'warning',
    Info = 'info',
}

export enum AttentionReason {
    StalledMining = 'stalled_mining',
    StalledCraft = 'stalled_craft',
    WarehouseNearFull = 'warehouse_near_full',
    DepositDepleted = 'deposit_depleted',
    DeliveryReady = 'delivery_ready',
    Unbuilt = 'unbuilt',
    DemolishCooldown = 'demolish_cooldown',
}

export interface AttentionStorageBreakdown {
    liquid: string;
    incomingTransport: string;
    lots: string;
}

export interface AttentionItem {
    tokenId: string;
    severity: AttentionSeverity;
    reason: AttentionReason;
    // Decorated with resourceName at the tool layer. null for cell-level reasons (unbuilt).
    resourceId: number | null;
    used: string | null;
    cap: string | null;
    fillPct: number | null;
    breakdown: AttentionStorageBreakdown | null;
    depositRemaining: string | null;
    deliveryId: string | null;
    arrivalAt: number | null;
}

export interface AttentionReport {
    // false when the wallet is unknown — attention is owner-scoped, so there is nothing to report.
    ownerKnown: boolean;
    version: number;
    serverTime: number;
    counts: Record<AttentionSeverity, number>;
    items: Array<AttentionItem>;
    // Set when the deliveries endpoint could not be reached; the map-derived items are still present.
    note: string | null;
}
