import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { GET_MARKETS_DESCRIPTION } from './constants.js';
import type { MarketResourceSummary } from '../../../api/types.js';
import type { Cell } from '../../../map/types.js';
import type { AppContext } from '../../../types.js';
import { summarizeMarkets } from '../format.utils.js';
import { marketsInputSchema, type EnrichedMarketSummary } from '../types.js';

interface SaleFeeReader {
    readRevealCell(tokenId: string): Cell | null;
}

function enrichLiveSaleFee(mapReader: SaleFeeReader, row: MarketResourceSummary): EnrichedMarketSummary {
    const cell = mapReader.readRevealCell(row.hubTokenId);
    const liveSaleFeePercent =
        cell === null || cell.saleFeeOverrides === null ? null : (cell.saleFeeOverrides[row.resourceId] ?? 0);
    return { ...row, liveSaleFeePercent };
}

export function registerGetMarketsTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_get_markets',
        { description: GET_MARKETS_DESCRIPTION, inputSchema: marketsInputSchema },
        async (args) => {
            const markets = await context.trade.getMarkets(args);
            const enriched = markets.map((row) => enrichLiveSaleFee(context.mapReader, row));
            const { resources } = await context.appConfig.load();

            return {
                content: [
                    { type: 'text', text: `${enriched.length} market(s)\n${summarizeMarkets(enriched, resources)}` },
                    { type: 'text', text: JSON.stringify(enriched) },
                ],
            };
        },
    );
}
