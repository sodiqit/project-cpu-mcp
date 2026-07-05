import { parseEventLogs, type Address, type Log } from 'viem';

import { TRANSPORT_ABI } from '../contracts/transport.abi.js';

export interface ScheduledDelivery {
    deliveryId: bigint;
    sourceId: bigint;
    targetId: bigint;
    arrivalAt: bigint;
}

/**
 * Pulls the `DeliveryScheduled` event Transport emits on every scheduled move — whether the caller
 * moved directly or a trade write (create / buy / cancel) routed goods through it. Shared by
 * TransportService and TradeService so the receipt parse lives in one place.
 */
export function decodeDeliveryScheduled(logs: Array<Log>, transport: Address): ScheduledDelivery {
    const events = parseEventLogs({ abi: TRANSPORT_ABI, eventName: 'DeliveryScheduled', logs });
    const event = events.find((e) => e.address.toLowerCase() === transport.toLowerCase());
    if (event === undefined) {
        throw new Error('Move confirmed but Transport emitted no DeliveryScheduled event.');
    }
    return {
        deliveryId: event.args.deliveryId,
        sourceId: event.args.sourceId,
        targetId: event.args.targetId,
        arrivalAt: event.args.arrivalAt,
    };
}
