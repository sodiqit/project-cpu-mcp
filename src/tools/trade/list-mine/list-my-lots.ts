import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { LIST_MY_LOTS_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';
import { summarizeLots } from '../format.utils.js';
import { listMyLotsInputSchema } from '../types.js';

export function registerListMyLotsTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_list_my_lots',
        { description: LIST_MY_LOTS_DESCRIPTION, inputSchema: listMyLotsInputSchema },
        async (args) => {
            const lots = await context.trade.listMyLots(args.state);
            const { resources } = await context.appConfig.load();
            const header = `${lots.length} lot(s)${args.state !== null ? ` · state=${args.state}` : ''}`;

            return {
                content: [
                    { type: 'text', text: `${header}\n${summarizeLots(lots, resources)}` },
                    { type: 'text', text: JSON.stringify(lots) },
                ],
            };
        },
    );
}
