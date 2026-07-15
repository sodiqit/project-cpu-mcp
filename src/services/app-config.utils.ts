import { type ModeSwitchView, ModeSwitchKind } from './types.js';

export function toModeSwitchView(cost: string | null | undefined): ModeSwitchView {
    if (cost === undefined) {
        return { kind: ModeSwitchKind.Unknown };
    }
    if (cost === null) {
        return { kind: ModeSwitchKind.Impossible };
    }
    return { kind: ModeSwitchKind.Possible, costCpu: cost };
}
