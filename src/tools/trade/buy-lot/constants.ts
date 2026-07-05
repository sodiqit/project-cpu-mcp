export const BUY_LOT_DESCRIPTION = [
    'Buy units from an OPEN lot, delivered to your own cell, on-chain. Requires a session.',
    'chain = [hub, ...waypoints, your destination cell] (the Hub holding the lot → your revealed cell). One atomic',
    'tx paid in $CPU: the seller price (value × pricePerUnit) plus any foreign-hub transit fee; you also pay gas.',
    'The first buy auto-approves twice — once for the sale (Trade) and once for the transit fee (Transport).',
    'Preview the exact cost first with `quote_buy`. The goods ship to your cell and are credited only after they',
    'arrive and you `finalize_delivery` on the returned deliveryId. Self-buying your own lot is allowed.',
].join(' ');
