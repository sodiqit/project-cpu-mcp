import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { CANCEL_LOT_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';
import { summarizeCancelLot } from '../format.utils.js';
import { cancelLotInputSchema } from '../types.js';

export function registerCancelLotTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cancel_lot',
        { description: CANCEL_LOT_DESCRIPTION, inputSchema: cancelLotInputSchema },
        async (args) => {
            const result = await context.trade.cancelLot({
                lotId: args.lotId,
                chain: args.chain,
            });
            const { resources } = await context.appConfig.load();

            return {
                content: [
                    { type: 'text', text: summarizeCancelLot(result, resources) },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
