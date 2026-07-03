export const TRANSPORT_DESCRIPTION = [
    'Move a resource between cells along a waypoint chain, on-chain. Requires a session — call `authenticate` first.',
    'One atomic move: it debits the source cell, pays the $CPU transit fee for every foreign Hub on the route',
    '(auto-approving the $CPU spend once, a one-time unbounded allowance), and escrows a time-delayed delivery;',
    'you also pay gas. Preview the fee and ETA first with `quote_transport`. Returns the on-chain deliveryId and',
    'arrival time. The delivery is not credited to the target until it arrives and is finalized — after arrivalAt,',
    'call `finalize_delivery` (`list_my_transports` shows what is ready). A route over only your own cells pays no',
    '$CPU fee (just gas).',
].join(' ');
