import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { GET_ATTENTION_DESCRIPTION } from './constants.js';
import { getAttentionInputSchema } from './types.js';
import { attentionItem, meetsSeverity, withExtraItems } from '../../../map/attention.utils.js';
import { AttentionReason } from '../../../map/types.js';
import type { DeliveryView } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { errorMessage } from '../../../utils/error.utils.js';
import { resourceName } from '../../../utils/format.utils.js';
import { getWalletAddress } from '../wallet.utils.js';

const DELIVERIES_UNREACHABLE = 'Deliveries could not be loaded (server unreachable); showing map-based items only.';

function deliveryItem(d: DeliveryView) {
    return attentionItem({ tokenId: d.targetTokenId }, AttentionReason.DeliveryReady, {
        resourceId: d.resourceId,
        deliveryId: d.deliveryId,
        arrivalAt: d.arrivalAt,
    });
}

export function registerGetAttentionTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_get_attention',
        { description: GET_ATTENTION_DESCRIPTION, inputSchema: getAttentionInputSchema },
        async (args) => {
            const self = getWalletAddress(context);
            const target = args.owner ?? self;
            const scouting = target !== null && (self === null || target.toLowerCase() !== self.toLowerCase());
            const { resources } = await context.appConfig.load();
            const mapReport = await context.mapReader.attention(target);

            // Deliveries are public too, so we surface arrived-and-ready ones for whoever we're inspecting.
            let report = mapReport;
            if (target !== null) {
                try {
                    const ready = await context.transport.listReadyToFinalizeForOwner(target);
                    report = withExtraItems(
                        mapReport,
                        ready.map((d) => deliveryItem(d)),
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

            const scope = scouting ? `Scouting ${target}` : 'Attention';
            const header = report.ownerKnown
                ? `${scope}: ${report.counts.critical} critical · ${report.counts.warning} warning · ` +
                  `${report.counts.info} info (map v${report.version}, ${items.length} shown).`
                : 'Attention needs a wallet or an `owner` address — call authenticate or pass owner. Nothing to scope to.';

            return {
                content: [
                    { type: 'text', text: header },
                    {
                        type: 'text',
                        text: JSON.stringify({ ...report, owner: target, scouting, items, resourceNames: resources }),
                    },
                ],
            };
        },
    );
}
