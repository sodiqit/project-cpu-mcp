import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { QUOTE_BUY_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';
import { summarizeQuoteBuy } from '../format.utils.js';
import { quoteBuyInputSchema } from '../types.js';

export function registerQuoteBuyTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_quote_buy',
        { description: QUOTE_BUY_DESCRIPTION, inputSchema: quoteBuyInputSchema },
        async (args) => {
            const quote = await context.trade.quoteBuy({
                lotId: args.lotId,
                value: args.value,
                chain: args.chain,
            });
            const { resources } = await context.appConfig.load();

            return {
                content: [
                    { type: 'text', text: summarizeQuoteBuy(quote, resources) },
                    { type: 'text', text: JSON.stringify(quote) },
                ],
            };
        },
    );
}
