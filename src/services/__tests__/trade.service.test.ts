import { encodeAbiParameters, encodeEventTopics, formatEther, parseEther, type Hash, type Log } from 'viem';
import { describe, expect, it } from 'vitest';

import type { ApiClient } from '../../api/client.js';
import { LotState, type LotView } from '../../api/types.js';
import { TRADE_ABI } from '../../contracts/trade.abi.js';
import { TRANSPORT_ABI } from '../../contracts/transport.abi.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import {
    type ConfirmedTx,
    type IContractClient,
    type ReadContractParams,
    TxStatus,
    type WalletProvider,
} from '../../wallet/types.js';
import { TradeService } from '../trade.service.js';
import type {
    BuyLotParams,
    CancelLotParams,
    CreateLotParams,
    FinalizeParams,
    ITradeClient,
    ITransportClient,
    MoveParams,
    QuoteRouteParams,
    RouteQuote,
} from '../types.js';
import {
    APPROVE_HASH,
    CPU_TOKEN,
    FakeAllowance,
    FakeApi,
    FakeAppConfig,
    FakeWallet,
    TRADE,
    TRANSPORT,
    WALLET_ADDRESS,
    makeConfig,
} from './service-fakes.js';

const CREATE_HASH = `0x${'1'.repeat(64)}` as Hash;
const BUY_HASH = `0x${'2'.repeat(64)}` as Hash;
const CANCEL_HASH = `0x${'3'.repeat(64)}` as Hash;

const CREATE_INPUT = {
    chain: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
    ],
    resourceId: 3,
    value: '100',
    pricePerUnit: '0.5',
};

function lotView(over: Partial<LotView> = {}): LotView {
    return {
        id: '7',
        hubTokenId: '20',
        hubX: 1,
        hubY: 0,
        sellerAddress: WALLET_ADDRESS,
        resourceId: 3,
        listed: '100',
        remaining: '100',
        pricePerUnit: parseEther('0.5').toString(),
        tradeFeePct: 0,
        state: LotState.Open,
        distanceFromCenter: null,
        createdAt: 1700,
        updated: 1700,
        ...over,
    };
}

function tradeLog(topics: unknown, data: unknown): Log {
    return {
        address: TRADE,
        topics,
        data,
        blockNumber: 100n,
        blockHash: `0x${'0'.repeat(64)}`,
        logIndex: 0,
        transactionHash: `0x${'0'.repeat(64)}`,
        transactionIndex: 0,
        removed: false,
    } as unknown as Log;
}

function createdLog(args: { lotId: bigint; hub: bigint }): Log {
    const topics = encodeEventTopics({
        abi: TRADE_ABI,
        eventName: 'LotCreated',
        args: { lotId: args.lotId, seller: WALLET_ADDRESS, hub: args.hub },
    });
    const data = encodeAbiParameters(
        [
            { name: 'resource', type: 'uint16' },
            { name: 'value', type: 'uint128' },
            { name: 'pricePerUnit', type: 'uint128' },
        ],
        [3, 100n, parseEther('0.5')],
    );
    return tradeLog(topics, data);
}

function boughtLog(args: { lotId: bigint; value: bigint; remaining: bigint; sale: bigint }): Log {
    const topics = encodeEventTopics({
        abi: TRADE_ABI,
        eventName: 'LotBought',
        args: { lotId: args.lotId, buyer: WALLET_ADDRESS },
    });
    const data = encodeAbiParameters(
        [
            { name: 'value', type: 'uint128' },
            { name: 'remaining', type: 'uint128' },
            { name: 'sale', type: 'uint256' },
        ],
        [args.value, args.remaining, args.sale],
    );
    return tradeLog(topics, data);
}

function cancelledLog(args: { lotId: bigint; returned: bigint }): Log {
    const topics = encodeEventTopics({
        abi: TRADE_ABI,
        eventName: 'LotCancelled',
        args: { lotId: args.lotId, seller: WALLET_ADDRESS },
    });
    const data = encodeAbiParameters([{ name: 'returned', type: 'uint128' }], [args.returned]);
    return tradeLog(topics, data);
}

function scheduledLog(deliveryId: bigint, arrivalAt: bigint): Log {
    const topics = encodeEventTopics({
        abi: TRANSPORT_ABI,
        eventName: 'DeliveryScheduled',
        args: { deliveryId, payer: WALLET_ADDRESS },
    });
    const data = encodeAbiParameters(
        [
            { name: 'sourceId', type: 'uint256' },
            { name: 'receiver', type: 'address' },
            { name: 'targetId', type: 'uint256' },
            { name: 'resource', type: 'uint16' },
            { name: 'amount', type: 'uint64' },
            { name: 'arrivalAt', type: 'uint64' },
        ],
        [10n, WALLET_ADDRESS, 20n, 3, 100n, arrivalAt],
    );
    return {
        address: TRANSPORT,
        topics,
        data,
        blockNumber: 100n,
        blockHash: `0x${'0'.repeat(64)}`,
        logIndex: 1,
        transactionHash: `0x${'0'.repeat(64)}`,
        transactionIndex: 0,
        removed: false,
    } as unknown as Log;
}

