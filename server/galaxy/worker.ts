import {economyCycle} from './economy-worker';
import 'dotenv/config';
import { awardStats } from './stats';
import { randomBytes } from 'node:crypto';
import { createPublicClient,http,keccak256,concatHex,type Hex,type Address } from 'viem';
import { db,migrateGalaxy,persistent } from './store';
import { assertNetwork,assertPrizeEscrow,chain,deployment,epoch,paid,read,reconcile,transact } from './chain';
import { arenaAllocation } from '../../shared/galaxy/rules';
import { replay,type ReplayHeader,type ReplayInput } from '../../shared/galaxy/replay';
import { rankings } from '../../shared/galaxy/engine';
import { canonicalJSON } from '../../shared/canonical';
import { ROOM_START_GRACE_SECONDS,ROOM_HEARTBEAT_GRACE_MS } from './lifecycle';
if(!persistent)throw new Error('MEMEGalaxy worker requires PostgreSQL');await migrateGalaxy();await assertNetwork();await assertPrizeEscrow();
// Solidity's block.number follows the parent height, but Nitro's BLOCKHASH value may differ from a Sepolia RPC hash.
const parent=createPublicClient({transport:http(process.env.SEPOLIA_RPC_URL??'https://ethereum-sepolia-rpc.publicnode.com',{timeout:15000,retryCount:1})});
if(await parent.getChainId()!==11155111)throw new Error('Entropy RPC must be Ethereum Sepolia');
const lock=await db.connect();await lock.query('SELECT pg_advisory_lock(hashtext($1))',[`memegalaxy-worker:${deployment}`]);lock.on('error',()=>process.exit(1));
async function cycle(){await reconcile();const e=await epoch();if(!e||e.status===3){if(e){await db.query("UPDATE mg_epochs SET status='closed' WHERE deployment=$1 AND id=$2",[deployment,e.id.toString()]);await reconcileClosedJobs(e.id);await payout();}if(!paid)return;const id=(e?.id??0n)+1n;let row=(await db.query('SELECT * FROM mg_epochs WHERE deployment=$1 AND id=$2',[deployment,id.toString()])).rows[0];if(!row){const secret=`0x${randomBytes(32).toString('hex')}` as Hex;row={secret,commitment:keccak256(secret)};await db.query("INSERT INTO mg_epochs(deployment,id,status,secret,commitment) VALUES($1,$2,'opening',$3,$4)",[deployment,id.toString(),row.secret,row.commitment]);}await transact(`open:${id}`,'openEpoch',[row.commitment],id);return;}
 const now=Number((await chain.getBlock()).timestamp);const wallets=await read('roster',[e.id]) as Address[];
 for(const wallet of wallets){const hash=await read('controllers',[e.id,wallet]);const row=(await db.query('SELECT * FROM mg_entries WHERE deployment=$1 AND epoch=$2 AND wallet=$3 AND controller_hash=$4',[deployment,e.id.toString(),wallet.toLowerCase(),hash])).rows[0];if(!row)throw new Error('Confirmed entry is missing its frozen controller record');await db.query('UPDATE mg_entries SET confirmed=true WHERE deployment=$1 AND epoch=$2 AND wallet=$3',[deployment,e.id.toString(),wallet.toLowerCase()]);}
 await db.query('UPDATE mg_entries SET confirmed=false WHERE deployment=$1 AND epoch=$2 AND NOT(wallet=ANY($3::text[]))',[deployment,e.id.toString(),wallets.map(w=>w.toLowerCase())]);
 const entropyMode=process.env.MEMEGALAXY_ENTROPY_SOURCE??'finalized-parent';
 if(entropyMode!=='contract'&&entropyMode!=='finalized-parent')throw new Error('Unsupported entropy source');
 if(e.status===1){
  if(now<e.deadline)return;
  if(e.count<10||BigInt(await read('availablePrize'))<100000000n||await read('entriesPaused')){
   await transact(`roll:${e.id}:${e.deadline}`,'rollover',[e.id],e.id);return;
  }
  if(!paid)return;
  if(e.entropyBlock===0n){
   await transact(`entropy:${e.id}:${e.deadline}`,'requestEntropy',[e.id],e.id);return;
  }
  let entropyHash:Hex;
  if(entropyMode==='contract'){
   // The view executes BLOCKHASH in the same rollup context as startEpoch.
   entropyHash=await read('entropyHash',[e.id]) as Hex;
   if(entropyHash===`0x${'0'.repeat(64)}`){
    if((await parent.getBlock()).number>e.entropyBlock+256n)
     await transact(`abandon:${e.id}`,'abandonExpiredEntropy',[e.id],e.id);
    return;
   }
  }else{
   // V2 has no onchain getter; an external RPC hash cannot prove the roster's seed.
   throw new Error('Legacy entropy source cannot safely start a new prize epoch');
  }
  const row=(await db.query('SELECT secret FROM mg_epochs WHERE deployment=$1 AND id=$2',[deployment,e.id.toString()])).rows[0];
  if(!row)throw new Error('Missing committed secret');
  const seed=keccak256(concatHex([row.secret,entropyHash]));
  const ordered=[...wallets].sort((a,b)=>keccak256(concatHex([seed,a])).localeCompare(keccak256(concatHex([seed,b]))));
  if(entropyMode==='contract')
   await db.query('UPDATE mg_epochs SET entropy_hash=$3 WHERE deployment=$1 AND id=$2',[deployment,e.id.toString(),entropyHash]);
  await transact(`start:${e.id}`,'startEpoch',[e.id,row.secret,ordered],e.id);
  return;
 }
 if(entropyMode==='contract'){
  const row=(await db.query('SELECT secret,entropy_hash FROM mg_epochs WHERE deployment=$1 AND id=$2',[deployment,e.id.toString()])).rows[0];
  if(!row?.entropy_hash)throw new Error('Missing persisted entropy hash for started epoch');
  const expected=keccak256(concatHex([row.secret,row.entropy_hash]));
  if(expected!==e.seed){
   // A parent-chain reorganization between the view and start must never pick an uncommitted roster.
   for(let arena=1;arena<=e.arenas;arena++)
    await transact(`entropy-mismatch:${e.id}:${arena}`,'invalidateArena',[e.id,BigInt(arena)],e.id);
   return;
  }
 }

 const sizes=arenaAllocation(wallets.length);let cursor=0;
 for(let arena=1;arena<=sizes.length;arena++){const a=await read('arenaInfo',[e.id,BigInt(arena)]),id=`${deployment}:${e.id}:${arena}`;const chunk=wallets.slice(cursor,cursor+sizes[arena-1]);cursor+=sizes[arena-1];const roster:Array<{id:string;name:string;controller:'human'|'agent';wallet:string}>=[];for(const wallet of chunk){const row=(await db.query('SELECT * FROM mg_entries WHERE deployment=$1 AND epoch=$2 AND wallet=$3',[deployment,e.id.toString(),wallet.toLowerCase()])).rows[0];roster.push({id:row.player_id,name:row.name,controller:row.controller,wallet:row.wallet});}const seed=parseInt(keccak256(concatHex([e.seed,`0x${arena.toString(16).padStart(64,'0')}` as Hex])).slice(2,10),16);await db.query('INSERT INTO mg_jobs(id,deployment,epoch,arena,seed,roster,budget,starts_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING',[id,deployment,e.id.toString(),arena,seed,JSON.stringify(roster),a.budget.toString(),Number(a.startedAt)]);
 const job=(await db.query('SELECT j.*,m.status AS match_status,m.header,m.result,m.checkpoint_tick,m.heartbeat FROM mg_jobs j LEFT JOIN mg_matches m ON m.id=j.room_id WHERE j.id=$1',[id])).rows[0];
 if(a.status===2||a.status===3){if(a.status===2&&job.result)await awardStats(id,job.result);await db.query('UPDATE mg_jobs SET status=$2 WHERE id=$1',[id,a.status===2?'settled':'refunded']);continue;}
 if(now>=e.recovery){await transact(`recover:${id}`,'recoverArena',[e.id,BigInt(arena)],e.id);continue;}
 if(job.match_status==='completed'){
   const chunks=(await db.query('SELECT events FROM mg_events WHERE match_id=$1 ORDER BY sequence',[job.room_id])).rows;const events=chunks.flatMap(r=>r.events) as ReplayInput[];const world=replay(job.header as ReplayHeader,events,job.checkpoint_tick);if(!world.finished)throw new Error('Replay did not finish');const result=rankings(world);if(result.some((p,i)=>p.id!==job.result[i]?.id))throw new Error('Replay ranking mismatch');const winners=result.slice(0,3).map(p=>roster.find(r=>r.id===p.id)!.wallet);const digest=keccak256(new TextEncoder().encode(canonicalJSON({header:job.header,events,endTick:world.tick})));await transact(`settle:${id}`,'finalizeArena',[e.id,BigInt(arena),winners,digest,BigInt(Math.max(Number(a.startedAt),Math.floor(new Date(job.heartbeat).getTime()/1000)))],e.id);
 }else if(job.status==='invalid'||job.match_status==='invalid'||now>Number(a.startedAt)+ROOM_START_GRACE_SECONDS&&(!job.heartbeat||Date.now()-new Date(job.heartbeat).getTime()>ROOM_HEARTBEAT_GRACE_MS)){await transact(`invalid:${id}`,'invalidateArena',[e.id,BigInt(arena)],e.id);}
 }
 await payout();
}
async function reconcileClosedJobs(epochId:bigint){const jobs=(await db.query('SELECT j.id,j.arena,m.result FROM mg_jobs j LEFT JOIN mg_matches m ON m.id=j.room_id WHERE j.deployment=$1 AND j.epoch=$2',[deployment,epochId.toString()])).rows;for(const job of jobs){const arena=await read('arenaInfo',[epochId,BigInt(job.arena)]);if(arena.status===2&&job.result)await awardStats(job.id,job.result);if(arena.status===2||arena.status===3)await db.query('UPDATE mg_jobs SET status=$2 WHERE id=$1',[job.id,arena.status===2?'settled':'refunded']);}}
async function payout(){const rows=(await db.query("SELECT x.* FROM mg_entries x JOIN mg_epochs e ON e.deployment=x.deployment AND e.id=x.epoch WHERE x.deployment=$1 AND x.confirmed AND e.status='closed'",[deployment])).rows;for(const r of rows){const id=BigInt(r.epoch),entry=await read('entryInfo',[id,r.wallet]);for(const [fn,done]of [['claimToken',entry[3]],['claimUSDC',entry[4]]]as const){if(done)continue;try{await transact(`${fn}:${id}:${r.wallet}`,fn,[id,r.wallet],id,r.wallet);}catch{console.warn('Payout remains claimable',fn,r.wallet);}}}}
let busy=false;const timer=setInterval(async()=>{if(busy)return;busy=true;try{await cycle();}catch(e){console.error('MEMEGalaxy worker:',e instanceof Error?e.message:'cycle failed');}finally{try{await economyCycle();}catch(e){console.error('Economy worker:',e instanceof Error?e.message:'cycle failed');}busy=false;}},2000);console.log('MEMEGalaxy testnet worker running');process.on('SIGTERM',()=>{clearInterval(timer);void db.end();});
