import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { DEMOLISH_DESCRIPTION } from './constants.js';
import { demolishInputSchema } from './types.js';
import type { AppContext } from '../../types.js';
import { formatStacks } from '../../utils/format.utils.js';

export function registerDemolishTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_demolish',
        { description: DEMOLISH_DESCRIPTION, inputSchema: demolishInputSchema },
        async (args) => {
            const result = await context.build.demolish({ tokenId: args.tokenId });
            const { resources } = await context.appConfig.load();

            const consumed = formatStacks(resources, result.inputsConsumed);
            const consumedNote = consumed.length > 0 ? ` plus ${consumed} from its warehouse` : '';
            const header =
                `Demolished the ${result.buildingType} on cell ${result.tokenId}: burned ${result.cpuBurned} $CPU` +
                `${consumedNote}. The plot is locked from rebuilding for ~${result.rebuildCooldownSec}s ` +
                `(the exact demolishFinishAt settles on the map shortly). tx ${result.txHash} confirmed in block ` +
                `${result.blockNumber}.`;

            return {
                content: [
                    { type: 'text', text: header },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
