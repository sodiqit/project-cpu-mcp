import { isAddress } from 'viem';

import { describeApiError } from './reveal.helpers.js';
import { settleTransit, type SettlementFunction } from './settlement.helpers.js';
import {
    type AppConfig,
    type BuyLotInput,
    type CancelLotInput,
    type CreateLotInput,
    type FreeLotResult,
    type IAllowanceService,
    type IAppConfig,
    LotAction,
    type ListLotsQuery,
    type LotResult,
    LotResultKind,
    type MarketsQuery,
    type PaidLotResult,
    type Payable,
    type QuoteBuyInput,
    type TradeServiceOptions,
} from './types.js';
import type { ApiClient } from '../api/client.js';
import {
    type ApiResponse,
    type BuyLotRequest,
    type CancelLotRequest,
    type CancelLotResponse,
    type CreateLotRequest,
    type CreateLotResponse,
    type FreeLotResponse,
    HttpStatus,
    LotResponseKind,
    type LotState,
    type LotView,
    type MarketResourceSummary,
    type PaidLotSignatureResponse,
    type TradeQuoteResponse,
} from '../api/types.js';
import type { ILogger } from '../logger/types.js';
import { errorMessage } from '../utils/error.utils.js';
import type { WalletManager, WalletProvider } from '../wallet/types.js';

/**
 * The lot marketplace: discovery reads plus the three paid/free writes (create / buy / cancel). Each
 * paid write returns an EIP-712 signature the client settles on-chain (`transport` for create-lot,
 * `tradeBuy`, `tradeCancel`) through the shared `settleTransit` path. There is no resume for trade: the
 * server reconciles an abandoned reservation a short while after its deadline, so a failed payment
 * surfaces the deadline and the action is re-run once that reservation has cleared.
 */
export class TradeService {
    private readonly api: ApiClient;
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly allowance: IAllowanceService;
    private readonly logger: ILogger;

    constructor(options: TradeServiceOptions) {
        this.api = options.api;
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.allowance = options.allowance;
        this.logger = options.logger;
    }

    // ---- Writes ----

    async createLot(input: CreateLotInput): Promise<LotResult> {
        const { config, wallet } = await this.ready();
        this.logger.info('creating lot', {
            resourceId: input.resourceId,
            value: input.value,
            pricePerUnit: input.pricePerUnit,
            network: config.network,
        });
        const response = await this.api.authenticatedRequest<CreateLotResponse>('/api/v1/trade/lots', {
            method: 'POST',
            body: {
                chain: input.chain,
                resourceId: input.resourceId,
                value: input.value,
                pricePerUnit: input.pricePerUnit,
                network: config.network,
            } satisfies CreateLotRequest,
        });
        return this.handleWrite(LotAction.Create, 'transport', config, wallet, response);
    }

    async buyLot(input: BuyLotInput): Promise<LotResult> {
        const { config, wallet } = await this.ready();
        this.logger.info('buying lot', { lotId: input.lotId, value: input.value, network: config.network });
        const response = await this.api.authenticatedRequest<PaidLotSignatureResponse>(
            `/api/v1/trade/lots/${input.lotId}/buy`,
            {
                method: 'POST',
                body: { chain: input.chain, value: input.value, network: config.network } satisfies BuyLotRequest,
            },
        );
        return this.handleWrite(LotAction.Buy, 'tradeBuy', config, wallet, response);
    }

    async cancelLot(input: CancelLotInput): Promise<LotResult> {
        const { config, wallet } = await this.ready();
        this.logger.info('cancelling lot', { lotId: input.lotId, network: config.network });
        const response = await this.api.authenticatedRequest<CancelLotResponse>(
            `/api/v1/trade/lots/${input.lotId}/cancel`,
            {
                method: 'POST',
                body: { chain: input.chain, network: config.network } satisfies CancelLotRequest,
            },
        );
        return this.handleWrite(LotAction.Cancel, 'tradeCancel', config, wallet, response);
    }

    // ---- Reads (discovery) ----

