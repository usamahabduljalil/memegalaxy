import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { Server, matchMaker, WebSocketTransport } from '../server/galaxy/colyseus';
import { Client, type Room } from 'colyseus.js';

process.env.DATABASE_URL = '';
process.env.MEMEGALAXY_DATABASE_URL = '';
const { GalaxyRoom, roomCreationKey } = await import('../server/galaxy/room');
const { issueAdmission } = await import('../server/galaxy/auth');

const http = createServer();
const server = new Server({ transport: new WebSocketTransport({ server: http }) });
server.define('galaxy', GalaxyRoom);
await server.listen(0, '127.0.0.1');
const port = (http.address() as { port: number }).port;
const client = new Client(`ws://127.0.0.1:${port}`);
const entrants = Array.from({ length: 10 }, (_, i) => ({ id: `player:${i}`, name: `Player ${i}`, controller: 'human' as const }));
const connections: Room[] = [];

try {
  // Slow settlement must not pre-eliminate entrants before a room exists.
  const reservation = await matchMaker.createRoom('galaxy', {
    mode: 'prize', entrants, seed: 77, serviceKey: roomCreationKey,
    startsAt: Math.floor(Date.now() / 1000) - 90
  });
  const room = matchMaker.getLocalRoomById(reservation.roomId) as InstanceType<typeof GalaxyRoom>;
  assert.equal(room.world.tick, 0);
  for (const p of entrants.slice(0, 3)) {
    const token = await issueAdmission({ ...p, owner: p.id, roomId: reservation.roomId, scope: 'prize' });
    connections.push(await client.joinById(reservation.roomId, { token }));
  }
  assert.equal(room.world.players.filter(p => p.disconnectedTick === null).length, 3);
  connections[0].send('action', { seq: 0, type: 'SPLIT', x: 1, y: 0 });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(room.world.players[0].seq, -1, 'prematch actions must not change game state');
  (room as unknown as {prizeReadyAt:number}).prizeReadyAt = Date.now() - 1;
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.ok(room.world.tick > 0, 'match must begin after the join window');
  assert.equal((room as unknown as {failed:boolean}).failed, false);

  const empty = await matchMaker.createRoom('galaxy', { mode: 'prize', entrants, seed: 78, serviceKey: roomCreationKey });
  const emptyRoom = matchMaker.getLocalRoomById(empty.roomId) as InstanceType<typeof GalaxyRoom>;
  (emptyRoom as unknown as {prizeReadyAt:number}).prizeReadyAt = Date.now() - 1;
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal((emptyRoom as unknown as {failed:boolean}).failed, true, 'a room with no players must be invalidated, not awarded');
  console.log('Prize room creation, join, start, and no-show invalidation passed');
} finally {
  await Promise.all(connections.map(connection => connection.leave()));
  await server.gracefullyShutdown(false);
}
