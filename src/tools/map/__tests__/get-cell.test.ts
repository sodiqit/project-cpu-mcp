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

function harness(inspection: CellInspection | null, serverTime = 0): Handler {
    const map = {
        inspectCell: (): CellInspection | null => inspection,
        getServerTime: (): number => serverTime,
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
        pos: { face: 0, i: 0, j: 7 },
        owner: '0xrival',
        revealCount: 1,
        revealPending: false,
        resources: [{ resourceId: 3, deposit: '100', balance: '0', strength: 3, storage: null }],
        building: { type: BuildingType.Mine, buildFinishAt: null },
        demolishFinishAt: null,
        transitFeeOverrides: { 3: '0.5' },
        saleFeeOverrides: { 3: 2.5 },
        process: {
            kind: CellProcessKind.Mining,
            resource: 3,
            durationSec: 180,
            batch: 77,
            startAt: 1700,
            stalled: false,
        },
        updated: 10,
        ready: true,
        activeHub: false,
        neighbors: [{ tokenId: '8', relation: NeighborRelation.Owned }],
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
                transitFeeOverrides: Record<number, string> | null;
                saleFeeOverrides: Record<number, number> | null;
            };
            distanceFromMine: number;
        };
        expect(parsed.cell.tokenId).toBe('7');
        expect(parsed.distanceFromMine).toBe(2);
        expect(parsed.cell.resources[0]?.resourceName).toBe('Silica');
        expect(parsed.cell.building?.type).toBe('mine');
        expect(parsed.cell.process?.resourceName).toBe('Silica');
        expect(parsed.cell.transitFeeOverrides).toEqual({ 3: '0.5' });
        expect(parsed.cell.saleFeeOverrides).toEqual({ 3: 2.5 });
    });

    it('throws when the cell is not in the map', async () => {
        const handler = harness(null);
        await expect(handler({ tokenId: 'missing' })).rejects.toThrow(/not in the current map/i);
    });

    it('notes the demolition cooldown while the cell is still locked', async () => {
        const cooling: CellInspection = {
            ...inspection,
            cell: { ...inspection.cell, building: null, demolishFinishAt: 500 },
        };
        const header = (await harness(cooling, 100)({ tokenId: '7' })).content[0]?.text ?? '';
        expect(header).toMatch(/demolition cooldown until/i);
    });
});
