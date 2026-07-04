import { BuildingType } from '../api/types.js';

export const REVEAL_CALLBACK_GAS = 500_000;

export const BUILDING_ON_CHAIN_ID: Record<BuildingType, number> = {
    [BuildingType.Extractor]: 1,
    [BuildingType.Hub]: 2,
};
