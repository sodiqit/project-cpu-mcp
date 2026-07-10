import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import { NoopLogger } from '../../../logger/noop.logger.js';
import type { RevealResult } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { TxStatus } from '../../../wallet/types.js';
import { registerRevealTool } from '../reveal.js';

interface ToolResult {
    content: Array<{ type: string; text: string }>;
}

type Handler = (args: { tokenId: string }) => Promise<ToolResult>;

function harness(outcome: RevealResult | Error): Handler {
    const reveal = {
        reveal: async (): Promise<RevealResult> => {
            if (outcome instanceof Error) {
                throw outcome;
            }
            return outcome;
        },
    };
    const context = { reveal, logger: new NoopLogger() } as unknown as AppContext;

    let captured: Handler | null = null;
    const server = {
        registerTool(_name: string, _def: unknown, handler: Handler): void {
            captured = handler;
        },
    } as unknown as McpServer;

    registerRevealTool(server, context);
    if (captured === null) {
        throw new Error('reveal was not registered');
    }
    return captured;
}

const fulfilledGenesis: RevealResult = {
    tokenId: '42',
    genesis: true,
    txHash: '0xreveal',
    status: TxStatus.Success,
    blockNumber: '100',
    fee: '0.0001',
    reRevealCost: '0',
    approveTxHash: null,
    fulfilled: true,
};

describe('reveal tool', () => {
    it('reports a fulfilled genesis reveal without an approve line', async () => {
        const result = await harness(fulfilledGenesis)({ tokenId: '42' });
        expect(result.content[0]?.text).toMatch(/0xreveal/);
        expect(result.content[0]?.text).toMatch(/first reveal \(free\)/);
        expect(result.content[0]?.text).toMatch(/revealed/i);
        expect(result.content[0]?.text).not.toMatch(/approve/i);
        const parsed = JSON.parse(result.content[1]?.text ?? '{}') as RevealResult;
        expect(parsed.txHash).toBe('0xreveal');
        expect(parsed.approveTxHash).toBeNull();
    });

    it('reports the approve tx and re-reveal cost for a paid re-reveal', async () => {
        const result = await harness({
            ...fulfilledGenesis,
            genesis: false,
            approveTxHash: '0xapprove',
            reRevealCost: '1',
        })({ tokenId: '42' });
        expect(result.content[0]?.text).toMatch(/approve tx 0xapprove/);
        expect(result.content[0]?.text).toMatch(/re-reveal/);
        expect(result.content[0]?.text).toMatch(/1 \$CPU/);
    });

    it('tells the agent to poll get_cell when the reveal is still pending', async () => {
        const result = await harness({ ...fulfilledGenesis, fulfilled: false })({ tokenId: '42' });
        expect(result.content[0]?.text).toMatch(/poll get_cell/);
        expect(result.content[0]?.text).toMatch(/not ready yet/i);
    });

    it('propagates service errors', async () => {
        await expect(harness(new Error('not authenticated'))({ tokenId: '42' })).rejects.toThrow(/not authenticated/);
    });
});
