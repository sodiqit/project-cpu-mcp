import { isAddress, parseEther, parseEventLogs, type Address, type Hash } from 'viem';
import { z } from 'zod';

import { decodeDeliveryScheduled } from './delivery.helpers.js';
import { describeApiError } from './reveal.helpers.js';
import {
    enrichFrozenBuyError,
    enrichSaleFeeToleranceError,
    withDecimalMinPrice,
    withDecimalPrice,
} from './trade.helpers.js';
import { TRANSPORT_MAX_FEE_BUFFER_PERCENT } from './transport.constants.js';
import {
    type AppConfig,
    type BuyLotInput,
    type BuyLotResult,
    type CancelLotInput,
    type CancelLotResult,
    type CreateLotInput,
    type CreateLotResult,
    type IAllowanceService,
    type IAppConfig,
    type ITradeClient,
    type ITransportClient,
    type ListLotsQuery,
    type MarketsQuery,
    type QuoteBuyInput,
    type QuoteRouteParams,
    type SetSaleFeeInput,
    type SetSaleFeeResult,
    type TradeQuote,
    type TradeServiceOptions,
} from './types.js';
import type { ApiClient } from '../api/client.js';
import {
    type ApiLotView,
    apiLotViewSchema,
    type ApiMarketResourceSummary,
    apiMarketResourceSummarySchema,
    HttpStatus,
    LotAvailability,
    type LotState,
    type LotView,
    type MarketResourceSummary,
} from '../api/types.js';
import { TRADE_ABI } from '../contracts/trade.abi.js';
import type { ILogger } from '../logger/types.js';
import { bpToPercent, cpuFromWei, percentToBp } from '../utils/format.utils.js';
import type { IContractClient, WalletManager, WalletProvider } from '../wallet/types.js';

/**
 * The lot marketplace. The three writes (create / buy / cancel) go straight to the Trade contract;
 * each routes goods through Transport, so the client quotes the transit fee on-chain
 * (`Transport.quoteRoute`), approves the $CPU it will spend, sends the call, and reads the lifecycle
 * event plus the `DeliveryScheduled` from the receipt. A write lands the lot in `DELIVERING` / ships
 * the goods; the escrow opens (or the goods arrive) only after a `finalize_delivery` on the returned
 * `deliveryId`. Discovery reads stay on the game API, which indexes the same events. Lot pricing is
 * read from that projection — `pricePerUnit` is immutable on-chain, so it is authoritative.
 */
export class TradeService {
    private readonly api: ApiClient;
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly allowance: IAllowanceService;
    private readonly contracts: IContractClient;
    private readonly tradeClient: ITradeClient;
    private readonly transportClient: ITransportClient;
    private readonly logger: ILogger;

    constructor(options: TradeServiceOptions) {
        this.api = options.api;
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.allowance = options.allowance;
        this.contracts = options.contracts;
        this.tradeClient = options.tradeClient;
        this.transportClient = options.transportClient;
        this.logger = options.logger;
    }

    // ---- Writes ----

    async createLot(input: CreateLotInput): Promise<CreateLotResult> {
        const { config, wallet } = await this.ready();
        const trade = this.resolveTrade(config);
        const transport = this.resolveTransport(config);

        const tokenIds = input.chain.map((tokenId) => BigInt(tokenId));
        const hub = tokenIds[tokenIds.length - 1] as bigint;
        const value = BigInt(input.value);
        const price = parseEther(input.pricePerUnit);

        const maxSaleFeeBp =
            input.maxSaleFeePercent !== null
                ? percentToBp(input.maxSaleFeePercent)
                : await this.tradeClient.getSaleFee({ trade, hub, res: input.resourceId });

        this.logger.info('creating lot', {
            resourceId: input.resourceId,
            value: input.value,
            pricePerUnit: input.pricePerUnit,
            maxSaleFeeBp,
            network: config.network,
        });

        const { feeWei, maxFee } = await this.quoteTransit({
            transport,
            from: wallet.getAddress(),
            tokenIds,
            res: input.resourceId,
            amount: value,
        });
        const approveTxHash = await this.approveTransit(config, transport, maxFee);

        let txHash: Hash;
        try {
            txHash = await this.tradeClient.createLot({
                trade,
                tokenIds,
                res: input.resourceId,
                value,
                price,
                maxSaleFeeBp,
                maxFee,
            });
        } catch (error) {
            throw enrichSaleFeeToleranceError(error);
        }
        const confirmed = await this.contracts.confirm(txHash, 'Create lot');

        const created = this.firstFrom(
            parseEventLogs({ abi: TRADE_ABI, eventName: 'LotCreated', logs: confirmed.logs }),
            trade,
            'LotCreated',
        );
        const scheduled = decodeDeliveryScheduled(confirmed.logs, transport);

        this.logger.info('lot created', {
            lotId: created.args.lotId.toString(),
            deliveryId: scheduled.deliveryId.toString(),
            txHash: confirmed.txHash,
            block: confirmed.blockNumber,
        });

        return {
            lotId: created.args.lotId.toString(),
            hubTokenId: created.args.hub.toString(),
            resourceId: input.resourceId,
            value: input.value,
            pricePerUnit: input.pricePerUnit,
            maxSaleFeePercent: bpToPercent(created.args.maxSaleFeeBp),
            deliveryId: scheduled.deliveryId.toString(),
            arrivalAt: Number(scheduled.arrivalAt),
            fee: cpuFromWei(feeWei.toString()),
            txHash: confirmed.txHash,
            approveTxHash,
            status: confirmed.status,
            blockNumber: confirmed.blockNumber,
        };
    }

