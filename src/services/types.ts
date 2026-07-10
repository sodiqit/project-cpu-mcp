import type { Address, Hash } from 'viem';

import type { ApiClient } from '../api/client.js';
import type {
    BuildingType,
    BuildingView,
    CraftRecipeId,
    CraftStackView,
    LotAvailability,
    LotSort,
    RecipeView,
    RevealCostView,
    TransportRoutingView,
} from '../api/types.js';
import type { Network } from '../config/types.js';
import type { ILogger } from '../logger/types.js';
import type { CellState, RevealCellReader } from '../map/types.js';
import type { SessionManager } from '../session/manager.js';
import type { IContractClient, TxStatus, WalletManager, WalletProvider } from '../wallet/types.js';

export interface AuthServiceOptions {
    session: SessionManager;
    api: ApiClient;
    wallet: WalletProvider;
    logger: ILogger;
}

export interface DeviceAuthResult {
    verificationUrl: string;
    userCode: string;
}

/** Resolved contract addresses for the configured network. */
export interface AppContracts {
    land: string;
    /** Empty until $CPU is configured for the network; validate with `isAddress` before use. */
    cpuToken: string;
    /** Uniswap v4 hook for the ETH/$CPU pool; empty until configured. Validate before a swap. */
    cpuHook: string;
    cell: string;
    cellLens: string;
    transport: string;
    /** The lot marketplace; empty until configured. Validate with `isAddress` before a trade write. */
    trade: string;
}

/** Chain + contract addresses for the configured network, loaded from the game API. */
export interface AppConfig {
    network: Network;
    chainId: number;
    contracts: AppContracts;
    /** Resource id → display name, served alongside the chain config. */
    resources: Record<number, string>;
    recipes: Array<RecipeView>;
    /** Per-building catalog — on-chain id, kind, costs, and mine/craft bindings. */
    buildings: Array<BuildingView>;
    /** First-reveal-free + re-reveal cost params. */
    reveal: RevealCostView;
    transport: TransportRoutingView;
}

/** Provider of the chain config — implemented by AppConfigService; injected into RevealService. */
export interface IAppConfig {
    load(): Promise<AppConfig>;
}

export interface AppConfigServiceOptions {
    api: ApiClient;
    network: Network;
    logger: ILogger;
}

/** Ensures the wallet has approved a spender for a token — implemented by AllowanceService. */
export interface IAllowanceService {
    ensureAllowance(token: Address, spender: Address, needed: bigint): Promise<Hash | null>;
}

export interface AllowanceServiceOptions {
    wallet: WalletProvider;
    logger: ILogger;
}

export interface CellClientOptions {
    contracts: IContractClient;
    logger: ILogger;
}

export interface RequestRevealParams {
    cell: Address;
    tokenId: bigint;
    value: bigint;
}

export interface PlaceParams {
    cell: Address;
    tokenId: bigint;
    buildingType: number;
}

export interface DemolishParams {
    cell: Address;
    tokenId: bigint;
}

export interface StartMiningParams {
    cell: Address;
    tokenId: bigint;
    target: number;
}

export interface StartCraftParams {
    cell: Address;
    tokenId: bigint;
    recipeId: bigint;
    batches: number;
}

export interface ClaimParams {
    cell: Address;
    tokenId: bigint;
}

export interface WithdrawCpuParams {
    cell: Address;
    tokenId: bigint;
    /** Whole wCPU units to convert to $CPU (on-chain `uint64`). */
    amount: bigint;
}

export interface ICellClient {
    quoteRevealFee(cell: Address): Promise<bigint>;
    requestReveal(params: RequestRevealParams): Promise<Hash>;
    place(params: PlaceParams): Promise<Hash>;
    demolish(params: DemolishParams): Promise<Hash>;
    startMining(params: StartMiningParams): Promise<Hash>;
    startCraft(params: StartCraftParams): Promise<Hash>;
    claim(params: ClaimParams): Promise<Hash>;
    withdrawCpu(params: WithdrawCpuParams): Promise<Hash>;
}

export interface RevealServiceOptions {
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    cellClient: ICellClient;
    contracts: IContractClient;
    mapReader: RevealCellReader;
    logger: ILogger;
}

export interface RevealResult {
    tokenId: string;
    genesis: boolean;
    txHash: Hash;
    status: TxStatus;
    blockNumber: string;
    /** Pyth Entropy request fee, in native ETH (decimal). */
    fee: string;
    /** Re-reveal cost in $CPU (decimal); "0" for a first reveal. */
    reRevealCost: string;
    approveTxHash: Hash | null;
    fulfilled: boolean;
}

