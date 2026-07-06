export const QUOTE_BUY_DESCRIPTION = [
    'Preview the cost of buying from a lot — non-destructive, reserves nothing, sends no transaction. Requires a',
    'session. Pass `chain` = [hub, ...waypoints, your destination cell] for the exact total `buy_lot` would charge',
    '(seller price + transit fee); omit it for a seller-only estimate (pricePerUnit × value). Reads the lot price',
    'and quotes the transit fee on-chain. Amounts are decimal $CPU: `sale` = value × pricePerUnit (exact), plus',
    '`transitFee`, summed as `total` — the expected charge. `buy_lot` re-quotes transit on-chain, so the transit',
    'part can move slightly; it authorizes ~10% over the quoted fee as headroom for that drift — a ceiling, not an',
    'extra charge (the contract debits the real fee). Use before `buy_lot`.',
].join(' ');
