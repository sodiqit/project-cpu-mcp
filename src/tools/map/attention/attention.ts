import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { GET_ATTENTION_DESCRIPTION } from './constants.js';
import { getAttentionInputSchema } from './types.js';
import { withExtraItems } from '../../../map/attention.utils.js';
import { WAREHOUSE_NEAR_FULL_PCT } from '../../../map/constants.js';
import { type AttentionItem, AttentionReason, AttentionSeverity } from '../../../map/types.js';
import type { DeliveryView } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { errorMessage } from '../../../utils/error.utils.js';
import { resourceName } from '../../../utils/format.utils.js';
import { getWalletAddress } from '../wallet.utils.js';

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
    [AttentionSeverity.Critical]: 0,
    [AttentionSeverity.Warning]: 1,
    [AttentionSeverity.Info]: 2,
};

// A delivery isn't a cell, so it carries no coords of its own — read them off the target cell in the map.
function buildDeliveryItem(context: AppContext, delivery: DeliveryView): AttentionItem {
    const cell = context.mapReader.readRevealCell(delivery.targetTokenId);
    return {
        tokenId: delivery.targetTokenId,
        x: cell?.x ?? 0,
        y: cell?.y ?? 0,
        severity: AttentionSeverity.Warning,
        reason: AttentionReason.DeliveryReady,
        resourceId: delivery.resourceId,
        used: null,
        cap: null,
        fillPct: null,
        breakdown: null,
        depositRemaining: null,
        deliveryId: delivery.deliveryId,
        arrivalAt: delivery.arrivalAt,
        suggestedTool: 'finalize_delivery',
        action: 'Delivery has arrived — finalize_delivery to land the goods and free the reserved space.',
    };
}

export function registerGetAttentionTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'get_attention',
        { description: GET_ATTENTION_DESCRIPTION, inputSchema: getAttentionInputSchema },
        async (args) => {
            const owner = getWalletAddress(context);
            const { resources, recipes } = await context.appConfig.load();
            const craftOutputsByRecipe: Record<string, Array<number>> = {};
            for (const recipe of recipes) {
                craftOutputsByRecipe[recipe.id] = recipe.outputs.map((o) => o.resourceId);
            }

            const mapReport = context.mapReader.attention(owner, {
                nearFullPct: WAREHOUSE_NEAR_FULL_PCT,
                craftOutputsByRecipe,
            });

            let report = mapReport;
            if (owner !== null) {
                try {
                    const ready = await context.transport.listReadyToFinalizeForOwner();
                    const deliveryItems = ready.map((d) => buildDeliveryItem(context, d));
                    report = withExtraItems(mapReport, deliveryItems, null);
                } catch (error) {
                    context.logger.warn('attention: deliveries fetch failed', { error: errorMessage(error) });
                    report = withExtraItems(
                        mapReport,
                        [],
                        'Deliveries could not be loaded (server unreachable); showing map-based items only.',
                    );
                }
            }

            const minRank =
                args.minSeverity === null ? SEVERITY_RANK[AttentionSeverity.Info] : SEVERITY_RANK[args.minSeverity];
            const items = report.items
                .filter((item) => SEVERITY_RANK[item.severity] <= minRank)
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