    async setSaleFee(input: SetSaleFeeInput): Promise<SetSaleFeeResult> {
        const { config } = await this.ready();
        const trade = this.resolveTrade(config);

        const feeBp = percentToBp(input.feePercent);

        this.logger.info('setting sale fee', {
            hubTokenId: input.hubTokenId,
            resourceId: input.resourceId,
            feeBp,
            network: config.network,
        });

        const txHash = await this.tradeClient.setSaleFee({
            trade,
            hub: BigInt(input.hubTokenId),
            res: input.resourceId,
            feeBp,
        });
        const confirmed = await this.contracts.confirm(txHash, 'Set sale fee');

        const changed = this.firstFrom(
            parseEventLogs({ abi: TRADE_ABI, eventName: 'SaleFeeChanged', logs: confirmed.logs }),
            trade,
            'SaleFeeChanged',
        );

        return {
            hubTokenId: changed.args.hubTokenId.toString(),
            resourceId: Number(changed.args.resource),
            feePercent: bpToPercent(changed.args.feeBp),
            txHash: confirmed.txHash,
            status: confirmed.status,
            blockNumber: confirmed.blockNumber,
        };
    }

    async buyLot(input: BuyLotInput): Promise<BuyLotResult> {
        const { config, wallet } = await this.ready();
        const trade = this.resolveTrade(config);
        const transport = this.resolveTransport(config);
        const cpuToken = this.resolveCpuToken(config);

        const lot = await this.getLot(input.lotId);
        const value = BigInt(input.value);
        const saleWei = value * parseEther(lot.pricePerUnit);

        const destTokenIds = input.chain.map((tokenId) => BigInt(tokenId));

        this.logger.info('buying lot', { lotId: input.lotId, value: input.value, network: config.network });

        const { feeWei, maxFee } = await this.quoteTransit({
            transport,
            from: wallet.getAddress(),
            tokenIds: destTokenIds,
            res: lot.resourceId,
            amount: value,
        });

        // Two spenders: Trade pulls the sale ($CPU → seller + burn), Transport pulls the transit fee.
        const approveSaleTxHash = await this.allowance.ensureAllowance(cpuToken, trade, saleWei);
        const approveTransitTxHash =
            maxFee === 0n ? null : await this.allowance.ensureAllowance(cpuToken, transport, maxFee);

        let txHash: Hash;
        try {
            txHash = await this.tradeClient.buy({ trade, lotId: BigInt(input.lotId), value, destTokenIds, maxFee });
        } catch (error) {
            throw enrichFrozenBuyError(error);
        }
        const confirmed = await this.contracts.confirm(txHash, `Buy lot ${input.lotId}`);

        const bought = this.firstFrom(
            parseEventLogs({ abi: TRADE_ABI, eventName: 'LotBought', logs: confirmed.logs }),
            trade,
            'LotBought',
        );
        const scheduled = decodeDeliveryScheduled(confirmed.logs, transport);

        this.logger.info('lot bought', {
            lotId: input.lotId,
            deliveryId: scheduled.deliveryId.toString(),
            txHash: confirmed.txHash,
            block: confirmed.blockNumber,
        });

        return {
            lotId: input.lotId,
            resourceId: lot.resourceId,
            value: input.value,
            sale: cpuFromWei(bought.args.sale.toString()),
            discount: cpuFromWei(bought.args.discount.toString()),
            paid: cpuFromWei((bought.args.sale - bought.args.discount).toString()),
            hubFee: cpuFromWei(bought.args.hubFee.toString()),
            tax: cpuFromWei(bought.args.tax.toString()),
            ownerNet: cpuFromWei(bought.args.ownerNet.toString()),
            burn: cpuFromWei(bought.args.burn.toString()),
            remaining: bought.args.remaining.toString(),
            fee: cpuFromWei(feeWei.toString()),
            deliveryId: scheduled.deliveryId.toString(),
            arrivalAt: Number(scheduled.arrivalAt),
            txHash: confirmed.txHash,
            approveSaleTxHash,
            approveTransitTxHash,
            status: confirmed.status,
            blockNumber: confirmed.blockNumber,
        };
    }

