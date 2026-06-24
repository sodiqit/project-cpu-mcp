import type { Address, Hash } from 'viem';

import type { ApiClient } from '../api/client.js';
import type {
    BuildingType,
    BuildingView,
    CraftRecipeId,
    CraftStackView,
    LotAvailability,
    LotSort,
    LotState,
    RecipeView,
    RevealCostView,
    TransportCoord,
    TransportStatus,
} from '../api/types.js';
import type { Network } from '../config/types.js';
import type { ILogger } from '../logger/types.js';
import type { SessionManager } from '../session/manager.js';
import type { TxStatus, WalletManager, WalletProvider } from '../wallet/types.js';

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
    /** Always a valid address — `AppConfigService.load()` rejects a config without it. */
    gameSettlement: Address;
    /** Uniswap v4 hook for the ETH/$CPU pool; empty until configured. Validate before a swap. */
    cpuHook: string;
}

/** Chain + contract addresses for the configured network, loaded from the game API. */
export interface AppConfig {
    network: Network;
    chainId: number;
    contracts: AppContracts;
    /** Resource id → display name, served alongside the chain config. */
    resources: Record<number, string>;
    recipes: Array<RecipeView>;
    /** Build-cost catalog (extractor / hub), human-readable $CPU. */
    buildings: Array<BuildingView>;
    /** First-reveal-free + re-reveal cost params. */
    reveal: RevealCostView;
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

export interface RevealServiceOptions {
    api: ApiClient;
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    logger: ILogger;
}

export interface RevealResult {
    tokenId: string;
    signId: number;
    txHash: Hash;
    /** Present only when a paid re-reveal required a $CPU approve before the reveal. */
    approveTxHash: Hash | null;
    status: TxStatus;
    cpuAmount: string;
    blockNumber: string;
}

export interface BuildServiceOptions {
    api: ApiClient;
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    logger: ILogger;
}

export interface BuildInput {
    tokenId: string;
    buildingType: BuildingType;
    targetResourceId: number | null;
}

/** A confirmed build — the on-chain $CPU spend that places the building (and starts mining for an extractor). */
export interface BuildResult {
    tokenId: string;
    signId: number;
    buildingType: BuildingType;
    targetResourceId: number | null;
    txHash: Hash;
    /** Present only when a $CPU approve was needed before the build. */
    approveTxHash: Hash | null;
    status: TxStatus;
    /** $CPU cost in wei. */
    cpuAmount: string;
    blockNumber: string;
}

export interface WithdrawServiceOptions {
    api: ApiClient;
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
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
    signId: number;
    /** wCPU debited / $CPU minted, in wei. */
    amount: string;
    txHash: Hash;
    /** Always null — a withdraw mints $CPU, so no $CPU approve is ever needed. Kept for shape parity. */
    approveTxHash: Hash | null;
    status: TxStatus;
    blockNumber: string;
    /** True when this finished an already-signed (interrupted) withdraw instead of starting a new one. */
    resumed: boolean;
}

export interface MiningServiceOptions {
    api: ApiClient;
    logger: ILogger;
}

export interface TransportServiceOptions {
    api: ApiClient;
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    logger: ILogger;
}

export interface TransportInput {
    path: Array<TransportCoord>;
    resourceId: number;
    amount: string;
}

export enum TransportResultKind {
    Free = 'free',
    Paid = 'paid',
}

/** A free transport that started immediately — nothing was spent on-chain. */
export interface FreeTransportResult {
    kind: TransportResultKind.Free;
    jobId: number;
    status: TransportStatus;
    sourceTokenId: string;
    targetTokenId: string;
    resourceId: number;
    amount: string;
    totalDistance: number;
    totalTimeSec: number;
    startedAt: number;
    arrivalAt: number;
}

/** A paid transport whose on-chain payment was submitted and confirmed. */
export interface PaidTransportResult {
    kind: TransportResultKind.Paid;
    jobId: number;
    signId: number;
    sourceTokenId: string;
    targetTokenId: string;
    resourceId: number;
    amount: string;
    /** On-chain amounts in wei. */
    totalAmount: string;
    burnAmount: string;
    recipients: Array<string>;
    payouts: Array<string>;
    txHash: Hash;
    /** Present only when a $CPU approve was needed before the payment. */
    approveTxHash: Hash | null;
    status: TxStatus;
    blockNumber: string;
}

export type TransportResult = FreeTransportResult | PaidTransportResult;

/** A resumable paid action awaiting on-chain payment — the input to `resume_transport`. */
export interface PendingTransportView {
    jobId: number;
    signId: number;
    sourceTokenId: string;
    targetTokenId: string;
    resourceId: number;
    amount: string;
    /** On-chain total in wei. */
    totalAmount: string;
    deadline: string;
    /** True while the signature deadline is still in the future. */
    resumable: boolean;
}

/** Resolved on-chain settlement inputs for a paid action, after the deterministic pre-flight checks. */
export interface Payable {
    gameSettlement: Address;
    cpuToken: Address;
    totalAmount: bigint;
}

export interface CraftServiceOptions {
    api: ApiClient;
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    logger: ILogger;
}

export interface CraftInput {
    tokenId: string;
    recipeId: CraftRecipeId;
    batches: number;
}

export enum CraftResultKind {
    Free = 'free',
    Paid = 'paid',
}

/** A free craft that started immediately — nothing was spent on-chain. */
export interface FreeCraftResult {
    kind: CraftResultKind.Free;
    uuid: string;
    tokenId: string;
    recipeId: CraftRecipeId;
    batches: number;
    startAt: number;
    endsAt: number;
    debitedInputs: Array<CraftStackView>;
}

/** A paid craft whose on-chain payment was submitted and confirmed; the timer starts on settlement. */
export interface PaidCraftResult {
    kind: CraftResultKind.Paid;
    uuid: string;
    signId: number;
    tokenId: string;
    recipeId: CraftRecipeId;
    batches: number;
    /** $CPU cost in wei. */
    cpuAmount: string;
    txHash: Hash;
    /** Present only when a $CPU approve was needed before the payment. */
    approveTxHash: Hash | null;
    status: TxStatus;
    blockNumber: string;
    debitedInputs: Array<CraftStackView>;
}

export type CraftResult = FreeCraftResult | PaidCraftResult;

// ---- Trade (lot marketplace) ----

export interface TradeServiceOptions {
    api: ApiClient;
    wallet: WalletProvider;
    appConfig: IAppConfig;
    allowance: IAllowanceService;
    logger: ILogger;
}

export interface CreateLotInput {
    /** `[source, …waypoints, hub]`. */
    chain: Array<TransportCoord>;
    resourceId: number;
    value: string;
    pricePerUnit: string;
}

export interface BuyLotInput {
    lotId: string;
    /** `[hub, …waypoints, buyerDest]`. */
    chain: Array<TransportCoord>;
    value: string;
}

export interface CancelLotInput {
    lotId: string;
    /** `[hub, …waypoints, sellerDest]` for an OPEN lot's return shipment. DRAFT lots can't be cancelled
     *  manually (they auto-revert), so a null chain only ever yields a rejection. */
    chain: Array<TransportCoord> | null;
}

export interface QuoteBuyInput {
    lotId: string;
    value: string;
    /** `[hub, …waypoints, buyerDest]`; null for a seller-only estimate. */
    chain: Array<TransportCoord> | null;
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
    centerX: number | null;
    centerY: number | null;
    radius: number | null;
}

/** Filters for `GET /api/v1/trade/markets`. */
export interface MarketsQuery {
    hub: number | null;
    resourceId: number | null;
    aroundTokenId: number | null;
    centerX: number | null;
    centerY: number | null;
    radius: number | null;
}

export enum LotResultKind {
    Free = 'free',
    Paid = 'paid',
}

/** Which write produced a lot result — drives the on-chain settlement function and the summary text. */
export enum LotAction {
    Create = 'create',
    Buy = 'buy',
    Cancel = 'cancel',
}

/** A free create / cancel that settled off-chain — nothing was spent on-chain. */
export interface FreeLotResult {
    kind: LotResultKind.Free;
    action: LotAction;
    lotId: string;
    state: LotState;
    arrivalAt: number;
}

/** A paid create / buy / cancel whose on-chain payment was submitted and confirmed. */
export interface PaidLotResult {
    kind: LotResultKind.Paid;
    action: LotAction;
    lotId: string;
    signId: number;
    state: LotState;
    tokenId: string;
    /** On-chain amounts in wei. */
    totalAmount: string;
    burnAmount: string;
    recipients: Array<string>;
    payouts: Array<string>;
    txHash: Hash;
    /** Present only when a $CPU approve was needed before the payment. */
    approveTxHash: Hash | null;
    status: TxStatus;
    blockNumber: string;
}

export type LotResult = FreeLotResult | PaidLotResult;

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
    amountInWei: string;
    amountOut: string;
    amountOutWei: string;
    amountOutMinimum: string;
    amountOutMinimumWei: string;
    slippage: number;
}

export interface SwapResult {
    direction: SwapDirection;
    sell: SwapToken;
    tokenIn: Address;
    tokenOut: Address;
    amountIn: string;
    amountInWei: string;
    amountOutQuoted: string;
    amountOutMinimum: string;
    amountOutMinimumWei: string;
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
    /** Per-cell price, human-readable ETH and wei. */
    mintPrice: string;
    mintPriceWei: string;
    /** quantity × mintPrice, human-readable ETH and wei. */
    total: string;
    totalWei: string;
    feeBps: number;
    startTime: number;
    endTime: number;
    maxTotalMintableByWallet: number;
}

/** A confirmed mint — the on-chain SeaDrop public-drop purchase of `quantity` cells, paid in ETH. */
export interface MintResult {
    land: Address;
    quantity: number;
    total: string;
    totalWei: string;
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
    /** $CPU balance, human-readable and wei. */
    cpu: string;
    cpuWei: string;
    /** Native gas balance, human-readable and wei. */
    native: string;
    nativeWei: string;
}
