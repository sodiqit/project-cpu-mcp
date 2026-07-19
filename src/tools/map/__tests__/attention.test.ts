import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';

import { LotState, type LotView } from '../../../api/types.js';
import { NoopLogger } from '../../../logger/noop.logger.js';
import { AttentionReason, type AttentionReport, AttentionSeverity } from '../../../map/types.js';
import type { DeliveryView } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { registerGetAttentionTool } from '../attention/attention.js';

interface ToolResult {
    content: Array<{ type: string; text: string }>;
}

type Handler = (args: unknown) => Promise<ToolResult>;

function mapReport(): AttentionReport {
    return {
        ownerKnown: true,
        version: 5,
        serverTime: 1,
        counts: { critical: 1, warning: 0, info: 1 },
        items: [
            {
                tokenId: '1',
                severity: AttentionSeverity.Critical,
                reason: AttentionReason.StalledMining,
                resourceId: 3,
                used: '50',
                cap: '50',
                fillPct: 100,
                breakdown: { liquid: '50', incomingTransport: '0', lots: '0' },
                depositRemaining: null,
                deliveryId: null,
                arrivalAt: null,
                lotId: null,
                message: null,
            },
            {
                tokenId: '2',
                severity: AttentionSeverity.Info,
                reason: AttentionReason.Unbuilt,
                resourceId: null,
                used: null,
                cap: null,
                fillPct: null,
                breakdown: null,
                depositRemaining: null,
                deliveryId: null,
                arrivalAt: null,
                lotId: null,
                message: null,
            },
        ],
        note: null,
    };
}

const READY_DELIVERY: DeliveryView = {
    deliveryId: '77',
    payer: '0xMe',
    sourceTokenId: '9',
    targetTokenId: '3',
    resourceId: 101,
    amount: '100',
    arrivalAt: 1,
    delivered: false,
    readyToFinalize: true,
};

function makeLot(overrides: Partial<LotView> = {}): LotView {
    return {
        id: '500',
        hubTokenId: '42',
        sellerAddress: '0xMe',
        resourceId: 3,
        listed: '100',
        remaining: '100',
        pricePerUnit: '1',
        saleFeePercent: 5,
        maxSaleFeePercent: 10,
        frozen: false,
        state: LotState.Open,
        distanceFromAnchor: null,
        createdAt: 1,
        updated: 1,
        ...overrides,
    };
}

interface HarnessOpts {
    walletReady: boolean | null;
    deliveries: (() => Promise<Array<DeliveryView>>) | null;
    lots: (() => Promise<Array<LotView>>) | null;
}

function harness(opts: Partial<HarnessOpts> = {}): Handler {
    const walletReady = opts.walletReady ?? true;
    const map = {
        attention: (owner: string | null): AttentionReport =>
            owner === null
                ? {
                      ownerKnown: false,
                      version: 5,
                      serverTime: 1,
                      counts: { critical: 0, warning: 0, info: 0 },
                      items: [],
                      note: null,
                  }
                : mapReport(),
    };
    const wallet = { isReady: () => walletReady, get: () => ({ getAddress: () => '0xMe' }) };
    const appConfig = {
        load: async () => ({ resources: { 3: 'Silica', 101: 'Power' }, recipes: [], buildings: [] }),
    };
    const transport = {
        listReadyToFinalizeForOwner: opts.deliveries ?? (async () => []),
    };
    const trade = {
        listMyLots: opts.lots ?? (async () => []),
    };
    const context = {
        mapReader: map,
        wallet,
        appConfig,
        transport,
        trade,
        logger: new NoopLogger(),
    } as unknown as AppContext;

    let captured: Handler | null = null;
    const server = {
        registerTool(_name: string, _def: unknown, handler: Handler): void {
            captured = handler;
        },
    } as unknown as McpServer;
    registerGetAttentionTool(server, context);
    if (captured === null) {
        throw new Error('get_attention was not registered');
    }
    return captured;
}