class FakeContractClient implements IContractClient {
    constructor(
        private readonly logs: Array<Log> = [],
        private readonly reverts: boolean = false,
    ) {}
    async read<T>(_params: ReadContractParams): Promise<T> {
        return undefined as T;
    }
    async send(): Promise<Hash> {
        throw new Error('TradeService should send via the trade client, not contracts.send');
    }
    async confirm(hash: Hash, revertLabel: string): Promise<ConfirmedTx> {
        if (this.reverts) {
            throw new Error(`${revertLabel} reverted on-chain (tx ${hash}).`);
        }
        return { txHash: hash, status: TxStatus.Success, blockNumber: '100', logs: this.logs };
    }
}

class FakeTradeClient implements ITradeClient {
    public readonly creates: Array<CreateLotParams> = [];
    public readonly buys: Array<BuyLotParams> = [];
    public readonly cancels: Array<CancelLotParams> = [];
    async createLot(p: CreateLotParams): Promise<Hash> {
        this.creates.push(p);
        return CREATE_HASH;
    }
    async buy(p: BuyLotParams): Promise<Hash> {
        this.buys.push(p);
        return BUY_HASH;
    }
    async cancel(p: CancelLotParams): Promise<Hash> {
        this.cancels.push(p);
        return CANCEL_HASH;
    }
}

class FakeTransportClient implements ITransportClient {
    public readonly quotes: Array<QuoteRouteParams> = [];
    constructor(
        private readonly quoteResult: RouteQuote,
        private readonly quoteError: Error | null = null,
    ) {}
    async quoteRoute(p: QuoteRouteParams): Promise<RouteQuote> {
        this.quotes.push(p);
        if (this.quoteError !== null) {
            throw this.quoteError;
        }
        return this.quoteResult;
    }
    async move(_p: MoveParams): Promise<Hash> {
        throw new Error('unused');
    }
    async finalize(_p: FinalizeParams): Promise<Hash> {
        throw new Error('unused');
    }
}

type Options = Partial<{
    quote: RouteQuote;
    quoteError: Error | null;
    confirmLogs: Array<Log>;
    reverts: boolean;
    approve: Hash | null | Error;
    walletChainId: number;
    config: ReturnType<typeof makeConfig>;
    response: { status: number; data: unknown };
}>;

function makeTrade(opts: Options = {}): {
    service: TradeService;
    api: FakeApi;
    wallet: FakeWallet;
    allowance: FakeAllowance;
    contracts: FakeContractClient;
    tradeClient: FakeTradeClient;
    transportClient: FakeTransportClient;
} {
    const api = new FakeApi(opts.response ?? { status: 200, data: null });
    const wallet = new FakeWallet(opts.walletChainId ?? 1);
    const allowance = new FakeAllowance(opts.approve ?? null);
    const contracts = new FakeContractClient(opts.confirmLogs ?? [], opts.reverts ?? false);
    const tradeClient = new FakeTradeClient();
    const transportClient = new FakeTransportClient(
        opts.quote ?? { totalFee: 0n, totalDistance: 2n, arrivalAt: 1704n },
        opts.quoteError ?? null,
    );
    const service = new TradeService({
        api: api as unknown as ApiClient,
        wallet: wallet as unknown as WalletProvider,
        appConfig: new FakeAppConfig(opts.config ?? makeConfig()),
        allowance,
        contracts,
        tradeClient,
        transportClient,
        logger: new NoopLogger(),
    });
    return { service, api, wallet, allowance, contracts, tradeClient, transportClient };
}

