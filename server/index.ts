import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { createServer } from 'node:http';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { keccak256, stringToHex, parseUnits, formatUnits } from 'viem';
import { z } from 'zod';
import { config, missingConfiguration, access } from './config';
import { authenticate, admissionToken } from './auth';
import { pool, query, heartbeat } from './db';
import { chain, escrowAddress, readEpoch, signer, assertChain } from './chain';
import { escrowAbi, entryTypes, arcTestnet } from '../shared/chain';
import { ArenaRoom } from './room';
let leaderReady=!config.databaseUrl;
const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
app.use(cors({origin(origin,done){done(null,!origin||config.origins.includes(origin));}}));app.use(express.json({limit:'16kb'}));app.use(rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-7',legacyHeaders:false}));
const route=(fn:(req:express.Request,res:express.Response)=>Promise<unknown>):express.RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};
app.get('/health',route(async(_req,res)=>{const workerReady=config.databaseUrl?(await query("SELECT 1 FROM service_health WHERE name='worker' AND heartbeat>now()-interval '15 seconds'")).rowCount===1:false;res.json({ok:true,leaderReady,workerReady,chainId:5042002,paidConfigured:config.paid&&missingConfiguration().length===0});}));
app.get('/api/lobby',route(async(_req,res)=>{
  if(!config.escrow||!config.databaseUrl)return res.json({status:'unconfigured',message:'Practice is open. Funded epochs open after the testnet service is configured.',count:0,pool:'0',chainId:5042002});
  const epoch=await readEpoch();const available=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'availablePrize'});
  if(!epoch)return res.json({status:'waiting',message:config.paid?'Waiting for the first epoch.':'Practice is open. Funded testnet epochs are not open yet.',count:0,pool:(available>1000000000n?1000000000n:available).toString(),available:available.toString(),entryEnabled:false,chainId:5042002});
  const arenas=await query('SELECT id,chain_arena,status,budget,room_id,result,replay_hash FROM arenas WHERE epoch_id=$1 ORDER BY chain_arena',[epoch.id.toString()]);
  const service=await query("SELECT name,heartbeat FROM service_health WHERE name IN ('worker','game') AND heartbeat>now()-interval '15 seconds'");
  return res.json({...epoch,message:access.mode==='invite-only'?'Invite-only test epoch. Public beta is not open yet.':undefined,id:epoch.id.toString(),entropyBlock:epoch.entropyBlock.toString(),status:['missing','registration','running','closed'][epoch.status],pool:(epoch.status===1?(available>1000000000n?1000000000n:available):BigInt((await query('SELECT pool FROM epochs WHERE id=$1',[epoch.id.toString()])).rows[0]?.pool??0)).toString(),available:available.toString(),arenas:arenas.rows,chainId:5042002,entryEnabled:leaderReady&&config.paid&&missingConfiguration().length===0&&service.rows.length===2,serverTime:Date.now()});
}));
app.get('/api/me',route(async(req,res)=>{const auth=await authenticate(req);const p=await query('SELECT name FROM profiles WHERE user_id=$1',[auth.userId]);const entries=await query('SELECT r.*,a.room_id,a.chain_arena,a.status AS arena_status,e.match_deadline,e.status AS epoch_status FROM registrations r LEFT JOIN arenas a ON a.id=r.arena_id JOIN epochs e ON e.id=r.epoch_id WHERE user_id=$1 AND active ORDER BY r.epoch_id DESC LIMIT 50',[auth.userId]);const transactions=await query('SELECT operation_key,epoch_id,kind,tx_hash,status,updated_at FROM transactions WHERE wallet=$1 ORDER BY updated_at DESC,id DESC LIMIT 50',[auth.wallet]);res.json({...auth,name:p.rows[0]?.name??auth.wallet.slice(0,6),entries:entries.rows,transactions:transactions.rows});}));
app.put('/api/profile',route(async(req,res)=>{const auth=await authenticate(req);const {name}=z.object({name:z.string().trim().min(1).max(24).regex(/^[\p{L}\p{N} _.-]+$/u)}).parse(req.body);await query('INSERT INTO profiles(user_id,wallet,name) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET name=$3',[auth.userId,auth.wallet,name]);res.json({name});}));
app.post('/api/entry/authorize',rateLimit({windowMs:60000,limit:8}),route(async(req,res)=>{
  if(!leaderReady||!config.paid||missingConfiguration().length)throw Object.assign(new Error('Funded epochs are not open yet.'),{status:503});
  await assertChain();const auth=await authenticate(req);if(!access.allows(auth.wallet))throw Object.assign(new Error('This test epoch is invite-only. Your wallet has not been invited yet.'),{status:403});const {deposit}=z.object({deposit:z.string().regex(/^\d{1,10}(\.\d{1,18})?$/)}).parse(req.body);const amount=parseUnits(deposit,18);if(amount<1000n*10n**18n||amount>1000000000n*10n**18n)throw new Error('Deposit must be between 1,000 and 1,000,000,000 DOMINATE');
  const epoch=await readEpoch();if(!epoch||epoch.status!==1||epoch.count>=500||Date.now()/1000>=epoch.deadline)throw Object.assign(new Error('Registration is closed or full.'),{status:409});
  const existing=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'entryInfo',args:[epoch.id,auth.wallet]});if(existing[0]>0n)throw Object.assign(new Error('You are already registered for this epoch.'),{status:409});
  const {rows}=await query("SELECT name FROM service_health WHERE name IN ('game','worker') AND heartbeat>now()-interval '15 seconds'");if(rows.length!==2)throw Object.assign(new Error('Game service is recovering. Please try again shortly.'),{status:503});
  await query('INSERT INTO profiles(user_id,wallet,name) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING',[auth.userId,auth.wallet,auth.wallet.slice(0,6)]);
  const userId=keccak256(stringToHex(auth.userId)),nonce=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'nonces',args:[auth.wallet]}),expiry=BigInt(Math.min(epoch.deadline,Math.floor(Date.now()/1000)+120));
  const message={epoch:epoch.id,wallet:auth.wallet,userId,amount,nonce,expiry};const signature=await signer('REGISTRAR_PRIVATE_KEY').signTypedData({domain:{name:'BigCircle',version:'1',chainId:arcTestnet.id,verifyingContract:escrowAddress()},types:entryTypes,primaryType:'Entry',message});
  res.json({epoch:epoch.id.toString(),wallet:auth.wallet,userId,amount:amount.toString(),expiry:expiry.toString(),signature,fee:'1000000',startingMass:Math.min(4000,Number(formatUnits(amount,18)))});
}));
app.post('/api/arenas/:id/admission',route(async(req,res)=>{const auth=await authenticate(req);const id=z.coerce.number().int().positive().parse(req.params.id);const {rows}=await query("SELECT a.* FROM arenas a JOIN registrations r ON r.arena_id=a.id WHERE a.id=$1 AND r.wallet=$2 AND r.active AND a.status='active'",[id,auth.wallet]);if(!rows[0]?.room_id)throw Object.assign(new Error('Your arena is not ready or has finished.'),{status:409});res.json({roomId:rows[0].room_id,token:await admissionToken(auth.wallet,String(id),auth.userId)});}));
app.get('/api/arenas/:id/replay',route(async(req,res)=>{const id=z.coerce.number().int().positive().parse(req.params.id);const {rows}=await query("SELECT epoch_id,chain_arena,seed,roster,result,replay_hash FROM arenas WHERE id=$1 AND status IN ('settled','completed')",[id]);if(!rows[0])return res.status(404).json({error:'Replay is not available yet.'});const events=await query('SELECT sequence,events FROM replays WHERE arena_id=$1 ORDER BY sequence',[id]);res.json({...rows[0],chunks:events.rows});}));
app.use((error:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{const status=error instanceof z.ZodError?400:error.status??500;console.error('API error:',error.message);res.status(status).json({error:status>=500?'The service is temporarily unavailable. Your funds remain in escrow.':error.message});});
const httpServer=createServer(app);const gameServer=new Server({transport:new WebSocketTransport({server:httpServer,maxPayload:4096,verifyClient:(info,done)=>done(config.origins.includes(info.origin))})});gameServer.define('arena',ArenaRoom);
let busy=false;let timer:ReturnType<typeof setInterval>|undefined;
if(config.databaseUrl){
  const lock=await pool.connect();
  async function activateLeader(){if(leaderReady)return true;const acquired=await lock.query('SELECT pg_try_advisory_lock(748221) AS locked');if(!acquired.rows[0].locked)return false;await query("UPDATE arenas SET status='invalid',error='Game process restarted' WHERE status='active'");leaderReady=true;return true;}
  lock.on('error',()=>{console.error('Lost game leader lock');process.exit(1);});
  await activateLeader();
  timer=setInterval(async()=>{if(busy)return;busy=true;try{if(!await activateLeader())return;await heartbeat('game');const {rows}=await query("SELECT id FROM arenas WHERE status='pending' ORDER BY id");for(const row of rows){try{await matchMaker.createRoom('arena',{arenaId:String(row.id)});}catch(error){await query("UPDATE arenas SET status='invalid',error=$2 WHERE id=$1",[row.id,String(error).slice(0,200)]);}}}catch(error){console.error('Game coordinator:',String(error));}finally{busy=false;}},1000);
}
await gameServer.listen(config.port);console.log(`Big Circle service: http://localhost:${config.port}. Funded epochs: ${config.paid?'enabled':'disabled'}`);
process.on('SIGTERM',()=>{leaderReady=false;if(timer)clearInterval(timer);void gameServer.gracefullyShutdown();});
