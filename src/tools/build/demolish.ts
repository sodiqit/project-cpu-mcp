import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { DEMOLISH_DESCRIPTION } from './constants.js';
import { demolishInputSchema } from './types.js';
import type { AppContext } from '../../types.js';

export function registerDemolishTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_demolish',
        { description: DEMOLISH_DESCRIPTION, inputSchema: demolishInputSchema },
        async (args) => {
            const result = await context.build.demolish({ tokenId: args.tokenId });
            const header =
                `Demolished the building on cell ${result.tokenId}: tx ${result.txHash} confirmed in block ` +
                `${result.blockNumber}. The cleared cell settles on the map shortly.`;

            return {
                content: [
                    { type: 'text', text: header },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
