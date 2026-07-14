export const CREATE_LOT_DESCRIPTION = [
    'List units of a resource for sale at a Hub, on-chain (needs a session — `cpu_authenticate` first). One atomic',
    'tx: ships the goods from your source cell to the listing Hub (`chain` = [source, ...waypoints, hub]) and opens',
    'a lot at `pricePerUnit` $CPU, plus gas. A route through a foreign Hub costs a $CPU transit fee (auto-approved',
    "once); over only your own cells it is free. The hub owner's current sale-fee rate is frozen into the lot and",
    'is later carved out of the seller proceeds on every sale (the buyer still pays exactly price × value).',
    'Optionally cap it with `maxSaleFeePercent`; omit it to accept the live rate at listing (read on-chain) — a',
    'last-moment rate raise then reverts the listing instead of freezing a worse rate in. The lot is DELIVERING and',
    'becomes buyable (OPEN) only after its escrow arrives — call `cpu_finalize_delivery` on the returned deliveryId',
    '(or wait). Returns the lotId and the frozen `saleFeePercent`; track with `cpu_list_my_lots` / `cpu_get_lot`.',
].join(' ');
