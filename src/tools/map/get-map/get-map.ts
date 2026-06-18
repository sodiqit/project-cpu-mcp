import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AppContext } from '../../../types.js';
import { labelCell } from '../label.utils.js';
import { getWalletAddress } from '../wallet.utils.js';
import { GET_MAP_DESCRIPTION } from './constants.js';
import { buildMapQuery, resolveScope } from './get-map.utils.js';
import { getMapInputSchema } from './types.js';

export function registerGetMapTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'get_map',
        { description: GET_MAP_DESCRIPTION, inputSchema: getMapInputSchema },
        async (args) => {
            const ownerAddress = getWalletAddress(context);
            const scope = resolveScope(args.scope, ownerAddress);
            const result = context.mapReader.query(buildMapQuery(scope, args, ownerAddress));
            const { resources } = await context.appConfig.load();
            const health = context.api.getServerHealth();

            const serverTag = health.reachable ? 'server=up' : 'server=DOWN';
            const header =
                `Map v${result.summary.version} · ${result.summary.totalCells} cells · ` +
                `scope=${result.scope} · returned ${result.returnedCells} · ${serverTag}`;

            // Resolve resource ids to names: inline on each cell, plus a legend for the resourceIndex keys.
            const labeled = {
                ...result,
                cells: result.cells.map((cell) => labelCell(cell, resources)),
                resourceNames: resources,
                server: { reachable: health.reachable, reason: health.reason },
            };

            return {
                content: [
                    { type: 'text', text: header },
                    { type: 'text', text: JSON.stringify(labeled) },
                ],
            };
        },
    );
}
