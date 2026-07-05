import type { ILogger } from '../logger/types.js';
import type { SessionManager } from '../session/manager.js';

/** HTTP status codes the client and services branch on. */
export enum HttpStatus {
    Ok = 200,
    Accepted = 202,
    Unauthorized = 401,
    Conflict = 409,
}

export interface ApiClientOptions {
    baseUrl: string;
    session: SessionManager;
    logger: ILogger;
}

export interface IAuthenticator {
    /** Returns a valid bearer token, performing a (re-)login if missing or expired. */
    getAccessToken(): Promise<string>;
    /** Forces a fresh login (used after a 401) and returns the new token. */
    reauthenticate(): Promise<string>;
}

export interface SiweNonceResponse {
    nonce: string;
    issuedAt: string;
    expirationTime: string;
}

export interface SiweVerifyResponse {
    accessToken: string;
    user: {
        id: string;
        address: string;
    };
}

export interface DeviceAuthResponse {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expiresIn: number;
    interval: number;
}

export interface DeviceTokenCompleteResponse {
    sessionConfig: {
        accountAddress: string;
        sessionHash: string;
        policies: unknown;
        expiresAt: number;
    };
}

export interface ApiResponse<T> {
    status: number;
    data: T;
}

/** Last-known reachability of the game API, derived from whether the most recent HTTP call to it
 *  produced a usable JSON response. `reachable: false` means the API is down/unreachable right now. */
export interface ServerHealthView {
    reachable: boolean;
    reason: string | null;
}

/** `GET /api/v1/config?network=` contract addresses. */
export interface AppContractsConfig {
    land: string;
    cpuToken: string;
    cpuHook: string;
    cell: string;
    cellLens: string;
    transport: string;
    trade: string;
}

export enum CraftCategory {
    Refine = 'refine',
    Forge = 'forge',
}

/** Must match the game's recipe catalog — never rename or reuse a value. */
export enum CraftRecipeId {
    GeneratePower = 'generate_power',
    RefinePureSilicon = 'refine_pure_silicon',
    RefineConcrete = 'refine_concrete',
    SmeltSteel = 'smelt_steel',
    RefineCopper = 'refine_copper',
    ForgeWcpu = 'forge_wcpu',
}

export interface CraftStackView {
    resourceId: number;
    amount: number;
}

/** Enabled craft recipes from `GET /api/v1/config`. */
export interface RecipeView {
    id: CraftRecipeId;
    name: string;
    category: CraftCategory;
    tier: number;
    inputs: Array<CraftStackView>;
    outputs: Array<CraftStackView>;
    durationSec: number;
    /** $CPU per batch, human-readable decimal (`'0'` = free). */
    costCpu: string;
}

/** Static build-cost catalog entry — `$CPU` per build, human-readable decimal (`'0'` = free). */
export interface BuildingView {
    type: BuildingType;
    name: string;
    buildCost: string;
}

/** Reveal-cost params — the first reveal of a cell is free; re-revealing a depleted cell costs `reRevealCost`. */
export interface RevealCostView {
    firstFree: boolean;
    reRevealCost: string;
}

/** `GET /api/v1/config?network=` response — chainId + contract addresses for one network. */
export interface AppConfigResponse {
    network: string;
    chainId: number;
    contracts: AppContractsConfig;
    /** Resource id → display name (e.g. `{ 3: 'Silica' }`). */
    resources: Record<number, string>;
    recipes: Array<RecipeView>;
    /** Build-cost catalog (extractor / hub), human-readable $CPU. */
    buildings: Array<BuildingView>;
    /** First-reveal-free + re-reveal cost params. */
    reveal: RevealCostView;
}

/** The kind of building a cell can hold. */
export enum BuildingType {
    Extractor = 'extractor',
    Hub = 'hub',
}

export interface TransportCoord {
    x: number;
    y: number;
}

export enum DeliveryTargetKind {
    Cell = 'cell',
    Lot = 'lot',
}

export interface DeliveryResponse {
    deliveryId: string;
    payer: string | null;
    receiver: string;
    sourceTokenId: string | null;
    targetTokenId: string;
    targetKind: DeliveryTargetKind;
    resourceId: number;
    amount: string;
    arrivalAt: number | null;
    delivered: boolean;
    updated: number;
}

export interface DeliveriesResponse {
    serverTime: number;
    version: number;
    deliveries: Array<DeliveryResponse>;
}

// ---- Trade (lot marketplace) ----

/** Lifecycle of a lot — mirrors the Trade contract, projected by the game API. */
export enum LotState {
    Delivering = 'delivering',
    Open = 'open',
    Sold = 'sold',
    Cancelled = 'cancelled',
}

/** Discovery availability filter — `incoming` = paid & en route (DELIVERING). */
export enum LotAvailability {
    Open = 'open',
    Incoming = 'incoming',
    All = 'all',
}

export enum LotSort {
    PriceAsc = 'price_asc',
    Recent = 'recent',
    Nearest = 'nearest',
}

/** A lot row from `GET /api/v1/trade/lots`, `/trade/lots/:id`, `/trade/lots/mine`. */
export interface LotView {
    id: string;
    hubTokenId: string;
    hubX: number;
    hubY: number;
    sellerAddress: string;
    resourceId: number;
    listed: string;
    remaining: string;
    pricePerUnit: string;
    /** Hub trade-fee % snapshot at listing — currently always 0 (placeholder; not applied to fees). */
    tradeFeePct: number;
    state: LotState;
    /** Hex steps from the zone center when a zone is supplied, else `null`. */
    distanceFromCenter: number | null;
    /** Listing time, unix seconds. */
    createdAt: number;
    /** Last projection update, unix seconds. */
    updated: number;
}

/** One `GET /api/v1/trade/markets` row per `(hub, resource)` — the compact scout view. */
export interface MarketResourceSummary {
    hubTokenId: string;
    hubX: number;
    hubY: number;
    resourceId: number;
    openLots: number;
    openRemaining: string;
    minPricePerUnit: string | null;
    tradeFeePct: number | null;
    incomingLots: number;
    incomingRemaining: string;
    distanceFromCenter: number | null;
}
