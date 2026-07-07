import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { GET_ATTENTION_DESCRIPTION } from './constants.js';
import { getAttentionInputSchema } from './types.js';
import { attentionItem, meetsSeverity, withExtraItems } from '../../../map/attention.utils.js';
import { WAREHOUSE_NEAR_FULL_PCT } from '../../../map/constants.js';
import { AttentionReason } from '../../../map/types.js';
import type { DeliveryView } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { errorMessage } from '../../../utils/error.utils.js';
import { resourceName } from '../../../utils/format.utils.js';
import { getWalletAddress } from '../wallet.utils.js';

const DELIVERIES_UNREACHABLE = 'Deliveries could not be loaded (server unreachable); showing map-based items only.';

// A delivery isn't a cell, so it borrows the target cell's coords from the map.
function deliveryItem(context: AppContext, d: DeliveryView) {
    const cell = context.mapReader.readRevealCell(d.targetTokenId);
    return attentionItem(
        { tokenId: d.targetTokenId, x: cell?.x ?? 0, y: cell?.y ?? 0 },
        AttentionReason.DeliveryReady,
        {
            resourceId: d.resourceId,
            deliveryId: d.deliveryId,
            arrivalAt: d.arrivalAt,
        },
    );
}

export function registerGetAttentionTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'get_attention',
        { description: GET_ATTENTION_DESCRIPTION, inputSchema: getAttentionInputSchema },
        async (args) => {
            const owner = getWalletAddress(context);
            const { resources, recipes } = await context.appConfig.load();
            const craftOutputsByRecipe = Object.fromEntries(
                recipes.map((r): [string, Array<number>] => [r.id, r.outputs.map((o) => o.resourceId)]),
            );

            const mapReport = context.mapReader.attention(owner, {
                nearFullPct: WAREHOUSE_NEAR_FULL_PCT,
                craftOutputsByRecipe,
            });

            let report = mapReport;
            if (owner !== null) {
                try {
                    const ready = await context.transport.listReadyToFinalizeForOwner();
                    report = withExtraItems(
                        mapReport,
                        ready.map((d) => deliveryItem(context, d)),
                        null,
                    );
                } catch (error) {
                    context.logger.warn('attention: deliveries fetch failed', { error: errorMessage(error) });
                    report = withExtraItems(mapReport, [], DELIVERIES_UNREACHABLE);
                }
            }

            const items = report.items
                .filter((item) => meetsSeverity(item.severity, args.minSeverity))
                .map((item) => ({
                    ...item,
                    resourceName: item.resourceId === null ? null : resourceName(resources, item.resourceId),
                }));

            const header = report.ownerKnown
                ? `Attention: ${report.counts.critical} critical · ${report.counts.warning} warning · ` +
                  `${report.counts.info} info (map v${report.version}, ${items.length} shown).`
                : 'Attention needs your wallet — call authenticate first. No owner-scoped items.';

            return {
                content: [
                    { type: 'text', text: header },
                    { type: 'text', text: JSON.stringify({ ...report, items, resourceNames: resources }) },
                ],
            };
        },
    );
}
