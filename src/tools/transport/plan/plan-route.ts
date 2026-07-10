import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { PLAN_ROUTE_DESCRIPTION } from './constants.js';
import type { PlanRouteResult } from '../../../services/types.js';
import type { AppContext } from '../../../types.js';
import { planRouteInputSchema } from '../types.js';

function summarizePlan(plan: PlanRouteResult): string {
    const chain = plan.waypoints.join(' → ');
    const fees =
        plan.foreignHubs.length === 0
            ? 'no foreign hubs — no transit fee'
            : `${plan.foreignHubs.length} foreign hub(s)` +
              (plan.estimatedFee !== null ? `, ~${plan.estimatedFee} $CPU fee` : '');
    return (
        `Planned ${plan.optimize} route (${plan.waypoints.length} waypoints, ${plan.totalDistance} grid steps, ` +
        `~${plan.estimatedTravelSec}s travel): ${chain}. ${fees}. ${plan.note}`
    );
}

export function registerPlanRouteTool(server: McpServer, context: AppContext): void {
    server.registerTool(
        'cpu_plan_route',
        { description: PLAN_ROUTE_DESCRIPTION, inputSchema: planRouteInputSchema },
        async (args) => {
            const plan = await context.route.plan({
                from: args.from,
                to: args.to,
                amount: args.amount,
                optimize: args.optimize,
            });

            return {
                content: [
                    { type: 'text', text: summarizePlan(plan) },
                    { type: 'text', text: JSON.stringify(plan) },
                ],
            };
        },
    );
}
