import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { GET_BALANCE_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';

export function registerGetBalanceTool(server: McpServer, context: AppContext): void {
    server.registerTool('cpu_get_balance', { description: GET_BALANCE_DESCRIPTION, inputSchema: {} }, async () => {
        const balance = await context.balance.getBalances();
        const header =
            `Wallet ${balance.address} on ${balance.network} (chainId ${balance.chainId}): ` +
            `${balance.cpu} $CPU, ${balance.native} gas.`;

        return {
            content: [
                { type: 'text', text: header },
                { type: 'text', text: JSON.stringify(balance) },
            ],
        };
    });
}
