import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CREATE_LOT_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';
import { summarizeCreateLot } from '../format.utils.js';
import { createLotInputSchema } from '../types.js';

export function registerCreateLotTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'create_lot',
        { description: CREATE_LOT_DESCRIPTION, inputSchema: createLotInputSchema },
        async (args) => {
            const result = await context.trade.createLot({
                chain: args.chain,
                resourceId: args.resourceId,
                value: args.value,
                pricePerUnit: args.pricePerUnit,
            });
            const { resources } = await context.appConfig.load();

            return {
                content: [
                    { type: 'text', text: summarizeCreateLot(result, resources) },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
