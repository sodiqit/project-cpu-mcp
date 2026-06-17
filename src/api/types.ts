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

/** `GET /api/v1/config?network=` contract addresses. */
export interface AppContractsConfig {
    land: string;
    cpuToken: string;
    gameSettlement: string;
    cpuHook: string;
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

/** `POST /api/v1/reveal` request body. */
export interface RevealRequest {
    tokenId: string;
    network: string;
}

/** The signed reveal intent — the EIP-712 signature to submit to `GameSettlement.reveal`. */
export interface RevealSignatureResponse {
    signId: number;
    tokenId: string;
    cpuAmount: string;
    deadline: string;
    v: number;
    r: string;
    s: string;
}

/** The kind of building a cell can hold. */
export enum BuildingType {
    Extractor = 'extractor',
    Hub = 'hub',
}

/** `POST /api/v1/build` request body. */
export interface BuildRequest {
    tokenId: string;
    network: string;
    buildingType: BuildingType;
    /** Resource id an extractor mines (must have an active deposit on the cell); null for a hub. */
    targetResourceId: number | null;
}

/** The signed build intent — the EIP-712 `SpendCpu` signature to submit to `GameSettlement.spendCpu`. */
export interface BuildSignatureResponse {
    signId: number;
    tokenId: string;
    /** $CPU cost in wei. Build is always paid. */
    cpuAmount: string;
    deadline: string;
    v: number;
    r: string;
    s: string;
}

/** `GET /api/v1/mining/:tokenId` — lazily-computed extraction status of a cell. */
export interface MiningStatusResponse {
    tokenId: string;
    /** An extractor mining job exists on the cell. */
    active: boolean;
    targetResourceId: number | null;
    tier: number | null;
    /** Mining cursor as unix seconds; null when inactive. */
    startAt: number | null;
    /** Accrued-but-unclaimed units, clamped to the remaining deposit; 0 when inactive. */
    minedAmount: number;
    /** Target deposit amount left; 0 when inactive/depleted. */
    depositRemaining: number;
}

/** `POST /api/v1/mining/:tokenId/claim` — result of banking the accrued resource (off-chain). */
export interface ClaimResponse {
    tokenId: string;
    resourceId: number;
    /** Units banked by this claim; 0 is a valid no-op (nothing accrued / depleted). */
    claimedAmount: number;
    /** Resource balance on the cell after the claim. */
    balanceAmount: number;
    /** Deposit amount left after the claim. */
    depositRemaining: number;
    /** The target deposit reached 0. */
    depleted: boolean;
}

export interface TransportCoord {
    x: number;
    y: number;
}

/** Lifecycle of a transport job. */
export enum TransportStatus {
    InTransit = 'in_transit',
    Delivered = 'delivered',
    AwaitingPayment = 'awaiting_payment',
    Cancelled = 'cancelled',
    Reverted = 'reverted',
}

/** `POST /api/v1/transport` (and `/transport/quote`) request body. */
export interface TransportRequest {
    /** Waypoint chain `[source, ...intermediate, target]` in axial hex coords. */
    path: Array<TransportCoord>;
    resourceId: number;
    amount: string;
    network: string;
}

/** Free branch of `POST /api/v1/transport` — an off-chain job that started immediately. */
export interface TransportJobResponse {
    id: number;
    status: TransportStatus;
    sourceTokenId: string;
    targetTokenId: string;
    resourceId: number;
    amount: string;
    totalDistance: number;
    totalTimeSec: number;
    /** Departure / expected-arrival times, unix seconds. */
    startedAt: number;
    arrivalAt: number;
}

/** Paid branch — the EIP-712 signature to submit to `GameSettlement.transport`. */
export interface PaidTransportSignatureResponse {
    jobId: number;
    signId: number;
    status: TransportStatus;
    sender: string;
    sourceTokenId: string;
    targetTokenId: string;
    resourceId: number;
    amount: string;
    /** On-chain amounts in wei. */
    totalAmount: string;
    burnAmount: string;
    recipients: Array<string>;
    payouts: Array<string>;
    deadline: string;
    v: number;
    r: string;
    s: string;
}

/** Lazily-computed in-flight position of a shipment. */
export interface TransportProgressView {
    elapsedSec: number;
    traveledDistance: number;
    totalDistance: number;
    totalTimeSec: number;
    arrived: boolean;
    segmentIndex: number;
    reachedWaypoints: number;
    position: TransportCoord;
}

/** `GET /api/v1/transport/:id` and each entry of `GET /api/v1/transport/mine`. */
export interface TransportStatusResponse extends TransportJobResponse {
    progress: TransportProgressView;
}

/** Transit-fee preview — human-readable CPU (`*`) plus the on-chain wei (`*Wei`) the paid branch submits. */
export interface TransportQuoteFee {
    total: string;
    burn: string;
    recipients: Array<string>;
    payouts: Array<string>;
    totalWei: string;
    burnWei: string;
    payoutsWei: Array<string>;
}

/** `POST /api/v1/transport/quote` — non-destructive price/route preview (no escrow). */
export interface TransportQuoteResponse {
    paid: boolean;
    totalDistance: number;
    totalTimeSec: number;
    fee: TransportQuoteFee;
}

/** A paid process stays `pending` until its on-chain payment settles. */
export enum CraftProcessStatus {
    Pending = 'pending',
    Active = 'active',
}

/** `POST /api/v1/craft/:tokenId/start` request body. */
export interface StartCraftRequest {
    recipeId: CraftRecipeId;
    batches: number;
    network: string;
}

/** Free branch of `POST /api/v1/craft/:tokenId/start` — started immediately. */
export interface StartCraftResponse {
    uuid: string;
    tokenId: string;
    recipeId: CraftRecipeId;
    batches: number;
    startAt: number;
    endsAt: number;
    debitedInputs: Array<CraftStackView>;
}

/** Paid branch — the EIP-712 `SpendCpu` signature to submit to `GameSettlement.spendCpu`. */
export interface PaidCraftSignatureResponse {
    uuid: string;
    signId: number;
    tokenId: string;
    recipeId: CraftRecipeId;
    batches: number;
    status: CraftProcessStatus;
    /** $CPU cost in wei. */
    cpuAmount: string;
    deadline: string;
    v: number;
    r: string;
    s: string;
    debitedInputs: Array<CraftStackView>;
}

/** `GET /api/v1/craft/:tokenId` — one craft process on a cell. */
export interface CraftProcessStatusResponse {
    uuid: string;
    tokenId: string;
    recipeId: CraftRecipeId;
    batches: number;
    status: CraftProcessStatus;
    claimedBatches: number;
    completedBatches: number;
    claimableBatches: number;
    claimableOutputs: Array<CraftStackView>;
    /** null while `pending` (timer not started). */
    startAt: number | null;
    endsAt: number | null;
    nextBatchAt: number | null;
    isFinished: boolean;
}

/** `POST /api/v1/craft/:tokenId/claim`. */
export interface ClaimCraftResponse {
    tokenId: string;
    /** `[]` when nothing matured — still a success. */
    claimed: Array<CraftStackView>;
    processes: Array<CraftProcessStatusResponse>;
}

// ---- Trade (lot marketplace) ----

/** Lifecycle of a lot. */
export enum LotState {
    Draft = 'draft',
    Delivering = 'delivering',
    Open = 'open',
    CancelPending = 'cancel_pending',
    Cancelling = 'cancelling',
    Cancelled = 'cancelled',
    Reverted = 'reverted',
}

/** Discriminator for the free (off-chain) vs paid (on-chain signature) lot responses. */
export enum LotResponseKind {
    Free = 'free',
    Paid = 'paid',
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

/** `POST /api/v1/trade/lots` request body. `chain` = `[source, …waypoints, hub]`. */
export interface CreateLotRequest {
    chain: Array<TransportCoord>;
    resourceId: number;
    value: string;
    pricePerUnit: string;
    network: string;
}

/** `POST /api/v1/trade/lots/:id/buy` request body. `chain` = `[hub, …waypoints, buyerDest]`. */
export interface BuyLotRequest {
    chain: Array<TransportCoord>;
    value: string;
    network: string;
}

/** `POST /api/v1/trade/lots/:id/cancel` request body. `chain` = `[hub, …waypoints, sellerDest]` (required for OPEN lots). */
export interface CancelLotRequest {
    chain: Array<TransportCoord> | null;
    network: string;
}

/** Free branch of a create / cancel — fully off-chain, no payment. */
export interface FreeLotResponse {
    kind: LotResponseKind.Free;
    lotId: string;
    state: LotState;
    arrivalAt: number;
}

/**
 * Paid branch — the EIP-712 signature to submit on-chain. `tokenId` is the action's token:
 * create → `sourceTokenId` (settled via `transport`), buy → `buyerDestTokenId` (`tradeBuy`),
 * cancel → `sellerDestTokenId` (`tradeCancel`). On-chain amounts are wei.
 */
export interface PaidLotSignatureResponse {
    kind: LotResponseKind.Paid;
    lotId: string;
    signId: number;
    state: LotState;
    sender: string;
    tokenId: string;
    totalAmount: string;
    burnAmount: string;
    recipients: Array<string>;
    payouts: Array<string>;
    deadline: string;
    v: number;
    r: string;
    s: string;
}

export type CreateLotResponse = FreeLotResponse | PaidLotSignatureResponse;
export type CancelLotResponse = FreeLotResponse | PaidLotSignatureResponse;

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

/**
 * `GET /api/v1/trade/lots/:id/quote` — non-destructive buy preview. `routed` is true when a route
 * `chain` was supplied (transit fees included — the exact total `buy_lot` would charge); false for a
 * seller-only quote (`pricePerUnit × value`).
 */
export interface TradeQuoteResponse {
    lotId: string;
    resourceId: number;
    sellerAddress: string;
    pricePerUnit: string;
    value: string;
    remaining: string;
    routed: boolean;
    totalDistance: number | null;
    totalTimeSec: number | null;
    fee: TransportQuoteFee;
}
