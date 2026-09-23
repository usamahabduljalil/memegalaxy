import { connectArena } from '../sdk/connection';
import type { Observation } from '../shared/galaxy/types';

const origin = process.env.MEMEGALAXY_API_URL ?? 'https://memegalaxy-staging-production.up.railway.app';
const lobby = await (await fetch(`${origin}/api/v2/lobby`)).json() as { rooms: Array<{id:string;mode:string;players:number}> };
const prize = lobby.rooms.find(room => room.mode === 'prize');
if (!prize) throw new Error('No hosted prize arena is open');
const response = await fetch(`${origin}/api/v2/rooms/${prize.id}/spectate`, { method:'POST' });
if (!response.ok) throw new Error(`Spectator admission failed: ${response.status}`);
const ticket = await response.json() as {roomId:string;token:string};
let resolveFrame!: (value: Observation) => void;
const frame = new Promise<Observation>(resolve => { resolveFrame = resolve; });
const connection = await connectArena(origin,ticket,{frame:resolveFrame,identity:()=>{}});
try {
  const observed = await Promise.race([frame,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('No spectator frame in 15 seconds')),15000))]);
  console.log(JSON.stringify({room:prize.id,connected:prize.players,simulationTick:observed.tick,alive:observed.alive,leaderboardEntries:observed.leaderboard.length}));
} finally {
  await connection.close();
}
