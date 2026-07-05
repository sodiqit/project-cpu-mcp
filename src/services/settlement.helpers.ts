import { encodeFunctionData, type Address, type Hash, type Hex } from 'viem';

import type { IAllowanceService } from './types.js';
import { GAME_SETTLEMENT_ABI } from '../contracts/game-settlement.abi.js';
import { TxStatus, type WalletManager } from '../wallet/types.js';

export interface ConfirmedTx {
    txHash: Hash;
    status: TxStatus;
    blockNumber: string;
}

/** Send a pre-encoded GameSettlement call and wait for it; throws `<revertLabel> reverted …` on revert. */
export async function submitAndConfirm(
    wallet: WalletManager,
    to: Address,
    data: Hex,
    revertLabel: string,
): Promise<ConfirmedTx> {
    const txHash = await wallet.sendTransaction({ to, data, value: null });
    const receipt = await wallet.waitForReceipt(txHash);
    if (receipt.status === TxStatus.Reverted) {
        throw new Error(`${revertLabel} reverted on-chain (tx ${txHash}).`);
    }
    return { txHash, status: receipt.status, blockNumber: receipt.blockNumber.toString() };
}

/** The EIP-712 spend signature shared by the build / reveal / craft actions. */
export interface SpendSignature {
    signId: number;
    tokenId: string;
    cpuAmount: string;
    deadline: string;
    v: number;
    r: string;
    s: string;
}

export interface SpendSettlement extends ConfirmedTx {
    approveTxHash: Hash | null;
}

export interface SettleSpendOptions {
    wallet: WalletManager;
    allowance: IAllowanceService;
    gameSettlement: Address;
    /** $CPU token to approve, or null to skip the approve for a free action (or a mint-only `withdrawCpu`). */
    cpuToken: Address | null;
    /** GameSettlement entry-point — `spendCpu` (build/craft) or `withdrawCpu` (mints $CPU). */
    functionName: 'spendCpu' | 'withdrawCpu';
    sig: SpendSignature;
    /** Action name for the revert error, e.g. `'Build transaction'`. */
    revertLabel: string;
}

/**
 * Approve $CPU when there's a cost, then submit the GameSettlement call and wait for it. `spendCpu` and
 * `withdrawCpu` share one arg tuple (`withdrawCpu` mints rather than spends, so it passes `cpuToken: null`);
 * the signature is bound to the SIWE address, so the wallet must be that same address or the contract
 * reverts (BadSignature).
 */
export async function settleSpend(opts: SettleSpendOptions): Promise<SpendSettlement> {
    const cpuAmount = BigInt(opts.sig.cpuAmount);

    // GameSettlement pulls $CPU via transferFrom, so a paid call needs an allowance first.
    const approveTxHash =
        opts.cpuToken !== null
            ? await opts.allowance.ensureAllowance(opts.cpuToken, opts.gameSettlement, cpuAmount)
            : null;

    const data = encodeFunctionData({
        abi: GAME_SETTLEMENT_ABI,
        functionName: opts.functionName,
        args: [
            BigInt(opts.sig.signId),
            BigInt(opts.sig.tokenId),
            cpuAmount,
            BigInt(opts.sig.deadline),
            opts.sig.v,
            opts.sig.r as Hex,
            opts.sig.s as Hex,
        ],
    });

    const confirmed = await submitAndConfirm(opts.wallet, opts.gameSettlement, data, opts.revertLabel);
    return { ...confirmed, approveTxHash };
}
