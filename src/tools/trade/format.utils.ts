import type { EnrichedMarketSummary } from './types.js';
import type { LotView } from '../../api/types.js';
import type {
    BuyLotResult,
    CancelLotResult,
    CreateLotResult,
    SetSaleFeeResult,
    TradeQuote,
} from '../../services/types.js';
import { formatUnixSeconds, resourceLabel, type ResourceNames } from '../../utils/format.utils.js';

/** Human header for a confirmed `create_lot`. */
export function summarizeCreateLot(result: CreateLotResult, resources: ResourceNames): string {
    const approve = result.approveTxHash !== null ? `approve tx ${result.approveTxHash}, ` : '';
    return (
        `Listed lot ${result.lotId}: ${result.value} ${resourceLabel(resources, result.resourceId)} @ ` +
        `${result.pricePerUnit} $CPU/u at Hub ${result.hubTokenId} (sale-fee tolerance ${result.maxSaleFeePercent}% ` +
        `locked in — the hub settles its live rate on each sale, but if it ever rises above your tolerance the lot ` +
        `freezes and buys revert until the hub lowers it; cancel_lot is always fee-free and returns the escrow). ` +
        `Escrow shipping to the Hub (delivery ${result.deliveryId}, ETA ${formatUnixSeconds(result.arrivalAt)}); the ` +
        `lot opens once it arrives — run finalize_delivery on ${result.deliveryId} after the ETA (or wait). Transit ` +
        `fee ${result.fee} $CPU. ${approve}create tx ${result.txHash} in block ${result.blockNumber}.`
    );
}

/** Human header for a confirmed `set_sale_fee`. */
export function summarizeSetSaleFee(result: SetSaleFeeResult, resources: ResourceNames): string {
    const free = result.feePercent === 0 ? ' (listed free)' : '';
    return (
        `Set the sale fee for ${resourceLabel(resources, result.resourceId)} on Hub ${result.hubTokenId} to ` +
        `${result.feePercent}%${free}. It is now the live rate every open lot of this resource settles at on its ` +
        `next sale — a lot whose seller tolerance you exceed freezes until you lower the rate back down. ` +
        `tx ${result.txHash} in block ${result.blockNumber}.`
    );
}

/** Human header for a confirmed `buy_lot`. */
export function summarizeBuyLot(result: BuyLotResult, resources: ResourceNames): string {
    const approvals = [
        result.approveSaleTxHash !== null ? `sale approve ${result.approveSaleTxHash}` : null,
        result.approveTransitTxHash !== null ? `transit approve ${result.approveTransitTxHash}` : null,
    ].filter((v): v is string => v !== null);
    const approve = approvals.length > 0 ? `${approvals.join(', ')}, ` : '';
    return (
        `Bought ${result.value} ${resourceLabel(resources, result.resourceId)} from lot ${result.lotId} for ` +
        `${result.sale} $CPU (+ ${result.fee} transit) — of the sale, ${result.hubFee} went to the hub owner and ` +
        `${result.burn} was burned. ${result.remaining} units remain on the lot. Goods shipping to your cell ` +
        `(delivery ${result.deliveryId}, ETA ${formatUnixSeconds(result.arrivalAt)}) — run finalize_delivery on ` +
        `${result.deliveryId} after the ETA. ${approve}buy tx ${result.txHash} in block ${result.blockNumber}.`
    );
}

/** Human header for a confirmed `cancel_lot`. */
export function summarizeCancelLot(result: CancelLotResult, resources: ResourceNames): string {
    const approve = result.approveTxHash !== null ? `approve tx ${result.approveTxHash}, ` : '';
    return (
        `Cancelled lot ${result.lotId}: ${result.returned} ${resourceLabel(resources, result.resourceId)} ` +
        `returning to you (delivery ${result.deliveryId}, ETA ${formatUnixSeconds(result.arrivalAt)}) — run ` +
        `finalize_delivery on ${result.deliveryId} after the ETA to reclaim them. Transit fee ` +
        `${result.fee} $CPU. ${approve}cancel tx ${result.txHash} in block ${result.blockNumber}.`
    );
}

