import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { GET_GAME_CONFIG_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';

export function registerGetGameConfigTool(server: McpServer, context: AppContext): void {
    server.registerTool('get_game_config', { description: GET_GAME_CONFIG_DESCRIPTION, inputSchema: {} }, async () => {
        const config = await context.appConfig.load();

        const resourceList =
            Object.entries(config.resources)
                .map(([id, name]) => `${id}:${name}`)
                .join(', ') || 'none';
        const buildings = config.buildings.map((b) => `${b.name} ${b.buildCost} $CPU`).join(', ') || 'none';
        const reveal = config.reveal.firstFree
            ? `first reveal free, re-reveal ${config.reveal.reRevealCost} $CPU`
            : `reveal ${config.reveal.reRevealCost} $CPU`;
        const header =
            `Network ${config.network} (chainId ${config.chainId}). ${config.recipes.length} recipe(s) ` +
            `(see list_recipes). Buildings: ${buildings}. Reveal: ${reveal}. Resources: ${resourceList}. ` +
            `Contracts — land ${config.contracts.land}, $CPU ${config.contracts.cpuToken}, ` +
            `gameSettlement ${config.contracts.gameSettlement}, cpuHook ${config.contracts.cpuHook}, ` +
            `cell ${config.contracts.cell}.`;

        return {
            content: [
                { type: 'text', text: header },
                { type: 'text', text: JSON.stringify(config) },
            ],
        };
    });
}
