import { isAddress } from 'viem';

import { describeApiError } from './reveal.helpers.js';
import { settleTransit } from './settlement.helpers.js';
import {
    type AppConfig,
    type FreeTransportResult,
    type IAllowanceService,
    type IAppConfig,
    type PaidTransportResult,
    type Payable,
    type PendingTransportView,
    type TransportInput,
    type TransportResult,
    TransportResultKind,
    type TransportServiceOptions,
} from './types.js';
import type { ApiClient } from '../api/client.js';
import {
    HttpStatus,
    type PaidTransportSignatureResponse,
    type TransportJobResponse,
    type TransportQuoteResponse,
    type TransportRequest,
    type TransportStatus,
    type TransportStatusResponse,
} from '../api/types.js';
import { GAME_SETTLEMENT_ABI } from '../contracts/game-settlement.abi.js';
import type { ILogger } from '../logger/types.js';
import { errorMessage } from '../utils/error.utils.js';
import type { WalletManager, WalletProvider } from '../wallet/types.js';

export class TransportService {
    private readonly api: ApiClient;
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly allowance: IAllowanceService;
    private readonly logger: ILogger;

    constructor(options: TransportServiceOptions) {
        this.api = options.api;
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.allowance = options.allowance;
        this.logger = options.logger;
    }

    async transport(input: TransportInput): Promise<TransportResult> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();
        this.assertChain(config.chainId, wallet.getChainId());

        this.logger.info('requesting transport', {
            resourceId: input.resourceId,
            amount: input.amount,
            network: config.network,
        });
        const response = await this.api.authenticatedRequest<TransportJobResponse | PaidTransportSignatureResponse>(
            '/api/v1/transport',
            { method: 'POST', body: { ...input, network: config.network } satisfies TransportRequest },
        );

        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Transport request failed (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }

        const data = response.data;
        if (!('signId' in data)) {
            this.logger.info('free transport started', { jobId: data.id });
            return this.toFreeResult(data);
        }

        // Validate the deterministic preconditions outside the resume-hint wrapper — resume can't fix them.
        const payable = this.validatePayable(config, wallet, data);