    async cancelLot(input: CancelLotInput): Promise<CancelLotResult> {
        const { config, wallet } = await this.ready();
        const trade = this.resolveTrade(config);
        const transport = this.resolveTransport(config);

        const lot = await this.getLot(input.lotId);
        const remaining = BigInt(lot.remaining);

        const returnTokenIds = input.chain.map((tokenId) => BigInt(tokenId));

        this.logger.info('cancelling lot', { lotId: input.lotId, network: config.network });

        const { feeWei, maxFee } = await this.quoteTransit({
            transport,
            from: wallet.getAddress(),
            tokenIds: returnTokenIds,
            res: lot.resourceId,
            amount: remaining,
        });
        const approveTxHash = await this.approveTransit(config, transport, maxFee);

        const txHash = await this.tradeClient.cancel({ trade, lotId: BigInt(input.lotId), returnTokenIds, maxFee });
        const confirmed = await this.contracts.confirm(txHash, `Cancel lot ${input.lotId}`);

        const cancelled = this.firstFrom(
            parseEventLogs({ abi: TRADE_ABI, eventName: 'LotCancelled', logs: confirmed.logs }),
            trade,
            'LotCancelled',
        );
        const scheduled = decodeDeliveryScheduled(confirmed.logs, transport);

        return {
            lotId: input.lotId,
            resourceId: lot.resourceId,
            returned: cancelled.args.returned.toString(),
            fee: cpuFromWei(feeWei.toString()),
            deliveryId: scheduled.deliveryId.toString(),
            arrivalAt: Number(scheduled.arrivalAt),
            txHash: confirmed.txHash,
            approveTxHash,
            status: confirmed.status,
            blockNumber: confirmed.blockNumber,
        };
    }

    /**
     * Non-destructive buy preview: `sale = value × pricePerUnit` (immutable, from the projection) plus
     * the on-chain transit fee when a route is supplied. Pass `chain` for the exact routed total, omit
     * it for a seller-only estimate.
     */
    async quoteBuy(input: QuoteBuyInput): Promise<TradeQuote> {
        const { config, wallet } = await this.ready();
        const lot = await this.getLot(input.lotId);
        const value = BigInt(input.value);
        const saleWei = value * parseEther(lot.pricePerUnit);

        let transitFeeWei: bigint | null = null;
        let totalDistance: number | null = null;
        let arrivalAt: number | null = null;

        if (input.chain !== null) {
            const transport = this.resolveTransport(config);
            const quote = await this.transportClient.quoteRoute({
                transport,
                from: wallet.getAddress(),
                tokenIds: input.chain.map((tokenId) => BigInt(tokenId)),
                res: lot.resourceId,
                amount: value,
            });
            transitFeeWei = quote.totalFee;
            totalDistance = Number(quote.totalDistance);
            arrivalAt = Number(quote.arrivalAt);
        }

        return {
            lotId: input.lotId,
            resourceId: lot.resourceId,
            pricePerUnit: lot.pricePerUnit,
            value: input.value,
            remaining: lot.remaining,
            routed: input.chain !== null,
            sale: cpuFromWei(saleWei.toString()),
            transitFee: transitFeeWei === null ? null : cpuFromWei(transitFeeWei.toString()),
            total: cpuFromWei((saleWei + (transitFeeWei ?? 0n)).toString()),
            totalDistance,
            arrivalAt,
            frozen: lot.frozen,
            saleFeePercent: lot.saleFeePercent,
            maxSaleFeePercent: lot.maxSaleFeePercent,
        };
    }

    // ---- Reads (discovery) ----

    /** Compact per-`(hub, resource)` scout aggregate — the recommended starting overview. */
    async getMarkets(query: MarketsQuery): Promise<Array<MarketResourceSummary>> {
        const qs = buildQuery({
            hub: query.hub,
            resourceId: query.resourceId,
            aroundTokenId: query.aroundTokenId,
            radius: query.radius,
        });
        const response = await this.api.request<Array<ApiMarketResourceSummary>>(`/api/v1/trade/markets${qs}`);
        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Failed to load markets (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }
        z.array(apiMarketResourceSummarySchema).parse(response.data);
        return response.data.map(withDecimalMinPrice);
    }

