import { isAddress, parseEther, type Address, type Hash } from 'viem';

import { REVEAL_FEE_BUFFER_BPS, REVEAL_POLL_INTERVAL_MS, REVEAL_POLL_TIMEOUT_MS } from './reveal.constants.js';
import type {
    AppConfig,
    IAllowanceService,
    IAppConfig,
    ICellClient,
    RevealResult,
    RevealServiceOptions,
} from './types.js';
import type { ILogger } from '../logger/types.js';
import type { RevealCellReader } from '../map/types.js';
import { sleep } from '../utils/async.utils.js';
import { cpuFromWei } from '../utils/format.utils.js';
import type { IContractClient, WalletProvider } from '../wallet/types.js';

export class RevealService {
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly allowance: IAllowanceService;
    private readonly cellClient: ICellClient;
    private readonly contracts: IContractClient;
    private readonly mapReader: RevealCellReader;
    private readonly logger: ILogger;

    constructor(options: RevealServiceOptions) {
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.allowance = options.allowance;
        this.cellClient = options.cellClient;
        this.contracts = options.contracts;
        this.mapReader = options.mapReader;
        this.logger = options.logger;
    }

    async reveal(tokenId: string): Promise<RevealResult> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();

        if (config.chainId !== wallet.getChainId()) {
            throw new Error(
                `Chain mismatch: the chain config is chainId ${config.chainId} but the wallet is on ${wallet.getChainId()}. Check NETWORK.`,
            );
        }

        const cell = config.contracts.cell;
        if (!isAddress(cell, { strict: false })) {
            throw new Error(`Cell contract is not configured for network ${config.network}; cannot reveal.`);
        }

        const state = this.mapReader.readRevealCell(tokenId);
        if (state === null) {
            throw new Error(`Cell ${tokenId} is not in the current map; cannot verify ownership before reveal.`);
        }

        const address = wallet.getAddress();
        if (state.owner.toLowerCase() !== address.toLowerCase()) {
            throw new Error(`You do not own cell ${tokenId} (owner ${state.owner}); only the owner can reveal it.`);
        }

        const genesis = state.revealCount === 0;
        const { approveTxHash, reRevealCostWei } = await this.settleReRevealCost(config, cell, genesis);

        const fee = await this.cellClient.quoteRevealFee(cell);
        const value = fee + (fee * REVEAL_FEE_BUFFER_BPS) / 10_000n;

        this.logger.info('requesting on-chain reveal', {
            tokenId,
            cell,
            genesis,
            feeWei: fee.toString(),
            valueWei: value.toString(),
            network: config.network,
        });

        const txHash = await this.cellClient.requestReveal({ cell, tokenId: BigInt(tokenId), value });
        const confirmed = await this.contracts.confirm(txHash, 'Reveal request');

        const fulfilled = await this.pollFulfillment(tokenId, state.revealCount);

        this.logger.info('reveal request confirmed', {
            tokenId,
            txHash: confirmed.txHash,
            block: confirmed.blockNumber,
            fulfilled,
        });

        return {
            tokenId,
            genesis,
            txHash: confirmed.txHash,
            status: confirmed.status,
            blockNumber: confirmed.blockNumber,
            fee: cpuFromWei(fee.toString()),
            reRevealCost: cpuFromWei(reRevealCostWei.toString()),
            approveTxHash,
            fulfilled,
        };
    }

    private async settleReRevealCost(
        config: AppConfig,
        cell: Address,
        genesis: boolean,
    ): Promise<{ approveTxHash: Hash | null; reRevealCostWei: bigint }> {
        if (genesis) {
            return { approveTxHash: null, reRevealCostWei: 0n };
        }
        const cpuToken = config.contracts.cpuToken;
        if (!isAddress(cpuToken, { strict: false })) {
            throw new Error(`$CPU token is not configured for network ${config.network}; cannot pay for re-reveal.`);
        }
        const reRevealCostWei = parseEther(config.reveal.reRevealCost);
        const approveTxHash =
            reRevealCostWei > 0n ? await this.allowance.ensureAllowance(cpuToken, cell, reRevealCostWei) : null;
        return { approveTxHash, reRevealCostWei };
    }

    private async pollFulfillment(tokenId: string, previousRevealCount: number): Promise<boolean> {
        const deadline = Date.now() + REVEAL_POLL_TIMEOUT_MS;
        while (Date.now() < deadline) {
            await sleep(REVEAL_POLL_INTERVAL_MS);
            await this.mapReader.refresh();
            const state = this.mapReader.readRevealCell(tokenId);
            if (state !== null && state.revealCount > previousRevealCount) {
                return true;
            }
        }
        return false;
    }
}
