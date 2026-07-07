export const GET_MAP_DESCRIPTION = [
    'Read the live game world — a snapshot of the background-synced map (public: you see every player). Always',
    'returns a `summary` (counts, freshness, `stalledCells`) and, when your wallet is known, a `resourceIndex`',
    '(resourceId → your cells). Cells are a graph: axial x/y + `neighbors` (6 adjacent hexes, owned/other/empty).',
    'Each resource carries a `storage` box (used/cap/reserved/stalled, integer units, cap null = uncapped) — a',
    'full box halts that resource’s production; trust the server `stalled` flag. Scopes: `mine`, `around` (hex',
    'radius), `cells`, `all`, `summary` (default when no wallet). Units: version/updated epoch ms,',
    'serverTime/startAt unix seconds. Carries `server: { reachable }` — false means actions will fail. For your',
    'owner-scoped to-do list use `cpu_get_attention`.',
].join(' ');
