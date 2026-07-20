import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CREATE_SYNDICATE_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';
import { summarizeCreate } from '../format.utils.js';
import { createSyndicateInputSchema } from '../types.js';

export function registerCreateSyndicateTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_create_syndicate',
        { description: CREATE_SYNDICATE_DESCRIPTION, inputSchema: createSyndicateInputSchema },
        async (args) => {
            const result = await context.syndicate.create(args);

            return {
                content: [
                    { type: 'text', text: summarizeCreate(result) },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
