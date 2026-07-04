export const BUILD_DESCRIPTION = [
    'Place a building on a revealed Land cell you own. Requires a session — call `authenticate` first.',
    'Two types: `extractor` (mines a resource deposit — pass the `targetResourceId` of a resource that has an',
    'active deposit on the cell) and `hub` (trade — pass `targetResourceId: null`). Build costs $CPU, which this',
    'tool auto-approves once (a one-time unbounded allowance to the Cell contract) before sending the on-chain',
    'place and waiting for its confirmation. An `extractor` then starts mining its target in a second',
    'transaction — track it with `get_mining_status`. The new state appears on the map shortly after; inspect',
    'it with `get_cell`.',
    'A cell holds one building; to change to a different building, `demolish` it first. Re-running build on a',
    'cell that already has the requested building skips the place and just (re)starts mining the target, so an',
    'interrupted build is safe to retry. To switch an extractor to a different resource, deplete the current',
    'one (claim it to zero so the process ends), then run build again with the new `targetResourceId`.',
].join(' ');

export const DEMOLISH_DESCRIPTION = [
    'Remove the building from a Land cell you own, clearing it for a different building. Requires a session —',
    'call `authenticate` first. The cell must have no active mining or craft process (claim or finish it',
    'first); a `hub` can only be demolished when it is not mid-route or anchoring open trade lots. Deposits and',
    'warehouse balances are preserved. Sends the on-chain demolish and waits for confirmation; the cleared',
    'state appears on the map shortly after.',
].join(' ');
