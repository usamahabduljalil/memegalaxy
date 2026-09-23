import { strict as assert } from 'node:assert';
import { replay, type ReplayHeader, type ReplayInput } from '../shared/galaxy/replay';
import { rankings } from '../shared/galaxy/engine';

const origin = process.env.MEMEGALAXY_API_URL ?? 'https://memegalaxy-staging-production.up.railway.app';
const roomId = process.argv[2];
if (!roomId || !/^[A-Za-z0-9_-]{1,100}$/.test(roomId)) throw new Error('Pass a completed room ID');
let after = -1;
let header!: ReplayHeader;
let result!: Array<{id:string}>;
let endTick = 0;
const events: ReplayInput[] = [];
let chunks = 0;
while (true) {
  const response = await fetch(`${origin}/api/v2/rooms/${roomId}/replay?after=${after}`);
  if (!response.ok) throw new Error(`Replay fetch failed: ${response.status}`);
  const page = await response.json() as {header:ReplayHeader;result:Array<{id:string}>;checkpoint_tick:number;chunks:Array<{sequence:number;events:ReplayInput[]}>;next:number|null};
  header = page.header;result = page.result;endTick = page.checkpoint_tick;
  for (const chunk of page.chunks) { events.push(...chunk.events); chunks++; }
  if (page.next === null) break;
  if (page.next <= after) throw new Error('Replay pagination did not advance');
  after = page.next;
}
const world = replay(header,events,endTick);
assert.equal(world.finished,true,'Replay must reach a completed match');
assert.deepEqual(rankings(world).map(player=>player.id),result.map(player=>player.id),'Replay ranking must match published results');
console.log(JSON.stringify({verified:true,roomId,entrants:header.entrants.length,ticks:endTick,chunks,inputs:events.length}));
