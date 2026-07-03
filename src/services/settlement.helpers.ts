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

/** The `GameSettlement` entry-point a paid transit action settles through. */
export type SettlementFunction = 'transport' | 'tradeBuy' | 'tradeCancel';

/** The EIP-712 transit signature shared by transport and the paid trade actions (create / buy / cancel). */
export interface TransitSignature {
    signId: number;
    /** `sourceTokenId` (transport / create), `buyerDestTokenId` (buy), or `sellerDestTokenId` (cancel). */
    tokenId: string;
    /** On-chain amounts in wei. */
    totalAmount: string;
    burnAmount: string;
    recipients: Array<string>;
    payouts: Array<string>;
    deadline: string;
    v: number;
    r: string;
    s: string;
}

export interface SettleTransitOptions {
    wallet: WalletManager;
    allowance: IAllowanceService;
    gameSettlement: Address;
    cpuToken: Address;
    /** GameSettlement entry-point — `transport` (transport / create-lot), `tradeBuy`, or `tradeCancel`. */
    functionName: SettlementFunction;
    sig: TransitSignature;
    /** Action name for the revert error, e.g. `'Transport payment'`. */
    revertLabel: string;
}

/**
 * Approve $CPU, then submit the GameSettlement transit call (`transport` / `tradeBuy` / `tradeCancel`)
 * and wait for it. The three share one arg tuple; the signature is bound to the SIWE address, so the
 * wallet must be that same address or the contract reverts (BadSignature).
 */
export async function settleTransit(opts: SettleTransitOptions): Promise<SpendSettlement> {
    const totalAmount = BigInt(opts.sig.totalAmount);

    const approveTxHash = await opts.allowance.ensureAllowance(opts.cpuToken, opts.gameSettlement, totalAmount);

    const data = encodeFunctionData({
        abi: GAME_SETTLEMENT_ABI,
        functionName: opts.functionName,
        args: [
            BigInt(opts.sig.signId),
            BigInt(opts.sig.tokenId),
            totalAmount,
            BigInt(opts.sig.burnAmount),
            opts.sig.recipients as Array<Address>,
            opts.sig.payouts.map((p) => BigInt(p)),
            BigInt(opts.sig.deadline),
            opts.sig.v,
            opts.sig.r as Hex,
            opts.sig.s as Hex,
        ],
    });

    const confirmed = await submitAndConfirm(opts.wallet, opts.gameSettlement, data, opts.revertLabel);
    return { ...confirmed, approveTxHash };
}
