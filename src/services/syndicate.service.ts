import { z } from 'zod';

import { describeApiError } from './reveal.helpers.js';
import { buildSyndicateQuery, toSyndicateCardView } from './syndicate.helpers.js';
import type {
    GetMembershipInput,
    GetSyndicateInput,
    ListSyndicatesQuery,
    SyndicateCardView,
    SyndicateDetailView,
    SyndicateMemberView,
    SyndicateMembershipView,
    SyndicateServiceOptions,
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
import type { ILogger } from '../logger/types.js';
import type { WalletProvider } from '../wallet/types.js';

export class SyndicateService {
    private readonly api: ApiClient;
    private readonly wallet: WalletProvider;
    private readonly logger: ILogger;

    constructor(options: SyndicateServiceOptions) {
        this.api = options.api;
        this.wallet = options.wallet;
        this.logger = options.logger;
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
}
