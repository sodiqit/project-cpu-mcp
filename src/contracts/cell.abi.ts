export const CELL_ABI = [
    {
        type: 'function',
        name: 'requestReveal',
        inputs: [
            { name: 'x', type: 'int256', internalType: 'int256' },
            { name: 'y', type: 'int256', internalType: 'int256' },
        ],
        outputs: [],
        stateMutability: 'payable',
    },
    {
        type: 'function',
        name: 'entropy',
        inputs: [],
        outputs: [{ name: '', type: 'address', internalType: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'function',
        name: 'entropyProvider',
        inputs: [],
        outputs: [{ name: '', type: 'address', internalType: 'address' }],
        stateMutability: 'view',
    },
    {
        type: 'event',
        name: 'RevealRequested',
        inputs: [
            { name: 'tokenId', type: 'uint256', indexed: true, internalType: 'uint256' },
            { name: 'sequenceNumber', type: 'uint64', indexed: false, internalType: 'uint64' },
            { name: 'isGenesis', type: 'bool', indexed: false, internalType: 'bool' },
            { name: 'revealCount', type: 'uint32', indexed: false, internalType: 'uint32' },
        ],
        anonymous: false,
    },
] as const;