describe('TradeService.createLot', () => {
    it('lists an own-cell route with no $CPU fee and decodes the lot + delivery', async () => {
        const h = makeTrade({
            quote: { totalFee: 0n, totalDistance: 2n, arrivalAt: 1704n },
            confirmLogs: [createdLog({ lotId: 7n, hub: 20n }), scheduledLog(123n, 1704n)],
        });

        const result = await h.service.createLot(CREATE_INPUT);

        expect(h.allowance.calls).toHaveLength(0);
        expect(h.tradeClient.creates).toHaveLength(1);
        expect(h.tradeClient.creates[0]).toMatchObject({
            trade: TRADE,
            res: 3,
            value: 100n,
            price: parseEther('0.5'),
            maxFee: 0n,
        });
        expect(result.lotId).toBe('7');
        expect(result.hubTokenId).toBe('20');
        expect(result.value).toBe('100');
        expect(result.pricePerUnit).toBe('0.5');
        expect(result.deliveryId).toBe('123');
        expect(result.arrivalAt).toBe(1704);
        expect(result.fee).toBe('0');
        expect(result.approveTxHash).toBeNull();
        expect(result.txHash).toBe(CREATE_HASH);
        expect(result.blockNumber).toBe('100');
        expect(result.status).toBe(TxStatus.Success);
    });

    it('approves the buffered transit fee to Transport for a foreign-hub route', async () => {
        const h = makeTrade({
            quote: { totalFee: 1_000n, totalDistance: 4n, arrivalAt: 1704n },
            approve: APPROVE_HASH,
            confirmLogs: [createdLog({ lotId: 7n, hub: 20n }), scheduledLog(123n, 1704n)],
        });

        const result = await h.service.createLot(CREATE_INPUT);

        expect(h.allowance.calls).toEqual([{ token: CPU_TOKEN, spender: TRANSPORT, needed: 1_100n }]);
        expect(h.tradeClient.creates[0]?.maxFee).toBe(1_100n);
        expect(result.fee).toBe(formatEther(1_000n));
        expect(result.approveTxHash).toBe(APPROVE_HASH);
    });

    it('refuses on a chain mismatch before quoting', async () => {
        const h = makeTrade({ walletChainId: 8453 });
        await expect(h.service.createLot(CREATE_INPUT)).rejects.toThrow(/chain mismatch/i);
        expect(h.transportClient.quotes).toHaveLength(0);
        expect(h.tradeClient.creates).toHaveLength(0);
    });

    it('throws when the Trade contract is not configured', async () => {
        const base = makeConfig();
        const config = { ...base, contracts: { ...base.contracts, trade: '' } };
        const h = makeTrade({ config });
        await expect(h.service.createLot(CREATE_INPUT)).rejects.toThrow(/not configured/i);
        expect(h.tradeClient.creates).toHaveLength(0);
    });

    it('throws when the create reverts on-chain', async () => {
        const h = makeTrade({ reverts: true });
        await expect(h.service.createLot(CREATE_INPUT)).rejects.toThrow(/reverted/i);
    });
});

describe('TradeService.buyLot', () => {
    it('reads the lot, approves both the sale and the transit fee, and decodes the buy', async () => {
        const h = makeTrade({
            response: {
                status: 200,
                data: lotView({ id: '7', pricePerUnit: parseEther('0.5').toString(), remaining: '100' }),
            },
            quote: { totalFee: 1_000n, totalDistance: 4n, arrivalAt: 1704n },
            approve: APPROVE_HASH,
            confirmLogs: [
                boughtLog({ lotId: 7n, value: 10n, remaining: 90n, sale: parseEther('5') }),
                scheduledLog(123n, 1704n),
            ],
        });

        const result = await h.service.buyLot({
            lotId: '7',
            chain: [
                { x: 5, y: 5 },
                { x: 6, y: 6 },
            ],
            value: '10',
        });

        expect(h.api.calls[0]?.path).toBe('/api/v1/trade/lots/7');
        expect(h.api.calls[0]?.authenticated).toBe(false);
        expect(h.allowance.calls).toEqual([
            { token: CPU_TOKEN, spender: TRADE, needed: parseEther('5') },
            { token: CPU_TOKEN, spender: TRANSPORT, needed: 1_100n },
        ]);
        expect(h.tradeClient.buys[0]).toMatchObject({ trade: TRADE, lotId: 7n, value: 10n, maxFee: 1_100n });
        expect(result.sale).toBe('5');
        expect(result.remaining).toBe('90');
        expect(result.fee).toBe(formatEther(1_000n));
        expect(result.deliveryId).toBe('123');
        expect(result.approveSaleTxHash).toBe(APPROVE_HASH);
        expect(result.approveTransitTxHash).toBe(APPROVE_HASH);
        expect(result.txHash).toBe(BUY_HASH);
    });

    it('skips the transit approve on a free route but still approves the sale', async () => {
        const h = makeTrade({
            response: {
                status: 200,
                data: lotView({ id: '7', pricePerUnit: parseEther('0.5').toString(), remaining: '100' }),
            },
            quote: { totalFee: 0n, totalDistance: 2n, arrivalAt: 1704n },
            approve: APPROVE_HASH,
            confirmLogs: [
                boughtLog({ lotId: 7n, value: 10n, remaining: 90n, sale: parseEther('5') }),
                scheduledLog(123n, 1704n),
            ],
        });

        const result = await h.service.buyLot({
            lotId: '7',
            chain: [
                { x: 1, y: 0 },
                { x: 2, y: 0 },
            ],
            value: '10',
        });

        expect(h.allowance.calls).toEqual([{ token: CPU_TOKEN, spender: TRADE, needed: parseEther('5') }]);
        expect(result.approveTransitTxHash).toBeNull();
        expect(result.approveSaleTxHash).toBe(APPROVE_HASH);
    });
});