    /** Compact per-`(hub, resource)` scout aggregate — the recommended starting overview. */
    async getMarkets(query: MarketsQuery): Promise<Array<MarketResourceSummary>> {
        const qs = buildQuery({
            hub: query.hub,
            resourceId: query.resourceId,
            aroundTokenId: query.aroundTokenId,
            centerX: query.centerX,
            centerY: query.centerY,
            radius: query.radius,
        });
        const response = await this.api.request<Array<MarketResourceSummary>>(`/api/v1/trade/markets${qs}`);
        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Failed to load markets (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }
        return response.data;
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
            centerX: query.centerX,
            centerY: query.centerY,
            radius: query.radius,
        });
        const response = await this.api.request<Array<LotView>>(`/api/v1/trade/lots${qs}`);
        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Failed to list lots (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }
        return response.data;
    }

    /** Public single-lot read. */
    async getLot(lotId: string): Promise<LotView> {
        const response = await this.api.request<LotView>(`/api/v1/trade/lots/${lotId}`);
        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Failed to get lot ${lotId} (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }
        return response.data;
    }

    /** The caller's lots across all lifecycle states (optionally filtered). */
    async listMyLots(state: LotState | null): Promise<Array<LotView>> {
        const qs = state === null ? '' : `?state=${state}`;
        const response = await this.api.authenticatedRequest<Array<LotView>>(`/api/v1/trade/lots/mine${qs}`);
        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Failed to list your lots (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }
        return response.data;
    }

    /** Non-destructive buy preview — pass `chain` for the exact routed total, omit it for a seller-only estimate. */
    async quoteBuy(input: QuoteBuyInput): Promise<TradeQuoteResponse> {
        const chain = input.chain === null ? null : input.chain.map((c) => `${c.x},${c.y}`).join(';');
        const qs = buildQuery({ value: input.value, chain });
        const response = await this.api.authenticatedRequest<TradeQuoteResponse>(
            `/api/v1/trade/lots/${input.lotId}/quote${qs}`,
        );
        if (response.status !== HttpStatus.Ok) {
            throw new Error(
                `Failed to quote buy on lot ${input.lotId} (HTTP ${response.status}): ${describeApiError(response.data)}`,
            );
        }
        return response.data;
    }

    private async handleWrite(
        action: LotAction,
        functionName: SettlementFunction,
        config: AppConfig,
        wallet: WalletManager,
        response: ApiResponse<FreeLotResponse | PaidLotSignatureResponse>,
    ): Promise<LotResult> {
        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Trade ${action} failed (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }

        const data = response.data;
        if (data.kind !== LotResponseKind.Paid) {
            this.logger.info('free lot action', { action, lotId: data.lotId, state: data.state });
            return this.toFreeResult(action, data);
        }

        // Validate the deterministic preconditions outside the retry-hint wrapper — a retry can't fix them.
        const payable = this.validatePayable(config, wallet, data);

        // The paid POST already soft-reserved (create/buy) or escrowed (cancel) and minted the signature;
        // if the on-chain payment now fails, the reservation dangles until its deadline, then reconciles
        // automatically. Surface the deadline so the agent waits for it to clear before retrying.
        try {
            return await this.submitPayment(action, functionName, wallet, data, payable);
        } catch (error) {
            throw new Error(
                `Paid ${action} on lot ${data.lotId} was signed but the on-chain payment did not complete: ` +
                    `${errorMessage(error)}. The signature is valid until ${data.deadline} (unix seconds); the ` +
                    `reservation is reconciled automatically a short while after the deadline — wait for it to ` +
                    `clear, then re-run the action (re-running while it is still pending is rejected).`,
            );
        }
    }

    private validatePayable(config: AppConfig, wallet: WalletManager, data: PaidLotSignatureResponse): Payable {
        // The on-chain signature is bound to `sender`; a wallet mismatch would revert as BadSignature.
        if (data.sender.toLowerCase() !== wallet.getAddress().toLowerCase()) {
            throw new Error(
                `Trade signature was issued for ${data.sender} but the wallet is ${wallet.getAddress()}; cannot pay.`,
            );
        }
        const cpuToken = config.contracts.cpuToken;
        if (!isAddress(cpuToken, { strict: false })) {
            throw new Error(`$CPU token is not configured for network ${config.network}; cannot pay for trade.`);
        }
        return {
            gameSettlement: config.contracts.gameSettlement,
            cpuToken,
            totalAmount: BigInt(data.totalAmount),
        };
    }

    private async submitPayment(
        action: LotAction,
        functionName: SettlementFunction,
        wallet: WalletManager,
        data: PaidLotSignatureResponse,
        payable: Payable,
    ): Promise<PaidLotResult> {
        this.logger.info('submitting trade payment', {
            action,
            lotId: data.lotId,
            gameSettlement: payable.gameSettlement,
            totalAmount: payable.totalAmount.toString(),
        });
        const settlement = await settleTransit({
            wallet,
            allowance: this.allowance,
            gameSettlement: payable.gameSettlement,
            cpuToken: payable.cpuToken,
            functionName,
            sig: data,
            revertLabel: `Trade ${action} (lot ${data.lotId})`,
        });

        this.logger.info('trade payment confirmed', {
            action,
            lotId: data.lotId,
            txHash: settlement.txHash,
            block: settlement.blockNumber,
        });
        return {
            kind: LotResultKind.Paid,
            action,
            lotId: data.lotId,
            signId: data.signId,
            state: data.state,
            tokenId: data.tokenId,
            totalAmount: data.totalAmount,
            burnAmount: data.burnAmount,
            recipients: data.recipients,
            payouts: data.payouts,
            ...settlement,
        };
    }

    private toFreeResult(action: LotAction, data: FreeLotResponse): FreeLotResult {
        return {
            kind: LotResultKind.Free,
            action,
            lotId: data.lotId,
            state: data.state,
            arrivalAt: data.arrivalAt,
        };
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
