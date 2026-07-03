export const REVEAL_DESCRIPTION = [
    'Reveal the resource deposits of a Land cell you own. Requires a session — call `authenticate` first.',
    'This submits an on-chain transaction to the Cell contract that requests randomness from Pyth Entropy,',
    'paying the Entropy fee in ETH (the native gas token) — keep some ETH in the wallet. The first reveal of a',
    'cell is free. A re-reveal is allowed only once every deposit on the cell is fully depleted (claimed to',
    'zero) and costs $CPU, which this tool auto-approves once (a one-time unbounded allowance to the Cell)',
    'before revealing. The deposits are drawn asynchronously by an Entropy callback a few seconds later; this',
    'tool waits briefly and reports whether they landed. Read the revealed deposits with `get_cell` once settled.',
].join(' ');