describe('TradeService.cancelLot', () => {
    it('reads the lot remaining, routes it home, and decodes the cancel', async () => {
        const h = makeTrade({
            response: { status: 200, data: lotView({ id: '7', remaining: '100' }) },
            quote: { totalFee: 0n, totalDistance: 2n, arrivalAt: 1704n },
            confirmLogs: [cancelledLog({ lotId: 7n, returned: 100n }), scheduledLog(123n, 1704n)],
        });

        const result = await h.service.cancelLot({
            lotId: '7',
            chain: [
                { x: 6, y: 6 },
                { x: 0, y: 0 },
            ],
        });

        expect(h.allowance.calls).toHaveLength(0);
        expect(h.tradeClient.cancels[0]).toMatchObject({ trade: TRADE, lotId: 7n, maxFee: 0n });
        expect(h.transportClient.quotes[0]?.amount).toBe(100n);
        expect(result.returned).toBe('100');
        expect(result.fee).toBe('0');
        expect(result.deliveryId).toBe('123');
        expect(result.approveTxHash).toBeNull();
        expect(result.txHash).toBe(CANCEL_HASH);
    });
});

describe('TradeService.quoteBuy', () => {
    it('includes the transit fee for a routed preview and sends no transaction', async () => {
        const h = makeTrade({
            response: {
                status: 200,
                data: lotView({ id: '7', pricePerUnit: parseEther('0.5').toString(), remaining: '100' }),
            },
            quote: { totalFee: 1_000n, totalDistance: 4n, arrivalAt: 1704n },
        });

        const result = await h.service.quoteBuy({
            lotId: '7',
            value: '10',
            chain: [
                { x: 5, y: 5 },
                { x: 6, y: 6 },
            ],
        });

        expect(h.transportClient.quotes).toHaveLength(1);
        expect(result.routed).toBe(true);
        expect(result.sale).toBe('5');
        expect(result.transitFee).toBe(formatEther(1_000n));
        expect(result.total).toBe(formatEther(parseEther('5') + 1_000n));
        expect(result.totalDistance).toBe(4);
        expect(result.arrivalAt).toBe(1704);
        expect(h.tradeClient.buys).toHaveLength(0);
    });

    it('gives a seller-only estimate with no route and no on-chain quote', async () => {
        const h = makeTrade({
            response: {
                status: 200,
                data: lotView({ id: '7', pricePerUnit: parseEther('0.5').toString(), remaining: '100' }),
            },
        });

        const result = await h.service.quoteBuy({ lotId: '7', value: '10', chain: null });

        expect(h.transportClient.quotes).toHaveLength(0);
        expect(result.routed).toBe(false);
        expect(result.transitFee).toBeNull();
        expect(result.total).toBe('5');
        expect(result.totalDistance).toBeNull();
        expect(result.arrivalAt).toBeNull();
    });

    it('reads the API price as wei — 20 units @ 2 $CPU quotes 4e19 wei, not 4e37', async () => {
        const h = makeTrade({
            response: {
                status: 200,
                data: lotView({ id: '7', pricePerUnit: parseEther('2').toString(), remaining: '100' }),
            },
        });

        const result = await h.service.quoteBuy({ lotId: '7', value: '20', chain: null });

        expect(result.pricePerUnit).toBe('2');
        expect(result.sale).toBe('40');
        expect(result.total).toBe('40');
    });
});

describe('TradeService reads', () => {
    it('listMyLots hits the authenticated mine endpoint', async () => {
        const h = makeTrade({ response: { status: 200, data: [lotView({ id: '1' })] } });

        const result = await h.service.listMyLots(null);

        expect(h.api.calls[0]?.path).toBe('/api/v1/trade/lots/mine');
        expect(h.api.calls[0]?.authenticated).toBe(true);
        expect(result[0]?.id).toBe('1');
    });

    it('listLots hits the public lots endpoint', async () => {
        const h = makeTrade({ response: { status: 200, data: [lotView()] } });

        const result = await h.service.listLots({
            hub: null,
            resourceId: null,
            seller: null,
            minPrice: null,
            maxPrice: null,
            availability: null,
            sort: null,
            limit: null,
            offset: null,
            aroundTokenId: null,
            centerX: null,
            centerY: null,
            radius: null,
        });

        expect(h.api.calls[0]?.path.startsWith('/api/v1/trade/lots')).toBe(true);
        expect(h.api.calls[0]?.authenticated).toBe(false);
        expect(result).toHaveLength(1);
    });
});
