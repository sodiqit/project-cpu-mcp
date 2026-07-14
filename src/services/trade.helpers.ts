import type { ApiLotView, ApiMarketResourceSummary, LotView, MarketResourceSummary } from '../api/types.js';
import { bpToPercent, cpuFromWei } from '../utils/format.utils.js';

export function withDecimalPrice(lot: ApiLotView): LotView {
    return {
        id: lot.id,
        hubTokenId: lot.hubTokenId,
        sellerAddress: lot.sellerAddress,
        resourceId: lot.resourceId,
        listed: lot.listed,
        remaining: lot.remaining,
        pricePerUnit: cpuFromWei(lot.pricePerUnit),
        saleFeePercent: bpToPercent(lot.saleFeeBp),
        state: lot.state,
        distanceFromAnchor: lot.distanceFromAnchor,
        createdAt: lot.createdAt,
        updated: lot.updated,
    };
}

export function withDecimalMinPrice(row: ApiMarketResourceSummary): MarketResourceSummary {
    return {
        hubTokenId: row.hubTokenId,
        resourceId: row.resourceId,
        openLots: row.openLots,
        openRemaining: row.openRemaining,
        minPricePerUnit: row.minPricePerUnit === null ? null : cpuFromWei(row.minPricePerUnit),
        incomingLots: row.incomingLots,
        incomingRemaining: row.incomingRemaining,
        distanceFromAnchor: row.distanceFromAnchor,
    };
}

export function enrichSaleFeeToleranceError(error: unknown): unknown {
    if (error instanceof Error && error.message.includes('SaleFeeExceedsMax')) {
        return new Error(
            `${error.message} — the hub's live sale fee now exceeds your tolerance (maxSaleFeePercent). Re-read ` +
                `the hub's current rate (cpu_get_cell or cpu_get_markets), then retry with a higher ` +
                `maxSaleFeePercent, or omit it to accept the current rate.`,
            { cause: error },
        );
    }
    return error;
}
