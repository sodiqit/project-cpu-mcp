export const QUOTE_BUY_DESCRIPTION = [
    'Preview the cost of buying from a lot — non-destructive, reserves nothing, sends no transaction. Requires a',
    'session. Pass `chain` = [hub, ...waypoints, your destination cell] for the exact total `buy_lot` would charge',
    '(seller price + transit fee); omit it for a seller-only estimate (pricePerUnit × value). Reads the lot price',
    'and quotes the transit fee on-chain. Use before `buy_lot`.',
].join(' ');
