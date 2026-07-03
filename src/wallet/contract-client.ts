import type { Hash } from 'viem';

import {
    TxStatus,
    type ConfirmedTx,
    type ContractClientOptions,
    type IContractClient,
    type ReadContractParams,
    type TransactionRequest,
    type WalletProvider,
} from './types.js';
import type { ILogger } from '../logger/types.js';
import { withRetry, type RetryOptions } from '../utils/retry.utils.js';

export class ContractClient implements IContractClient {
    private readonly wallet: WalletProvider;
    private readonly logger: ILogger;
    private readonly retry: Partial<RetryOptions>;

    constructor(options: ContractClientOptions) {
        this.wallet = options.wallet;
        this.logger = options.logger;
        this.retry = options.retry ?? {};
    }

    async read<T>(params: ReadContractParams): Promise<T> {
        return withRetry(async () => (await this.wallet.get().readContract(params)) as T, {
            ...this.retry,
            logger: this.logger,
            label: `read ${params.functionName}`,
        });
    }

    async send(tx: TransactionRequest): Promise<Hash> {
        return this.wallet.get().sendTransaction(tx);
    }

    async confirm(hash: Hash, revertLabel: string): Promise<ConfirmedTx> {
        const receipt = await withRetry(() => this.wallet.get().waitForReceipt(hash), {
            ...this.retry,
            logger: this.logger,
            label: 'waitForReceipt',
        });
        if (receipt.status === TxStatus.Reverted) {
            throw new Error(`${revertLabel} reverted on-chain (tx ${hash}).`);
        }
        return {
            txHash: receipt.transactionHash,
            status: receipt.status,
            blockNumber: receipt.blockNumber.toString(),
        };
    }
}
