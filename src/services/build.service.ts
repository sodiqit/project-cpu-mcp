import { isAddress, parseEther, type Address, type Hash } from 'viem';

import { BUILDING_ON_CHAIN_ID } from './cell.constants.js';
import type {
    AppConfig,
    BuildInput,
    BuildResult,
    BuildServiceOptions,
    DemolishInput,
    DemolishResult,
    IAllowanceService,
    IAppConfig,
    ICellClient,
} from './types.js';
import { BuildingType } from '../api/types.js';
import type { ILogger } from '../logger/types.js';
import type { RevealCellReader } from '../map/types.js';
import type { IContractClient, WalletManager, WalletProvider } from '../wallet/types.js';

export class BuildService {
    private readonly wallet: WalletProvider;
    private readonly appConfig: IAppConfig;
    private readonly allowance: IAllowanceService;
    private readonly cellClient: ICellClient;
    private readonly contracts: IContractClient;
    private readonly mapReader: RevealCellReader;
    private readonly logger: ILogger;

    constructor(options: BuildServiceOptions) {
        this.wallet = options.wallet;
        this.appConfig = options.appConfig;
        this.allowance = options.allowance;
        this.cellClient = options.cellClient;
        this.contracts = options.contracts;
        this.mapReader = options.mapReader;
        this.logger = options.logger;
    }

    async build(input: BuildInput): Promise<BuildResult> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();
        this.assertChain(config, wallet);

        const cell = this.requireCell(config);
        const cpuToken = this.requireCpuToken(config);
        const tokenId = BigInt(input.tokenId);

        const state = this.mapReader.readRevealCell(input.tokenId);
        if (state !== null) {
            if (state.owner.toLowerCase() !== wallet.getAddress().toLowerCase()) {
                throw new Error(
                    `You do not own cell ${input.tokenId} (owner ${state.owner}); only the owner can build.`,
                );
            }
            if (state.process !== null) {
                throw new Error(
                    `Cell ${input.tokenId} has an active ${state.process.kind} process; claim or finish it before building.`,
                );
            }
            if (state.building !== null && state.building.type !== input.buildingType) {
                throw new Error(
                    `Cell ${input.tokenId} already has a ${state.building.type}; demolish it before building a ${input.buildingType}.`,
                );
            }
        }

        const alreadyBuilt = state?.building?.type === input.buildingType;

        let approveTxHash: Hash | null = null;
        let buildTxHash: Hash | null = null;
        let buildCostWei = '0';
        if (!alreadyBuilt) {
            const costWei = this.buildCostWei(config, input.buildingType);
            buildCostWei = costWei.toString();
            approveTxHash = costWei > 0n ? await this.allowance.ensureAllowance(cpuToken, cell, costWei) : null;

            this.logger.info('placing building', {
                tokenId: input.tokenId,
                buildingType: input.buildingType,
                buildCostWei,
                network: config.network,
            });
            buildTxHash = await this.cellClient.place({
                cell,
                tokenId,
                buildingType: BUILDING_ON_CHAIN_ID[input.buildingType],
            });
            await this.contracts.confirm(buildTxHash, 'Build transaction');
        }

        let miningTxHash: Hash | null = null;
        if (input.buildingType === BuildingType.Extractor && input.targetResourceId !== null) {
            this.logger.info('starting mining', { tokenId: input.tokenId, target: input.targetResourceId });
            miningTxHash = await this.cellClient.startMining({ cell, tokenId, target: input.targetResourceId });
            await this.contracts.confirm(miningTxHash, 'Start mining');
        }

        return {
            tokenId: input.tokenId,
            buildingType: input.buildingType,
            targetResourceId: input.targetResourceId,
            buildCostWei,
            approveTxHash,
            buildTxHash,
            miningTxHash,
            alreadyBuilt,
        };
    }

    async demolish(input: DemolishInput): Promise<DemolishResult> {
        const config = await this.appConfig.load();
        const wallet = this.wallet.get();
        this.assertChain(config, wallet);

        const cell = this.requireCell(config);
        const tokenId = BigInt(input.tokenId);

        const state = this.mapReader.readRevealCell(input.tokenId);
        if (state !== null && state.owner.toLowerCase() !== wallet.getAddress().toLowerCase()) {
            throw new Error(
                `You do not own cell ${input.tokenId} (owner ${state.owner}); only the owner can demolish.`,
            );
        }

        this.logger.info('demolishing building', { tokenId: input.tokenId, network: config.network });
        const txHash = await this.cellClient.demolish({ cell, tokenId });
        const confirmed = await this.contracts.confirm(txHash, 'Demolish transaction');

        return {
            tokenId: input.tokenId,
            txHash: confirmed.txHash,
            status: confirmed.status,
            blockNumber: confirmed.blockNumber,
        };
    }

    private assertChain(config: AppConfig, wallet: WalletManager): void {
        if (config.chainId !== wallet.getChainId()) {
            throw new Error(
                `Chain mismatch: the chain config is chainId ${config.chainId} but the wallet is on ${wallet.getChainId()}. Check NETWORK.`,
            );
        }
    }

    private requireCell(config: AppConfig): Address {
        const cell = config.contracts.cell;
        if (!isAddress(cell, { strict: false })) {
            throw new Error(`Cell contract is not configured for network ${config.network}; cannot build.`);
        }
        return cell;
    }

    private requireCpuToken(config: AppConfig): Address {
        const cpuToken = config.contracts.cpuToken;
        if (!isAddress(cpuToken, { strict: false })) {
            throw new Error(`$CPU token is not configured for network ${config.network}; cannot pay for build.`);
        }
        return cpuToken;
    }

    private buildCostWei(config: AppConfig, buildingType: BuildingType): bigint {
        const view = config.buildings.find((b) => b.type === buildingType);
        if (view === undefined) {
            throw new Error(`No build cost is configured for a ${buildingType} on network ${config.network}.`);
        }
        return parseEther(view.buildCost);
    }
}
