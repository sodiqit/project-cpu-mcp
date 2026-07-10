import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { NEXT_HOPS_DESCRIPTION } from './constants.js';
import type { NextHopsResult } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { nextHopsInputSchema } from '../types.js';

function summarizeHops(result: NextHopsResult): string {
    if (result.hops.length === 0) {
        return (
            `No eligible waypoints within reach of ${result.from} — the route ends here. ` +
            'Build a Hub to bridge the gap, use closer cells, or reveal what you own nearby.'
        );
    }
    const towards =
        result.towards !== null ? ` towards ${result.towards} (${result.targetDistance ?? '?'} steps away)` : '';
    const lines = result.hops.map((hop) => {
        const kind = hop.isOwn ? 'own' : 'hub';
        const fee = hop.transitFeePerUnit !== null ? `, fee ${hop.transitFeePerUnit} $CPU/u` : '';
        const remaining = hop.distanceToTarget !== null ? `, ${hop.distanceToTarget} steps to target` : '';
        return `${hop.tokenId} (${kind}, ${hop.hopDistance} step hop${fee}${remaining})`;
    });
    return `${result.hops.length} legal next hop(s) from ${result.from}${towards}: ${lines.join('; ')}. ${result.note}`;
}

export function registerNextHopsTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_next_hops',
        { description: NEXT_HOPS_DESCRIPTION, inputSchema: nextHopsInputSchema },
        async (args) => {
            const result = await context.route.nextHops({ from: args.from, towards: args.towards });

            return {
                content: [
                    { type: 'text', text: summarizeHops(result) },
                    { type: 'text', text: JSON.stringify(result) },
                ],
            };
        },
    );
}