        // The paid POST already escrowed the source resource and minted the signature; if the on-chain
        // payment now fails, the action dangles until its deadline. Surface jobId so the agent can resume.
        try {
            return await this.submitPayment(wallet, data, payable);
        } catch (error) {
            throw new Error(
                `Paid transport initiated (job ${data.jobId}) but the on-chain payment did not complete: ` +
                    `${errorMessage(error)}. The source resource is held in escrow and the signature is valid ` +
                    `until ${data.deadline} (unix seconds). Retry with resume_transport ${data.jobId}.`,
            );
        }
    }

    /** Non-destructive price/route preview — no escrow, no transaction. */
    async quote(input: TransportInput): Promise<TransportQuoteResponse> {
        const config = await this.appConfig.load();
        this.logger.info('quoting transport', {
            resourceId: input.resourceId,
            amount: input.amount,
            network: config.network,
        });
        const response = await this.api.authenticatedRequest<TransportQuoteResponse>('/api/v1/transport/quote', {
            method: 'POST',
            body: { ...input, network: config.network } satisfies TransportRequest,
        });
        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Transport quote failed (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }
        return response.data;
    }

    /** Finish paying a pending paid action by jobId — re-submits the existing signature, never re-POSTs. */
    async resume(jobId: number): Promise<PaidTransportResult> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();
        this.assertChain(config.chainId, wallet.getChainId());

        const pending = await this.fetchPending();
        const action = pending.find((a) => a.jobId === jobId);
        if (action === undefined) {
            throw new Error(`No pending paid transport with job ${jobId}. List them with get_pending_transports.`);
        }

        const payable = this.validatePayable(config, wallet, action);

        if (BigInt(action.deadline) * 1000n <= BigInt(Date.now())) {
            throw new Error(
                `Transport job ${jobId} signature expired at ${action.deadline} (unix seconds). Its escrow is ` +
                    `refunded automatically shortly after the deadline — wait for it to clear (track with ` +
                    `get_pending_transports), then start a new transport.`,
            );
        }

        const used = (await wallet.readContract({
            address: payable.gameSettlement,
            abi: GAME_SETTLEMENT_ABI,
            functionName: 'usedSignIds',
            args: [BigInt(action.signId)],
        })) as boolean;
        if (used) {
            throw new Error(
                `Transport job ${jobId} is already paid on-chain; delivery starts shortly. ` +
                    `Track it with get_transport_status ${jobId}.`,
            );
        }

        return this.submitPayment(wallet, action, payable);
    }

    /** The caller's own transports (newest first), optionally filtered by status. */
    async listMine(status: TransportStatus | null): Promise<Array<TransportStatusResponse>> {
        const query = status === null ? '' : `?status=${status}`;
        const response = await this.api.authenticatedRequest<Array<TransportStatusResponse>>(
            `/api/v1/transport/mine${query}`,
        );
        if (response.status !== HttpStatus.Ok) {
            throw new Error(
                `Failed to list your transports (HTTP ${response.status}): ${describeApiError(response.data)}`,
            );
        }
        return response.data;
    }

    /** Public read — a job's route/progress is world state (no auth, works for any jobId). */
    async getStatus(jobId: number): Promise<TransportStatusResponse> {
        const response = await this.api.request<TransportStatusResponse>(`/api/v1/transport/${jobId}`);
        if (response.status !== HttpStatus.Ok) {
            throw new Error(
                `Failed to get transport ${jobId} (HTTP ${response.status}): ${describeApiError(response.data)}`,
            );
        }
        return response.data;
    }

    async getPending(): Promise<Array<PendingTransportView>> {
        const actions = await this.fetchPending();
        const nowMs = Date.now();
        return actions.map((a) => ({
            jobId: a.jobId,
            signId: a.signId,
            sourceTokenId: a.sourceTokenId,
            targetTokenId: a.targetTokenId,
            resourceId: a.resourceId,
            amount: a.amount,
            totalAmount: a.totalAmount,
            deadline: a.deadline,
            resumable: BigInt(a.deadline) * 1000n > BigInt(nowMs),
        }));
    }

    private async fetchPending(): Promise<Array<PaidTransportSignatureResponse>> {
        const response =
            await this.api.authenticatedRequest<Array<PaidTransportSignatureResponse>>('/api/v1/transport/pending');
        if (response.status !== HttpStatus.Ok) {
            throw new Error(
                `Failed to list pending transports (HTTP ${response.status}): ${describeApiError(response.data)}`,
            );
        }
        return response.data;
    }

    private validatePayable(config: AppConfig, wallet: WalletManager, action: PaidTransportSignatureResponse): Payable {
        // The on-chain signature is bound to `sender`; a wallet mismatch would revert as BadSignature.
        if (action.sender.toLowerCase() !== wallet.getAddress().toLowerCase()) {
            throw new Error(
                `Transport signature was issued for ${action.sender} but the wallet is ${wallet.getAddress()}; ` +
                    `cannot pay.`,
            );
        }
        const cpuToken = config.contracts.cpuToken;
        if (!isAddress(cpuToken, { strict: false })) {
            throw new Error(`$CPU token is not configured for network ${config.network}; cannot pay for transport.`);
        }
        return {
            gameSettlement: config.contracts.gameSettlement,
            cpuToken,
            totalAmount: BigInt(action.totalAmount),
        };
    }

    private async submitPayment(
        wallet: WalletManager,
        action: PaidTransportSignatureResponse,
        payable: Payable,
    ): Promise<PaidTransportResult> {
        this.logger.info('submitting transport payment', {
            jobId: action.jobId,
            gameSettlement: payable.gameSettlement,
            totalAmount: payable.totalAmount.toString(),
        });
        const settlement = await settleTransit({
            wallet,
            allowance: this.allowance,
            gameSettlement: payable.gameSettlement,
            cpuToken: payable.cpuToken,
            functionName: 'transport',
            sig: { ...action, tokenId: action.sourceTokenId },
            revertLabel: `Transport payment (job ${action.jobId})`,
        });

        this.logger.info('transport payment confirmed', {
            jobId: action.jobId,
            txHash: settlement.txHash,
            block: settlement.blockNumber,
        });
        return {
            kind: TransportResultKind.Paid,
            jobId: action.jobId,
            signId: action.signId,
            sourceTokenId: action.sourceTokenId,
            targetTokenId: action.targetTokenId,
            resourceId: action.resourceId,
            amount: action.amount,
            totalAmount: action.totalAmount,
            burnAmount: action.burnAmount,
            recipients: action.recipients,
            payouts: action.payouts,
            ...settlement,
        };
    }

    private assertChain(configChainId: number, walletChainId: number): void {
        if (configChainId !== walletChainId) {
            throw new Error(
                `Chain mismatch: the chain config is chainId ${configChainId} but the wallet is on ${walletChainId}. Check NETWORK.`,
            );
        }
    }

    private toFreeResult(job: TransportJobResponse): FreeTransportResult {
        return {
            kind: TransportResultKind.Free,
            jobId: job.id,
            status: job.status,
            sourceTokenId: job.sourceTokenId,
            targetTokenId: job.targetTokenId,
            resourceId: job.resourceId,
            amount: job.amount,
            totalDistance: job.totalDistance,
            totalTimeSec: job.totalTimeSec,
            startedAt: job.startedAt,
            arrivalAt: job.arrivalAt,
        };
    }
}
