import { isAddress, type Address } from 'viem';

import { describeApiError } from './reveal.helpers.js';
import { settleSpend } from './settlement.helpers.js';
import type { BuildInput, BuildResult, BuildServiceOptions, IAllowanceService, IAppConfig } from './types.js';
import type { ApiClient } from '../api/client.js';
import { type BuildRequest, type BuildSignatureResponse, HttpStatus } from '../api/types.js';
import type { ILogger } from '../logger/types.js';
import { errorMessage } from '../utils/error.utils.js';
import type { WalletManager, WalletProvider } from '../wallet/types.js';

export class BuildService {
    private readonly api: ApiClient;
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly allowance: IAllowanceService;
    private readonly logger: ILogger;

    constructor(options: BuildServiceOptions) {
        this.api = options.api;
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.allowance = options.allowance;
        this.logger = options.logger;
    }

    async build(input: BuildInput): Promise<BuildResult> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();

        if (config.chainId !== wallet.getChainId()) {
            throw new Error(
                `Chain mismatch: the chain config is chainId ${config.chainId} but the wallet is on ${wallet.getChainId()}. Check NETWORK.`,
            );
        }

        const gameSettlement = config.contracts.gameSettlement;
        // Build is always paid; refuse before reserving the intent if there's no $CPU token to pay with.
        const cpuToken = config.contracts.cpuToken;
        if (!isAddress(cpuToken, { strict: false })) {
            throw new Error(`$CPU token is not configured for network ${config.network}; cannot pay for build.`);
        }

        this.logger.info('requesting build signature', {
            tokenId: input.tokenId,
            buildingType: input.buildingType,
            targetResourceId: input.targetResourceId,
            network: config.network,
        });
        const response = await this.api.authenticatedRequest<BuildSignatureResponse>('/api/v1/build', {
            method: 'POST',
            body: {
                tokenId: input.tokenId,
                network: config.network,
                buildingType: input.buildingType,
                targetResourceId: input.targetResourceId,
            } satisfies BuildRequest,
        });

        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Build request failed (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }

        const sig = response.data;

        // The signed POST already reserved the build intent; if the on-chain payment now fails the intent
        // dangles until its deadline. The POST is idempotent per cell, so re-running `build` reissues the
        // same signature — surface that so the agent can simply retry.
        try {
            return await this.submit(wallet, gameSettlement, cpuToken, input, sig);
        } catch (error) {
            throw new Error(
                `Build signature issued (signId ${sig.signId}) but the on-chain payment did not complete: ` +
                    `${errorMessage(error)}. The signature is valid until ${sig.deadline} (unix seconds) — re-run ` +
                    `build with the same arguments to retry (the server reissues the same signature).`,
            );
        }
    }

    private async submit(
        wallet: WalletManager,
        gameSettlement: Address,
        cpuToken: Address,
        input: BuildInput,
        sig: BuildSignatureResponse,
    ): Promise<BuildResult> {
        this.logger.info('submitting build tx', { tokenId: input.tokenId, gameSettlement, cpuAmount: sig.cpuAmount });
        const settlement = await settleSpend({
            wallet,
            allowance: this.allowance,
            gameSettlement,
            cpuToken,
            functionName: 'spendCpu',
            sig,
            revertLabel: 'Build transaction',
        });

        this.logger.info('build confirmed', {
            tokenId: input.tokenId,
            txHash: settlement.txHash,
            block: settlement.blockNumber,
        });
        return {
            tokenId: input.tokenId,
            signId: sig.signId,
            buildingType: input.buildingType,
            targetResourceId: input.targetResourceId,
            cpuAmount: sig.cpuAmount,
            ...settlement,
        };
    }
}
