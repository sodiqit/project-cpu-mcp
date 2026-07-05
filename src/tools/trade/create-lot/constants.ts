export const CREATE_LOT_DESCRIPTION = [
    'List units of a resource for sale at a Hub, on-chain. Requires a session — call `authenticate` first.',
    'One atomic tx: ships the goods from your source cell to the listing Hub (chain = [source, ...waypoints, hub])',
    'and opens a lot at `pricePerUnit` $CPU; you also pay gas. A route through a foreign Hub costs a $CPU transit',
    'fee (auto-approving the $CPU spend once); a route over only your own cells is free. The lot starts DELIVERING',
    'and becomes buyable (OPEN) only after its escrow arrives — after arrivalAt, call `finalize_delivery` on the',
    'returned deliveryId (or wait for someone to). Returns the lotId — track it with `list_my_lots` / `get_lot`.',
].join(' ');
