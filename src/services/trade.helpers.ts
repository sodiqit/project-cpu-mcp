import type { LotView, MarketResourceSummary } from '../api/types.js';
import { cpuFromWei } from '../utils/format.utils.js';

export function withDecimalPrice(lot: LotView): LotView {
    return { ...lot, pricePerUnit: cpuFromWei(lot.pricePerUnit) };
}

export function withDecimalMinPrice(row: MarketResourceSummary): MarketResourceSummary {
    return { ...row, minPricePerUnit: row.minPricePerUnit === null ? null : cpuFromWei(row.minPricePerUnit) };
}
