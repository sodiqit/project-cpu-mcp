import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import { NoopLogger } from '../../../logger/noop.logger.js';
import type { DemolishResult } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { TxStatus } from '../../../wallet/types.js';
import { registerDemolishTool } from '../demolish.js';

interface ToolResult {
    content: Array<{ type: string; text: string }>;
}

type Handler = (args: { tokenId: string }) => Promise<ToolResult>;

function harness(outcome: DemolishResult | Error): Handler {
    const build = {
        demolish: async (): Promise<DemolishResult> => {
            if (outcome instanceof Error) {
                throw outcome;
            }
            return outcome;
        },
    };
    const context = { build, logger: new NoopLogger() } as unknown as AppContext;

    let captured: Handler | null = null;
    const server = {
        registerTool(_name: string, _def: unknown, handler: Handler): void {
            captured = handler;
        },
    } as unknown as McpServer;

    registerDemolishTool(server, context);
    if (captured === null) {
        throw new Error('demolish was not registered');
    }
    return captured;
}

describe('demolish tool', () => {
    it('reports the confirmed demolish', async () => {
        const result = await harness({
            tokenId: '42',
            txHash: `0x${'d'.repeat(64)}`,
            status: TxStatus.Success,
            blockNumber: '100',
        })({ tokenId: '42' });

        const header = result.content[0]?.text ?? '';
        expect(header).toMatch(/Demolished the building on cell 42/);
        expect(header).toMatch(/block 100/);
    });

    it('propagates service errors', async () => {
        await expect(harness(new Error('CellBusy'))({ tokenId: '42' })).rejects.toThrow(/CellBusy/);
    });
});
