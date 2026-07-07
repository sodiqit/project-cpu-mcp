export const QUOTE_BUY_DESCRIPTION = [
    'Preview the cost of buying from a lot — read-only, reserves nothing, sends no tx (needs a session). Pass',
    '`chain` = [hub, ...waypoints, your destination cell] for the exact total `cpu_buy_lot` would charge; omit it',
    'for a seller-only estimate (pricePerUnit × value). Returns decimal $CPU: `sale` (value × pricePerUnit, exact)',
    '+ `transitFee`, summed as `total`. `cpu_buy_lot` re-quotes transit on-chain, so that part can move slightly',
    'and it authorizes ~10% over as headroom (a ceiling, not an extra charge). Use before `cpu_buy_lot`.',
].join(' ');
