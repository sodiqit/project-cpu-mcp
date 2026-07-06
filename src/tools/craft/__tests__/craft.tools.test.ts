import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';

import { CraftCategory, CraftRecipeId, type RecipeView } from '../../../api/types.js';
import { NoopLogger } from '../../../logger/noop.logger.js';
import type { CraftClaimResult, CraftStartResult, CraftStatusResult } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { TxStatus } from '../../../wallet/types.js';
import { registerClaimCraftTool } from '../claim/claim-craft.js';
import { registerCraftTool } from '../craft.js';
import { registerGetCraftStatusTool } from '../get-status/get-craft-status.js';
import { registerListRecipesTool } from '../list-recipes/list-recipes.js';

interface ToolResult {
    content: Array<{ type: string; text: string }>;
}

type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

const POWER_RECIPE: RecipeView = {
    id: CraftRecipeId.GeneratePower,
    name: 'Generate Power',
    category: CraftCategory.Refine,
    tier: 2,
    inputs: [{ resourceId: 6, amount: 5 }],
    outputs: [{ resourceId: 101, amount: 10 }],
    durationSec: 30,
    costCpu: '0',
};
const FORGE_RECIPE: RecipeView = {
    id: CraftRecipeId.ForgeWcpu,
    name: 'CPU Forge',
    category: CraftCategory.Forge,
    tier: 5,
    inputs: [{ resourceId: 100, amount: 50 }],
    outputs: [{ resourceId: 1, amount: 1 }],
    durationSec: 3600,
    costCpu: '100',
};

const appConfigStub = {
    load: async (): Promise<{ resources: Record<number, string>; recipes: Array<RecipeView> }> => ({
        resources: { 1: 'WCPU', 6: 'Coal', 100: 'Pure Silicon', 101: 'Power' },
        recipes: [POWER_RECIPE, FORGE_RECIPE],
    }),
};

function capture(register: (server: McpServer, context: AppContext) => void, context: AppContext): Handler {
    let captured: Handler | null = null;
    const server = {
        registerTool(_name: string, _def: unknown, handler: Handler): void {
            captured = handler;
        },
    } as unknown as McpServer;
    register(server, context);
    if (captured === null) {
        throw new Error('tool was not registered');
    }
    return captured;
}

function craftHarness(outcome: CraftStartResult): Handler {
    const craft = { craft: async (): Promise<CraftStartResult> => outcome };
    const context = { craft, appConfig: appConfigStub, logger: new NoopLogger() } as unknown as AppContext;
    return capture(registerCraftTool, context);
}

describe('craft tool', () => {
    it('summarizes a free craft', async () => {
        const result = await craftHarness({
            tokenId: '42',
            recipeId: CraftRecipeId.GeneratePower,
            batches: 2,
            costCpu: '0',
            approveTxHash: null,
            txHash: `0x${'1'.repeat(64)}`,
            status: TxStatus.Success,
            blockNumber: '100',
        })({ tokenId: '42', recipeId: CraftRecipeId.GeneratePower, batches: 2 });

        const header = result.content[0]?.text ?? '';
        expect(header).toMatch(/Craft started/i);
        expect(header).toMatch(/2× generate_power \(free\)/);
        expect(header).toMatch(/claim_craft 42/);
    });

    it('summarizes a paid craft with the $CPU cost and approve tx', async () => {
        const result = await craftHarness({
            tokenId: '42',
            recipeId: CraftRecipeId.ForgeWcpu,
            batches: 1,
            costCpu: '100',
            approveTxHash: `0x${'c'.repeat(64)}`,
            txHash: `0x${'1'.repeat(64)}`,
            status: TxStatus.Success,
            blockNumber: '100',
        })({ tokenId: '42', recipeId: CraftRecipeId.ForgeWcpu, batches: 1 });

        const header = result.content[0]?.text ?? '';
        expect(header).toMatch(/100 \$CPU/);
        expect(header).toMatch(/approve tx/);
        expect(header).toMatch(/get_craft_status 42/);
    });

    it('propagates service errors', async () => {
        const craft = {
            craft: async (): Promise<CraftStartResult> => {
                throw new Error('craftRejected');
            },
        };
        const context = { craft, appConfig: appConfigStub, logger: new NoopLogger() } as unknown as AppContext;
        const handler = capture(registerCraftTool, context);
        await expect(handler({ tokenId: '42', recipeId: CraftRecipeId.GeneratePower, batches: 1 })).rejects.toThrow(
            /craftRejected/,
        );
    });
});

