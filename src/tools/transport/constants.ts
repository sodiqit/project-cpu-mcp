export const TRANSPORT_DESCRIPTION = [
    'Move a resource between cells along a waypoint chain, on-chain (needs a session — `cpu_authenticate` first).',
    'One atomic move: debits the source, pays the $CPU transit fee for every foreign Hub on the route',
    '(auto-approved once) plus gas, and escrows a time-delayed delivery. Preview fee and ETA with',
    '`cpu_quote_transport`. Returns the deliveryId and arrival time; the goods credit to the target only after',
    'arrival, when you call `cpu_finalize_delivery` (`cpu_list_my_transports` shows what is ready). A route over',
    'only your own cells pays no fee.',
].join(' ');
