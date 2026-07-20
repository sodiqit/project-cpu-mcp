import { encodeFunctionData, type Address } from 'viem';

import type {
    ISyndicateRegistryClient,
    JoinRegistryParams,
    LeaveRegistryParams,
    SyndicateRegistryClientOptions,
    SyndicateRegistryConfig,
} from './types.js';
import { SYNDICATE_ABI } from '../contracts/syndicate.abi.js';
import type { ILogger } from '../logger/types.js';
import type { ConfirmedTx, IContractClient } from '../wallet/types.js';

export class SyndicateRegistryClient implements ISyndicateRegistryClient {
    private readonly contracts: IContractClient;
    private readonly logger: ILogger;

    constructor(options: SyndicateRegistryClientOptions) {
        this.contracts = options.contracts;
        this.logger = options.logger;
    }

    async join(params: JoinRegistryParams): Promise<ConfirmedTx> {
        const data = encodeFunctionData({ abi: SYNDICATE_ABI, functionName: 'join', args: [params.id] });
        this.logger.info('joining syndicate', { registry: params.registry, id: params.id.toString() });
        const hash = await this.contracts.send({ to: params.registry, data, value: null }, SYNDICATE_ABI);
        return this.contracts.confirm(hash, 'Join syndicate');
    }

    async leave(params: LeaveRegistryParams): Promise<ConfirmedTx> {
        const data = encodeFunctionData({ abi: SYNDICATE_ABI, functionName: 'leave', args: [] });
        this.logger.info('leaving syndicate', { registry: params.registry });
        const hash = await this.contracts.send({ to: params.registry, data, value: null }, SYNDICATE_ABI);
        return this.contracts.confirm(hash, 'Leave syndicate');
    }

    async getConfig(registry: Address): Promise<SyndicateRegistryConfig> {
        const config = await this.contracts.read<{ exitCooldownSec: bigint }>({
            address: registry,
            abi: SYNDICATE_ABI,
            functionName: 'getConfig',
            args: [],
        });
        return { exitCooldownSec: Number(config.exitCooldownSec) };
    }
}
