import type { LotView, MarketResourceSummary, TradeQuoteResponse } from '../../api/types.js';
import { type LotResult, LotResultKind } from '../../services/types.js';
import { cpuFromWei, formatUnixSeconds, resourceLabel, type ResourceNames } from '../../utils/format.utils.js';

/** Human header for a completed create / buy / cancel (free or paid). */
export function summarizeLotResult(result: LotResult): string {
    if (result.kind === LotResultKind.Free) {
        return (
            `Free ${result.action} on lot ${result.lotId}: now ${result.state} (ETA ${formatUnixSeconds(result.arrivalAt)}). ` +
            `Track with get_lot ${result.lotId} / list_my_lots.`
        );
    }
    const approve = result.approveTxHash !== null ? `approve tx ${result.approveTxHash}, ` : '';
    return (
        `Paid ${result.action} on lot ${result.lotId}: ${cpuFromWei(result.totalAmount)} $CPU ` +
        `(burn ${cpuFromWei(result.burnAmount)}). ${approve}${result.action} tx ${result.txHash} confirmed in block ` +
        `${result.blockNumber}. Lot is now ${result.state}. Track with get_lot ${result.lotId} / list_my_lots.`
    );
}

export function summarizeMarkets(markets: Array<MarketResourceSummary>, resources: ResourceNames): string {
    if (markets.length === 0) {
        return 'No markets match.';
    }
    return markets
        .map((m) => {
            const price = m.minPricePerUnit !== null ? `from ${m.minPricePerUnit} $CPU/u` : 'no open lots';
            const incoming = m.incomingLots > 0 ? `, ${m.incomingLots} incoming (${m.incomingRemaining})` : '';
            const where = m.distanceFromCenter !== null ? `, ${m.distanceFromCenter} hops away` : '';
            return (
                `Hub ${m.hubTokenId} @(${m.hubX},${m.hubY}) · ${resourceLabel(resources, m.resourceId)}: ` +
                `${m.openLots} open (${m.openRemaining} units) ${price}${incoming}${where}`
            );
        })
        .join('\n');
}

export function summarizeLots(lots: Array<LotView>, resources: ResourceNames): string {
    if (lots.length === 0) {
        return 'No lots match.';
    }
    return lots.map((lot) => summarizeLotLine(lot, resources)).join('\n');
}

export function summarizeLot(lot: LotView, resources: ResourceNames): string {
    return summarizeLotLine(lot, resources);
}

function summarizeLotLine(lot: LotView, resources: ResourceNames): string {
    const dist = lot.distanceFromCenter !== null ? `, ${lot.distanceFromCenter} hops away` : '';
    return (
        `lot ${lot.id} [${lot.state}] · ${resourceLabel(resources, lot.resourceId)} · ${lot.remaining}/${lot.listed} ` +
        `left @ ${lot.pricePerUnit} $CPU/u · Hub ${lot.hubTokenId} (${lot.hubX},${lot.hubY})${dist} · ` +
        `seller ${lot.sellerAddress}`
    );
}

export function summarizeQuoteBuy(quote: TradeQuoteResponse, resources: ResourceNames): string {
    const goods = `${quote.value} ${resourceLabel(resources, quote.resourceId)} @ ${quote.pricePerUnit} $CPU/u`;
    if (!quote.routed) {
        return (
            `Seller-only estimate for lot ${quote.lotId}: ${goods} = ${quote.fee.total} $CPU (transit fees ` +
            `excluded — pass a chain for the exact total). ${quote.remaining} units remain.`
        );
    }
    return (
        `Buy quote for lot ${quote.lotId}: ${goods}. Total ${quote.fee.total} $CPU (burn ${quote.fee.burn}, ` +
        `${quote.fee.recipients.length} payee(s)), ${quote.totalDistance} hops ~${quote.totalTimeSec}s. ` +
        `${quote.remaining} units remain. Commit with buy_lot.`
    );
}
