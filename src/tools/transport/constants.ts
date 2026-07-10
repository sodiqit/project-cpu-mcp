export const TRANSPORT_DESCRIPTION = [
    'Move a resource between cells along a waypoint chain of tokenIds, on-chain (needs a session —',
    '`cpu_authenticate` first). One atomic move: debits the source, pays the $CPU transit fee for every foreign',
    'Hub on the route (auto-approved once) plus gas, and escrows a time-delayed delivery. Every waypoint must be',
    'revealed and yours-or-a-Hub; each hop must be within radius(from)+radius(to) grid steps. Recommended flow:',
    '`cpu_plan_route` (build the chain) → `cpu_quote_transport` (verify fee/ETA) → `cpu_transport`. Returns the',
    'deliveryId and arrival time; the goods credit to the target only after arrival, when you call',
    '`cpu_finalize_delivery` (`cpu_list_my_transports` shows what is ready). A route over only your own cells',
    'pays no fee.',
].join(' ');

export const PLAN_ROUTE_DESCRIPTION = [
    'Plan a valid transport/trade waypoint chain between two cells, locally and deterministically (read-only, no',
    'transaction). Searches the eligible-waypoint graph — your revealed cells plus all Hubs — under the on-chain',
    'hop rule (each hop ≤ radius(from)+radius(to) grid steps; a plain cell reaches moveRadius, a Hub hubRadius)',
    'and returns the cheapest (default) or fastest chain: `waypoints` ready to pass to cpu_transport /',
    'cpu_quote_transport / trade chains, per-leg distances, every foreign Hub with its per-unit fee, the $CPU fee',
    'estimate (when amount is given) and a travel-time estimate. Always verify with cpu_quote_transport — the',
    'chain and fees are enforced on-chain.',
].join(' ');
