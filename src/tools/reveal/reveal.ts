import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { REVEAL_DESCRIPTION } from './constants.js';
import { revealInputSchema } from './types.js';
import type { AppContext } from '../../types.js';

export function registerRevealTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_reveal',
        { description: REVEAL_DESCRIPTION, inputSchema: revealInputSchema },
        async (args) => {
            const result = await context.reveal.reveal(args.tokenId);

            const cost = result.genesis ? 'first reveal (free)' : `re-reveal (burned ${result.reRevealCost} $CPU)`;
            const approve = result.approveTxHash !== null ? ` approve tx ${result.approveTxHash},` : '';
            const outcome = result.fulfilled
                ? `Deposits are revealed — read them with get_cell ${result.tokenId}.`
                : `Deposits are drawn asynchronously by Pyth Entropy and were not ready yet — poll get_cell ${result.tokenId} shortly.`;
            const header =
                `Requested reveal for cell ${result.tokenId} — ${cost}, ` +
                `paid ${result.fee} ETH fee.${approve} request tx ${result.txHash} confirmed in block ` +
                `${result.blockNumber}. ${outcome}`;

            return {
                content: [
                    { type: 'text', text: header },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
