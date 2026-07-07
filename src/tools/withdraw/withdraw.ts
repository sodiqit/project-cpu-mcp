import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { WITHDRAW_DESCRIPTION } from './constants.js';
import { withdrawInputSchema } from './types.js';
import type { AppContext } from '../../types.js';

export function registerWithdrawTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_withdraw',
        { description: WITHDRAW_DESCRIPTION, inputSchema: withdrawInputSchema },
        async (args) => {
            const result = await context.withdraw.withdraw({ tokenId: args.tokenId, amount: args.amount });

            const header =
                `Withdrew from cell ${result.tokenId}: minted ${result.amount} $CPU to your wallet — withdraw tx ` +
                `${result.txHash} confirmed in block ${result.blockNumber}. Check it with get_balance.`;

            return {
                content: [
                    { type: 'text', text: header },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
