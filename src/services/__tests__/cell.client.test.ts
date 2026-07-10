import { type Abi, decodeFunctionData, zeroAddress, type Address, type Hash } from 'viem';
import { describe, expect, it } from 'vitest';

import { CELL_ABI } from '../../contracts/cell.abi.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import type { ConfirmedTx, IContractClient, ReadContractParams, TransactionRequest } from '../../wallet/types.js';
import { CellClient } from '../cell.client.js';

const CELL = '0x1111111111111111111111111111111111111111' as Address;
const ENTROPY = '0x2222222222222222222222222222222222222222' as Address;
const PROVIDER = '0x3333333333333333333333333333333333333333' as Address;
const SENT = `0x${'f'.repeat(64)}` as Hash;

class FakeContracts implements IContractClient {
    public readonly sent: Array<TransactionRequest> = [];
    constructor(private readonly reads: Record<string, unknown>) {}
    async read<T>(params: ReadContractParams): Promise<T> {
        return this.reads[params.functionName] as T;
    }
    async send(tx: TransactionRequest, _errorAbi: Abi | null): Promise<Hash> {
        this.sent.push(tx);
        return SENT;
    }
    async confirm(): Promise<ConfirmedTx> {
        throw new Error('unused');
    }
}

function makeClient(reads: Record<string, unknown>): { client: CellClient; contracts: FakeContracts } {
    const contracts = new FakeContracts(reads);
    return { client: new CellClient({ contracts, logger: new NoopLogger() }), contracts };
}

describe('CellClient', () => {
    it('quotes the reveal fee via the cell Entropy wiring', async () => {
        const { client } = makeClient({ entropy: ENTROPY, entropyProvider: PROVIDER, getFeeV2: 4_200n });
        expect(await client.quoteRevealFee(CELL)).toBe(4_200n);
    });

    it('throws when the cell is not wired to Entropy', async () => {
        const { client } = makeClient({ entropy: zeroAddress, entropyProvider: PROVIDER, getFeeV2: 0n });
        await expect(client.quoteRevealFee(CELL)).rejects.toThrow(/not wired to Pyth Entropy/i);
    });

    it('encodes requestReveal and sends it with the fee value', async () => {
        const { client, contracts } = makeClient({});
        const hash = await client.requestReveal({ cell: CELL, tokenId: 42n, value: 5n });

        expect(hash).toBe(SENT);
        const tx = contracts.sent[0];
        if (tx === undefined) {
            throw new Error('expected a tx');
        }
        expect(tx.to).toBe(CELL);
        expect(tx.value).toBe(5n);
        const decoded = decodeFunctionData({ abi: CELL_ABI, data: tx.data });
        expect(decoded.functionName).toBe('requestReveal');
        expect(decoded.args).toEqual([42n]);
    });
});
