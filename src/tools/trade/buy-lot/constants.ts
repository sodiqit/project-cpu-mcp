export const BUY_LOT_DESCRIPTION = [
    'Buy units from an OPEN lot, delivered to your own cell, on-chain (needs a session). `chain` = [hub holding the',
    'lot, ...waypoints, your destination cell]. One atomic $CPU tx: seller price (value × pricePerUnit) + any',
    'foreign-hub transit fee, plus gas; the first buy auto-approves the sale exactly and the transit fee with ~10%',
    'headroom (a ceiling for on-chain fee drift, not a double charge). Preview the exact cost with `cpu_quote_buy`.',
    'Goods ship to your cell and credit only after arrival, when you `cpu_finalize_delivery` the returned',
    'deliveryId. Buying your own lot is allowed.',
].join(' ');
