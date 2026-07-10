import type { DeliveryView, TransportQuote, TransportResult } from '../../services/types.js';
import { formatUnixSeconds, resourceLabel, type ResourceNames } from '../../utils/format.utils.js';

export function summarizeQuote(quote: TransportQuote): string {
    const fee = quote.fee === '0' ? 'free (no transit fee)' : `${quote.fee} $CPU fee`;
    return `Route — ${fee}, ${quote.totalDistance} hops, arrival ${formatUnixSeconds(quote.arrivalAt)}. Commit it with transport.`;
}

export function summarizeTransport(r: TransportResult, resources: ResourceNames): string {
    const approve = r.approveTxHash !== null ? `approve tx ${r.approveTxHash}, ` : '';
    const fee = r.fee === '0' ? 'no $CPU fee' : `${r.fee} $CPU fee`;
    return (
        `Transport delivery ${r.deliveryId}: ${r.amount} ${resourceLabel(resources, r.resourceId)} from cell ` +
        `${r.sourceTokenId} → ${r.targetTokenId}, ${fee}. ${approve}move tx ${r.txHash} confirmed in block ` +
        `${r.blockNumber}. Arrives ${formatUnixSeconds(r.arrivalAt)} — after that, finalize_delivery ${r.deliveryId}.`
    );
}

export function summarizeDelivery(d: DeliveryView, resources: ResourceNames): string {
    const state = d.delivered ? 'delivered' : d.readyToFinalize ? 'ready to finalize' : 'in transit';
    const eta = d.arrivalAt !== null ? ` · arrival ${formatUnixSeconds(d.arrivalAt)}` : '';
    return (
        `Delivery ${d.deliveryId}: ${state} · ${d.amount} ${resourceLabel(resources, d.resourceId)} ` +
        `${d.sourceTokenId ?? '—'}→${d.targetTokenId}${eta}`
    );
}

export function summarizeDeliveries(deliveries: Array<DeliveryView>, resources: ResourceNames): string {
    if (deliveries.length === 0) {
        return 'You have no deliveries.';
    }
    return deliveries.map((d) => summarizeDelivery(d, resources)).join('\n');
}
