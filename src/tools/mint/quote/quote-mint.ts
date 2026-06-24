import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AppContext } from '../../../types.js';
import { QUOTE_MINT_DESCRIPTION } from '../constants.js';
import { summarizeMintQuote } from '../format.utils.js';
import { quoteMintInputSchema } from '../types.js';

export function registerQuoteMintTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'quote_mint',
        { description: QUOTE_MINT_DESCRIPTION, inputSchema: quoteMintInputSchema },
        async (args) => {
            const quote = await context.mint.quote({ quantity: args.quantity });

            return {
                content: [
                    { type: 'text', text: summarizeMintQuote(quote) },
                    { type: 'text', text: JSON.stringify(quote) },
                ],
            };
        },
    );
}
