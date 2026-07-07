export const REVEAL_DESCRIPTION = [
    'Reveal the deposits of a cell you own (call `cpu_authenticate` first). Sends an on-chain Cell tx requesting',
    'Pyth Entropy randomness, paying the fee in ETH — keep some ETH. First reveal is free; a re-reveal needs',
    'all deposits depleted and costs $CPU (auto-approved once). Deposits land asynchronously — read with `cpu_get_cell`.',
].join(' ');
