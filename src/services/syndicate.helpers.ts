import type { SyndicateCardView } from './types.js';
import type { ApiSyndicateCard } from '../api/types.js';
import { bpToPercent } from '../utils/format.utils.js';

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

export function buildSyndicateQuery(params: Record<string, string | number | null>): string {
    const pairs: Array<string> = [];
    for (const [key, value] of Object.entries(params)) {
        if (value !== null) {
            pairs.push(`${key}=${encodeURIComponent(String(value))}`);
        }
    }
    return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}
