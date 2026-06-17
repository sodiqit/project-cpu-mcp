export const SWAP_DESCRIPTION = [
    'Swap between native ETH and $CPU on the game token pool (Uniswap v4), in either direction:',
    '`sell: "ETH"` buys $CPU, `sell: "CPU"` sells it for ETH. `amount` is how much of the sold token to spend.',
    'Preview the result first with `quote_swap`. The swap is exact-input: you spend `amount` and receive at',
    'least the quoted output minus `slippageBps`. Selling $CPU auto-approves it (via Permit2) once before the',
    'first swap; the trade is submitted on-chain and this waits for confirmation. A 1% pool fee applies.',
].join(' ');

export const QUOTE_SWAP_DESCRIPTION = [
    'Preview an ETH↔$CPU swap without committing: returns the expected output from the Uniswap v4 Quoter',
    '(already net of the pool fee) and the minimum you would receive after `slippageBps`. It has no side',
    'effects — no approval, no transaction. Use it before `swap` to size the trade.',
].join(' ');
