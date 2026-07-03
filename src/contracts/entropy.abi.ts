export const ENTROPY_ABI = [
    {
        type: 'function',
        name: 'getFeeV2',
        inputs: [
            { name: 'provider', type: 'address', internalType: 'address' },
            { name: 'gasLimit', type: 'uint32', internalType: 'uint32' },
        ],
        outputs: [{ name: 'feeAmount', type: 'uint128', internalType: 'uint128' }],
        stateMutability: 'view',
    },
] as const;
