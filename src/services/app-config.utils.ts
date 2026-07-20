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

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export function normalizeOptionalAddress(address: string | null | undefined): string | null {
    if (address === undefined || address === null || address === '') {
        return null;
    }
    return address.toLowerCase() === ZERO_ADDRESS ? null : address;
}
