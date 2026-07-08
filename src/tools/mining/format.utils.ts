import type { MiningClaimResult, MiningStatusResult, StartMiningResult } from '../../services/types.js';
import { formatDuration, resourceLabel, type ResourceNames } from '../../utils/format.utils.js';

export function summarizeMiningStart(r: StartMiningResult, resources: ResourceNames): string {
    const cycle =
        r.batch !== null && r.durationSec !== null
            ? ` a batch of ${r.batch} every ${formatDuration(r.durationSec)}`
            : '';
    return (
        `Started mining ${resourceLabel(resources, r.targetResourceId)}${cycle} on cell ${r.tokenId}: ` +
        `tx ${r.txHash} confirmed in block ${r.blockNumber}. Each cycle matures a batch — check ` +
        `cpu_get_mining_status ${r.tokenId} and bank matured batches with cpu_claim_mining.`
    );
}

export function summarizeMiningStatus(s: MiningStatusResult, resources: ResourceNames): string {
    if (!s.active || s.targetResourceId === null) {
        return `Cell ${s.tokenId} has no active mining (no extractor, or the deposit is depleted).`;
    }
    const cycle =
        s.batch !== null && s.durationSec !== null
            ? `batch of ${s.batch} every ${formatDuration(s.durationSec)}. `
            : '';
    const cycles = `${s.cyclesMatured} cycle${s.cyclesMatured === 1 ? '' : 's'} matured`;
    const next = s.nextBatchInSec !== null ? `, next batch in ${formatDuration(s.nextBatchInSec)}` : '';
    const depleted = s.depositRemaining === '0' ? ' Deposit depleted.' : '';
    const stalled = s.stalled
        ? ` Warehouse FULL (${s.warehouseUsed}/${s.warehouseCap}) — mining stalled; offload to resume.`
        : '';
    return (
        `Cell ${s.tokenId} mining ${resourceLabel(resources, s.targetResourceId)}: ${cycle}` +
        `${s.claimable} claimable now (${cycles})${next}. ${s.depositRemaining} left in deposit.${depleted}${stalled}`
    );
}

export function summarizeMiningClaim(r: MiningClaimResult, resources: ResourceNames): string {
    const claimed = BigInt(r.claimedAmount);
    if (claimed > 0n && r.resourceId !== null) {
        return (
            `Claimed ${r.claimedAmount} ${resourceLabel(resources, r.resourceId)} from cell ${r.tokenId}: ` +
            `tx ${r.txHash} confirmed in block ${r.blockNumber}.`
        );
    }
    return (
        `Nothing newly matured to claim on cell ${r.tokenId} (tx ${r.txHash}); mining keeps running until the ` +
        `deposit is depleted.`
    );
}
