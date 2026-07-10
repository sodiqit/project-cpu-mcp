import { decodeErrorResult, type Abi, type Hex } from 'viem';

const MAX_CAUSE_DEPTH = 10;

// viem carries the raw revert payload on different nodes depending on the path taken
// (RawContractError for contract calls, RpcRequestError for raw sends), so walk the
// cause chain for the first hex `data` instead of matching a specific error class.
export function extractRevertData(error: unknown): Hex | null {
    let current: unknown = error;
    for (let depth = 0; depth < MAX_CAUSE_DEPTH && typeof current === 'object' && current !== null; depth += 1) {
        const data: unknown = (current as { data: unknown }).data;
        const hex = typeof data === 'object' && data !== null ? (data as { data: unknown }).data : data;
        if (typeof hex === 'string' && hex.startsWith('0x') && hex.length > 2) {
            return hex as Hex;
        }
        current = (current as { cause: unknown }).cause;
    }
    return null;
}

export function describeRevert(error: unknown, abi: Abi): string | null {
    const data = extractRevertData(error);
    if (data === null) {
        return null;
    }
    try {
        const decoded = decodeErrorResult({ abi, data });
        const args = (decoded.args ?? []).map((arg) => String(arg)).join(', ');
        return `${decoded.errorName}(${args})`;
    } catch {
        return null;
    }
}
