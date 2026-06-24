import type { TransportQuoteResponse, TransportStatusResponse } from '../../api/types.js';
import type { FreeTransportResult, PaidTransportResult, PendingTransportView } from '../../services/types.js';
import { cpuFromWei, resourceLabel, type ResourceNames } from '../../utils/format.utils.js';

export function summarizeQuote(quote: TransportQuoteResponse): string {
    if (!quote.paid) {
        return `Free route — ${quote.totalDistance} hops, ~${quote.totalTimeSec}s. Commit it with transport.`;
    }
    return (
        `Paid route — fee ${quote.fee.total} $CPU (burn ${quote.fee.burn}), ${quote.fee.recipients.length} hub ` +
        `payout(s), ${quote.totalDistance} hops, ~${quote.totalTimeSec}s. Commit with transport (it auto-approves ` +
        `$CPU and submits the payment).`
    );
}

export function summarizeFree(r: FreeTransportResult, resources: ResourceNames): string {
    return (
        `Free transport ${r.jobId} started: ${r.amount} ${resourceLabel(resources, r.resourceId)} from cell ` +
        `${r.sourceTokenId} → ${r.targetTokenId}, ~${r.totalTimeSec}s (ETA unix ${r.arrivalAt}). ` +
        `Track with get_transport_status ${r.jobId}.`
    );
}

export function summarizePaid(r: PaidTransportResult, resources: ResourceNames): string {
    const approve = r.approveTxHash !== null ? `approve tx ${r.approveTxHash}, ` : '';
    return (
        `Paid transport ${r.jobId}: ${r.amount} ${resourceLabel(resources, r.resourceId)}, ` +
        `${cpuFromWei(r.totalAmount)} $CPU (burn ${cpuFromWei(r.burnAmount)}). ${approve}transport tx ${r.txHash} ` +
        `confirmed in block ${r.blockNumber}. Delivery starts now — track with get_transport_status ${r.jobId}.`
    );
}

export function summarizePending(views: Array<PendingTransportView>, resources: ResourceNames): string {
    if (views.length === 0) {
        return 'No pending paid transports awaiting payment.';
    }
    return views
        .map((v) => {
            const next = v.resumable
                ? `resume_transport ${v.jobId}`
                : 'expired — a background sweep auto-refunds the escrow shortly; wait for it to clear';
            return (
                `job ${v.jobId}: ${v.amount} ${resourceLabel(resources, v.resourceId)}, ` +
                `${cpuFromWei(v.totalAmount)} $CPU, deadline unix ${v.deadline} → ${next}`
            );
        })
        .join('\n');
}

export function summarizeMine(jobs: Array<TransportStatusResponse>, resources: ResourceNames): string {
    if (jobs.length === 0) {
        return 'You have no transports.';
    }
    return jobs
        .map((j) => {
            const where = j.progress.arrived
                ? 'arrived'
                : `@(${j.progress.position.x.toFixed(1)},${j.progress.position.y.toFixed(1)}) ETA unix ${j.arrivalAt}`;
            return (
                `job ${j.id}: ${j.status}, ${j.amount} ${resourceLabel(resources, j.resourceId)} ` +
                `${j.sourceTokenId}→${j.targetTokenId}, ${where}`
            );
        })
        .join('\n');
}
