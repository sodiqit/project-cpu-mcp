import type { ClaimCraftResponse, CraftProcessStatusResponse, CraftStackView, RecipeView } from '../../api/types.js';
import { CraftProcessStatus } from '../../api/types.js';
import type { FreeCraftResult, PaidCraftResult } from '../../services/types.js';
import { cpuFromWei, formatUnixSeconds, resourceLabel, type ResourceNames } from '../../utils/format.utils.js';

function formatStacks(stacks: Array<CraftStackView>, resources: ResourceNames): string {
    if (stacks.length === 0) {
        return 'nothing';
    }
    return stacks.map((s) => `${s.amount} ${resourceLabel(resources, s.resourceId)}`).join(' + ');
}

function formatDuration(sec: number): string {
    if (sec < 60) {
        return `${sec}s`;
    }
    if (sec < 3600) {
        return `${Math.round(sec / 60)}m`;
    }
    return `${(sec / 3600).toFixed(sec % 3600 === 0 ? 0 : 1)}h`;
}

function formatCost(costCpu: string): string {
    return costCpu === '0' ? 'free' : `${costCpu} $CPU/batch`;
}

export function summarizeRecipes(recipes: Array<RecipeView>, resources: ResourceNames): string {
    if (recipes.length === 0) {
        return 'No craft recipes available.';
    }
    return recipes
        .map(
            (r) =>
                `${r.name} (${r.id}): ${formatStacks(r.inputs, resources)} → ${formatStacks(r.outputs, resources)}, ` +
                `~${formatDuration(r.durationSec)}/batch, ${formatCost(r.costCpu)}`,
        )
        .join('\n');
}

export function summarizeFreeCraft(r: FreeCraftResult, resources: ResourceNames): string {
    return (
        `Free craft started on cell ${r.tokenId}: ${r.batches}× ${r.recipeId}, consumes ` +
        `${formatStacks(r.debitedInputs, resources)}, ready by ${formatUnixSeconds(r.endsAt)}. Bank it with claim_craft ${r.tokenId}.`
    );
}

export function summarizePaidCraft(r: PaidCraftResult, resources: ResourceNames): string {
    const approve = r.approveTxHash !== null ? `approve tx ${r.approveTxHash}, ` : '';
    return (
        `Paid craft on cell ${r.tokenId}: ${r.batches}× ${r.recipeId} (${cpuFromWei(r.cpuAmount)} $CPU), consumes ` +
        `${formatStacks(r.debitedInputs, resources)}. ${approve}craft tx ${r.txHash} confirmed in block ` +
        `${r.blockNumber}. The timer starts once the indexer settles — check get_craft_status ${r.tokenId}.`
    );
}

export function summarizeCraftStatus(processes: Array<CraftProcessStatusResponse>, resources: ResourceNames): string {
    if (processes.length === 0) {
        return 'No craft processes on this cell.';
    }
    return processes
        .map((p) => {
            if (p.status === CraftProcessStatus.Pending) {
                return `${p.recipeId}: pending payment — timer not started`;
            }
            const claimable =
                p.claimableBatches > 0
                    ? `, ${p.claimableBatches} claimable now (${formatStacks(p.claimableOutputs, resources)})`
                    : '';
            const when = p.isFinished
                ? 'finished'
                : p.nextBatchAt !== null
                  ? `next batch ${formatUnixSeconds(p.nextBatchAt)}`
                  : p.endsAt !== null
                    ? `done ${formatUnixSeconds(p.endsAt)}`
                    : 'in progress';
            return `${p.recipeId}: ${p.completedBatches}/${p.batches} batches done${claimable}, ${when}`;
        })
        .join('\n');
}

export function summarizeClaim(claim: ClaimCraftResponse, resources: ResourceNames): string {
    const running = claim.processes.filter((p) => !p.isFinished).length;
    const tail = running > 0 ? ` ${running} process(es) still running.` : '';
    if (claim.claimed.length === 0) {
        return `Nothing matured yet on cell ${claim.tokenId}.${tail}`;
    }
    return `Claimed ${formatStacks(claim.claimed, resources)} on cell ${claim.tokenId}.${tail}`;
}
