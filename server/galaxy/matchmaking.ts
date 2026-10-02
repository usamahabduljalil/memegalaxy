type RoomListing = {roomId: string; clients: number; metadata?: {mode?: string; players?: number; spectators?: number}};

/** Spectator seats and pending player admissions are separate from arena capacity. */
export function roomPopulation(room: RoomListing) {
  return room.metadata?.players ?? room.clients;
}

export function availableRoom<T extends RoomListing>(rooms: T[], mode: 'free' | 'hunt', pending = new Map<string, number>()) {
  return rooms.find(room => room.metadata?.mode === mode && Math.max(roomPopulation(room), pending.get(room.roomId) ?? 0) < 100);
}
