import type { CraftStackView, RecipeView } from '../../api/types.js';
import type { CraftClaimResult, CraftStartResult, CraftStatusResult } from '../../services/types.js';
import { resourceLabel, type ResourceNames } from '../../utils/format.utils.js';

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

export function summarizeCraftStart(r: CraftStartResult): string {
    const approve = r.approveTxHash !== null ? `approve tx ${r.approveTxHash}, ` : '';
    const cost = r.costCpu === '0' ? 'free' : `${r.costCpu} $CPU`;
    return (
        `Craft started on cell ${r.tokenId}: ${r.batches}× ${r.recipeId} (${cost}). ${approve}craft tx ${r.txHash} ` +
        `confirmed in block ${r.blockNumber}. Batches mature over time — check get_craft_status ${r.tokenId} and bank ` +
        `matured ones with claim_craft ${r.tokenId}.`
    );
}

export function summarizeCraftStatus(s: CraftStatusResult): string {
    if (!s.active) {
        return `Cell ${s.tokenId} has no active craft.`;
    }
    const claimable = s.claimableBatches > 0 ? `, ${s.claimableBatches} claimable now` : '';
    return (
        `Cell ${s.tokenId} crafting ${s.recipeId}: ${s.maturedBatches}/${s.batches} batches matured ` +
        `(${s.claimedBatches} already claimed)${claimable}.`
    );
}

export function summarizeCraftClaim(r: CraftClaimResult, resources: ResourceNames): string {
    if (r.outputs.length === 0) {
        return `Nothing matured yet to claim on cell ${r.tokenId} (tx ${r.txHash}).`;
    }
    const outs = r.outputs.map((o) => `${o.amount} ${resourceLabel(resources, o.resourceId)}`).join(' + ');
    return `Claimed ${r.batches} batch(es) → ${outs} on cell ${r.tokenId}: tx ${r.txHash} confirmed in block ${r.blockNumber}.`;
}