    /** Paginated lot browse with filter / sort / zone. */
    async listLots(query: ListLotsQuery): Promise<Array<LotView>> {
        const qs = buildQuery({
            hub: query.hub,
            resourceId: query.resourceId,
            seller: query.seller,
            minPrice: query.minPrice,
            maxPrice: query.maxPrice,
            availability: query.availability,
            sort: query.sort,
            limit: query.limit,
            offset: query.offset,
            aroundTokenId: query.aroundTokenId,
            radius: query.radius,
        });
        const response = await this.api.request<Array<ApiLotView>>(`/api/v1/trade/lots${qs}`);
        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Failed to list lots (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }
        z.array(apiLotViewSchema).parse(response.data);
        const lots = response.data.map(withDecimalPrice);
        const hidesFrozen = query.availability === null || query.availability === LotAvailability.Open;
        return hidesFrozen ? lots.filter((lot) => !lot.frozen) : lots;
    }

    /** Public single-lot read. */
    async getLot(lotId: string): Promise<LotView> {
        const response = await this.api.request<ApiLotView>(`/api/v1/trade/lots/${lotId}`);
        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Failed to get lot ${lotId} (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }
        apiLotViewSchema.parse(response.data);
        return withDecimalPrice(response.data);
    }

    /** The caller's lots across all lifecycle states (optionally filtered). */
    async listMyLots(state: LotState | null): Promise<Array<LotView>> {
        const qs = state === null ? '' : `?state=${state}`;
        const response = await this.api.authenticatedRequest<Array<ApiLotView>>(`/api/v1/trade/lots/mine${qs}`);
        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Failed to list your lots (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }
        z.array(apiLotViewSchema).parse(response.data);
        return response.data.map(withDecimalPrice);
    }

    // ---- Internal ----

    private async quoteTransit(route: QuoteRouteParams): Promise<{ feeWei: bigint; maxFee: bigint }> {
        const quote = await this.transportClient.quoteRoute(route);
        const maxFee = quote.totalFee + (quote.totalFee * BigInt(TRANSPORT_MAX_FEE_BUFFER_PERCENT)) / 100n;
        return { feeWei: quote.totalFee, maxFee };
    }

    private async approveTransit(config: AppConfig, transport: Address, maxFee: bigint): Promise<Hash | null> {
        if (maxFee === 0n) {
            return null;
        }
        return this.allowance.ensureAllowance(this.resolveCpuToken(config), transport, maxFee);
    }

    private firstFrom<T extends { address: string }>(events: Array<T>, trade: Address, label: string): T {
        const event = events.find((e) => e.address.toLowerCase() === trade.toLowerCase());
        if (event === undefined) {
            throw new Error(`Trade write confirmed but Trade emitted no ${label} event.`);
        }
        return event;
    }

    private resolveTrade(config: AppConfig): Address {
        const trade = config.contracts.trade;
        if (!isAddress(trade, { strict: false })) {
            throw new Error(`Trade contract is not configured for network ${config.network}; cannot trade.`);
        }
        return trade;
    }

    private resolveTransport(config: AppConfig): Address {
        const transport = config.contracts.transport;
        if (!isAddress(transport, { strict: false })) {
            throw new Error(`Transport contract is not configured for network ${config.network}; cannot route goods.`);
        }
        return transport;
    }

    private resolveCpuToken(config: AppConfig): Address {
        const cpuToken = config.contracts.cpuToken;
        if (!isAddress(cpuToken, { strict: false })) {
            throw new Error(`$CPU token is not configured for network ${config.network}; cannot pay for trade.`);
        }
        return cpuToken;
    }

    private async ready(): Promise<{ config: AppConfig; wallet: WalletManager }> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();
        if (config.chainId !== wallet.getChainId()) {
            throw new Error(
                `Chain mismatch: the chain config is chainId ${config.chainId} but the wallet is on ` +
                    `${wallet.getChainId()}. Check NETWORK.`,
            );
        }
        return { config, wallet };
    }
}

/** Serialise a query object to `?a=1&b=2`, dropping null fields and URL-encoding values. */
function buildQuery(params: Record<string, string | number | null>): string {
    const pairs: Array<string> = [];
    for (const [key, value] of Object.entries(params)) {
        if (value !== null) {
            pairs.push(`${key}=${encodeURIComponent(String(value))}`);
        }
    }
    return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}
