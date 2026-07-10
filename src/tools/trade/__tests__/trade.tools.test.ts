import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import { type LotView, type MarketResourceSummary, LotState } from '../../../api/types.js';
import { Network } from '../../../config/types.js';
import { NoopLogger } from '../../../logger/noop.logger.js';
import type {
    BalanceResult,
    BuyLotResult,
    CancelLotResult,
    CreateLotResult,
    TradeQuote,
} from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { TxStatus } from '../../../wallet/types.js';
import { registerGetBalanceTool } from '../../account/get-balance/get-balance.js';
import { registerBuyLotTool } from '../buy-lot/buy-lot.js';
import { registerCancelLotTool } from '../cancel-lot/cancel-lot.js';
import { registerCreateLotTool } from '../create-lot/create-lot.js';
import { registerGetLotTool } from '../get-lot/get-lot.js';
import { registerListLotsTool } from '../list-lots/list-lots.js';
import { registerListMyLotsTool } from '../list-mine/list-my-lots.js';
import { registerGetMarketsTool } from '../markets/get-markets.js';
import { registerQuoteBuyTool } from '../quote-buy/quote-buy.js';

interface ToolResult {
    content: Array<{ type: string; text: string }>;
}

type Register = (server: McpServer, context: AppContext) => void;

const RESOURCES = { 3: 'Silica' };

function capture(register: Register, contextPartial: Record<string, unknown>): (args: never) => Promise<ToolResult> {
    const appConfig = { load: async () => ({ resources: RESOURCES }) };
    const context = { appConfig, logger: new NoopLogger(), ...contextPartial } as unknown as AppContext;
    let captured: ((args: never) => Promise<ToolResult>) | null = null;
    const server = {
        registerTool(_name: string, _def: unknown, handler: (args: never) => Promise<ToolResult>): void {
            captured = handler;
        },
    } as unknown as McpServer;
    register(server, context);
    if (captured === null) {
        throw new Error('tool was not registered');
    }
    return captured;
}

const createResult: CreateLotResult = {
    lotId: '7',
    hubTokenId: '20',
    resourceId: 3,
    value: '100',
    pricePerUnit: '0.5',
    deliveryId: '123',
    arrivalAt: 1704,
    fee: '0',
    txHash: '0xcreate',
    approveTxHash: null,
    status: TxStatus.Success,
    blockNumber: '100',
};

const cancelResult: CancelLotResult = {
    lotId: '7',
    resourceId: 3,
    returned: '80',
    fee: '0',
    deliveryId: '123',
    arrivalAt: 1704,
    txHash: '0xcancel',
    approveTxHash: null,
    status: TxStatus.Success,
    blockNumber: '100',
};

const buyResult: BuyLotResult = {
    lotId: '7',
    resourceId: 3,
    value: '10',
    sale: '5',
    remaining: '90',
    fee: '0',
    deliveryId: '123',
    arrivalAt: 1704,
    txHash: '0xbuy',
    approveSaleTxHash: '0xapprove',
    approveTransitTxHash: null,
    status: TxStatus.Success,
    blockNumber: '100',
};

const lot: LotView = {
    id: 'lot-1',
    hubTokenId: '5',
    sellerAddress: '0xseller',
    resourceId: 3,
    listed: '100',
    remaining: '80',
    pricePerUnit: '0.5',
    tradeFeePct: 0,
    state: LotState.Open,
    distanceFromAnchor: 3,
    createdAt: 1700,
    updated: 1700,
};

const market: MarketResourceSummary = {
    hubTokenId: '5',
    resourceId: 3,
    openLots: 2,
    openRemaining: '150',
    minPricePerUnit: '0.4',
    tradeFeePct: 0,
    incomingLots: 1,
    incomingRemaining: '50',
    distanceFromAnchor: 3,
};

