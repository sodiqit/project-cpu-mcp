import { describe, expect, it } from 'vitest';

import {
    WALLET_ADDRESS,
    SYNDICATE,
    FakeAppConfig,
    FakeSyndicateRegistryClient,
    FakeWallet,
    confirmedTx,
    makeConfig,
    memberJoinedLog,
    memberLeftLog,
    syndicateRevert,
} from './service-fakes.js';
import type { ApiClient } from '../../api/client.js';
import type { ApiSyndicateCard, ApiSyndicateMemberView } from '../../api/types.js';
import { SyndicateSort } from '../../api/types.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import type { WalletProvider } from '../../wallet/types.js';
import { SyndicateService } from '../syndicate.service.js';
import type { AppConfig } from '../types.js';

interface Reply {
    status: number;
    data: unknown;
}

class RoutedApi {
    public readonly calls: Array<{ path: string; authenticated: boolean }> = [];
    constructor(private readonly route: (path: string) => Reply) {}
    async request(path: string): Promise<Reply> {
        this.calls.push({ path, authenticated: false });
        return this.route(path);
    }
    async authenticatedRequest(path: string): Promise<Reply> {
        this.calls.push({ path, authenticated: true });
        return this.route(path);
    }
}

function cardWire(over: Partial<ApiSyndicateCard> = {}): ApiSyndicateCard {
    return {
        id: '1',
        manager: '0x00000000000000000000000000000000000000a1',
        name: 'Iron Pact',
        link: 'https://example.test/iron',
        rates: { tradeDiscountBp: 250, transportDiscountBp: 500, tradeTaxBp: 100, transportTaxBp: 0 },
        memberCount: 2,
        createdAt: 1_700_000_000,
        ...over,
    };
}

function makeService(route: (path: string) => Reply): { service: SyndicateService; api: RoutedApi } {
    const { service, api } = makeWriteService({ route });
    return { service, api };
}

function makeWriteService(
    opts: Partial<{
        route: (path: string) => Reply;
        registry: FakeSyndicateRegistryClient;
        config: AppConfig;
        walletChainId: number;
    }>,
): { service: SyndicateService; api: RoutedApi; registry: FakeSyndicateRegistryClient } {
    const api = new RoutedApi(opts.route ?? (() => ({ status: 200, data: cardWire() })));
    const wallet = new FakeWallet(opts.walletChainId ?? 1);
    const registry = opts.registry ?? new FakeSyndicateRegistryClient();
    const service = new SyndicateService({
        api: api as unknown as ApiClient,
        wallet: wallet as unknown as WalletProvider,
        appConfig: new FakeAppConfig(opts.config ?? makeConfig()),
        registry,
        logger: new NoopLogger(),
    });
    return { service, api, registry };
}

function darkConfig(): AppConfig {
    const config = makeConfig();
    return { ...config, contracts: { ...config.contracts, syndicate: null } };
}

describe('SyndicateService.listSyndicates', () => {
    it('passes filters/sort through and converts bp rates to percent', async () => {
        const { service, api } = makeService(() => ({ status: 200, data: [cardWire()] }));

        const cards = await service.listSyndicates({
            name: 'iron',
            minMembers: 2,
            maxMembers: null,
            sort: SyndicateSort.MembersDesc,
            limit: 10,
            offset: null,
        });

        expect(api.calls[0]?.path).toBe('/api/v1/syndicates?name=iron&minMembers=2&sort=members_desc&limit=10');
        expect(cards[0]?.rates).toEqual({
            tradeDiscountPercent: 2.5,
            transportDiscountPercent: 5,
            tradeTaxPercent: 1,
            transportTaxPercent: 0,
        });
    });

    it('returns an empty catalog when the server has none', async () => {
        const { service } = makeService(() => ({ status: 200, data: [] }));
        expect(await service.listSyndicates(query())).toEqual([]);
    });

    it('throws on a non-200 catalog response', async () => {
        const { service } = makeService(() => ({ status: 500, data: { message: 'boom' } }));
        await expect(service.listSyndicates(query())).rejects.toThrow(/Failed to list syndicates/i);
    });
});

