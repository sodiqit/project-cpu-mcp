export const CREATE_LOT_DESCRIPTION = [
    'List units of a resource for sale at a Hub. Requires a session — call `authenticate` first.',
    'Transports the goods from your source cell to the listing Hub (chain = [source, ...waypoints, hub]) and',
    'opens a lot at `pricePerUnit` $CPU. A route over only your own cells is free and starts immediately; a',
    'route through a foreign Hub costs $CPU — this tool then auto-approves the $CPU spend once and submits the',
    'on-chain payment. Returns the lotId — track it with `list_my_lots` / `get_lot`. While a prior paid listing',
    'of the same resource from the same cell is still awaiting payment, a new one is rejected — finish or let',
    'the pending one lapse (a lapsed escrow is auto-refunded within ~a minute).',
].join(' ');