describe('create_lot / cancel_lot tools', () => {
    it('summarizes a create with the lot, delivery and finalize hint', async () => {
        const handler = capture(registerCreateLotTool, { trade: { createLot: async () => createResult } });
        const result = await handler({ chain: [], resourceId: 3, value: '100', pricePerUnit: '0.5' } as never);
        expect(result.content[0]?.text).toMatch(/Listed lot 7/);
        expect(result.content[0]?.text).toMatch(/Silica \(#3\)/);
        expect(result.content[0]?.text).toMatch(/finalize_delivery on 123/);
        expect(result.content[0]?.text).toMatch(/create tx 0xcreate/);
    });

    it('summarizes a cancel with the returned units and finalize hint', async () => {
        const handler = capture(registerCancelLotTool, { trade: { cancelLot: async () => cancelResult } });
        const result = await handler({ lotId: '7', chain: [] } as never);
        expect(result.content[0]?.text).toMatch(/Cancelled lot 7/);
        expect(result.content[0]?.text).toMatch(/finalize_delivery on 123/);
        expect(result.content[0]?.text).toMatch(/cancel tx 0xcancel/);
    });
});

describe('buy_lot tool', () => {
    it('reports a buy with the sale approve and buy tx', async () => {
        const handler = capture(registerBuyLotTool, { trade: { buyLot: async () => buyResult } });
        const result = await handler({ lotId: '7', chain: [], value: '10' } as never);
        expect(result.content[0]?.text).toMatch(/Bought 10 Silica/);
        expect(result.content[0]?.text).toMatch(/for 5 \$CPU/);
        expect(result.content[0]?.text).toMatch(/sale approve 0xapprove/);
        expect(result.content[0]?.text).toMatch(/buy tx 0xbuy/);
    });

    it('propagates service errors', async () => {
        const handler = capture(registerBuyLotTool, {
            trade: {
                buyLot: async () => {
                    throw new Error('LotNotOpen');
                },
            },
        });
        await expect(handler({ lotId: '7', chain: [], value: '10' } as never)).rejects.toThrow(/LotNotOpen/);
    });
});

describe('quote_buy tool', () => {
    it('summarizes a routed buy quote', async () => {
        const quote: TradeQuote = {
            lotId: '7',
            resourceId: 3,
            pricePerUnit: '0.5',
            value: '100',
            remaining: '80',
            routed: true,
            sale: '50',
            transitFee: '5',
            total: '55',
            totalDistance: 4,
            arrivalAt: 1704,
        };
        const handler = capture(registerQuoteBuyTool, { trade: { quoteBuy: async () => quote } });
        const result = await handler({ lotId: '7', value: '100', chain: [] } as never);
        expect(result.content[0]?.text).toMatch(/Buy quote for lot 7/);
        expect(result.content[0]?.text).toMatch(/Silica \(#3\)/);
        expect(result.content[0]?.text).toMatch(/55 \$CPU total/);
    });

    it('summarizes a seller-only estimate', async () => {
        const quote: TradeQuote = {
            lotId: '7',
            resourceId: 3,
            pricePerUnit: '0.5',
            value: '100',
            remaining: '80',
            routed: false,
            sale: '50',
            transitFee: null,
            total: '50',
            totalDistance: null,
            arrivalAt: null,
        };
        const handler = capture(registerQuoteBuyTool, { trade: { quoteBuy: async () => quote } });
        const result = await handler({ lotId: '7', value: '100', chain: null } as never);
        expect(result.content[0]?.text).toMatch(/Seller-only estimate for lot 7/);
        expect(result.content[0]?.text).toMatch(/50 \$CPU/);
    });
});

describe('discovery read tools', () => {
    it('list_lots renders a lot line', async () => {
        const handler = capture(registerListLotsTool, { trade: { listLots: async () => [lot] } });
        const result = await handler({} as never);
        expect(result.content[0]?.text).toMatch(/1 lot/);
        expect(result.content[0]?.text).toMatch(/lot lot-1 \[open\]/);
        expect(result.content[0]?.text).toMatch(/Silica \(#3\)/);
        expect(result.content[0]?.text).toMatch(/80\/100/);
    });

    it('get_markets renders a scout row', async () => {
        const handler = capture(registerGetMarketsTool, { trade: { getMarkets: async () => [market] } });
        const result = await handler({} as never);
        expect(result.content[0]?.text).toMatch(/Hub 5 · /);
        expect(result.content[0]?.text).toMatch(/2 open/);
        expect(result.content[0]?.text).toMatch(/from 0.4 \$CPU/);
    });

    it('get_lot renders a single lot', async () => {
        const handler = capture(registerGetLotTool, { trade: { getLot: async () => lot } });
        const result = await handler({ lotId: 'lot-1' } as never);
        expect(result.content[0]?.text).toMatch(/lot lot-1 \[open\]/);
    });

    it('list_my_lots shows the count and state filter', async () => {
        const handler = capture(registerListMyLotsTool, { trade: { listMyLots: async () => [lot] } });
        const result = await handler({ state: LotState.Open } as never);
        expect(result.content[0]?.text).toMatch(/1 lot\(s\) · state=open/);
    });
});

describe('get_balance tool', () => {
    it('reports $CPU and gas', async () => {
        const balance: BalanceResult = {
            address: '0xdead',
            network: Network.ETHEREUM,
            chainId: 1,
            cpu: '12.5',
            native: '0.3',
        };
        const handler = capture(registerGetBalanceTool, { balance: { getBalances: async () => balance } });
        const result = await handler({} as never);
        expect(result.content[0]?.text).toMatch(/Wallet 0xdead/);
        expect(result.content[0]?.text).toMatch(/12.5 \$CPU/);
        expect(result.content[0]?.text).toMatch(/0.3 gas/);
    });
});
