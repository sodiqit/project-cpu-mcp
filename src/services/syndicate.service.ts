import { isAddress, parseEventLogs, type Address, type Log } from 'viem';
import { z } from 'zod';

import { describeApiError } from './reveal.helpers.js';
import { buildSyndicateQuery, toSyndicateCardView } from './syndicate.helpers.js';
import type {
    AppConfig,
    GetMembershipInput,
    GetSyndicateInput,
    ISyndicateRegistryClient,
    JoinSyndicateInput,
    JoinSyndicateResult,
    LeaveSyndicateResult,
    ListSyndicatesQuery,
    SyndicateCardView,
    SyndicateDetailView,
    SyndicateMemberView,
    SyndicateMembershipView,
    SyndicateServiceOptions,
    IAppConfig,
} from './types.js';
import type { ApiClient } from '../api/client.js';
import {
    type ApiSyndicateCard,
    type ApiSyndicateMembership,
    type ApiSyndicateMemberView,
    apiSyndicateCardSchema,
    apiSyndicateMembershipSchema,
    apiSyndicateMemberViewSchema,
    HttpStatus,
} from '../api/types.js';
import { SYNDICATE_ABI } from '../contracts/syndicate.abi.js';
import type { ILogger } from '../logger/types.js';
import { formatUnixSeconds } from '../utils/format.utils.js';
import { describeRevert } from '../wallet/revert.utils.js';
import type { WalletManager, WalletProvider } from '../wallet/types.js';

export class SyndicateService {
    private readonly api: ApiClient;
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly registry: ISyndicateRegistryClient;
    private readonly logger: ILogger;
    private cachedCooldownSec: number | null = null;

    constructor(options: SyndicateServiceOptions) {
        this.api = options.api;
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.registry = options.registry;
        this.logger = options.logger;
    }

    async join(input: JoinSyndicateInput): Promise<JoinSyndicateResult> {
        const config = await this.appConfig.load();
        this.assertChain(config, this.wallet.get());
        const registry = this.requireRegistry(config);

        const id = BigInt(input.id);
        const cooldownSec = await this.cooldownSec(registry);

        this.logger.info('joining syndicate', { id: input.id, network: config.network });
        const receipt = await this.sendJoin(registry, id);
        const joinedAt = this.decodeJoinedAt(receipt.logs, registry);

        const card = await this.readCardBestEffort(input.id);
        return {
            syndicateId: input.id,
            joinedAt,
            leaveAvailableAt: joinedAt + cooldownSec,
            name: card?.name ?? null,
            rates: card?.rates ?? null,
        };
    }

    private async readCardBestEffort(id: string): Promise<SyndicateCardView | null> {
        try {
            return await this.getCard(id);
        } catch (enrichError) {
            this.logger.warn('join confirmed but the syndicate card could not be read for enrichment', {
                id,
                error: enrichError,
            });
            return null;
        }
    }

    async leave(): Promise<LeaveSyndicateResult> {
        const config = await this.appConfig.load();
        this.assertChain(config, this.wallet.get());
        const registry = this.requireRegistry(config);

        this.logger.info('leaving syndicate', { network: config.network });
        const receipt = await this.sendLeave(registry);
        return { syndicateId: this.decodeLeftId(receipt.logs, registry), rejoinAvailableImmediately: true };
    }

    async listSyndicates(query: ListSyndicatesQuery): Promise<Array<SyndicateCardView>> {
        const qs = buildSyndicateQuery({
            name: query.name,
            minMembers: query.minMembers,
            maxMembers: query.maxMembers,
            sort: query.sort,
            limit: query.limit,
            offset: query.offset,
        });
        const response = await this.api.request<Array<ApiSyndicateCard>>(`/api/v1/syndicates${qs}`);
        if (response.status !== HttpStatus.Ok) {
            throw new Error(`Failed to list syndicates (HTTP ${response.status}): ${describeApiError(response.data)}`);
        }
        z.array(apiSyndicateCardSchema).parse(response.data);
        return response.data.map(toSyndicateCardView);
    }

    async getSyndicate(input: GetSyndicateInput): Promise<SyndicateDetailView> {
        const card = await this.getCard(input.id);
        const members = await this.listMembers(input.id, input.membersLimit, input.membersOffset);
        return { card, members };
    }

    async getMembership(input: GetMembershipInput): Promise<SyndicateMembershipView> {
        const address = input.address ?? this.wallet.get().getAddress();
        this.logger.info('reading syndicate membership', { address });

        const response = await this.api.request<ApiSyndicateMembership | null>(
            `/api/v1/syndicates/player/${encodeURIComponent(address)}`,
        );
        if (response.status !== HttpStatus.Ok) {
            throw new Error(
                `Failed to read syndicate membership for ${address} (HTTP ${response.status}): ` +
                    describeApiError(response.data),
            );
        }
        if (response.data === null) {
            return {
                address,
                member: false,
                syndicateId: null,
                joinedAt: null,
                leaveAvailableAt: null,
                syndicate: null,
            };
        }

        const membership = apiSyndicateMembershipSchema.parse(response.data);
        const card = await this.getCard(membership.syndicateId);
        return {
            address,
            member: true,
            syndicateId: membership.syndicateId,
            joinedAt: membership.joinedAt,
            leaveAvailableAt: membership.leaveAvailableAt,
            syndicate: card,
        };
    }