describe('SyndicateService.getSyndicate', () => {
    it('fetches the card plus a members page and preserves the API member order', async () => {
        const members: Array<ApiSyndicateMemberView> = [
            { address: '0x00000000000000000000000000000000000000b1', joinedAt: 100 },
            { address: '0x00000000000000000000000000000000000000b2', joinedAt: 200 },
        ];
        const { service, api } = makeService((path) =>
            path.includes('/members') ? { status: 200, data: members } : { status: 200, data: cardWire() },
        );

        const detail = await service.getSyndicate({ id: '1', membersLimit: 50, membersOffset: 0 });

        expect(api.calls.map((c) => c.path)).toEqual([
            '/api/v1/syndicates/1',
            '/api/v1/syndicates/1/members?limit=50&offset=0',
        ]);
        expect(detail.card.id).toBe('1');
        expect(detail.members.map((m) => m.address)).toEqual([
            '0x00000000000000000000000000000000000000b1',
            '0x00000000000000000000000000000000000000b2',
        ]);
    });

    it('surfaces an empty members page for a page past the end', async () => {
        const { service } = makeService((path) =>
            path.includes('/members') ? { status: 200, data: [] } : { status: 200, data: cardWire() },
        );
        const detail = await service.getSyndicate({ id: '1', membersLimit: null, membersOffset: null });
        expect(detail.members).toEqual([]);
    });

    it('throws a clear error naming the unknown id on a 404 card', async () => {
        const { service } = makeService(() => ({ status: 404, data: { message: 'SyndicateNotFound' } }));
        await expect(service.getSyndicate({ id: '999', membersLimit: null, membersOffset: null })).rejects.toThrow(
            /No syndicate with id 999/i,
        );
    });
});

describe('SyndicateService.getMembership', () => {
    it('defaults to the wallet address and reports a non-member (200 + null) as not an error', async () => {
        const { service, api } = makeService(() => ({ status: 200, data: null }));

        const membership = await service.getMembership({ address: null });

        expect(api.calls[0]?.path).toBe(`/api/v1/syndicates/player/${encodeURIComponent(WALLET_ADDRESS)}`);
        expect(membership).toEqual({
            address: WALLET_ADDRESS,
            member: false,
            syndicateId: null,
            joinedAt: null,
            leaveAvailableAt: null,
            syndicate: null,
        });
    });

    it('enriches a member with their syndicate card and rates in percent', async () => {
        const { service, api } = makeService((path) =>
            path.includes('/player/')
                ? { status: 200, data: { syndicateId: '1', joinedAt: 100, leaveAvailableAt: 700 } }
                : { status: 200, data: cardWire({ id: '1' }) },
        );

        const membership = await service.getMembership({ address: '0x00000000000000000000000000000000000000c1' });

        expect(api.calls.map((c) => c.path)).toEqual([
            '/api/v1/syndicates/player/0x00000000000000000000000000000000000000c1',
            '/api/v1/syndicates/1',
        ]);
        expect(membership.member).toBe(true);
        expect(membership.syndicateId).toBe('1');
        expect(membership.joinedAt).toBe(100);
        expect(membership.leaveAvailableAt).toBe(700);
        expect(membership.syndicate?.rates.tradeDiscountPercent).toBe(2.5);
    });

    it('throws on a non-200, non-null membership response', async () => {
        const { service } = makeService(() => ({ status: 503, data: { message: 'down' } }));
        await expect(service.getMembership({ address: '0xabc' })).rejects.toThrow(
            /Failed to read syndicate membership/i,
        );
    });
});

