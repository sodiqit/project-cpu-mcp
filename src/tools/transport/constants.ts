export const TRANSPORT_DESCRIPTION = [
    'Move a resource between cells along a waypoint chain of tokenIds, on-chain (needs a session —',
    '`cpu_authenticate` first). One atomic move: debits the source, pays the $CPU transit fee for every foreign',
    'Hub on the route (auto-approved once) plus gas, and escrows a time-delayed delivery. Every waypoint must be',
    'revealed and yours-or-a-Hub; each hop must be within radius(from)+radius(to) grid steps. Recommended flow:',
    '`cpu_next_hops` (scout waypoints) → chain them yourself → `cpu_quote_transport` (verify fee/ETA) →',
    '`cpu_transport`. Returns the',
    'deliveryId and arrival time; the goods credit to the target only after arrival, when you call',
    '`cpu_finalize_delivery` (`cpu_list_my_transports` shows what is ready). A route over only your own cells',
    'pays no fee.',
].join(' ');

export const ROUTE_NETWORK_DESCRIPTION = [
    'The road map of the world (read-only): every legal waypoint — your revealed cells and all Hubs — as graph',
    'nodes (owner, hub flag, per-unit transit fee, pos, connected-component id) plus every hop the contract',
    'would accept as edges (pairs within radius(a)+radius(b) grid steps, with distances). Pass from/towards to',
    'annotate each node with grid distance from the source and to the destination (a potential field to reason',
    'over). Different component ids = a gap no chain can cross today — bridging it (build a Hub, buy land) is a',
    'strategic decision. Routing over this map is YOUR job: pick the chain, then verify with',
    'cpu_quote_transport. Use cpu_next_hops to zoom into one cell.',
].join(' ');

export const NEXT_HOPS_DESCRIPTION = [
    'Survey the legal next waypoints from a cell (read-only). Lists every eligible waypoint — your revealed cells',
    'and all Hubs — within one hop under the on-chain reach rule (hop ≤ radius(from)+radius(to) grid steps; a',
    'plain cell reaches moveRadius, a Hub hubRadius), with facts per candidate: hop distance, owner, hub flag,',
    'its per-unit transit fee, and — when `towards` is given — the remaining grid distance to the target',
    '(a compass, not a route). Planning is YOUR job: pick each hop yourself (cheap vs short vs whose hub you',
    'trust), chain them into `path`, and verify with cpu_quote_transport. An empty list means the route ends',
    'here — build a Hub to bridge the gap or approach from other cells.',
].join(' ');
