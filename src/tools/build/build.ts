import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { BUILD_DESCRIPTION } from './constants.js';
import { buildInputSchema } from './types.js';
import { BuildingKind, type BuildingView } from '../../api/types.js';
import type { AppConfig } from '../../services/types.js';
import type { AppContext } from '../../types.js';
import { formatDuration, resourceLabel } from '../../utils/format.utils.js';

export function registerBuildTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_build',
        { description: BUILD_DESCRIPTION, inputSchema: buildInputSchema },
        async (args) => {
            const result = await context.build.build({
                tokenId: args.tokenId,
                buildingType: args.buildingType,
            });
            const config = await context.appConfig.load();
            const view = config.buildings.find((b) => b.type === result.buildingType) ?? null;
            const name = view?.name ?? result.buildingType;

            const approve = result.approveTxHash !== null ? `approve tx ${result.approveTxHash}; ` : '';
            const placed = result.alreadyBuilt
                ? `${name} already in place`
                : `build tx ${result.buildTxHash} (paid ${result.buildCost} $CPU)`;
            const header =
                `Built ${name} on cell ${result.tokenId}: ${approve}${placed}. ` +
                `The building settles on the map shortly. ${nextStep(view, config, result.tokenId)}`;

            return {
                content: [
                    { type: 'text', text: header },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}

function nextStep(view: BuildingView | null, config: AppConfig, tokenId: string): string {
    if (view === null) {
        return `Inspect it with cpu_get_cell ${tokenId}.`;
    }
    const ready = view.buildTimeSec > 0 ? `It finishes building in ~${formatDuration(view.buildTimeSec)}; ` : '';
    if (view.kind === BuildingKind.Extractor) {
        const mines = view.minableResources.map((id) => resourceLabel(config.resources, id)).join(', ');
        return `${ready}once ready, start extraction with cpu_start_mining ${tokenId} (mines: ${mines}).`;
    }
    if (view.kind === BuildingKind.Crafter) {
        const recipes = view.recipes.map((id) => recipeName(config, id)).join(', ');
        return `${ready}once ready, run a recipe with cpu_craft ${tokenId} (recipes: ${recipes}).`;
    }
    return `${ready}it routes transport and trade. Inspect it with cpu_get_cell ${tokenId}.`;
}

function recipeName(config: AppConfig, recipeId: string): string {
    const recipe = config.recipes.find((r) => r.id === recipeId);
    return recipe !== undefined ? `${recipe.name} (${recipe.id})` : recipeId;
}
