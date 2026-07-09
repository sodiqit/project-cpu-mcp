import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import { BuildingType } from '../../../api/types.js';
import { NoopLogger } from '../../../logger/noop.logger.js';
import type { DemolishResult } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { TxStatus } from '../../../wallet/types.js';
import { registerDemolishTool } from '../demolish.js';

interface ToolResult {
    content: Array<{ type: string; text: string }>;
}

type Handler = (args: { tokenId: string }) => Promise<ToolResult>;

const RESOURCES = { 101: 'Concrete' };

function harness(outcome: DemolishResult | Error): Handler {
    const build = {
        demolish: async (): Promise<DemolishResult> => {
            if (outcome instanceof Error) {
                throw outcome;
            }
            return outcome;
        },
    };
    const appConfig = { load: async () => ({ resources: RESOURCES }) };
    const context = { build, appConfig, logger: new NoopLogger() } as unknown as AppContext;

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

function result(overrides: Partial<DemolishResult> = {}): DemolishResult {
    return {
        tokenId: '42',
        buildingType: BuildingType.Mine,
        cpuBurned: '2.5',
        inputsConsumed: [],
        rebuildCooldownSec: 120,
        approveTxHash: null,
        txHash: `0x${'d'.repeat(64)}`,
        status: TxStatus.Success,
        blockNumber: '100',
        ...overrides,
    };
}

describe('demolish tool', () => {
    it('reports the burned $CPU and rebuild cooldown', async () => {
        const header = (await harness(result())({ tokenId: '42' })).content[0]?.text ?? '';
        expect(header).toMatch(/Demolished the mine on cell 42/);
        expect(header).toMatch(/burned 2\.5 \$CPU/);
        expect(header).toMatch(/locked from rebuilding for ~120s/);
        expect(header).toMatch(/block 100/);
    });

    it('names the warehouse resources it consumed', async () => {
        const outcome = result({
            buildingType: BuildingType.SteelMill,
            cpuBurned: '10',
            inputsConsumed: [{ resourceId: 101, amount: 2 }],
        });
        const header = (await harness(outcome)({ tokenId: '42' })).content[0]?.text ?? '';
        expect(header).toMatch(/plus 2 Concrete from its warehouse/);
    });

    it('propagates service errors', async () => {
        await expect(harness(new Error('CellBusy'))({ tokenId: '42' })).rejects.toThrow(/CellBusy/);
    });
});