export interface BuildServiceOptions {
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    cellClient: ICellClient;
    contracts: IContractClient;
    mapReader: RevealCellReader;
    logger: ILogger;
}

export interface BuildInput {
    tokenId: string;
    buildingType: BuildingType;
}

export interface BuildResult {
    tokenId: string;
    buildingType: BuildingType;
    /** Build cost in $CPU (decimal). */
    buildCost: string;
    approveTxHash: Hash | null;
    buildTxHash: Hash | null;
    alreadyBuilt: boolean;
}

export interface BuildPlacement {
    buildTxHash: Hash | null;
    approveTxHash: Hash | null;
    /** Build cost in $CPU (decimal). */
    buildCost: string;
}

export interface DemolishInput {
    tokenId: string;
}

export interface DemolishResult {
    tokenId: string;
    buildingType: BuildingType;
    /** $CPU burned to tear it down (decimal). */
    cpuBurned: string;
    /** Warehouse resources consumed by the demolish (integer units); empty when none. */
    inputsConsumed: Array<CraftStackView>;
    /** Seconds the plot stays locked from rebuilding after this demolish (the tier's build time). */
    rebuildCooldownSec: number;
    approveTxHash: Hash | null;
    txHash: Hash;
    status: TxStatus;
    blockNumber: string;
}

export interface WithdrawServiceOptions {
    wallet: WalletProvider;
    appConfig: IAppConfig;
    cellClient: ICellClient;
    contracts: IContractClient;
    mapReader: RevealCellReader;
    logger: ILogger;
}

export interface WithdrawInput {
    tokenId: string;
    /** Whole wCPU units to cash out (e.g. `"100"`). */
    amount: string;
}

/** A confirmed withdraw — the on-chain mint of $CPU against a cell's debited wCPU (1:1). */
export interface WithdrawResult {
    tokenId: string;
    /** Whole wCPU units debited from the cell / $CPU units minted to the wallet, 1:1. */
    amount: string;
    txHash: Hash;
    status: TxStatus;
    blockNumber: string;
}

export interface MiningServiceOptions {
    wallet: WalletProvider;
    appConfig: IAppConfig;
    cellClient: ICellClient;
    contracts: IContractClient;
    mapReader: RevealCellReader;
    logger: ILogger;
}

export interface MiningStatusResult {
    tokenId: string;
    active: boolean;
    targetResourceId: number | null;
    // Units produced per matured cycle, and the cycle length; null when no extractor is active.
    batch: number | null;
    durationSec: number | null;
    startAt: number | null;
    // Whole cycles matured since `startAt` (before the deposit/room cap).
    cyclesMatured: number;
    // Seconds until the next cycle matures; null when inactive, stalled, or the deposit is depleted.
    nextBatchInSec: number | null;
    claimable: string;
    depositRemaining: string;
    // Production halted because the mined resource's warehouse is full (server-authoritative).
    stalled: boolean;
    // The mined resource's warehouse; null when uncapped or storage is not reported.
    warehouseUsed: string | null;
    warehouseCap: string | null;
}

export interface MiningClaimResult {
    tokenId: string;
    resourceId: number | null;
    claimedAmount: string;
    txHash: Hash;
    status: TxStatus;
    blockNumber: string;
}

export interface StartMiningInput {
    tokenId: string;
    /** Resource id to mine; null defaults to the extractor's sole minable resource. */
    targetResourceId: number | null;
}

export interface StartMiningResult {
    tokenId: string;
    targetResourceId: number;
    /** Cycle length and per-cycle batch snapshot from the on-chain MiningStarted event; null if not decodable. */
    batch: number | null;
    durationSec: number | null;
    txHash: Hash;
    status: TxStatus;
    blockNumber: string;
}

export interface TransportClientOptions {
    contracts: IContractClient;
    logger: ILogger;
}

export interface QuoteRouteParams {
    transport: Address;
    from: Address;
    tokenIds: Array<bigint>;
    res: number;
    amount: bigint;
}

export interface RouteQuote {
    totalFee: bigint;
    totalDistance: bigint;
    arrivalAt: bigint;
}

export interface MoveParams {
    transport: Address;
    tokenIds: Array<bigint>;
    res: number;
    amount: bigint;
    maxFee: bigint;
}

export interface FinalizeParams {
    transport: Address;
    ids: Array<bigint>;
}

