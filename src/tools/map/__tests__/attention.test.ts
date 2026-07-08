import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

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
                x: 0,
                y: 0,
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
            },
            {
                tokenId: '2',
                x: 1,
                y: 0,
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

interface HarnessOpts {
    walletReady: boolean | null;
    deliveries: (() => Promise<Array<DeliveryView>>) | null;
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
        readRevealCell: () => ({ x: 4, y: 4 }),
    };
    const wallet = { isReady: () => walletReady, get: () => ({ getAddress: () => '0xMe' }) };
    const appConfig = {
        load: async () => ({ resources: { 3: 'Silica', 101: 'Power' }, recipes: [], buildings: [] }),
    };
    const transport = {
        listReadyToFinalizeForOwner: opts.deliveries ?? (async () => []),
    };
    const context = { mapReader: map, wallet, appConfig, transport, logger: new NoopLogger() } as unknown as AppContext;

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
});
