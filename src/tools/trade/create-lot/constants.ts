export const CREATE_LOT_DESCRIPTION = [
    'List units of a resource for sale at a Hub, on-chain (needs a session — `cpu_authenticate` first). One atomic',
    'tx: ships the goods from your source cell to the listing Hub (`chain` = [source, ...waypoints, hub]) and opens',
    'a lot at `pricePerUnit` $CPU, plus gas. A route through a foreign Hub costs a $CPU transit fee (auto-approved',
    'once); over only your own cells it is free. The lot is DELIVERING and becomes buyable (OPEN) only after its',
    'escrow arrives — call `cpu_finalize_delivery` on the returned deliveryId (or wait). Returns the lotId; track',
    'with `cpu_list_my_lots` / `cpu_get_lot`.',
].join(' ');
