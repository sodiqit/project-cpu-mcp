import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AppContext } from '../../../types.js';
import { resourceLabel } from '../../../utils/format.utils.js';
import { miningStatusInputSchema } from '../types.js';
import { GET_MINING_STATUS_DESCRIPTION } from './constants.js';

export function registerGetMiningStatusTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'get_mining_status',
        { description: GET_MINING_STATUS_DESCRIPTION, inputSchema: miningStatusInputSchema },
        async (args) => {
            const status = await context.mining.getStatus(args.tokenId);

            let header: string;
            if (status.active && status.targetResourceId !== null) {
                const { resources } = await context.appConfig.load();
                const depleted = status.depositRemaining === '0' ? ' Deposit depleted.' : '';
                const stalled = status.stalled
                    ? ` Warehouse FULL (${status.warehouseUsed}/${status.warehouseCap}) — mining stalled; offload to resume.`
                    : '';
                header =
                    `Cell ${status.tokenId} mining ${resourceLabel(resources, status.targetResourceId)}: ` +
                    `~${status.claimable} claimable now, ${status.depositRemaining} left in deposit.${depleted}${stalled}`;
            } else {
                header = `Cell ${status.tokenId} has no active mining (no extractor, or the deposit is depleted).`;
            }

            return {
                content: [
                    { type: 'text', text: header },
                    { type: 'text', text: JSON.stringify(status) },
                ],
            };
        },
    );
}
