export const SET_SALE_FEE_DESCRIPTION = [
    'Set the sale-fee rate for one resource on a Hub you own, on-chain (needs a session — `cpu_authenticate`',
    'first). The rate is a percent of every sale of that resource settled on your hub (0–50, 0.01 granularity),',
    'carved out of the seller proceeds; set 0 to list that resource for free. One resource per call (loop for',
    'several). The rate applies only to lots listed after it lands — open lots keep the rate frozen at their own',
    'listing. Settable on a hub still under construction, so it is already in place when the hub becomes Ready.',
    'Reverts if you do not own the hub or the rate exceeds the 50% cap. Returns the confirmed rate and tx hash.',
].join(' ');
