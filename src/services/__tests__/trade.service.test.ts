import { decodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';

import {
    type FreeLotResponse,
    LotAvailability,
    LotResponseKind,
    LotSort,
    LotState,
    type PaidLotSignatureResponse,
} from '../../api/types.js';
import { GAME_SETTLEMENT_ABI } from '../../contracts/game-settlement.abi.js';
import { TxStatus } from '../../wallet/types.js';
import { TradeService } from '../trade.service.js';
import { LotAction, LotResultKind } from '../types.js';
import {
    APPROVE_HASH,
    CPU_TOKEN,
    GAME_SETTLEMENT,
    type Harness,
    type HarnessOptions,
    makeHarness,
    R,
    S,
    WALLET_ADDRESS,
} from './service-fakes.js';

const HUB = '0x4444444444444444444444444444444444444444';

const CHAIN = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
];

const CREATE_INPUT = { chain: CHAIN, resourceId: 3, value: '100', pricePerUnit: '0.5' };

function makeFreeLot(overrides: Partial<FreeLotResponse> = {}): FreeLotResponse {
    return { kind: LotResponseKind.Free, lotId: 'lot-1', state: LotState.Delivering, arrivalAt: 1704, ...overrides };
}

function makePaidLot(overrides: Partial<PaidLotSignatureResponse> = {}): PaidLotSignatureResponse {
    return {
        kind: LotResponseKind.Paid,
        lotId: 'lot-1',
        signId: 9,
        state: LotState.Open,
        sender: WALLET_ADDRESS,
        tokenId: '20',
        totalAmount: '1000',
        burnAmount: '100',
        recipients: [HUB],
        payouts: ['900'],
        deadline: '9999999999',
        v: 27,
        r: R,
        s: S,
        ...overrides,
    };
}

function makeService(opts: HarnessOptions): Harness<TradeService> {
    return makeHarness((deps) => new TradeService(deps), opts);
}

describe('TradeService.createLot', () => {
    it('returns a free lot without touching the wallet or $CPU', async () => {
        const { service, api, wallet, allowance } = makeService({ response: { status: 200, data: makeFreeLot() } });

        const result = await service.createLot(CREATE_INPUT);

        expect(api.calls[0]?.path).toBe('/api/v1/trade/lots');
        expect(api.calls[0]?.method).toBe('POST');
        expect(api.calls[0]?.authenticated).toBe(true);
        expect(api.calls[0]?.body).toEqual({ ...CREATE_INPUT, network: 'ethereum' });
        expect(result.kind).toBe(LotResultKind.Free);
        expect(result.action).toBe(LotAction.Create);
        expect(result.lotId).toBe('lot-1');
        expect(wallet.sent).toHaveLength(0);
        expect(allowance.calls).toHaveLength(0);
    });

    it('settles a paid create via the transport function', async () => {
        const { service, wallet, allowance } = makeService({
            response: { status: 200, data: makePaidLot() },
            approve: APPROVE_HASH,
        });

        const result = await service.createLot(CREATE_INPUT);

        expect(allowance.calls).toEqual([{ token: CPU_TOKEN, spender: GAME_SETTLEMENT, needed: 1000n }]);
        const sent = wallet.sent[0];
        if (sent === undefined) {
            throw new Error('expected one tx');
        }
        expect(sent.to).toBe(GAME_SETTLEMENT);
        const decoded = decodeFunctionData({ abi: GAME_SETTLEMENT_ABI, data: sent.data });
        expect(decoded.functionName).toBe('transport');
        expect(decoded.args).toEqual([9n, 20n, 1000n, 100n, [HUB], [900n], 9999999999n, 27, R, S]);

        if (result.kind !== LotResultKind.Paid) {
            throw new Error('expected a paid result');
        }
        expect(result.action).toBe(LotAction.Create);
        expect(result.approveTxHash).toBe(APPROVE_HASH);
        expect(result.totalAmount).toBe('1000');
    });

    it('refuses when the signature sender does not match the wallet — no tx', async () => {
        const { service, wallet, allowance } = makeService({
            response: { status: 200, data: makePaidLot({ sender: '0x9999999999999999999999999999999999999999' }) },
        });
        await expect(service.createLot(CREATE_INPUT)).rejects.toThrow(/issued for/i);
        expect(wallet.sent).toHaveLength(0);
        expect(allowance.calls).toHaveLength(0);
    });

    it('wraps a failed on-chain payment with the wait-then-retry hint', async () => {
        const { service } = makeService({
            response: { status: 200, data: makePaidLot() },
            receipts: [TxStatus.Reverted],
        });
        await expect(service.createLot(CREATE_INPUT)).rejects.toThrow(/reconciled automatically/i);
    });

    it('surfaces a 409 conflict and sends no tx', async () => {
        const { service, wallet } = makeService({
            response: { status: 409, data: { message: 'LotCreatePendingExists' } },
        });
        await expect(service.createLot(CREATE_INPUT)).rejects.toThrow(/LotCreatePendingExists/);
        expect(wallet.sent).toHaveLength(0);
    });

    it('refuses on a chain mismatch before calling the API', async () => {
        const { service, api, wallet } = makeService({
            response: { status: 200, data: makeFreeLot() },
            walletChainId: 8453,
        });
        await expect(service.createLot(CREATE_INPUT)).rejects.toThrow(/chain mismatch/i);
        expect(api.calls).toHaveLength(0);
        expect(wallet.sent).toHaveLength(0);
    });
});