export interface ITransportClient {
    quoteRoute(params: QuoteRouteParams): Promise<RouteQuote>;
    move(params: MoveParams): Promise<Hash>;
    finalize(params: FinalizeParams): Promise<Hash>;
}

export interface TransportServiceOptions {
    api: ApiClient;
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    contracts: IContractClient;
    transportClient: ITransportClient;
    logger: ILogger;
}

export interface TransportInput {
    path: Array<string>;
    resourceId: number;
    amount: string;
}

export interface TransportQuote {
    /** Transit fee in $CPU (decimal); "0" for an own-cells-only route. */
    fee: string;
    totalDistance: number;
    arrivalAt: number;
}

export interface TransportResult {
    deliveryId: string;
    sourceTokenId: string;
    targetTokenId: string;
    resourceId: number;
    amount: string;
    /** Transit fee paid, in $CPU (decimal). */
    fee: string;
    arrivalAt: number;
    txHash: Hash;
    approveTxHash: Hash | null;
    status: TxStatus;
    blockNumber: string;
}

export enum DeliveryFilter {
    All = 'all',
    InTransit = 'in_transit',
    Delivered = 'delivered',
    ReadyToFinalize = 'ready_to_finalize',
}

export interface DeliveryView {
    deliveryId: string;
    payer: string | null;
    sourceTokenId: string | null;
    targetTokenId: string;
    resourceId: number;
    amount: string;
    arrivalAt: number | null;
    delivered: boolean;
    readyToFinalize: boolean;
}

export interface FinalizeResult {
    deliveryIds: Array<string>;
    txHash: Hash;
    status: TxStatus;
    blockNumber: string;
}

// ---- Route planning ----

export enum RouteOptimize {
    Cheapest = 'cheapest',
    Fastest = 'fastest',
}

export interface RouteCellReader {
    allCells(): Array<CellState>;
}

export interface RouteServiceOptions {
    wallet: WalletProvider;
    appConfig: IAppConfig;
    mapReader: RouteCellReader;
    logger: ILogger;
}

export interface PlanRouteInput {
    from: string;
    to: string;
    amount: string | null;
    optimize: RouteOptimize;
}

export interface RouteLegView {
    from: string;
    to: string;
    distance: number;
}

export interface RouteHubFeeView {
    tokenId: string;
    owner: string;
    feePerUnit: string;
    fee: string | null;
}

export interface PlanRouteResult {
    waypoints: Array<string>;
    legs: Array<RouteLegView>;
    totalDistance: number;
    foreignHubs: Array<RouteHubFeeView>;
    estimatedFee: string | null;
    estimatedTravelSec: number;
    optimize: RouteOptimize;
    note: string;
}

export interface CraftServiceOptions {
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    cellClient: ICellClient;
    contracts: IContractClient;
    mapReader: RevealCellReader;
    logger: ILogger;
}

export interface CraftInput {
    tokenId: string;
    recipeId: CraftRecipeId;
    batches: number;
}

export interface CraftStartResult {
    tokenId: string;
    recipeId: CraftRecipeId;
    batches: number;
    /** Total $CPU cost for all batches (decimal); "0" for a free recipe. */
    costCpu: string;
    approveTxHash: Hash | null;
    txHash: Hash;
    status: TxStatus;
    blockNumber: string;
}

export interface CraftOutput {
    resourceId: number;
    amount: string;
}

export interface CraftClaimResult {
    tokenId: string;
    recipeId: CraftRecipeId | null;
    batches: number;
    outputs: Array<CraftOutput>;
    txHash: Hash;
    status: TxStatus;
    blockNumber: string;
}

export interface CraftStatusResult {
    tokenId: string;
    active: boolean;
    recipeId: string | null;
    batches: number;
    claimedBatches: number;
    maturedBatches: number;
    claimableBatches: number;
    startAt: number | null;
    durationSec: number | null;
    // Production halted because at least one output warehouse is full (server-authoritative).
    stalled: boolean;
    // The recipe outputs whose warehouse is full — offload one of these to resume.
    blockedResourceIds: Array<number>;
}

// ---- Trade (lot marketplace) ----

export interface TradeServiceOptions {
    api: ApiClient;
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    contracts: IContractClient;
    tradeClient: ITradeClient;
    /** Reused for the transit-fee quote — every trade write routes goods through Transport. */
    transportClient: ITransportClient;
    logger: ILogger;
}

export interface CreateLotInput {
    /** Waypoint tokenIds, `[source, …waypoints, hub]`. */
    chain: Array<string>;
    resourceId: number;
    value: string;
    pricePerUnit: string;
}

