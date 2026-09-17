import { indexEntryHistory } from './entry-history';
import { randomBytes } from 'node:crypto';
import { keccak256, concatHex, formatUnits, type Address, type Hex } from 'viem';
import { config } from './config';
import { pool, query, heartbeat } from './db';
import { chain, assertChain, escrowAddress, readEpoch, writeEscrow, reconcilePending } from './chain';
import { escrowAbi } from '../shared/chain';
import { arenaSizes } from '../shared/economics';
if(!config.databaseUrl||!config.escrow||!process.env.RESULT_SIGNER_PRIVATE_KEY)throw new Error('Configure database, escrow, and result signer before starting the worker');
await assertChain();const lock=await pool.connect();await lock.query('SELECT pg_advisory_lock(748222)');lock.on('error',()=>process.exit(1));
async function reconcileRegistrations(epochId:bigint){
  const wallets=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'roster',args:[epochId]});
  // Deactivate first; upserts below only include chain-confirmed registrations.
  await query('UPDATE registrations SET active=false WHERE epoch_id=$1 AND NOT(wallet=ANY($2::text[]))',[epochId.toString(),wallets.map(x=>x.toLowerCase())]);
  const profiles=(await query('SELECT * FROM profiles WHERE wallet=ANY($1::text[])',[wallets.map(w=>w.toLowerCase())])).rows;
  const players=[];
  for(let offset=0;offset<wallets.length;offset+=50){const slice=wallets.slice(offset,offset+50);const values=await Promise.all(slice.map(wallet=>chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'entryInfo',args:[epochId,wallet]})));
    for(let i=0;i<slice.length;i++){const lower=slice[i].toLowerCase(),p=profiles.find(p=>p.wallet===lower),entry=values[i];if(!p)throw new Error('Registered player has no verified profile');await query('INSERT INTO registrations(epoch_id,wallet,user_id,deposit,active) VALUES($1,$2,$3,$4,true) ON CONFLICT(epoch_id,wallet) DO UPDATE SET deposit=$4,active=true',[epochId.toString(),lower,p.user_id,entry[0].toString()]);players.push({id:lower,name:p.name,deposit:Number(formatUnits(entry[0],18))});}
  }
  return players;
}
async function syncArenas(epoch:NonNullable<Awaited<ReturnType<typeof readEpoch>>>){
  const ordered=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'roster',args:[epoch.id]});
  const stored=(await query('SELECT r.wallet,r.deposit,p.name FROM registrations r JOIN profiles p ON p.user_id=r.user_id WHERE r.epoch_id=$1 AND r.active',[epoch.id.toString()])).rows;
  const players=ordered.map(wallet=>{const p=stored.find(p=>p.wallet===wallet.toLowerCase());if(!p)throw new Error('Confirmed roster is missing from database');return {id:p.wallet,name:p.name,deposit:Number(formatUnits(BigInt(p.deposit),18))};}),sizes=arenaSizes(players.length);let cursor=0,total=0n;
  for(let index=0;index<sizes.length;index++){
    const a=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'arenaInfo',args:[epoch.id,BigInt(index+1)]});total+=a.budget;
    const roster=players.slice(cursor,cursor+sizes[index]);cursor+=sizes[index];
    const seed=parseInt(keccak256(concatHex([epoch.seed,('0x'+(index+1).toString(16).padStart(64,'0')) as Hex])).slice(2,10),16);
    await query('INSERT INTO arenas(epoch_id,chain_arena,seed,budget,starts_at,roster) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(epoch_id,chain_arena) DO NOTHING',[epoch.id.toString(),index+1,seed,a.budget.toString(),Number(a.startedAt),JSON.stringify(roster)]);
    const row=(await query('SELECT * FROM arenas WHERE epoch_id=$1 AND chain_arena=$2',[epoch.id.toString(),index+1])).rows[0];
    for(const p of roster)await query('UPDATE registrations SET arena_id=$3 WHERE epoch_id=$1 AND wallet=$2',[epoch.id.toString(),p.id,row.id]);
    if(a.status===2)await query("UPDATE arenas SET status='settled' WHERE id=$1",[row.id]);else if(a.status===3)await query("UPDATE arenas SET status='refunded' WHERE id=$1",[row.id]);
  }
  await query("UPDATE epochs SET status='running',seed=$2,match_deadline=$3,pool=$4 WHERE id=$1",[epoch.id.toString(),epoch.seed,epoch.matchDeadline,total.toString()]);
}
async function processEpoch(){
  const epoch=await readEpoch();
  if(!epoch||epoch.status===3){
    if(epoch){await query("UPDATE epochs SET status='closed' WHERE id=$1",[epoch.id.toString()]);const owed=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'operationsOwed'});if(owed>0n)await writeEscrow(`operations:${epoch.id}`,'payOperations',[],{epoch:epoch.id});}
    if(!config.paid)return;
    const next=(epoch?.id??0n)+1n;let row=(await query('SELECT * FROM epochs WHERE id=$1',[next.toString()])).rows[0];
    if(!row){const secret=('0x'+randomBytes(32).toString('hex')) as Hex,commitment=keccak256(secret);await query("INSERT INTO epochs(id,status,secret,commitment,deadline) VALUES($1,'opening',$2,$3,0)",[next.toString(),secret,commitment]);row={secret,commitment};}
    await writeEscrow(`open:${next}`,'openEpoch',[row.commitment],{epoch:next});return;
  }
  const row=(await query('SELECT * FROM epochs WHERE id=$1',[epoch.id.toString()])).rows[0];if(!row)throw new Error('Missing committed epoch secret; manual recovery required');
  await query('UPDATE epochs SET deadline=$2,status=$3 WHERE id=$1',[epoch.id.toString(),epoch.deadline,['missing','registration','running','closed'][epoch.status]]);
  if(epoch.status===1){
    await reconcileRegistrations(epoch.id);if(Date.now()/1000<epoch.deadline)return;
    const available=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'availablePrize'}),paused=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'entriesPaused'});
    if(epoch.count<10||available<100000000n||paused){await writeEscrow(`roll:${epoch.id}:${epoch.deadline}`,'rollover',[epoch.id],{epoch:epoch.id});return;}
    if(epoch.entropyBlock===0n){await writeEscrow(`entropy:${epoch.id}:${epoch.deadline}`,'requestEntropy',[epoch.id],{epoch:epoch.id});return;}
    const block=(await chain.getBlock({blockTag:'finalized'})).number;if(block<=epoch.entropyBlock)return;if(block>epoch.entropyBlock+256n){await writeEscrow(`abandon:${epoch.id}`,'abandonExpiredEntropy',[epoch.id],{epoch:epoch.id});return;}
    const entropy=await chain.getBlock({blockNumber:epoch.entropyBlock}),seed=keccak256(concatHex([row.secret,entropy.hash!]));
    const roster=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'roster',args:[epoch.id]});
    const ordered=[...roster].sort((a,b)=>keccak256(concatHex([seed,a])).localeCompare(keccak256(concatHex([seed,b]))));
    await writeEscrow(`start:${epoch.id}`,'startEpoch',[epoch.id,row.secret,ordered],{epoch:epoch.id});const started=await readEpoch(epoch.id);if(started)await syncArenas(started);return;
  }
  if(epoch.status===2){
    const arenaCount=Number((await query('SELECT count(*) AS n FROM arenas WHERE epoch_id=$1',[epoch.id.toString()])).rows[0].n);if(arenaCount!==epoch.arenas)await syncArenas(epoch);
    await query("UPDATE arenas SET status='invalid',error='Arena heartbeat timed out' WHERE epoch_id=$1 AND ((status='active' AND heartbeat<now()-interval '20 seconds') OR (status='pending' AND starts_at<extract(epoch from now())-15))",[epoch.id.toString()]);
    const {rows}=await query("SELECT * FROM arenas WHERE epoch_id=$1 AND status IN ('completed','invalid') ORDER BY id",[epoch.id.toString()]);
    for(const a of rows){const chainState=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'arenaInfo',args:[epoch.id,BigInt(a.chain_arena)]});if(chainState.status===2||chainState.status===3){await query('UPDATE arenas SET status=$2 WHERE id=$1',[a.id,chainState.status===2?'settled':'refunded']);continue;}
      if(a.status==='completed'&&Date.now()/1000<epoch.matchDeadline+3600){await writeEscrow(`settle:${a.id}`,'finalizeArena',[epoch.id,BigInt(a.chain_arena),a.result.slice(0,3).map((p:any)=>p.wallet),a.replay_hash,BigInt(a.ended_at)],{epoch:epoch.id});await query("UPDATE arenas SET status='settled' WHERE id=$1",[a.id]);}
      else {await writeEscrow(`invalidate:${a.id}`,'invalidateArena',[epoch.id,BigInt(a.chain_arena)],{epoch:epoch.id});await query("UPDATE arenas SET status='refunded' WHERE id=$1",[a.id]);}
    }
  }
}
async function payOutstanding(){
  const {rows}=await query("SELECT r.epoch_id,r.wallet FROM registrations r JOIN epochs e ON e.id=r.epoch_id WHERE r.active AND e.status='closed' AND (NOT EXISTS(SELECT 1 FROM transactions t WHERE t.operation_key='token:'||r.epoch_id||':'||r.wallet AND t.status='confirmed') OR NOT EXISTS(SELECT 1 FROM transactions t WHERE t.operation_key='usdc:'||r.epoch_id||':'||r.wallet AND t.status='confirmed')) ORDER BY r.payment_checked_at NULLS FIRST,r.epoch_id,r.wallet LIMIT 10");
  for(const r of rows){await query('UPDATE registrations SET payment_checked_at=now() WHERE epoch_id=$1 AND wallet=$2',[r.epoch_id,r.wallet]);const id=BigInt(r.epoch_id),wallet=r.wallet as Address;const entry=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'entryInfo',args:[id,wallet]});for(const [prefix,fn,already] of [['token','claimToken',entry[3]],['usdc','claimUSDC',entry[4]]] as const){const key=`${prefix}:${id}:${wallet}`;if(already){await query("INSERT INTO transactions(operation_key,epoch_id,wallet,kind,status) VALUES($1,$2,$3,$4,'confirmed') ON CONFLICT(operation_key) DO UPDATE SET status='confirmed'",[key,id.toString(),wallet,fn]);continue;}try{await writeEscrow(key,fn,[id,wallet],{epoch:id,wallet,kind:fn});}catch(error){console.error('Payment remains claimable',key,String(error).slice(0,120));}}}
}
const healthTimer=setInterval(()=>{void heartbeat('worker').catch(()=>{});},5000);
let running=false;const timer=setInterval(async()=>{if(running)return;running=true;try{await heartbeat('worker');await reconcilePending();try{await processEpoch();}catch(error){console.error('Epoch coordinator:',error instanceof Error?error.message:String(error));}await payOutstanding();try{await indexEntryHistory();}catch(error){console.error('Entry history:',error instanceof Error?error.message:String(error));}}catch(error){console.error('Worker cycle:',error instanceof Error?error.message:String(error));}finally{running=false;}},2000);
console.log('Arc testnet settlement worker running');process.on('SIGTERM',()=>{clearInterval(timer);clearInterval(healthTimer);void pool.end();process.exit(0);});
