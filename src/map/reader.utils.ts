import type { CellProjectionConfig } from './types.js';
import { BuildingKind } from '../api/types.js';
import type { AppConfig } from '../services/types.js';

export function buildingTypesOfKind(config: AppConfig, kind: BuildingKind): Set<string> {
    return new Set(config.buildings.filter((b) => b.kind === kind).map((b) => b.type as string));
}

export function craftOutputsByRecipe(config: AppConfig): Record<string, Array<number>> {
    return Object.fromEntries(
        config.recipes.map((r): [string, Array<number>] => [r.id, r.outputs.map((o) => o.resourceId)]),
    );
}

export function toProjectionConfig(config: AppConfig): CellProjectionConfig {
    return {
        hubStorageMultiplier: config.storage.hubStorageMultiplier,
        hubBuildingTypes: buildingTypesOfKind(config, BuildingKind.Hub),
        craftOutputsByRecipe: craftOutputsByRecipe(config),
    };
}