export interface BuyLotInput {
    lotId: string;
    /** Waypoint tokenIds, `[hub, …waypoints, buyerDest]`. */
    chain: Array<string>;
    value: string;
}

export interface CancelLotInput {
    lotId: string;
    /** Waypoint tokenIds, `[hub, …waypoints, sellerDest]` — routes the unsold remainder home. */
    chain: Array<string>;
}

export interface QuoteBuyInput {
    lotId: string;
    value: string;
    /** Waypoint tokenIds, `[hub, …waypoints, buyerDest]`; null for a seller-only estimate. */
    chain: Array<string> | null;
}

/** Filters for `GET /api/v1/trade/lots`. All fields nullable — omit to leave unset. */
export interface ListLotsQuery {
    hub: number | null;
    resourceId: number | null;
    seller: string | null;
    minPrice: string | null;
    maxPrice: string | null;
    availability: LotAvailability | null;
    sort: LotSort | null;
    limit: number | null;
    offset: number | null;
    aroundTokenId: number | null;
    radius: number | null;
}

/** Filters for `GET /api/v1/trade/markets`. */
export interface MarketsQuery {
    hub: number | null;
    resourceId: number | null;
    aroundTokenId: number | null;
    radius: number | null;
}

export interface TradeClientOptions {
    contracts: IContractClient;
    logger: ILogger;
}

export interface CreateLotParams {
    trade: Address;
    tokenIds: Array<bigint>;
    res: number;
    /** Units to list. */
    value: bigint;
    /** Asking price per unit, in $CPU wei. */
    price: bigint;
    maxFee: bigint;
}

export interface BuyLotParams {
    trade: Address;
    lotId: bigint;
    value: bigint;
    destTokenIds: Array<bigint>;
    maxFee: bigint;
}

export interface CancelLotParams {
    trade: Address;
    lotId: bigint;
    returnTokenIds: Array<bigint>;
    maxFee: bigint;
}

/** Sends the three Trade writes — implemented by TradeClient. Lot reads come from the game API. */
export interface ITradeClient {
    createLot(params: CreateLotParams): Promise<Hash>;
    buy(params: BuyLotParams): Promise<Hash>;
    cancel(params: CancelLotParams): Promise<Hash>;
}

/**
 * A confirmed `create_lot`: the lot is `DELIVERING` until its escrow arrives at the hub and a
 * `finalize_delivery` on `deliveryId` opens it.
 */
export interface CreateLotResult {
    lotId: string;
    hubTokenId: string;
    resourceId: number;
    value: string;
    pricePerUnit: string;
    deliveryId: string;
    arrivalAt: number;
    /** Transit fee quoted for the routing, in $CPU (decimal). */
    fee: string;
    txHash: Hash;
    /** Transport-fee approve, when the route crossed a foreign hub. */
    approveTxHash: Hash | null;
    status: TxStatus;
    blockNumber: string;
}

/** A confirmed `buy_lot`: goods ship to the buyer's cell and land after `finalize_delivery`. */
export interface BuyLotResult {
    lotId: string;
    resourceId: number;
    value: string;
    /** value × pricePerUnit, in $CPU (decimal). */
    sale: string;
    /** Units left on the lot after this buy (0 = sold out). */
    remaining: string;
    /** Transit fee paid, in $CPU (decimal). */
    fee: string;
    deliveryId: string;
    arrivalAt: number;
    txHash: Hash;
    /** $CPU approve for the sale (spender: Trade). */
    approveSaleTxHash: Hash | null;
    /** $CPU approve for the transit fee (spender: Transport), when the route crossed a foreign hub. */
    approveTransitTxHash: Hash | null;
    status: TxStatus;
    blockNumber: string;
}

/** A confirmed `cancel_lot`: the unsold remainder ships home and lands after `finalize_delivery`. */
export interface CancelLotResult {
    lotId: string;
    resourceId: number;
    /** Units returned to the seller. */
    returned: string;
    /** Transit fee paid, in $CPU (decimal). */
    fee: string;
    deliveryId: string;
    arrivalAt: number;
    txHash: Hash;
    approveTxHash: Hash | null;
    status: TxStatus;
    blockNumber: string;
}

