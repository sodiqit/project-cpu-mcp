import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { isInDemolishCooldown } from '../../../map/map.utils.js';
import type { AppContext } from '../../../types.js';
import { formatUnixSeconds } from '../../../utils/format.utils.js';
import { labelCell } from '../label.utils.js';
import { getWalletAddress } from '../wallet.utils.js';
import { GET_CELL_DESCRIPTION } from './constants.js';
import { getCellInputSchema } from './types.js';

export function registerGetCellTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_get_cell',
        { description: GET_CELL_DESCRIPTION, inputSchema: getCellInputSchema },
        async (args) => {
            const inspection = context.mapReader.inspectCell(args.tokenId, getWalletAddress(context));
            if (inspection === null) {
                throw new Error(`Cell ${args.tokenId} is not in the current map.`);
            }

            const { cell, neighbors } = inspection;
            const { resources } = await context.appConfig.load();
            const cooldownNote =
                isInDemolishCooldown(cell, context.mapReader.getServerTime()) && cell.demolishFinishAt !== null
                    ? ` · demolition cooldown until ${formatUnixSeconds(cell.demolishFinishAt)} (no rebuild yet)`
                    : '';
            const header = `Cell ${cell.tokenId} @(${cell.x},${cell.y}) · ${neighbors.length} neighbours${cooldownNote}`;

            const labeled = {
                ...inspection,
                cell: labelCell(cell, resources),
                neighbors: neighbors.map((neighbor) => labelCell(neighbor, resources)),
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
