export const BUILD_DESCRIPTION = [
    'Place a building on a revealed Land cell you own (needs a session — `cpu_authenticate` first). Pick a',
    '`buildingType` from the catalog (`cpu_get_game_config`): an extractor mines a raw deposit, a crafter runs a',
    'recipe, the hub routes transport/trade. Costs $CPU (some buildings also consume refined resources from the',
    "cell's warehouse); the tool auto-approves the $CPU spend once, sends the on-chain place, and waits for",
    'confirmation. Building takes time — it is not usable until it finishes. Once ready, start an extractor with',
    '`cpu_start_mining` or a crafter with `cpu_craft`. A cell holds one building: re-running build on the same',
    'building is a safe no-op; to switch buildings `cpu_demolish` first. Inspect the result with `cpu_get_cell`.',
].join(' ');

export const DEMOLISH_DESCRIPTION = [
    'Remove the building from a Land cell you own, clearing it for a different building. Requires a session —',
    'call `cpu_authenticate` first. The cell must have no active mining or craft process (claim or finish it',
    'first); a `hub` can only be demolished when it is not mid-route or anchoring open trade lots. Deposits and',
    'warehouse balances are preserved. Sends the on-chain demolish and waits for confirmation; the cleared',
    'state appears on the map shortly after.',
].join(' ');
