export const GET_PENDING_TRANSPORTS_DESCRIPTION = [
    'List your paid transports awaiting on-chain payment — actions whose source resource is already escrowed',
    'and whose signature is still held server-side. Each entry shows the $CPU cost, deadline, and whether it is',
    'still resumable. Finish paying a resumable one with `resume_transport <jobId>`. An expired one is refunded',
    'automatically within about a minute of its deadline — just wait for it to clear; starting the same route',
    'again while it is still pending is rejected.',
].join(' ');
