import { isAddress } from 'viem';

import type { AppConfig, AppConfigServiceOptions, IAppConfig } from './types.js';
import type { ApiClient } from '../api/client.js';
import { type AppConfigResponse, HttpStatus } from '../api/types.js';
import type { Network } from '../config/types.js';
import type { ILogger } from '../logger/types.js';

export class AppConfigService implements IAppConfig {
    private readonly api: ApiClient;
    private readonly network: Network;
    private readonly logger: ILogger;
    private cached: AppConfig | null = null;

    constructor(options: AppConfigServiceOptions) {
        this.api = options.api;
        this.network = options.network;
        this.logger = options.logger;
    }

    async load(): Promise<AppConfig> {
        if (this.cached !== null) {
            return this.cached;
        }

        this.logger.info('loading chain config', { network: this.network });
        const { status, data } = await this.api.request<AppConfigResponse>(`/api/v1/config?network=${this.network}`);

        if (status !== HttpStatus.Ok) {
            throw new Error(`Failed to load chain config (HTTP ${status}) for network ${this.network}.`);
        }

        // The config ships empty addresses until contracts are deployed — fail loud rather than send a
        // transaction into the void. `strict: false` validates shape only (addresses may be un-checksummed).
        if (!isAddress(data.contracts.gameSettlement, { strict: false })) {
            throw new Error(`GameSettlement contract is not configured for network ${this.network}.`);
        }

        const config: AppConfig = {
            network: this.network,
            chainId: data.chainId,
            // `gameSettlement` is narrowed to `Address` by the isAddress guard above.
            contracts: {
                land: data.contracts.land,
                cpuToken: data.contracts.cpuToken,
                gameSettlement: data.contracts.gameSettlement,
                cpuHook: data.contracts.cpuHook,
                cell: data.contracts.cell,
                cellLens: data.contracts.cellLens,
                transport: data.contracts.transport,
            },
            resources: data.resources ?? {},
            recipes: data.recipes ?? [],
            buildings: data.buildings ?? [],
            reveal: data.reveal ?? { firstFree: true, reRevealCost: '0' },
        };
        this.cached = config;
        this.logger.info('chain config loaded', {
            chainId: config.chainId,
            gameSettlement: config.contracts.gameSettlement,
        });
        return config;
    }
}
