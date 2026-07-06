import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { BUILD_DESCRIPTION } from './constants.js';
import { buildInputSchema } from './types.js';
import type { AppContext } from '../../types.js';
import { resourceLabel } from '../../utils/format.utils.js';

export function registerBuildTool(server: McpServer, context: AppContext): void {
    server.registerTool('build', { description: BUILD_DESCRIPTION, inputSchema: buildInputSchema }, async (args) => {
        const result = await context.build.build({
            tokenId: args.tokenId,
            buildingType: args.buildingType,
            targetResourceId: args.targetResourceId,
        });
        const { resources } = await context.appConfig.load();

        const what =
            result.targetResourceId !== null
                ? `extractor mining ${resourceLabel(resources, result.targetResourceId)}`
                : 'hub';
        const approve = result.approveTxHash !== null ? `approve tx ${result.approveTxHash}; ` : '';
        const placed = result.alreadyBuilt
            ? `${result.buildingType} already in place`
            : `build tx ${result.buildTxHash} (paid ${result.buildCost} $CPU)`;
        const mining = result.miningTxHash !== null ? `; mining started (tx ${result.miningTxHash})` : '';
        const followUp =
            result.targetResourceId !== null
                ? `Track it with get_mining_status ${result.tokenId}.`
                : `Inspect it with get_cell ${result.tokenId}.`;
        const header =
            `Built ${what} on cell ${result.tokenId}: ${approve}${placed}${mining}. ` +
            `The building settles on the map shortly. ${followUp}`;

        return {
            content: [
                { type: 'text', text: header },
                { type: 'text', text: JSON.stringify(result) },
            ],
        };
    });
}
