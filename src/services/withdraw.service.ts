import { formatEther, parseEther, type Address } from 'viem';

import { describeApiError } from './reveal.helpers.js';
import { settleSpend } from './settlement.helpers.js';
import type { IAllowanceService, IAppConfig, WithdrawInput, WithdrawResult, WithdrawServiceOptions } from './types.js';
import type { ApiClient } from '../api/client.js';
import {
    HttpStatus,
    type PendingWithdrawResponse,
    type WithdrawRequest,
    type WithdrawSignatureResponse,
} from '../api/types.js';
import { GAME_SETTLEMENT_ABI } from '../contracts/game-settlement.abi.js';
import type { ILogger } from '../logger/types.js';
import { errorMessage } from '../utils/error.utils.js';
import { formatUnixSeconds } from '../utils/format.utils.js';
import type { WalletManager, WalletProvider } from '../wallet/types.js';

export class WithdrawService {
    private readonly api: ApiClient;
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly allowance: IAllowanceService;
    private readonly logger: ILogger;

    constructor(options: WithdrawServiceOptions) {
        this.api = options.api;
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.allowance = options.allowance;
        this.logger = options.logger;
    }

    async withdraw(input: WithdrawInput): Promise<WithdrawResult> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();

        if (config.chainId !== wallet.getChainId()) {
            throw new Error(
                `Chain mismatch: the chain config is chainId ${config.chainId} but the wallet is on ${wallet.getChainId()}. Check NETWORK.`,
            );
        }

        const gameSettlement = config.contracts.gameSettlement;
        const amountWei = parseEther(input.amount);

        // Only one withdraw can be in flight per player, and the sign-time POST already debited the wCPU.
        // So a re-run after an interrupted on-chain mint must finish the existing intent, never re-POST.
        const pending = await this.fetchPending();
        if (pending !== null) {
            return this.resumePending(wallet, gameSettlement, input, amountWei, pending);
        }

        this.logger.info('requesting withdraw signature', {
            tokenId: input.tokenId,
            amount: input.amount,
            network: config.network,
        });
        const response = await this.api.authenticatedRequest<WithdrawSignatureResponse>('/api/v1/cpu/withdraw', {
            method: 'POST',
            body: {
                tokenId: input.tokenId,
                network: config.network,
                amount: input.amount,
            } satisfies WithdrawRequest,
        });

        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Withdraw request failed (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }

        return this.submit(wallet, gameSettlement, response.data, false);
    }

    private async resumePending(
        wallet: WalletManager,
        gameSettlement: Address,
        input: WithdrawInput,
        amountWei: bigint,
        pending: WithdrawSignatureResponse,
    ): Promise<WithdrawResult> {
        // Never silently finish a withdraw the caller didn't ask for — the args must match the live intent.
        if (pending.tokenId !== input.tokenId || BigInt(pending.amount) !== amountWei) {
            throw new Error(
                `A different withdraw is already pending: cell ${pending.tokenId} for ${formatEther(BigInt(pending.amount))} wCPU. ` +
                    `Finish it by re-running withdraw with those args, or wait for it to lapse ` +
                    `(deadline ${formatUnixSeconds(Number(pending.deadline))}).`,
            );
        }

        if (BigInt(pending.deadline) * 1000n <= BigInt(Date.now())) {
            throw new Error(
                `The pending withdraw for cell ${pending.tokenId} expired at ${formatUnixSeconds(Number(pending.deadline))}; ` +
                    `its wCPU is auto-refunded to the cell. Re-run withdraw to start a fresh one.`,
            );
        }

        const used = (await wallet.readContract({
            address: gameSettlement,
            abi: GAME_SETTLEMENT_ABI,
            functionName: 'usedSignIds',
            args: [BigInt(pending.signId)],
        })) as boolean;
        if (used) {
            throw new Error(
                `The withdraw for cell ${pending.tokenId} is already settled on-chain; the $CPU is in your wallet. ` +
                    `Check it with get_balance.`,
            );
        }

        return this.submit(wallet, gameSettlement, pending, true);
    }

    private async submit(
        wallet: WalletManager,
        gameSettlement: Address,
        sig: WithdrawSignatureResponse,
        resumed: boolean,
    ): Promise<WithdrawResult> {
        this.logger.info('submitting withdraw tx', {
            tokenId: sig.tokenId,
            gameSettlement,
            amount: sig.amount,
            resumed,
        });

        let settlement;
        try {
            settlement = await settleSpend({
                wallet,
                allowance: this.allowance,
                gameSettlement,
                // A withdraw mints $CPU rather than spending it — no token to approve.
                cpuToken: null,
                functionName: 'withdrawCpu',
                sig: { ...sig, cpuAmount: sig.amount },
                revertLabel: 'Withdraw transaction',
            });
        } catch (error) {
            throw new Error(
                `Withdraw signed (signId ${sig.signId}, ${formatEther(BigInt(sig.amount))} wCPU debited from cell ` +
                    `${sig.tokenId}) but the on-chain mint did not complete: ${errorMessage(error)}. The signature is ` +
                    `valid until ${formatUnixSeconds(Number(sig.deadline))} — re-run withdraw with the same tokenId and amount to ` +
                    `finish it; your wCPU is held until then.`,
            );
        }

        this.logger.info('withdraw confirmed', {
            tokenId: sig.tokenId,
            txHash: settlement.txHash,
            block: settlement.blockNumber,
        });
        return {
            tokenId: sig.tokenId,
            signId: sig.signId,
            amount: sig.amount,
            txHash: settlement.txHash,
            approveTxHash: settlement.approveTxHash,
            status: settlement.status,
            blockNumber: settlement.blockNumber,
            resumed,
        };
    }

    private async fetchPending(): Promise<WithdrawSignatureResponse | null> {
        const response = await this.api.authenticatedRequest<PendingWithdrawResponse>('/api/v1/cpu/withdraw/pending');
        if (response.status !== HttpStatus.Ok) {
            throw new Error(
                `Failed to check pending withdraw (HTTP ${response.status}): ${describeApiError(response.data)}`,
            );
        }
        return response.data.pending;
    }
}
