import { isAddress, type Address } from 'viem';

import { describeApiError } from './reveal.helpers.js';
import { settleSpend } from './settlement.helpers.js';
import {
    type CraftInput,
    type CraftResult,
    CraftResultKind,
    type CraftServiceOptions,
    type IAllowanceService,
    type IAppConfig,
    type PaidCraftResult,
} from './types.js';
import type { ApiClient } from '../api/client.js';
import {
    type ClaimCraftResponse,
    type CraftProcessStatusResponse,
    HttpStatus,
    type PaidCraftSignatureResponse,
    type StartCraftRequest,
    type StartCraftResponse,
} from '../api/types.js';
import type { ILogger } from '../logger/types.js';
import { errorMessage } from '../utils/error.utils.js';
import type { WalletManager, WalletProvider } from '../wallet/types.js';

/**
 * Crafting refines/forges resources on a cell. Free recipes start the timer immediately; the paid
 * forge escrows inputs and returns a `spendCpu` signature settled exactly like build. A craft
 * signature cannot be re-fetched, so the paid path submits atomically — a failed payment leaves a
 * pending escrow that is auto-refunded shortly after the signature deadline, with no resume.
 */
export class CraftService {
    private readonly api: ApiClient;
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly allowance: IAllowanceService;
    private readonly logger: ILogger;

    constructor(options: CraftServiceOptions) {
        this.api = options.api;
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.allowance = options.allowance;
        this.logger = options.logger;
    }

    async craft(input: CraftInput): Promise<CraftResult> {
        const config = await this.appConfig.load();

        this.logger.info('starting craft', {
            tokenId: input.tokenId,
            recipeId: input.recipeId,
            batches: input.batches,
        });
        const response = await this.api.authenticatedRequest<StartCraftResponse | PaidCraftSignatureResponse>(
            `/api/v1/craft/${input.tokenId}/start`,
            {
                method: 'POST',
                body: {
                    recipeId: input.recipeId,
                    batches: input.batches,
                    network: config.network,
                } satisfies StartCraftRequest,
            },
        );

        if (response.status !== HttpStatus.Ok) {
            if (response.status === HttpStatus.Conflict) {
                throw new Error(
                    `Craft rejected (HTTP 409): ${describeApiError(response.data)}. A prior paid craft on cell ` +
                        `${input.tokenId} is still escrowed awaiting payment — it is auto-refunded shortly after ` +
                        `its signature deadline; retry then.`,
                );
            }
            throw new Error(`Craft request failed (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }

        if (!('signId' in response.data)) {
            const free = response.data;
            this.logger.info('free craft started', { tokenId: input.tokenId, uuid: free.uuid });
            return {
                kind: CraftResultKind.Free,
                uuid: free.uuid,
                tokenId: free.tokenId,
                recipeId: free.recipeId,
                batches: free.batches,
                startAt: free.startAt,
                endsAt: free.endsAt,
                debitedInputs: free.debitedInputs,
            };
        }

        const sig = response.data;
        const wallet = this.wallet.get();

        if (config.chainId !== wallet.getChainId()) {
            throw new Error(
                `Chain mismatch: the chain config is chainId ${config.chainId} but the wallet is on ${wallet.getChainId()}. Check NETWORK.`,
            );
        }
        const cpuToken = config.contracts.cpuToken;
        if (!isAddress(cpuToken, { strict: false })) {
            throw new Error(`$CPU token is not configured for network ${config.network}; cannot pay for craft.`);
        }

        try {
            return await this.submit(wallet, config.contracts.gameSettlement, cpuToken, input, sig);
        } catch (error) {
            throw new Error(
                `Craft signature issued (signId ${sig.signId}) but the on-chain payment did not complete: ` +
                    `${errorMessage(error)}. The inputs stay escrowed on cell ${input.tokenId} past the signature ` +
                    `deadline ${sig.deadline} (unix seconds), then they are auto-refunded — retry the craft after ` +
                    `that.`,
            );
        }
    }

    private async submit(
        wallet: WalletManager,
        gameSettlement: Address,
        cpuToken: Address,
        input: CraftInput,
        sig: PaidCraftSignatureResponse,
    ): Promise<PaidCraftResult> {
        this.logger.info('submitting craft tx', { tokenId: input.tokenId, gameSettlement, cpuAmount: sig.cpuAmount });
        const settlement = await settleSpend({
            wallet,
            allowance: this.allowance,
            gameSettlement,
            cpuToken,
            functionName: 'spendCpu',
            sig,
            revertLabel: 'Craft transaction',
        });

        this.logger.info('craft payment confirmed', {
            tokenId: input.tokenId,
            txHash: settlement.txHash,
            signId: sig.signId,
        });
        return {
            kind: CraftResultKind.Paid,
            uuid: sig.uuid,
            signId: sig.signId,
            tokenId: sig.tokenId,
            recipeId: sig.recipeId,
            batches: sig.batches,
            cpuAmount: sig.cpuAmount,
            debitedInputs: sig.debitedInputs,
            ...settlement,
        };
    }

    /** Public read — server-computed progress for every craft process on a cell. */
    async getStatus(tokenId: string): Promise<Array<CraftProcessStatusResponse>> {
        const response = await this.api.request<Array<CraftProcessStatusResponse>>(`/api/v1/craft/${tokenId}`);
        if (response.status !== HttpStatus.Ok) {
            throw new Error(
                `Failed to get craft status for cell ${tokenId} (HTTP ${response.status}): ${describeApiError(response.data)}`,
            );
        }
        return response.data;
    }

    /** Owner-only claim-all — banks every matured batch on the cell into its resource balance. */
    async claim(tokenId: string): Promise<ClaimCraftResponse> {
        this.logger.info('claiming craft outputs', { tokenId });
        const response = await this.api.authenticatedRequest<ClaimCraftResponse>(`/api/v1/craft/${tokenId}/claim`, {
            method: 'POST',
            body: null,
        });
        if (response.status !== HttpStatus.Ok) {
            throw new Error(
                `Craft claim failed for cell ${tokenId} (HTTP ${response.status}): ${describeApiError(response.data)}`,
            );
        }
        return response.data;
    }
}
