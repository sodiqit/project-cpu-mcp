export const GET_MAP_DESCRIPTION = [
    'Read the live game world — a snapshot of the background-synced map (public: you see every player). The world',
    'is a finite sphere of 48,990 cells keyed by tokenId (1..48990); there are no x/y coordinates. Always returns',
    'a `summary` (counts, freshness, `stalledCells`) and, when your wallet is known, a `resourceIndex`',
    '(resourceId → your cells). Cells form a graph: `neighbors` lists the 6 adjacent cells (5 on the 60 cells',
    'next to a pentagon vertex) as owned/other/empty — empty = unminted (mintable). `pos {face,i,j}` is a coarse',
    'orientation hint only; it wraps across face seams, so use neighbors / scope="around" / cpu_plan_route for',
    'real proximity. Each resource carries a `storage` box (used/cap/reserved/stalled, integer units, cap null =',
    'uncapped) — a full box halts that resource’s production; trust the server `stalled` flag. Scopes: `mine`,',
    '`around` (grid radius around aroundTokenId), `cells`, `all`, `summary` (default when no wallet). Units:',
    'version/updated epoch ms, serverTime/startAt unix seconds. Carries `server: { reachable }` — false means',
    'actions will fail. For your owner-scoped to-do list use `cpu_get_attention`.',
].join(' ');
