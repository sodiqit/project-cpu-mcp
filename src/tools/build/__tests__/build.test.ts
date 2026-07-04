import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import { BuildingType } from '../../../api/types.js';
import { NoopLogger } from '../../../logger/noop.logger.js';
import type { BuildResult } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { registerBuildTool } from '../build.js';

interface ToolResult {
    content: Array<{ type: string; text: string }>;
}

type BuildArgs = { tokenId: string; buildingType: BuildingType; targetResourceId: number | null };
type Handler = (args: BuildArgs) => Promise<ToolResult>;

function harness(outcome: BuildResult | Error): Handler {
    const build = {
        build: async (): Promise<BuildResult> => {
            if (outcome instanceof Error) {
                throw outcome;
            }
            return outcome;
        },
    };
    const appConfig = {
        load: async (): Promise<{ resources: Record<number, string> }> => ({ resources: { 3: 'Silica' } }),
    };
    const context = { build, appConfig, logger: new NoopLogger() } as unknown as AppContext;

    let captured: Handler | null = null;
    const server = {
        registerTool(_name: string, _def: unknown, handler: Handler): void {
            captured = handler;
        },
    } as unknown as McpServer;

    registerBuildTool(server, context);
    if (captured === null) {
        throw new Error('build was not registered');
    }
    return captured;
}

const extractorResult: BuildResult = {
    tokenId: '42',
    buildingType: BuildingType.Extractor,
    targetResourceId: 3,
    buildCostWei: '2000000000000000000000',
    approveTxHash: '0xapprove',
    buildTxHash: '0xbuild',
    miningTxHash: '0xmine',
    alreadyBuilt: false,
};

describe('build tool', () => {
    it('reports the resource name, $CPU paid, and a mining follow-up for an extractor', async () => {
        const result = await harness(extractorResult)({
            tokenId: '42',
            buildingType: BuildingType.Extractor,
            targetResourceId: 3,
        });

        const header = result.content[0]?.text ?? '';
        expect(header).toMatch(/Silica \(#3\)/);
        expect(header).toMatch(/approve tx 0xapprove/);
        expect(header).toMatch(/2000 \$CPU/);
        expect(header).toMatch(/mining started \(tx 0xmine\)/);
        expect(header).toMatch(/get_mining_status 42/);

        const parsed = JSON.parse(result.content[1]?.text ?? '{}') as BuildResult;
        expect(parsed.targetResourceId).toBe(3);
    });

    it('reports a hub with no approve mention and a get_cell follow-up', async () => {
        const result = await harness({
            ...extractorResult,
            buildingType: BuildingType.Hub,
            targetResourceId: null,
            approveTxHash: null,
            buildCostWei: '5000000000000000000000',
            miningTxHash: null,
        })({ tokenId: '42', buildingType: BuildingType.Hub, targetResourceId: null });

        const header = result.content[0]?.text ?? '';
        expect(header).toMatch(/hub/);
        expect(header).toMatch(/5000 \$CPU/);
        expect(header).toMatch(/get_cell 42/);
        expect(header).not.toMatch(/approve/i);
    });

    it('notes when the building was already in place', async () => {
        const result = await harness({
            ...extractorResult,
            approveTxHash: null,
            buildTxHash: null,
            buildCostWei: '0',
            alreadyBuilt: true,
        })({ tokenId: '42', buildingType: BuildingType.Extractor, targetResourceId: 3 });

        const header = result.content[0]?.text ?? '';
        expect(header).toMatch(/already in place/);
        expect(header).toMatch(/mining started/);
    });

    it('propagates service errors', async () => {
        await expect(
            harness(new Error('CellNotRevealed'))({
                tokenId: '42',
                buildingType: BuildingType.Extractor,
                targetResourceId: 3,
            }),
        ).rejects.toThrow(/CellNotRevealed/);
    });
});
