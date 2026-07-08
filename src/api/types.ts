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

/** Must match the game's recipe catalog — never rename or reuse a value. */
export enum CraftRecipeId {
    GenerateEnergyOil = 'generate_energy_oil',
    EnrichFuelRods = 'enrich_fuel_rods',
    GenerateEnergyReactor = 'generate_energy_reactor',
    MakeConcrete = 'make_concrete',
    SmeltSteel = 'smelt_steel',
    RefineWiring = 'refine_wiring',
    MakeHeatsinks = 'make_heatsinks',
    MakeChemicals = 'make_chemicals',
    MakeCompounds = 'make_compounds',
    MakeSilicon = 'make_silicon',
    MakeChips = 'make_chips',
    MakeMemory = 'make_memory',
    MakeCooling = 'make_cooling',
    MakeBattery = 'make_battery',
    MakeAccelerators = 'make_accelerators',
    MakeNetwork = 'make_network',
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
    tier: number;
    inputs: Array<CraftStackView>;
    outputs: Array<CraftStackView>;
    durationSec: number;
    /** $CPU per batch, human-readable decimal (`'0'` = free). */
    costCpu: string;
}

/** Building role — an extractor mines resources, a crafter runs recipes, the hub routes transport. */
export enum BuildingKind {
    Extractor = 'extractor',
    Crafter = 'crafter',
    Hub = 'hub',
}

/** Per-building catalog entry from `GET /api/v1/config`. */
export interface BuildingView {
    type: BuildingType;
    /** `uint8` id the on-chain `place(tokenId, type)` consumes — stable and append-only. */
    onChainId: number;
    name: string;
    kind: BuildingKind;
    tier: number;
    /** $CPU per build, human-readable decimal (`'0'` = free). */
    buildCost: string;
    buildTimeSec: number;
    /** Resources burned to construct it (integer units); empty for tier-1 extractors. Ids → `resources`. */
    buildInputs: Array<CraftStackView>;
    /** Resource ids an extractor produces; empty for crafters/hub. Ids → `resources`. */
    minableResources: Array<number>;
    /** Recipe ids a crafter runs; empty for extractors/hub. */
    recipes: Array<CraftRecipeId>;
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
    /** Resource id → display name (e.g. `{ 5: 'Iron' }`). */
    resources: Record<number, string>;
    recipes: Array<RecipeView>;
    /** Per-building catalog — on-chain id, kind, costs, and mine/craft bindings. */
    buildings: Array<BuildingView>;
    /** First-reveal-free + re-reveal cost params. */
    reveal: RevealCostView;
}

/** The building types a cell can hold — 6 tier-1 extractors, tier-2..5 crafters, and the Hub. */
export enum BuildingType {
    PumpStation = 'pump_station',
    Quarry = 'quarry',
    Derrick = 'derrick',
    Mine = 'mine',
    TungstenDrill = 'tungsten_drill',
    LeachField = 'leach_field',
    OilPowerPlant = 'oil_power_plant',
    EnrichmentPlant = 'enrichment_plant',
    Reactor = 'reactor',
    ConcretePlant = 'concrete_plant',
    SteelMill = 'steel_mill',
    CopperSmelter = 'copper_smelter',
    HeatsinkPlant = 'heatsink_plant',
    ChemicalPlant = 'chemical_plant',
    CompoundsPlant = 'compounds_plant',
    SiliconPlant = 'silicon_plant',
    WaferFab = 'wafer_fab',
    CoolingPlant = 'cooling_plant',
    BatteryPlant = 'battery_plant',
    AcceleratorFab = 'accelerator_fab',
    NetworkAssembly = 'network_assembly',
    Datacenter = 'datacenter',
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
    /** Price per unit in $CPU. The game API sends wei; TradeService normalizes it to a decimal string (e.g. "2"). */
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
    /** Lowest open-lot price per unit in $CPU (TradeService normalizes the API's wei to decimal), or null when no open lots. */
    minPricePerUnit: string | null;
    tradeFeePct: number | null;
    incomingLots: number;
    incomingRemaining: string;
    distanceFromCenter: number | null;
}