export function summarizeMarkets(markets: Array<EnrichedMarketSummary>, resources: ResourceNames): string {
    if (markets.length === 0) {
        return 'No markets match.';
    }
    return markets
        .map((m) => {
            const price = m.minPricePerUnit !== null ? `from ${m.minPricePerUnit} $CPU/u` : 'no open lots';
            const fee = m.liveSaleFeePercent !== null ? `, sale fee ${m.liveSaleFeePercent}%` : '';
            const incoming = m.incomingLots > 0 ? `, ${m.incomingLots} incoming (${m.incomingRemaining})` : '';
            const frozen =
                m.frozenLots !== null && m.frozenLots > 0 ? `, ${m.frozenLots} frozen (${m.frozenRemaining})` : '';
            const where = m.distanceFromAnchor !== null ? `, ${m.distanceFromAnchor} grid steps away` : '';
            return (
                `Hub ${m.hubTokenId} · ${resourceLabel(resources, m.resourceId)}: ` +
                `${m.openLots} open (${m.openRemaining} units) ${price}${fee}${incoming}${frozen}${where}`
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
    const line = summarizeLotLine(lot, resources);
    if (!lot.frozen) {
        return line;
    }
    return (
        `${line}\nFrozen: the hub's live sale fee (${lot.saleFeePercent}%) exceeds your tolerance ` +
        `(${lot.maxSaleFeePercent}%), so every buy reverts until the hub owner lowers the rate to your tolerance ` +
        `or below — or you cancel the lot (fee-free, the escrow returns to you).`
    );
}

function summarizeLotLine(lot: LotView, resources: ResourceNames): string {
    const dist = lot.distanceFromAnchor !== null ? `, ${lot.distanceFromAnchor} grid steps away` : '';
    const frozen = lot.frozen ? ` · FROZEN (live ${lot.saleFeePercent}% > tolerance ${lot.maxSaleFeePercent}%)` : '';
    return (
        `lot ${lot.id} [${lot.state}] · ${resourceLabel(resources, lot.resourceId)} · ${lot.remaining}/${lot.listed} ` +
        `left @ ${lot.pricePerUnit} $CPU/u (sale fee ${lot.saleFeePercent}%)${frozen} · Hub ${lot.hubTokenId}${dist} · ` +
        `seller ${lot.sellerAddress}`
    );
}

export function summarizeQuoteBuy(quote: TradeQuote, resources: ResourceNames): string {
    const goods = `${quote.value} ${resourceLabel(resources, quote.resourceId)} @ ${quote.pricePerUnit} $CPU/u`;
    const frozen = quote.frozen
        ? ` FROZEN: the hub's live sale fee (${quote.saleFeePercent}%) exceeds the seller tolerance ` +
          `(${quote.maxSaleFeePercent}%), so buy_lot reverts on-chain until the hub lowers the rate — or the seller ` +
          `cancels (fee-free). The estimate above is what you would pay if it clears.`
        : '';
    if (!quote.routed) {
        return (
            `Seller-only estimate for lot ${quote.lotId}: ${goods} = ${quote.sale} $CPU (transit ` +
            `excluded — pass a chain for the exact total). ${quote.remaining} units remain.${frozen}`
        );
    }
    const hops = quote.totalDistance !== null ? `, ${quote.totalDistance} hops` : '';
    const eta = quote.arrivalAt !== null ? ` ~ETA ${formatUnixSeconds(quote.arrivalAt)}` : '';
    return (
        `Buy quote for lot ${quote.lotId}: ${goods} = ${quote.sale} $CPU + ` +
        `${quote.transitFee ?? '0'} transit = ${quote.total} $CPU total${hops}${eta}. ` +
        `${quote.remaining} units remain. Commit with buy_lot.${frozen}`
    );
}
