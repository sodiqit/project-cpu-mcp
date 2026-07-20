import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { LIST_SYNDICATES_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';
import { summarizeSyndicateList } from '../format.utils.js';
import { listSyndicatesInputSchema } from '../types.js';

export function registerListSyndicatesTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_list_syndicates',
        { description: LIST_SYNDICATES_DESCRIPTION, inputSchema: listSyndicatesInputSchema },
        async (args) => {
            const cards = await context.syndicate.listSyndicates(args);

            return {
                content: [
                    { type: 'text', text: `${cards.length} syndicate(s)\n${summarizeSyndicateList(cards)}` },
                    { type: 'text', text: JSON.stringify(cards) },
                ],
            };
        },
    );
}
