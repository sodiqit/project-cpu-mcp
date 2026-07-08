import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { START_MINING_DESCRIPTION } from './constants.js';
import type { AppContext } from '../../../types.js';
import { resourceLabel } from '../../../utils/format.utils.js';
import { startMiningInputSchema } from '../types.js';

export function registerStartMiningTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_start_mining',
        { description: START_MINING_DESCRIPTION, inputSchema: startMiningInputSchema },
        async (args) => {
            const result = await context.mining.startMining({
                tokenId: args.tokenId,
                targetResourceId: args.targetResourceId,
            });
            const { resources } = await context.appConfig.load();

            const rate = result.rate !== null ? ` at ${result.rate}/s` : '';
            const header =
                `Started mining ${resourceLabel(resources, result.targetResourceId)}${rate} on cell ` +
                `${result.tokenId}: tx ${result.txHash} confirmed in block ${result.blockNumber}. ` +
                `Track accrual with cpu_get_mining_status ${result.tokenId} and bank it with cpu_claim_mining.`;

            return {
                content: [
                    { type: 'text', text: header },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