describe('get_attention tool', () => {
    it('merges ready deliveries and decorates resource names', async () => {
        const handler = harness({ deliveries: async () => [READY_DELIVERY] });
        const result = await handler({ minSeverity: null });

        const header = result.content[0]?.text ?? '';
        expect(header).toMatch(/1 critical · 1 warning · 1 info/);

        const payload = JSON.parse(result.content[1]?.text ?? '{}');
        const delivery = payload.items.find((i: { reason: string }) => i.reason === AttentionReason.DeliveryReady);
        expect(delivery.deliveryId).toBe('77');
        expect(delivery.arrivalAt).toBe(1);
        const stalled = payload.items.find((i: { reason: string }) => i.reason === AttentionReason.StalledMining);
        expect(stalled.resourceName).toBe('Silica');
    });

    it('reports no owner-scoped items when the wallet is not ready', async () => {
        const handler = harness({ walletReady: false });
        const result = await handler({ minSeverity: null, owner: null });
        expect(result.content[0]?.text).toMatch(/authenticate/);
        const payload = JSON.parse(result.content[1]?.text ?? '{}');
        expect(payload.ownerKnown).toBe(false);
    });

    it('scouts another owner, surfacing their cells and inbound deliveries as intel', async () => {
        const handler = harness({ deliveries: async () => [READY_DELIVERY] });
        const result = await handler({ minSeverity: null, owner: '0xNeighbor' });
        expect(result.content[0]?.text).toMatch(/Scouting 0xNeighbor/);
        const payload = JSON.parse(result.content[1]?.text ?? '{}');
        expect(payload.scouting).toBe(true);
        expect(payload.owner).toBe('0xNeighbor');
        expect(payload.items.some((i: { reason: string }) => i.reason === AttentionReason.DeliveryReady)).toBe(true);
    });

    it('filters by minSeverity', async () => {
        const handler = harness();
        const result = await handler({ minSeverity: AttentionSeverity.Critical });
        const payload = JSON.parse(result.content[1]?.text ?? '{}');
        expect(payload.items).toHaveLength(1);
        expect(payload.items[0].severity).toBe(AttentionSeverity.Critical);
    });

    it('degrades gracefully when the deliveries fetch fails', async () => {
        const handler = harness({
            deliveries: async () => {
                throw new Error('server down');
            },
        });
        const result = await handler({ minSeverity: null });
        const payload = JSON.parse(result.content[1]?.text ?? '{}');
        expect(payload.note).toMatch(/could not be loaded/i);
        // Map-derived items survive the delivery outage.
        expect(payload.items.some((i: { reason: string }) => i.reason === AttentionReason.StalledMining)).toBe(true);
    });

    it('warns about a frozen own lot, naming the live rate, tolerance and fee-free cancel', async () => {
        const handler = harness({
            lots: async () => [
                makeLot({ id: '900', hubTokenId: '77', saleFeePercent: 12, maxSaleFeePercent: 10, frozen: true }),
            ],
        });
        const result = await handler({ minSeverity: null });
        const payload = JSON.parse(result.content[1]?.text ?? '{}');
        const frozen = payload.items.find((i: { reason: string }) => i.reason === AttentionReason.LotFrozen);
        expect(frozen.severity).toBe(AttentionSeverity.Warning);
        expect(frozen.lotId).toBe('900');
        expect(frozen.tokenId).toBe('77');
        expect(frozen.message).toMatch(/12%/);
        expect(frozen.message).toMatch(/10%/);
        expect(frozen.message).toMatch(/cancel is fee-free/i);
    });

    it('flags an own lot at exactly the tolerance as at-risk info', async () => {
        const handler = harness({
            lots: async () => [makeLot({ id: '901', hubTokenId: '77', saleFeePercent: 10, maxSaleFeePercent: 10 })],
        });
        const result = await handler({ minSeverity: null });
        const payload = JSON.parse(result.content[1]?.text ?? '{}');
        const atRisk = payload.items.find((i: { reason: string }) => i.reason === AttentionReason.LotAtRisk);
        expect(atRisk.severity).toBe(AttentionSeverity.Info);
        expect(atRisk.lotId).toBe('901');
        expect(atRisk.tokenId).toBe('77');
    });

    it('leaves a healthy own lot (rate below tolerance) off the list', async () => {
        const handler = harness({
            lots: async () => [makeLot({ saleFeePercent: 5, maxSaleFeePercent: 10 })],
        });
        const result = await handler({ minSeverity: null });
        const payload = JSON.parse(result.content[1]?.text ?? '{}');
        expect(payload.items.some((i: { reason: string }) => i.reason === AttentionReason.LotFrozen)).toBe(false);
        expect(payload.items.some((i: { reason: string }) => i.reason === AttentionReason.LotAtRisk)).toBe(false);
    });

    it('never flags lots in delivering, sold or cancelled states', async () => {
        const handler = harness({
            lots: async () => [
                makeLot({
                    id: '1',
                    state: LotState.Delivering,
                    saleFeePercent: 20,
                    maxSaleFeePercent: 10,
                    frozen: true,
                }),
                makeLot({ id: '2', state: LotState.Sold, saleFeePercent: 10, maxSaleFeePercent: 10 }),
                makeLot({
                    id: '3',
                    state: LotState.Cancelled,
                    saleFeePercent: 20,
                    maxSaleFeePercent: 10,
                    frozen: true,
                }),
            ],
        });
        const result = await handler({ minSeverity: null });
        const payload = JSON.parse(result.content[1]?.text ?? '{}');
        expect(payload.items.some((i: { reason: string }) => i.reason === AttentionReason.LotFrozen)).toBe(false);
        expect(payload.items.some((i: { reason: string }) => i.reason === AttentionReason.LotAtRisk)).toBe(false);
    });

    it('does not fold the caller lots into a scouted owner report', async () => {
        const lots = vi.fn(async () => [makeLot({ frozen: true, saleFeePercent: 20, maxSaleFeePercent: 10 })]);
        const handler = harness({ lots });
        const result = await handler({ minSeverity: null, owner: '0xNeighbor' });
        const payload = JSON.parse(result.content[1]?.text ?? '{}');
        expect(payload.items.some((i: { reason: string }) => i.reason === AttentionReason.LotFrozen)).toBe(false);
        expect(lots).not.toHaveBeenCalled();
    });

    it('degrades gracefully when the lots fetch fails', async () => {
        const handler = harness({
            lots: async () => {
                throw new Error('server down');
            },
        });
        const result = await handler({ minSeverity: null });
        const payload = JSON.parse(result.content[1]?.text ?? '{}');
        expect(payload.note).toMatch(/lots could not be loaded/i);
        expect(payload.items.some((i: { reason: string }) => i.reason === AttentionReason.StalledMining)).toBe(true);
    });
});
