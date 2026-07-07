import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { AppContext } from '../../../types.js';
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
            const header = `Cell ${cell.tokenId} @(${cell.x},${cell.y}) · ${neighbors.length} neighbours`;

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
