import { zeroAddress } from 'viem';

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

export function normalizeOptionalAddress(address: string | null | undefined): string | null {
    if (address === undefined || address === null || address === '') {
        return null;
    }
    return address.toLowerCase() === zeroAddress ? null : address;
}