/** A non-destructive buy preview. `routed` = a route was supplied, so the transit fee is included. */
export interface TradeQuote {
    lotId: string;
    resourceId: number;
    /** Decimal $CPU per unit (e.g. "2"). */
    pricePerUnit: string;
    value: string;
    remaining: string;
    routed: boolean;
    /** value × pricePerUnit, in $CPU (decimal). */
    sale: string;
    /** Transit fee in $CPU (decimal), or null for a seller-only estimate. */
    transitFee: string | null;
    /** sale + transitFee, in $CPU (decimal) — the expected $CPU buy_lot charges. */
    total: string;
    totalDistance: number | null;
    arrivalAt: number | null;
}

// ---- Swap (Uniswap v4 ETH/$CPU pool) ----

export interface SwapServiceOptions {
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    logger: ILogger;
}

export enum SwapToken {
    ETH = 'ETH',
    CPU = 'CPU',
}

export enum SwapDirection {
    EthToCpu = 'eth_to_cpu',
    CpuToEth = 'cpu_to_eth',
}

export interface PoolKeyView {
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
}

export interface SwapRoute {
    direction: SwapDirection;
    tokenIn: Address;
    tokenOut: Address;
    zeroForOne: boolean;
}

export interface PreparedSwap {
    config: AppConfig;
    wallet: WalletManager;
    pool: PoolKeyView;
    route: SwapRoute;
    amountInWei: bigint;
    amountOutWei: bigint;
    amountOutMinimumWei: bigint;
}

export interface V4SwapPlan {
    poolKey: PoolKeyView;
    zeroForOne: boolean;
    inputCurrency: Address;
    outputCurrency: Address;
    amountInWei: bigint;
    amountOutMinimumWei: bigint;
    deadline: bigint;
}

export interface SwapInput {
    sell: SwapToken;
    amount: string;
    slippage: number;
}

export interface SwapQuote {
    direction: SwapDirection;
    sell: SwapToken;
    tokenIn: Address;
    tokenOut: Address;
    fee: number;
    amountIn: string;
    amountOut: string;
    amountOutMinimum: string;
    slippage: number;
}

export interface SwapResult {
    direction: SwapDirection;
    sell: SwapToken;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: string;
    amountOutQuoted: string;
    amountOutMinimum: string;
    txHash: Hash;
    approveTxHash: Hash | null;
    permit2TxHash: Hash | null;
    status: TxStatus;
    blockNumber: string;
}

// ---- Mint (OpenSea SeaDrop land public drop) ----

export interface MintServiceOptions {
    wallet: WalletProvider;
    appConfig: IAppConfig;
    logger: ILogger;
}

export interface MintInput {
    /** Number of land cells to mint, as a positive integer string. */
    quantity: string;
}

/** The active SeaDrop public-drop terms for the land collection, read on-chain. */
export interface PublicDropView {
    /** ETH price per cell, in wei. */
    mintPrice: bigint;
    startTime: number;
    endTime: number;
    maxTotalMintableByWallet: number;
    /** OpenSea fee, in basis points of the (inclusive) mint price. */
    feeBps: number;
    restrictFeeRecipients: boolean;
}

export interface PreparedMint {
    config: AppConfig;
    wallet: WalletManager;
    land: Address;
    drop: PublicDropView;
    quantity: number;
    /** quantity × mintPrice, in wei — the exact ETH the mint must pay. */
    totalWei: bigint;
}

export interface MintQuote {
    land: Address;
    quantity: number;
    /** Per-cell price in native ETH (decimal). */
    mintPrice: string;
    /** quantity × mintPrice in native ETH (decimal). */
    total: string;
    feeBps: number;
    startTime: number;
    endTime: number;
    maxTotalMintableByWallet: number;
}

/** A confirmed mint — the on-chain SeaDrop public-drop purchase of `quantity` cells, paid in ETH. */
export interface MintResult {
    land: Address;
    quantity: number;
    /** quantity × mintPrice in native ETH (decimal). */
    total: string;
    txHash: Hash;
    status: TxStatus;
    blockNumber: string;
}

/** Mints land cells via the SeaDrop public drop — implemented by MintService. */
export interface IMintService {
    quote(input: MintInput): Promise<MintQuote>;
    mint(input: MintInput): Promise<MintResult>;
}

// ---- Account balance ----

export interface BalanceServiceOptions {
    wallet: WalletProvider;
    appConfig: IAppConfig;
    logger: ILogger;
}

/** The wallet's spendable funds — $CPU (the game currency) plus native gas. */
export interface BalanceResult {
    address: string;
    network: Network;
    chainId: number;
    /** $CPU balance in $CPU (decimal). */
    cpu: string;
    /** Native gas balance in ETH (decimal). */
    native: string;
}
