import { isAddress, parseEther, type Address, type Hash } from 'viem';

import { BUILDING_ON_CHAIN_ID } from './cell.constants.js';
import type {
    AppConfig,
    BuildInput,
    BuildPlacement,
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
import type { CellState, RevealCellReader } from '../map/types.js';
import { cpuFromWei } from '../utils/format.utils.js';
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
        this.assertBuildable(input, state, wallet.getAddress());

        const alreadyBuilt = state?.building?.type === input.buildingType;
        const placement: BuildPlacement = alreadyBuilt
            ? { buildTxHash: null, approveTxHash: null, buildCost: '0' }
            : await this.placeBuilding(config, cell, cpuToken, input, tokenId);
        const miningTxHash = await this.startExtractorMining(cell, tokenId, input);

        return {
            tokenId: input.tokenId,
            buildingType: input.buildingType,
            targetResourceId: input.targetResourceId,
            buildCost: placement.buildCost,
            approveTxHash: placement.approveTxHash,
            buildTxHash: placement.buildTxHash,
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
        this.assertOwner(input.tokenId, state, wallet.getAddress(), 'demolish');

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

    private assertBuildable(input: BuildInput, state: CellState | null, address: string): void {
        this.assertOwner(input.tokenId, state, address, 'build');
        if (state === null) {
            return;
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

    private assertOwner(tokenId: string, state: CellState | null, address: string, action: string): void {
        if (state !== null && state.owner.toLowerCase() !== address.toLowerCase()) {
            throw new Error(`You do not own cell ${tokenId} (owner ${state.owner}); only the owner can ${action}.`);
        }
    }

    private async placeBuilding(
        config: AppConfig,
        cell: Address,
        cpuToken: Address,
        input: BuildInput,
        tokenId: bigint,
    ): Promise<BuildPlacement> {
        const costWei = this.costWeiForBuilding(config, input.buildingType);
        const approveTxHash = costWei > 0n ? await this.allowance.ensureAllowance(cpuToken, cell, costWei) : null;

        this.logger.info('placing building', {
            tokenId: input.tokenId,
            buildingType: input.buildingType,
            costWei: costWei.toString(),
            network: config.network,
        });
        const buildTxHash = await this.cellClient.place({
            cell,
            tokenId,
            buildingType: BUILDING_ON_CHAIN_ID[input.buildingType],
        });
        await this.contracts.confirm(buildTxHash, 'Build transaction');

        return { buildTxHash, approveTxHash, buildCost: cpuFromWei(costWei.toString()) };
    }

    private async startExtractorMining(cell: Address, tokenId: bigint, input: BuildInput): Promise<Hash | null> {
        if (input.buildingType !== BuildingType.Extractor || input.targetResourceId === null) {
            return null;
        }
        this.logger.info('starting mining', { tokenId: input.tokenId, target: input.targetResourceId });
        const miningTxHash = await this.cellClient.startMining({ cell, tokenId, target: input.targetResourceId });
        await this.contracts.confirm(miningTxHash, 'Start mining');
        return miningTxHash;
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

    private costWeiForBuilding(config: AppConfig, buildingType: BuildingType): bigint {
        const view = config.buildings.find((b) => b.type === buildingType);
        if (view === undefined) {
            throw new Error(`No build cost is configured for a ${buildingType} on network ${config.network}.`);
        }
        return parseEther(view.buildCost);
    }
}
