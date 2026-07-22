import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { TRANSFER_SYNDICATE_MANAGER_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';
import { summarizeTransfer } from '../format.utils.js';
import { transferSyndicateManagerInputSchema } from '../types.js';

export function registerTransferSyndicateManagerTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_transfer_syndicate_manager',
        { description: TRANSFER_SYNDICATE_MANAGER_DESCRIPTION, inputSchema: transferSyndicateManagerInputSchema },
        async (args) => {
            const result = await context.syndicate.transferManager(args);

            return {
                content: [
                    { type: 'text', text: summarizeTransfer(result) },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
