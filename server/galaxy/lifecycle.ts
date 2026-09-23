// Service timing, separate from the immutable gameplay ruleset.
export const ROOM_CREATION_GRACE_SECONDS = 120;
export const PRIZE_JOIN_WINDOW_MS = 60_000;
export const ROOM_START_GRACE_SECONDS = ROOM_CREATION_GRACE_SECONDS + PRIZE_JOIN_WINDOW_MS / 1000;
export const ROOM_HEARTBEAT_GRACE_MS = 30_000;
