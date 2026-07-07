import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AppContext } from '../../../types.js';
import { resourceLabel } from '../../../utils/format.utils.js';
import { claimMiningInputSchema } from '../types.js';
import { CLAIM_MINING_DESCRIPTION } from './constants.js';

export function registerClaimMiningTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_claim_mining',
        { description: CLAIM_MINING_DESCRIPTION, inputSchema: claimMiningInputSchema },
        async (args) => {
            const result = await context.mining.claim(args.tokenId);
            const { resources } = await context.appConfig.load();

            const claimed = BigInt(result.claimedAmount);
            const header =
                claimed > 0n && result.resourceId !== null
                    ? `Claimed ${result.claimedAmount} ${resourceLabel(resources, result.resourceId)} from cell ` +
                      `${result.tokenId}: tx ${result.txHash} confirmed in block ${result.blockNumber}.`
                    : `Nothing newly accrued to claim on cell ${result.tokenId} (tx ${result.txHash}); mining keeps ` +
                      `running until the deposit is depleted.`;

            return {
                content: [
                    { type: 'text', text: header },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
