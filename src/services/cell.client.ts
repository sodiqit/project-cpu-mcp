import { encodeFunctionData, zeroAddress, type Address, type Hash } from 'viem';

import { REVEAL_CALLBACK_GAS } from './cell.constants.js';
import type {
    CellClientOptions,
    ClaimParams,
    DemolishParams,
    ICellClient,
    PlaceParams,
    RequestRevealParams,
    StartCraftParams,
    StartMiningParams,
    WithdrawCpuParams,
} from './types.js';
import { CELL_ABI } from '../contracts/cell.abi.js';
import { ENTROPY_ABI } from '../contracts/entropy.abi.js';
import type { ILogger } from '../logger/types.js';
import type { IContractClient } from '../wallet/types.js';

export class CellClient implements ICellClient {
    private readonly contracts: IContractClient;
    private readonly logger: ILogger;

    constructor(options: CellClientOptions) {
        this.contracts = options.contracts;
        this.logger = options.logger;
    }

    async quoteRevealFee(cell: Address): Promise<bigint> {
        const [entropy, provider] = await Promise.all([
            this.contracts.read<Address>({ address: cell, abi: CELL_ABI, functionName: 'entropy', args: [] }),
            this.contracts.read<Address>({ address: cell, abi: CELL_ABI, functionName: 'entropyProvider', args: [] }),
        ]);

        if (entropy === zeroAddress || provider === zeroAddress) {
            throw new Error('Cell is not wired to Pyth Entropy on this deployment; reveal is unavailable.');
        }

        const fee = await this.contracts.read<bigint>({
            address: entropy,
            abi: ENTROPY_ABI,
            functionName: 'getFeeV2',
            args: [provider, REVEAL_CALLBACK_GAS],
        });
        this.logger.info('quoted reveal fee', { cell, entropy, provider, feeWei: fee.toString() });
        return fee;
    }

    async requestReveal(params: RequestRevealParams): Promise<Hash> {
        const data = encodeFunctionData({
            abi: CELL_ABI,
            functionName: 'requestReveal',
            args: [params.x, params.y],
        });
        this.logger.info('submitting reveal request', {
            cell: params.cell,
            x: params.x.toString(),
            y: params.y.toString(),
            valueWei: params.value.toString(),
        });
        return this.contracts.send({ to: params.cell, data, value: params.value });
    }

    async place(params: PlaceParams): Promise<Hash> {
        const data = encodeFunctionData({
            abi: CELL_ABI,
            functionName: 'place',
            args: [params.tokenId, params.buildingType],
        });
        this.logger.info('submitting place', {
            cell: params.cell,
            tokenId: params.tokenId.toString(),
            buildingType: params.buildingType,
        });
        return this.contracts.send({ to: params.cell, data, value: null });
    }

    async demolish(params: DemolishParams): Promise<Hash> {
        const data = encodeFunctionData({
            abi: CELL_ABI,
            functionName: 'demolish',
            args: [params.tokenId],
        });
        this.logger.info('submitting demolish', { cell: params.cell, tokenId: params.tokenId.toString() });
        return this.contracts.send({ to: params.cell, data, value: null });
    }

    async startMining(params: StartMiningParams): Promise<Hash> {
        const data = encodeFunctionData({
            abi: CELL_ABI,
            functionName: 'startMining',
            args: [params.tokenId, params.target],
        });
        this.logger.info('submitting startMining', {
            cell: params.cell,
            tokenId: params.tokenId.toString(),
            target: params.target,
        });
        return this.contracts.send({ to: params.cell, data, value: null });
    }

    async startCraft(params: StartCraftParams): Promise<Hash> {
        const data = encodeFunctionData({
            abi: CELL_ABI,
            functionName: 'startCraft',
            args: [params.tokenId, params.recipeId, params.batches],
        });
        this.logger.info('submitting startCraft', {
            cell: params.cell,
            tokenId: params.tokenId.toString(),
            recipeId: params.recipeId.toString(),
            batches: params.batches,
        });
        return this.contracts.send({ to: params.cell, data, value: null });
    }

    async claim(params: ClaimParams): Promise<Hash> {
        const data = encodeFunctionData({
            abi: CELL_ABI,
            functionName: 'claim',
            args: [params.tokenId],
        });
        this.logger.info('submitting claim', { cell: params.cell, tokenId: params.tokenId.toString() });
        return this.contracts.send({ to: params.cell, data, value: null });
    }

    async withdrawCpu(params: WithdrawCpuParams): Promise<Hash> {
        const data = encodeFunctionData({
            abi: CELL_ABI,
            functionName: 'withdrawCpu',
            args: [params.tokenId, params.amount],
        });
        this.logger.info('submitting withdrawCpu', {
            cell: params.cell,
            tokenId: params.tokenId.toString(),
            amount: params.amount.toString(),
        });
        return this.contracts.send({ to: params.cell, data, value: null });
    }
}
