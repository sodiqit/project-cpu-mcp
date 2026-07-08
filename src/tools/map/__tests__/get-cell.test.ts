import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import { BuildingType } from '../../../api/types.js';
import { NoopLogger } from '../../../logger/noop.logger.js';
import { type CellInspection, CellProcessKind, NeighborRelation } from '../../../map/types.js';
import type { AppContext } from '../../../types.js';
import { registerGetCellTool } from '../get-cell/get-cell.js';

interface ToolResult {
    content: Array<{ type: string; text: string }>;
}

type Handler = (args: unknown) => Promise<ToolResult>;

function harness(inspection: CellInspection | null): Handler {
    const map = {
        inspectCell: (): CellInspection | null => inspection,
    };
    const wallet = { isReady: () => true, get: () => ({ getAddress: () => '0xMe' }) };
    const appConfig = {
        load: async (): Promise<{ resources: Record<number, string> }> => ({ resources: { 3: 'Silica' } }),
    };
    const context = { mapReader: map, wallet, appConfig, logger: new NoopLogger() } as unknown as AppContext;

    let captured: Handler | null = null;
    const server = {
        registerTool(_name: string, _def: unknown, handler: Handler): void {
            captured = handler;
        },
    } as unknown as McpServer;

    registerGetCellTool(server, context);
    if (captured === null) {
        throw new Error('get_cell was not registered');
    }
    return captured;
}

const inspection: CellInspection = {
    cell: {
        tokenId: '7',
        x: 0,
        y: 0,
        owner: '0xrival',
        revealCount: 1,
        revealPending: false,
        resources: [{ resourceId: 3, deposit: '100', balance: '0', strength: 3, storage: null }],
        building: { type: BuildingType.Mine, buildFinishAt: null },
        transitFeePerUnit: null,
        process: { kind: CellProcessKind.Mining, resource: 3, rate: 10, startAt: 1700, stalled: false },
        updated: 10,
        neighbors: [{ x: 1, y: 0, tokenId: 'mine', relation: NeighborRelation.Owned }],
    },
    neighbors: [],
    distanceFromMine: 2,
};

describe('get_cell tool', () => {
    it('returns the inspection, with resource ids labeled from config', async () => {
        const handler = harness(inspection);
        const result = await handler({ tokenId: '7' });
        const parsed = JSON.parse(result.content[1]?.text ?? '{}') as {
            cell: {
                tokenId: string;
                resources: Array<{ resourceId: number; resourceName: string }>;
                building: { type: string } | null;
                process: { kind: string; resourceName: string } | null;
            };
            distanceFromMine: number;
        };
        expect(parsed.cell.tokenId).toBe('7');
        expect(parsed.distanceFromMine).toBe(2);
        expect(parsed.cell.resources[0]?.resourceName).toBe('Silica');
        expect(parsed.cell.building?.type).toBe('mine');
        expect(parsed.cell.process?.resourceName).toBe('Silica');
    });

    it('throws when the cell is not in the map', async () => {
        const handler = harness(null);
        await expect(handler({ tokenId: 'missing' })).rejects.toThrow(/not in the current map/i);
    });
});
