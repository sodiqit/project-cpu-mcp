import { encodeFunctionData, zeroAddress, type Address, type Hash } from 'viem';

import { REVEAL_CALLBACK_GAS } from './cell.constants.js';
import type { CellClientOptions, ICellClient, RequestRevealParams } from './types.js';
import { CELL_ABI } from '../contracts/cell.abi.js';
import { ENTROPY_ABI } from '../contracts/entropy.abi.js';
import type { ILogger } from '../logger/types.js';
import type { IContractClient } from '../wallet/types.js';

export class CellClient implements ICellClient {
    private readonly contracts: IContractClient;
    private readonly logger: ILogger;

    constructor(options: CellClientOptions) {
        this.contracts = options.contracts;
        this.logger = options.logger;
    }

    async quoteRevealFee(cell: Address): Promise<bigint> {
        const [entropy, provider] = await Promise.all([
            this.contracts.read<Address>({ address: cell, abi: CELL_ABI, functionName: 'entropy', args: [] }),
            this.contracts.read<Address>({ address: cell, abi: CELL_ABI, functionName: 'entropyProvider', args: [] }),
        ]);

        if (entropy === zeroAddress || provider === zeroAddress) {
            throw new Error('Cell is not wired to Pyth Entropy on this deployment; reveal is unavailable.');
        }

        const fee = await this.contracts.read<bigint>({
            address: entropy,
            abi: ENTROPY_ABI,
            functionName: 'getFeeV2',
            args: [provider, REVEAL_CALLBACK_GAS],
        });
        this.logger.info('quoted reveal fee', { cell, entropy, provider, feeWei: fee.toString() });
        return fee;
    }

    async requestReveal(params: RequestRevealParams): Promise<Hash> {
        const data = encodeFunctionData({
            abi: CELL_ABI,
            functionName: 'requestReveal',
            args: [params.x, params.y],
        });
        this.logger.info('submitting reveal request', {
            cell: params.cell,
            x: params.x.toString(),
            y: params.y.toString(),
            valueWei: params.value.toString(),
        });
        return this.contracts.send({ to: params.cell, data, value: params.value });
    }
}
