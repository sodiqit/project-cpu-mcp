import { decodeFunctionData, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';

import { CELL_ABI } from '../../contracts/cell.abi.js';
import { makeCell } from '../../map/__tests__/fixtures.js';
import { TxStatus } from '../../wallet/types.js';
import { WithdrawService } from '../withdraw.service.js';
import { CELL, makeCellHarness, makeConfig, WALLET_ADDRESS } from './service-fakes.js';

function makeService(opts: Parameters<typeof makeCellHarness>[1] = {}) {
    return makeCellHarness((deps) => new WithdrawService(deps), opts);
}

describe('WithdrawService', () => {
    it('sends withdrawCpu to the Cell for whole wCPU units and reports the confirmation', async () => {
        const { service, contracts } = makeService({ cell: makeCell({ tokenId: '42', owner: WALLET_ADDRESS }) });

        const result = await service.withdraw({ tokenId: '42', amount: '100' });

        expect(contracts.sent).toHaveLength(1);
        const sent = contracts.sent[0];
        if (sent === undefined) {
            throw new Error('expected one tx');
        }
        expect(sent.to).toBe(CELL);
        expect(sent.value).toBeNull(); // a mint spends no ETH

        const decoded = decodeFunctionData({ abi: CELL_ABI, data: sent.data as Hex });
        expect(decoded.functionName).toBe('withdrawCpu');
        // Whole wCPU units go on-chain as a uint64 — never wei.
        expect(decoded.args).toEqual([42n, 100n]);

        expect(result.tokenId).toBe('42');
        expect(result.amount).toBe('100');
        expect(result.status).toBe(TxStatus.Success);
        expect(result.blockNumber).toBe('100');
    });

    it('withdraws when the map has no cached cell (ownership left to the contract)', async () => {
        const { service, contracts } = makeService();
        await service.withdraw({ tokenId: '42', amount: '100' });
        expect(contracts.sent).toHaveLength(1);
    });

    it('rejects a withdraw from a cell owned by someone else', async () => {
        const { service, contracts } = makeService({ cell: makeCell({ tokenId: '42', owner: '0xother' }) });
        await expect(service.withdraw({ tokenId: '42', amount: '100' })).rejects.toThrow(/do not own/i);
        expect(contracts.sent).toHaveLength(0);
    });

    it('refuses when the Cell contract is not configured', async () => {
        const config = makeConfig();
        config.contracts.cell = '';
        const { service, contracts } = makeService({ config });
        await expect(service.withdraw({ tokenId: '42', amount: '100' })).rejects.toThrow(/not configured/i);
        expect(contracts.sent).toHaveLength(0);
    });

    it('wraps an on-chain revert', async () => {
        const { service } = makeService({ receipts: [TxStatus.Reverted] });
        await expect(service.withdraw({ tokenId: '42', amount: '100' })).rejects.toThrow(
            /withdraw transaction reverted/i,
        );
    });

    it('refuses when the wallet chainId does not match the chain config', async () => {
        const { service, contracts } = makeService({ walletChainId: 8453 });
        await expect(service.withdraw({ tokenId: '42', amount: '100' })).rejects.toThrow(/chain mismatch/i);
        expect(contracts.sent).toHaveLength(0);
    });
});
