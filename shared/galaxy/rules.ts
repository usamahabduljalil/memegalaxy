export const GALAXY_RULES = Object.freeze({ version: 2, tickRate: 30, snapshotRate: 10, capacity: 100, startingMass: 100, minimumMass: 10, eatingRatio: 1.25, maxCells: 16, splitMinimum: 80, ejectCost: 12, ejectMass: 10, foodPerSlot: 10, maxPellets: 1000, maxObjects: 50, protectionTicks: 90, reconnectTicks: 600, respawnTicks: 90, recoverySeconds: 7200 });
// Every replay records this exact identifier; changed tuning requires a new rules version.
export const RULESET_ID = 'memegalaxy-v2.0.0';
export const radius = (mass: number) => 4 * Math.sqrt(Math.max(0, mass));
export const speed = (mass: number) => Math.max(55, Math.min(260, 230 * Math.pow(100 / Math.max(10, mass), .22)));
export const mergeDelay = (mass: number) => Math.ceil((20 + .02 * mass) * 30);
export function arenaAllocation(count: number) { if (!Number.isInteger(count) || count < 0 || count > 500) throw new Error('Invalid entrant count'); if (count < 10) return []; const n = Math.ceil(count / 100); return Array.from({length:n}, (_,i) => Math.floor(count/n) + (i < count%n ? 1 : 0)); }