describe('list_recipes tool', () => {
    it('lists each recipe with inputs, outputs, duration and cost', async () => {
        const context = { appConfig: appConfigStub, logger: new NoopLogger() } as unknown as AppContext;
        const handler = capture(registerListRecipesTool, context);

        const result = await handler({});
        const header = result.content[0]?.text ?? '';
        expect(header).toMatch(
            /Generate Power \(generate_power\): 5 Coal \(#6\) → 10 Power \(#101\), ~30s\/batch, free/,
        );
        expect(header).toMatch(/CPU Forge \(forge_wcpu\):.*~1h\/batch, 100 \$CPU\/batch/);
    });
});

describe('get_craft_status tool', () => {
    it('summarizes an active process with claimable batches', async () => {
        const status: CraftStatusResult = {
            tokenId: '42',
            active: true,
            recipeId: CraftRecipeId.GeneratePower,
            batches: 2,
            claimedBatches: 0,
            maturedBatches: 1,
            claimableBatches: 1,
            startAt: 1000,
            durationSec: 30,
        };
        const craft = { getStatus: async (): Promise<CraftStatusResult> => status };
        const context = { craft, appConfig: appConfigStub, logger: new NoopLogger() } as unknown as AppContext;
        const handler = capture(registerGetCraftStatusTool, context);

        const result = await handler({ tokenId: '42' });
        const header = result.content[0]?.text ?? '';
        expect(header).toMatch(/1\/2 batches matured/);
        expect(header).toMatch(/1 claimable now/);
    });

    it('reports a cell with no active craft', async () => {
        const status: CraftStatusResult = {
            tokenId: '42',
            active: false,
            recipeId: null,
            batches: 0,
            claimedBatches: 0,
            maturedBatches: 0,
            claimableBatches: 0,
            startAt: null,
            durationSec: null,
        };
        const craft = { getStatus: async (): Promise<CraftStatusResult> => status };
        const context = { craft, appConfig: appConfigStub, logger: new NoopLogger() } as unknown as AppContext;
        const handler = capture(registerGetCraftStatusTool, context);

        const result = await handler({ tokenId: '42' });
        expect(result.content[0]?.text).toMatch(/no active craft/i);
    });
});

describe('claim_craft tool', () => {
    it('reports the claimed resources', async () => {
        const claim: CraftClaimResult = {
            tokenId: '42',
            recipeId: CraftRecipeId.GeneratePower,
            batches: 1,
            outputs: [{ resourceId: 101, amount: '20' }],
            txHash: `0x${'1'.repeat(64)}`,
            status: TxStatus.Success,
            blockNumber: '100',
        };
        const craft = { claim: async (): Promise<CraftClaimResult> => claim };
        const context = { craft, appConfig: appConfigStub, logger: new NoopLogger() } as unknown as AppContext;
        const handler = capture(registerClaimCraftTool, context);

        const result = await handler({ tokenId: '42' });
        expect(result.content[0]?.text).toMatch(/Claimed 1 batch\(es\) → 20 Power \(#101\)/);
    });

    it('reports a no-op claim when nothing matured', async () => {
        const claim: CraftClaimResult = {
            tokenId: '42',
            recipeId: null,
            batches: 0,
            outputs: [],
            txHash: `0x${'1'.repeat(64)}`,
            status: TxStatus.Success,
            blockNumber: '100',
        };
        const craft = { claim: async (): Promise<CraftClaimResult> => claim };
        const context = { craft, appConfig: appConfigStub, logger: new NoopLogger() } as unknown as AppContext;
        const handler = capture(registerClaimCraftTool, context);

        const result = await handler({ tokenId: '42' });
        expect(result.content[0]?.text).toMatch(/nothing matured/i);
    });
});
