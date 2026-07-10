export const TRANSPORT_DESCRIPTION = [
    'Move a resource between cells along a waypoint chain of tokenIds, on-chain (needs a session —',
    '`cpu_authenticate` first). One atomic move: debits the source, pays the $CPU transit fee for every foreign',
    'Hub on the route (auto-approved once) plus gas, and escrows a time-delayed delivery. Every waypoint must be',
    'revealed and yours-or-a-Hub; each hop must be within radius(from)+radius(to)−1 grid steps (default balance:',
    'own↔own 1 = adjacent only, own↔hub 3, hub↔hub 5). Recommended flow:',
    '`cpu_next_hops` (scout waypoints) → chain them yourself → `cpu_quote_transport` (verify fee/ETA) →',
    '`cpu_transport`. Returns the',
    'deliveryId and arrival time; the goods credit to the target only after arrival, when you call',
    '`cpu_finalize_delivery` (`cpu_list_my_transports` shows what is ready). A route over only your own cells',
    'pays no fee.',
].join(' ');

export const ROUTE_NETWORK_DESCRIPTION = [
    'The road map of the world (read-only): every legal waypoint — your revealed cells and all Hubs — as graph',
    'nodes (owner, hub flag, per-unit transit fee, pos, connected-component id) plus every hop the contract',
    'would accept as edges (within radius(a)+radius(b)−1 grid steps; default balance: own↔own 1 = adjacent',
    'only, own↔hub 3, hub↔hub 5). Foreign cells are never nodes: even a single foreign cell between two plain',
    'cells is a WALL — only a Hub reaches across. Different component ids show exactly that — no chain crosses',
    'today, goods stop at the border.',
    'Bridging is a strategic decision: a border Hub (it still needs an eligible landing point within reach on',
    'the far side), buying land across, or a detour — the sphere is closed, so a wall must encircle to truly',
    'seal. Pass from/towards to annotate each node with grid distances (a potential field to reason over).',
    'Routing over this map is YOUR job: pick the chain, then verify with cpu_quote_transport. WHEN: the heavy',
    'read — plan a journey or a big replan; for point checks while executing use the cheap cpu_next_hops.',
].join(' ');

export const NEXT_HOPS_DESCRIPTION = [
    'Survey the legal next waypoints from a cell (read-only). Lists every eligible waypoint — your revealed cells',
    'and all Hubs — within one hop under the reach rule: hop ≤ radius(from)+radius(to)−1 grid steps (default',
    'balance: own↔own 1 = adjacent only, own↔hub 3, hub↔hub 5). Foreign cells are never waypoints, so even a',
    'single foreign cell between two plain cells is a WALL — only a Hub reaches across; empty `hops` means',
    'goods can only be hauled up to here. Facts per candidate: hop distance, owner, hub flag, per-unit transit',
    'fee, and — with `towards` —',
    'the remaining grid distance (a compass, not a route). Planning is YOUR job: pick each hop yourself (cheap',
    'vs short vs whose hub you trust), chain them into `path`, and verify with cpu_quote_transport. To break a',
    'wall: build a border Hub (it still needs an eligible landing cell within reach on the far side), buy land',
    'across, or go around. WHEN: the cheap point check — call it right before each leg and after',
    'cpu_get_changes shows movement (hubs get demolished, fees change while goods travel); replan via',
    'cpu_route_network only when a local fix is impossible.',
].join(' ');
