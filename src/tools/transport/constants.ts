export const TRANSPORT_DESCRIPTION = [
    'Move a resource between cells along a waypoint chain. Requires a session — call `authenticate` first.',
    'A route over only your own cells is free and starts immediately; a route through a foreign Hub costs $CPU',
    '— this tool then auto-approves the $CPU spend once (a one-time unbounded allowance) and submits the',
    'on-chain payment, waiting for its confirmation. Preview the cost first with `quote_transport`. Returns the',
    'transport jobId — track the shipment with `get_transport_status <jobId>`. If the on-chain payment fails,',
    'the source resource stays escrowed and the action is resumable with `resume_transport <jobId>`. While that',
    'paid shipment is still pending, starting another transport of the same resource from the same cell is',
    'rejected — finish it with `resume_transport`, or wait for the background sweep to refund a lapsed one.',
].join(' ');
