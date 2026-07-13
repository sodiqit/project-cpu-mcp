import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import { BuildingKind, BuildingType, CraftRecipeId } from '../../../api/types.js';
import { Network } from '../../../config/types.js';
import { NoopLogger } from '../../../logger/noop.logger.js';
import type { AppConfig } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { registerGetGameConfigTool } from '../get-game-config/get-game-config.js';

interface ToolResult {
    content: Array<{ type: string; text: string }>;
}

const CONFIG: AppConfig = {
    network: Network.ETHEREUM,
    chainId: 1,
    contracts: {
        land: '0xland',
        cpuToken: '0xcpu',
        cpuHook: '0x4444444444444444444444444444444444444444',
        cell: '0x5555555555555555555555555555555555555555',
        cellLens: '0x6666666666666666666666666666666666666666',
        transport: '0x7777777777777777777777777777777777777777',
        trade: '0x8888888888888888888888888888888888888888',
    },
    resources: { 5: 'Iron' },
    recipes: [
        {
            id: CraftRecipeId.SmeltSteel,
            name: 'Smelt Steel',
            tier: 2,
            inputs: [],
            outputs: [],
            durationSec: 30,
            costCpu: '0',
        },
    ],
    buildings: [
        {
            type: BuildingType.Mine,
            onChainId: 4,
            name: 'Mine',
            kind: BuildingKind.Extractor,
            tier: 1,
            buildCost: '5',
            buildTimeSec: 120,
            buildInputs: [],
            demolishCost: { cpu: '2.5', inputs: [] },
            minableResources: [5, 6],
            recipes: [],
        },
    ],
    reveal: { firstFree: true, reRevealCost: '1000' },
    transport: { moveRadius: 1, hubRadius: 3, moveTimePerCellSec: 2, defaultMoveFeePerUnit: '0.1' },
    trade: { saleBurnPercent: 1, maxSaleFeePercent: 50 },
};

function capture(): (args: never) => Promise<ToolResult> {
    const context = {
        appConfig: { load: async () => CONFIG },
        logger: new NoopLogger(),
    } as unknown as AppContext;
    let captured: ((args: never) => Promise<ToolResult>) | null = null;
    const server = {
        registerTool(_name: string, _def: unknown, handler: (args: never) => Promise<ToolResult>): void {
            captured = handler;
        },
    } as unknown as McpServer;
    registerGetGameConfigTool(server, context);
    if (captured === null) {
        throw new Error('tool was not registered');
    }
    return captured;
}

describe('get_game_config tool', () => {
    it('summarizes the rulebook and returns the full config', async () => {
        const result = await capture()({} as never);

        const header = result.content[0]?.text ?? '';
        expect(header).toMatch(/Network ethereum \(chainId 1\)/);
        expect(header).toMatch(/Mine \(extractor, build 5 \$CPU, demolish 2\.5 \$CPU\)/);
        expect(header).toMatch(/first reveal free, re-reveal 1000 \$CPU/);
        expect(header).toMatch(/1 recipe\(s\)/);
        expect(header).toMatch(/5:Iron/);
        expect(header).toMatch(/cell 0x5555555555555555555555555555555555555555/);
        expect(header).toMatch(/1% sale burn, sale-fee cap 50%, default transit fee 0.1 \$CPU\/u/);

        const json = JSON.parse(result.content[1]?.text ?? '{}') as AppConfig;
        expect(json.buildings[0]?.buildCost).toBe('5');
        expect(json.reveal.reRevealCost).toBe('1000');
        expect(json.trade).toEqual({ saleBurnPercent: 1, maxSaleFeePercent: 50 });
        expect(json.transport.defaultMoveFeePerUnit).toBe('0.1');
    });
});
