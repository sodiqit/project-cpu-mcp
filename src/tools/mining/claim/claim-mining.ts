import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AppContext } from '../../../types.js';
import { summarizeMiningClaim } from '../format.utils.js';
import { claimMiningInputSchema } from '../types.js';
import { CLAIM_MINING_DESCRIPTION } from './constants.js';

export function registerClaimMiningTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_claim_mining',
        { description: CLAIM_MINING_DESCRIPTION, inputSchema: claimMiningInputSchema },
        async (args) => {
            const result = await context.mining.claim(args.tokenId);
            const { resources } = await context.appConfig.load();

            return {
                content: [
                    { type: 'text', text: summarizeMiningClaim(result, resources) },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
