import type { RegistryRates, SyndicateCardView, SyndicateRatesView } from './types.js';
import type { ApiSyndicateCard } from '../api/types.js';
import { bpToPercent, percentToBp } from '../utils/format.utils.js';

export function toSyndicateCardView(card: ApiSyndicateCard): SyndicateCardView {
    return {
        id: card.id,
        manager: card.manager,
        name: card.name,
        link: card.link,
        rates: {
            tradeDiscountPercent: bpToPercent(card.rates.tradeDiscountBp),
            transportDiscountPercent: bpToPercent(card.rates.transportDiscountBp),
            tradeTaxPercent: bpToPercent(card.rates.tradeTaxBp),
            transportTaxPercent: bpToPercent(card.rates.transportTaxBp),
        },
        memberCount: card.memberCount,
        createdAt: card.createdAt,
    };
}

export function ratesToRegistry(rates: SyndicateRatesView): RegistryRates {
    return {
        tradeDiscountBp: rateToBp(rates.tradeDiscountPercent, 'trade discount'),
        transportDiscountBp: rateToBp(rates.transportDiscountPercent, 'transport discount'),
        tradeTaxBp: rateToBp(rates.tradeTaxPercent, 'trade tax'),
        transportTaxBp: rateToBp(rates.transportTaxPercent, 'transport tax'),
    };
}

function rateToBp(percent: number, label: string): number {
    if (percent < 0 || percent > 100) {
        throw new Error(`The ${label} rate must be between 0% and 100% (got ${percent}%).`);
    }
    return percentToBp(percent);
}

export function buildSyndicateQuery(params: Record<string, string | number | null>): string {
    const pairs: Array<string> = [];
    for (const [key, value] of Object.entries(params)) {
        if (value !== null) {
            pairs.push(`${key}=${encodeURIComponent(String(value))}`);
        }
    }
    return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}