describe('SyndicateService.join', () => {
    it('joins, derives leaveAvailableAt from the receipt joinedAt plus the cooldown, and names/rates from the card', async () => {
        const registry = new FakeSyndicateRegistryClient({
            join: confirmedTx([
                memberJoinedLog({ player: WALLET_ADDRESS, id: 1n, joinedAt: 1_000n, registry: SYNDICATE }),
            ]),
            config: { exitCooldownSec: 600 },
        });
        const { service, registry: reg } = makeWriteService({
            route: () => ({ status: 200, data: cardWire({ id: '1' }) }),
            registry,
        });

        const result = await service.join({ id: '1' });

        expect(reg.joinCalls).toEqual([{ registry: SYNDICATE, id: 1n }]);
        expect(result).toEqual({
            syndicateId: '1',
            joinedAt: 1_000,
            leaveAvailableAt: 1_600,
            name: 'Iron Pact',
            rates: {
                tradeDiscountPercent: 2.5,
                transportDiscountPercent: 5,
                tradeTaxPercent: 1,
                transportTaxPercent: 0,
            },
        });
    });

    it('still returns a successful result when the post-tx card read fails (projection lag)', async () => {
        const registry = new FakeSyndicateRegistryClient({
            join: confirmedTx([
                memberJoinedLog({ player: WALLET_ADDRESS, id: 1n, joinedAt: 1_000n, registry: SYNDICATE }),
            ]),
            config: { exitCooldownSec: 600 },
        });
        const { service, registry: reg } = makeWriteService({
            route: () => ({ status: 404, data: { message: 'SyndicateNotFound' } }),
            registry,
        });

        const result = await service.join({ id: '1' });

        expect(reg.joinCalls).toEqual([{ registry: SYNDICATE, id: 1n }]);
        expect(result).toEqual({
            syndicateId: '1',
            joinedAt: 1_000,
            leaveAvailableAt: 1_600,
            name: null,
            rates: null,
        });
    });

    it('rewrites AlreadyInSyndicate into a message naming the current syndicate from HTTP membership', async () => {
        const registry = new FakeSyndicateRegistryClient({ join: syndicateRevert('AlreadyInSyndicate') });
        const { service } = makeWriteService({
            route: (path) =>
                path.includes('/player/')
                    ? { status: 200, data: { syndicateId: '2', joinedAt: 100, leaveAvailableAt: 700 } }
                    : { status: 200, data: cardWire({ id: '2', name: 'Copper Cartel' }) },
            registry,
        });

        await expect(service.join({ id: '1' })).rejects.toThrow(/already in syndicate 2 "Copper Cartel"/i);
    });

    it('rewrites SyndicateNotFound into a plain message naming the unknown id', async () => {
        const registry = new FakeSyndicateRegistryClient({ join: syndicateRevert('SyndicateNotFound') });
        const { service } = makeWriteService({ registry });
        await expect(service.join({ id: '999' })).rejects.toThrow(/No syndicate with id 999/i);
    });

    it('refuses before any transaction when the registry is not deployed', async () => {
        const registry = new FakeSyndicateRegistryClient();
        const { service } = makeWriteService({ registry, config: darkConfig() });

        await expect(service.join({ id: '1' })).rejects.toThrow(/not deployed/i);
        expect(registry.joinCalls).toEqual([]);
    });
});

describe('SyndicateService.leave', () => {
    it('leaves and reports the syndicate id plus immediate re-join', async () => {
        const registry = new FakeSyndicateRegistryClient({
            leave: confirmedTx([memberLeftLog({ player: WALLET_ADDRESS, id: 1n, registry: SYNDICATE })]),
        });
        const { service, registry: reg } = makeWriteService({ registry });

        const result = await service.leave();

        expect(reg.leaveCalls).toEqual([{ registry: SYNDICATE }]);
        expect(result).toEqual({ syndicateId: '1', rejoinAvailableImmediately: true });
    });

    it('rewrites an early-leave CooldownActive into a message carrying the leave-available time', async () => {
        const registry = new FakeSyndicateRegistryClient({ leave: syndicateRevert('CooldownActive') });
        const { service } = makeWriteService({
            route: (path) =>
                path.includes('/player/')
                    ? { status: 200, data: { syndicateId: '1', joinedAt: 100, leaveAvailableAt: 700 } }
                    : { status: 200, data: cardWire({ id: '1' }) },
            registry,
        });

        await expect(service.leave()).rejects.toThrow(/cannot leave yet.*unix 700/is);
    });

    it('rewrites NotInSyndicate into a plain "nothing to leave" message', async () => {
        const registry = new FakeSyndicateRegistryClient({ leave: syndicateRevert('NotInSyndicate') });
        const { service } = makeWriteService({ registry });
        await expect(service.leave()).rejects.toThrow(/not a member of any syndicate/i);
    });

    it('refuses before any transaction when the registry is not deployed', async () => {
        const registry = new FakeSyndicateRegistryClient();
        const { service } = makeWriteService({ registry, config: darkConfig() });

        await expect(service.leave()).rejects.toThrow(/not deployed/i);
        expect(registry.leaveCalls).toEqual([]);
    });
});

function query(): {
    name: null;
    minMembers: null;
    maxMembers: null;
    sort: null;
    limit: null;
    offset: null;
} {
    return { name: null, minMembers: null, maxMembers: null, sort: null, limit: null, offset: null };
}
