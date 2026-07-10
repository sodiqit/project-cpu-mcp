import { encodeFunctionData, type Hash } from 'viem';

import type { BuyLotParams, CancelLotParams, CreateLotParams, ITradeClient, TradeClientOptions } from './types.js';
import { TRADE_ABI } from '../contracts/trade.abi.js';
import type { ILogger } from '../logger/types.js';
import type { IContractClient } from '../wallet/types.js';

export class TradeClient implements ITradeClient {
    private readonly contracts: IContractClient;
    private readonly logger: ILogger;

    constructor(options: TradeClientOptions) {
        this.contracts = options.contracts;
        this.logger = options.logger;
    }

    async createLot(params: CreateLotParams): Promise<Hash> {
        const data = encodeFunctionData({
            abi: TRADE_ABI,
            functionName: 'createLot',
            args: [params.tokenIds, params.res, params.value, params.price, params.maxFee],
        });
        this.logger.info('submitting create lot', {
            trade: params.trade,
            res: params.res,
            value: params.value.toString(),
            priceWei: params.price.toString(),
            maxFeeWei: params.maxFee.toString(),
        });
        return this.contracts.send({ to: params.trade, data, value: null });
    }

    async buy(params: BuyLotParams): Promise<Hash> {
        const data = encodeFunctionData({
            abi: TRADE_ABI,
            functionName: 'buy',
            args: [params.lotId, params.value, params.destTokenIds, params.maxFee],
        });
        this.logger.info('submitting buy lot', {
            trade: params.trade,
            lotId: params.lotId.toString(),
            value: params.value.toString(),
            maxFeeWei: params.maxFee.toString(),
        });
        return this.contracts.send({ to: params.trade, data, value: null });
    }

    async cancel(params: CancelLotParams): Promise<Hash> {
        const data = encodeFunctionData({
            abi: TRADE_ABI,
            functionName: 'cancel',
            args: [params.lotId, params.returnTokenIds, params.maxFee],
        });
        this.logger.info('submitting cancel lot', {
            trade: params.trade,
            lotId: params.lotId.toString(),
            maxFeeWei: params.maxFee.toString(),
        });
        return this.contracts.send({ to: params.trade, data, value: null });
    }
}
