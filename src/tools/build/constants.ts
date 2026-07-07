export const BUILD_DESCRIPTION = [
    'Place a building on a revealed Land cell you own (needs a session — `cpu_authenticate` first). Two types via',
    '`targetResourceId`: `extractor` (pass a resource id with an active deposit on the cell — it then auto-starts',
    'mining, tracked by `cpu_get_mining_status`) or `hub` (trade; pass null). Costs $CPU; the tool auto-approves the',
    'spend once, sends the on-chain place, and waits for confirmation. A cell holds one building: re-running build',
    'on the same building just (re)starts mining, so an interrupted build is safe to retry; to switch buildings',
    '`cpu_demolish` first; to switch an extractor’s resource, deplete the current one (claim to zero) then build',
    'again. Inspect the result with `cpu_get_cell`.',
].join(' ');

export const DEMOLISH_DESCRIPTION = [
    'Remove the building from a Land cell you own, clearing it for a different building. Requires a session —',
    'call `cpu_authenticate` first. The cell must have no active mining or craft process (claim or finish it',
    'first); a `hub` can only be demolished when it is not mid-route or anchoring open trade lots. Deposits and',
    'warehouse balances are preserved. Sends the on-chain demolish and waits for confirmation; the cleared',
    'state appears on the map shortly after.',
].join(' ');