    private async getCard(id: string): Promise<SyndicateCardView> {
        const response = await this.api.request<ApiSyndicateCard>(`/api/v1/syndicates/${encodeURIComponent(id)}`);
        if (response.status === HttpStatus.NotFound) {
            throw new Error(`No syndicate with id ${id} — check the id from cpu_list_syndicates.`);
        }
        if (response.status !== HttpStatus.Ok) {
            throw new Error(
                `Failed to load syndicate ${id} (HTTP ${response.status}): ${describeApiError(response.data)}`,
            );
        }
        apiSyndicateCardSchema.parse(response.data);
        return toSyndicateCardView(response.data);
    }

    private async listMembers(
        id: string,
        limit: number | null,
        offset: number | null,
    ): Promise<Array<SyndicateMemberView>> {
        const qs = buildSyndicateQuery({ limit, offset });
        const response = await this.api.request<Array<ApiSyndicateMemberView>>(
            `/api/v1/syndicates/${encodeURIComponent(id)}/members${qs}`,
        );
        if (response.status !== HttpStatus.Ok) {
            throw new Error(
                `Failed to list members of syndicate ${id} (HTTP ${response.status}): ${describeApiError(response.data)}`,
            );
        }
        z.array(apiSyndicateMemberViewSchema).parse(response.data);
        return response.data.map((member) => ({ address: member.address, joinedAt: member.joinedAt }));
    }

    private async sendJoin(registry: Address, id: bigint): Promise<{ logs: Array<Log> }> {
        try {
            return await this.registry.join({ registry, id });
        } catch (error) {
            throw await this.explainJoinError(error, id);
        }
    }

    private async sendLeave(registry: Address): Promise<{ logs: Array<Log> }> {
        try {
            return await this.registry.leave({ registry });
        } catch (error) {
            throw await this.explainLeaveError(error);
        }
    }

    private async explainJoinError(error: unknown, id: bigint): Promise<Error> {
        const revert = describeRevert(error, SYNDICATE_ABI);
        if (revert === null) {
            return error instanceof Error ? error : new Error(String(error));
        }
        if (revert.startsWith('SyndicateNotFound')) {
            return new Error(`No syndicate with id ${id.toString()} — check the id from cpu_list_syndicates.`);
        }
        if (revert.startsWith('AlreadyInSyndicate')) {
            return new Error(await this.alreadyInMessage());
        }
        return new Error(`Execution reverted: ${revert}`);
    }

    private async explainLeaveError(error: unknown): Promise<Error> {
        const revert = describeRevert(error, SYNDICATE_ABI);
        if (revert === null) {
            return error instanceof Error ? error : new Error(String(error));
        }
        if (revert.startsWith('NotInSyndicate')) {
            return new Error('You are not a member of any syndicate; nothing to leave.');
        }
        if (revert.startsWith('CooldownActive')) {
            return new Error(await this.cooldownMessage());
        }
        return new Error(`Execution reverted: ${revert}`);
    }

    private async alreadyInMessage(): Promise<string> {
        try {
            const membership = await this.getMembership({ address: null });
            if (membership.member && membership.syndicateId !== null) {
                const named = membership.syndicate !== null ? ` "${membership.syndicate.name}"` : '';
                return `You are already in syndicate ${membership.syndicateId}${named}. Leave it before joining another.`;
            }
        } catch (enrichError) {
            this.logger.warn('could not resolve current membership for the error message', { error: enrichError });
        }
        return 'You are already a member of a syndicate. Leave it before joining another.';
    }

    private async cooldownMessage(): Promise<string> {
        try {
            const membership = await this.getMembership({ address: null });
            if (membership.leaveAvailableAt !== null) {
                return (
                    `You cannot leave yet — the exit cooldown runs until ${formatUnixSeconds(membership.leaveAvailableAt)} ` +
                    `(unix ${membership.leaveAvailableAt}). Try again after that.`
                );
            }
        } catch (enrichError) {
            this.logger.warn('could not resolve the leave-available time for the error message', {
                error: enrichError,
            });
        }
        return 'You cannot leave yet — the exit cooldown has not elapsed. Try again later.';
    }

    private async cooldownSec(registry: Address): Promise<number> {
        if (this.cachedCooldownSec !== null) {
            return this.cachedCooldownSec;
        }
        const config = await this.registry.getConfig(registry);
        this.cachedCooldownSec = config.exitCooldownSec;
        return this.cachedCooldownSec;
    }

    private decodeJoinedAt(logs: Array<Log>, registry: Address): number {
        const events = parseEventLogs({ abi: SYNDICATE_ABI, eventName: 'MemberJoined', logs });
        const event = events.find((e) => e.address.toLowerCase() === registry.toLowerCase());
        if (event === undefined) {
            throw new Error('Join confirmed on-chain but no MemberJoined event was found in the receipt.');
        }
        return Number(event.args.joinedAt);
    }

    private decodeLeftId(logs: Array<Log>, registry: Address): string {
        const events = parseEventLogs({ abi: SYNDICATE_ABI, eventName: 'MemberLeft', logs });
        const event = events.find((e) => e.address.toLowerCase() === registry.toLowerCase());
        if (event === undefined) {
            throw new Error('Leave confirmed on-chain but no MemberLeft event was found in the receipt.');
        }
        return event.args.id.toString();
    }

    private requireRegistry(config: AppConfig): Address {
        const registry = config.contracts.syndicate;
        if (registry === null || !isAddress(registry, { strict: false })) {
            throw new Error(
                `The syndicate registry is not deployed on network ${config.network}; joining and leaving are unavailable here.`,
            );
        }
        return registry;
    }

    private assertChain(config: AppConfig, wallet: WalletManager): void {
        if (config.chainId !== wallet.getChainId()) {
            throw new Error(
                `Chain mismatch: the chain config is chainId ${config.chainId} but the wallet is on ${wallet.getChainId()}. Check NETWORK.`,
            );
        }
    }
}
