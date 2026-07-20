import { describe, expect, it } from 'vitest';

import type { ApiClient } from '../../api/client.js';
import type { ApiSyndicateCard, ApiSyndicateMemberView } from '../../api/types.js';
import { SyndicateSort } from '../../api/types.js';
import { NoopLogger } from '../../logger/noop.logger.js';
import type { WalletProvider } from '../../wallet/types.js';
import { SyndicateService } from '../syndicate.service.js';
import { WALLET_ADDRESS, FakeWallet } from './service-fakes.js';

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
    const api = new RoutedApi(route);
    const wallet = new FakeWallet(1);
    const service = new SyndicateService({
        api: api as unknown as ApiClient,
        wallet: wallet as unknown as WalletProvider,
        logger: new NoopLogger(),
    });
    return { service, api };
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