describe('TradeService.buyLot', () => {
    it('settles via tradeBuy at the buyer destination token', async () => {
        const { service, api, wallet } = makeService({ response: { status: 200, data: makePaidLot() } });

        const result = await service.buyLot({ lotId: 'lot-1', chain: CHAIN, value: '100' });

        expect(api.calls[0]?.path).toBe('/api/v1/trade/lots/lot-1/buy');
        expect(api.calls[0]?.body).toEqual({ chain: CHAIN, value: '100', network: 'ethereum' });
        const sent = wallet.sent[0];
        if (sent === undefined) {
            throw new Error('expected one tx');
        }
        const decoded = decodeFunctionData({ abi: GAME_SETTLEMENT_ABI, data: sent.data });
        expect(decoded.functionName).toBe('tradeBuy');
        expect(decoded.args?.[1]).toBe(20n);
        if (result.kind !== LotResultKind.Paid) {
            throw new Error('expected a paid result');
        }
        expect(result.action).toBe(LotAction.Buy);
    });
});

describe('TradeService.cancelLot', () => {
    it('settles via tradeCancel for an open lot', async () => {
        const { service, api, wallet } = makeService({ response: { status: 200, data: makePaidLot() } });

        const result = await service.cancelLot({ lotId: 'lot-1', chain: CHAIN });

        expect(api.calls[0]?.path).toBe('/api/v1/trade/lots/lot-1/cancel');
        expect(api.calls[0]?.body).toEqual({ chain: CHAIN, network: 'ethereum' });
        const sent = wallet.sent[0];
        if (sent === undefined) {
            throw new Error('expected one tx');
        }
        expect(decodeFunctionData({ abi: GAME_SETTLEMENT_ABI, data: sent.data }).functionName).toBe('tradeCancel');
        expect(result.action).toBe(LotAction.Cancel);
    });

    it('handles a free draft cancel with a null chain and no tx', async () => {
        const { service, api, wallet } = makeService({
            response: { status: 200, data: makeFreeLot({ state: LotState.Reverted }) },
        });

        const result = await service.cancelLot({ lotId: 'lot-1', chain: null });

        expect(api.calls[0]?.body).toEqual({ chain: null, network: 'ethereum' });
        expect(result.kind).toBe(LotResultKind.Free);
        expect(wallet.sent).toHaveLength(0);
    });
});

describe('TradeService reads', () => {
    it('listLots builds the filter query and reads the public endpoint', async () => {
        const { service, api } = makeService({ response: { status: 200, data: [] } });

        await service.listLots({
            hub: 5,
            resourceId: 3,
            seller: null,
            minPrice: null,
            maxPrice: null,
            availability: LotAvailability.Open,
            sort: LotSort.PriceAsc,
            limit: 50,
            offset: null,
            aroundTokenId: null,
            centerX: null,
            centerY: null,
            radius: null,
        });

        expect(api.calls[0]?.path).toBe(
            '/api/v1/trade/lots?hub=5&resourceId=3&availability=open&sort=price_asc&limit=50',
        );
        expect(api.calls[0]?.authenticated).toBe(false);
    });

    it('getMarkets passes the zone params', async () => {
        const { service, api } = makeService({ response: { status: 200, data: [] } });

        await service.getMarkets({
            hub: null,
            resourceId: null,
            aroundTokenId: 7,
            centerX: null,
            centerY: null,
            radius: 3,
        });

        expect(api.calls[0]?.path).toBe('/api/v1/trade/markets?aroundTokenId=7&radius=3');
        expect(api.calls[0]?.authenticated).toBe(false);
    });

    it('getLot reads the public single-lot endpoint', async () => {
        const { service, api } = makeService({ response: { status: 200, data: {} } });
        await service.getLot('lot-1');
        expect(api.calls[0]?.path).toBe('/api/v1/trade/lots/lot-1');
        expect(api.calls[0]?.authenticated).toBe(false);
    });

    it('listMyLots filters by state on the authenticated endpoint', async () => {
        const { service, api } = makeService({ response: { status: 200, data: [] } });
        await service.listMyLots(LotState.Open);
        expect(api.calls[0]?.path).toBe('/api/v1/trade/lots/mine?state=open');
        expect(api.calls[0]?.authenticated).toBe(true);
    });

    it('quoteBuy serialises the chain and authenticates', async () => {
        const { service, api } = makeService({ response: { status: 200, data: {} } });
        await service.quoteBuy({ lotId: 'lot-1', value: '100', chain: CHAIN });
        expect(api.calls[0]?.path).toBe('/api/v1/trade/lots/lot-1/quote?value=100&chain=0%2C0%3B1%2C0');
        expect(api.calls[0]?.authenticated).toBe(true);
    });

    it('quoteBuy omits the chain for a seller-only estimate', async () => {
        const { service, api } = makeService({ response: { status: 200, data: {} } });
        await service.quoteBuy({ lotId: 'lot-1', value: '100', chain: null });
        expect(api.calls[0]?.path).toBe('/api/v1/trade/lots/lot-1/quote?value=100');
    });
});
