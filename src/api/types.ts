import { z } from 'zod';

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

/** Cost to demolish a building: `cpu` $CPU burned + `inputs` consumed from the cell's warehouse (no refund). */
export interface DemolishCostView {
    /** $CPU burned to tear it down, human-readable decimal. */
    cpu: string;
    /** Resources debited from the cell's warehouse (integer units). Ids → `resources`. */
    inputs: Array<CraftStackView>;
}

export interface BuildingEffectsView {
    cycleTimeBp: number;
    extractionShareBp: number;
    inputEfficiency: Array<{ resourceId: number; percent: number }>;
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
    /** Cost to tear it down — burned $CPU + warehouse resources consumed. */
    demolishCost: DemolishCostView;
    modeSwitchCost: string | null;
    /** Resource ids an extractor produces; empty for crafters/hub. Ids → `resources`. */
    minableResources: Array<number>;
    /** Recipe ids a crafter runs; empty for extractors/hub. */
    recipes: Array<CraftRecipeId>;
    effects: BuildingEffectsView;
    recipeOpexCpu: Record<string, string> | null;
}

/** Reveal-cost params — the first reveal of a cell is free; re-revealing a depleted cell costs `reRevealCost`. */
export interface RevealCostView {
    firstFree: boolean;
    reRevealCost: string;
}

export interface TransportRoutingView {
    moveRadius: number;
    hubRadius: number;
    moveTimePerCellSec: number;
    defaultMoveFeePerUnit: string;
}

export interface TradeFeeView {
    saleBurnPercent: number;
    maxSaleFeeBp: number;
}

export interface StorageConfigView {
    hubStorageMultiplier: number;
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
    transport: TransportRoutingView;
    trade: TradeFeeView;
    storage: StorageConfigView;
}

export const buildingEffectsSchema = z
    .object({
        cycleTimeBp: z.number(),
        extractionShareBp: z.number(),
        inputEfficiency: z.array(z.object({ resourceId: z.number(), percent: z.number() })),
    })
    .passthrough();

export const buildingConfigSchema = z
    .object({
        effects: buildingEffectsSchema,
        recipeOpexCpu: z.record(z.string(), z.string()).nullable().optional(),
    })
    .passthrough();

export const appConfigResponseSchema = z
    .object({
        chainId: z.number(),
        contracts: z.object({}).passthrough(),
        storage: z.object({ hubStorageMultiplier: z.number() }).passthrough(),
        resources: z.record(z.string(), z.string()).optional(),
        recipes: z.array(z.object({}).passthrough()).optional(),
        buildings: z.array(buildingConfigSchema).optional(),
        reveal: z.object({}).passthrough().optional(),
        transport: z.object({}).passthrough().optional(),
        trade: z.object({}).passthrough().optional(),
    })
    .passthrough();

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
    AcceleratorFab = 'accelerator_fab',
    NetworkAssembly = 'network_assembly',
    Datacenter = 'datacenter',
    Hub = 'hub',
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

export interface ApiLotView {
    id: string;
    hubTokenId: string;
    sellerAddress: string;
    resourceId: number;
    listed: string;
    remaining: string;
    pricePerUnit: string;
    saleFeeBp: number;
    state: LotState;
    distanceFromAnchor: number | null;
    createdAt: number;
    updated: number;
}

export interface LotView {
    id: string;
    hubTokenId: string;
    sellerAddress: string;
    resourceId: number;
    listed: string;
    remaining: string;
    pricePerUnit: string;
    saleFeePercent: number;
    state: LotState;
    distanceFromAnchor: number | null;
    createdAt: number;
    updated: number;
}

export interface ApiMarketResourceSummary {
    hubTokenId: string;
    resourceId: number;
    openLots: number;
    openRemaining: string;
    minPricePerUnit: string | null;
    incomingLots: number;
    incomingRemaining: string;
    distanceFromAnchor: number | null;
}

export interface MarketResourceSummary {
    hubTokenId: string;
    resourceId: number;
    openLots: number;
    openRemaining: string;
    minPricePerUnit: string | null;
    incomingLots: number;
    incomingRemaining: string;
    distanceFromAnchor: number | null;
}
