export const GALAXY_RULES = Object.freeze({ version: 2, tickRate: 30, snapshotRate: 10, capacity: 100, startingMass: 100, minimumMass: 10, eatingRatio: 1.25, maxCells: 16, splitMinimum: 80, ejectCost: 12, ejectMass: 10, foodPerSlot: 10, maxPellets: 1000, maxObjects: 50, protectionTicks: 90, reconnectTicks: 600, respawnTicks: 90, recoverySeconds: 7200 });
// Protocol 2 remains stable. A recorded ruleset selects immutable gameplay tuning.
export const LEGACY_RULESET_ID = 'memegalaxy-v2.0.0';
export const RULESET_ID = 'memegalaxy-v2.1.0';
const tuning = Object.freeze({
  [LEGACY_RULESET_ID]: Object.freeze({ foodMass: 1, baseSpeed: 230, minimumSpeed: 55, maximumSpeed: 260, speedExponent: .22, steeringResponse: 8 }),
  [RULESET_ID]: Object.freeze({ foodMass: 4, baseSpeed: 340, minimumSpeed: 80, maximumSpeed: 390, speedExponent: .28, steeringResponse: 12 }),
});
export function rulesFor(id: string) { const rules = tuning[id as keyof typeof tuning]; if (!rules) throw new Error('Unsupported gameplay ruleset'); return rules; }
export const radius = (mass: number) => 4 * Math.sqrt(Math.max(0, mass));
export const speed = (mass: number, ruleset = RULESET_ID) => { const r = rulesFor(ruleset); return Math.max(r.minimumSpeed, Math.min(r.maximumSpeed, r.baseSpeed * Math.pow(100 / Math.max(10, mass), r.speedExponent))); };
export const mergeDelay = (mass: number) => Math.ceil((20 + .02 * mass) * 30);
export function arenaAllocation(count: number) { if (!Number.isInteger(count) || count < 0 || count > 500) throw new Error('Invalid entrant count'); if (count < 10) return []; const n = Math.ceil(count / 100); return Array.from({length:n}, (_,i) => Math.floor(count/n) + (i < count%n ? 1 : 0)); }
