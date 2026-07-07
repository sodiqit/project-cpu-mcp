import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { GET_MARKETS_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';
import { summarizeMarkets } from '../format.utils.js';
import { marketsInputSchema } from '../types.js';

export function registerGetMarketsTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_get_markets',
        { description: GET_MARKETS_DESCRIPTION, inputSchema: marketsInputSchema },
        async (args) => {
            const markets = await context.trade.getMarkets(args);
            const { resources } = await context.appConfig.load();

            return {
                content: [
                    { type: 'text', text: `${markets.length} market(s)\n${summarizeMarkets(markets, resources)}` },
                    { type: 'text', text: JSON.stringify(markets) },
                ],
            };
        },
    );
}
