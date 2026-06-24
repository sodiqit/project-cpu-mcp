export const BUY_LOT_DESCRIPTION = [
    'Buy units from an OPEN lot, delivered to your own cell. Requires a session.',
    'chain = [hub, ...waypoints, your destination cell] (the Hub holding the lot → your revealed cell).',
    'Always paid in $CPU (seller price + any foreign-hub transit fees) — auto-approves the spend once and',
    'submits the on-chain payment. NOTE: this reserves the units immediately (no dry-run) — preview the exact',
    'cost first with `quote_buy`. Track delivery with `list_my_transports` / `get_lot`. If you already have a',
    'pending buy on this lot awaiting payment, a new one is rejected — retry once it settles or lapses (a lapsed',
    'one is auto-refunded by a background sweep within ~a minute).',
].join(' ');
