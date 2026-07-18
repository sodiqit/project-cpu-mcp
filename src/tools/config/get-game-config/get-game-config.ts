import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { GET_GAME_CONFIG_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';

export function registerGetGameConfigTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_get_game_config',
        { description: GET_GAME_CONFIG_DESCRIPTION, inputSchema: {} },
        async () => {
            const config = await context.appConfig.load();

            const resourceList =
                Object.entries(config.resources)
                    .map(([id, name]) => `${id}:${name}`)
                    .join(', ') || 'none';
            const buildings =
                config.buildings
                    .map((b) => `${b.name} (${b.kind}, build ${b.buildCost} $CPU, demolish ${b.demolishCost.cpu} $CPU)`)
                    .join(', ') || 'none';
            const reveal = config.reveal.firstFree
                ? `first reveal free, re-reveal ${config.reveal.reRevealCost} $CPU`
                : `reveal ${config.reveal.reRevealCost} $CPU`;
            const trade =
                `${config.trade.saleBurnPercent}% sale burn, sale fee up to ${config.trade.maxSaleFeePercent}% ` +
                `(structural bound — a hub owner can set any rate up to it), default transit fee ` +
                `${config.transport.defaultMoveFeePerUnit} $CPU/u`;
            const storage = `an active hub multiplies a cell's storage cap by ${config.storage.hubStorageMultiplier}x`;
            const header =
                `Network ${config.network} (chainId ${config.chainId}). ${config.recipes.length} recipe(s) ` +
                `(see list_recipes). Buildings: ${buildings}. Reveal: ${reveal}. Trade: ${trade}. ` +
                `Storage: ${storage}. ` +
                `Resources: ${resourceList}. ` +
                `Contracts — land ${config.contracts.land}, $CPU ${config.contracts.cpuToken}, ` +
                `cpuHook ${config.contracts.cpuHook}, cell ${config.contracts.cell}, ` +
                `transport ${config.contracts.transport}.`;

            return {
                content: [
                    { type: 'text', text: header },
                    { type: 'text', text: JSON.stringify(config) },
                ],
            };
        },
    );
}
