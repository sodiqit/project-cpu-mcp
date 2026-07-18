export const QUOTE_BUY_DESCRIPTION = [
    'Preview the cost of buying from a lot — read-only, reserves nothing, sends no tx (needs a session). Pass',
    '`chain` = [hub, ...waypoints, your destination cell] for the exact total `cpu_buy_lot` would charge; omit it',
    'for a seller-only estimate (pricePerUnit × value). Returns decimal $CPU: `sale` (value × pricePerUnit, exact)',
    '+ `transitFee`, summed as `total`. The sale split (the hub sale fee + the burn) comes out of the seller',
    'proceeds, not on top — as a buyer you pay exactly `sale` for the goods, so it does not change your total.',
    '`cpu_buy_lot` re-quotes transit on-chain, so that part can move slightly and it authorizes ~10% over as',
    'headroom (a ceiling, not an extra charge). Flags a `frozen` lot (live sale fee above the seller tolerance),',
    'whose buy would revert on-chain — this is a warning, not a refusal. Use before `cpu_buy_lot`.',
].join(' ');
