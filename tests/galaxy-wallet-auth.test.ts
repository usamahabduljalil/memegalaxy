import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import express from 'express';
import {createServer,type Server} from 'node:http';
import {privateKeyToAccount} from 'viem/accounts';
import {verifyMessage,encodeEventTopics,encodeAbiParameters,type Hex} from 'viem';
import {escrowEvents,walletEscrowEvents} from '../shared/galaxy/escrow-events';
const state=vi.hoisted(()=>({challenges:new Map<string,any>(),sessions:new Map<string,any>(),identities:new Map<string,any>()}));
vi.mock('../server/galaxy/store',()=>{
 const query=async(sql:string,p:any[]=[])=>{
  let rows:any[]=[];
  if(sql.startsWith('INSERT INTO mg_wallet_challenges'))state.challenges.set(p[0],{wallet:p[1],origin:p[2],message:p[3],expires:p[4].getTime(),consumed:false});
  if(sql.startsWith('SELECT wallet,origin,message')){const c=state.challenges.get(p[0]);if(c&&!c.consumed&&c.expires>Date.now())rows=[c];}
  if(sql.startsWith('UPDATE mg_wallet_challenges')){const c=state.challenges.get(p[0]);if(c&&!c.consumed&&c.expires>Date.now()){c.consumed=true;rows=[{id:p[0]}];}}
  if(sql.startsWith('INSERT INTO mg_wallet_identities'))state.identities.set(p[1],p[0]);
  if(sql.startsWith('INSERT INTO mg_wallet_sessions'))state.sessions.set(p[0],{owner:p[1],wallet:p[2],expires:p[3].getTime()});
  if(sql.startsWith('SELECT owner,wallet FROM mg_wallet_sessions')){const s=state.sessions.get(p[0]);if(s&&s.expires>Date.now())rows=[s];}
  if(sql.startsWith('SELECT wallet FROM mg_wallet_identities')&&state.identities.has(p[0]))rows=[{wallet:state.identities.get(p[0])}];
  if(sql.startsWith('DELETE FROM mg_wallet_sessions WHERE token_hash'))state.sessions.delete(p[0]);
  return {rows,rowCount:rows.length};
 };return {persistent:true,db:{query,connect:async()=>({query,release(){}})}};
});
vi.mock('../server/galaxy/chain',()=>({chain:{verifyMessage}}));
import {walletAuthRoutes} from '../server/galaxy/wallet-auth';
import {owner,ownerById} from '../server/galaxy/auth';
const a=privateKeyToAccount(('0x'+'11'.repeat(32)) as Hex),b=privateKeyToAccount(('0x'+'22'.repeat(32)) as Hex),origin='http://127.0.0.1:5173';
let server:Server,url:string;
const post=async(path:string,body:any={},token?:string,site=origin)=>{const res=await fetch(url+'/api/v2/'+path,{method:'POST',headers:{Origin:site,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return {status:res.status,data:res.status===204?null:await res.json()};};
beforeAll(async()=>{process.env.MEMEGALAXY_WEB_ORIGINS=origin;const app=express();app.use(express.json());const route=(fn:any):express.RequestHandler=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);};walletAuthRoutes(app,route);app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.status??(err.name==='ZodError'?400:500)).json({error:err.message}));server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+(server.address() as any).port;});
afterAll(async()=>{await new Promise<void>(r=>server.close(()=>r()));});
beforeEach(()=>{state.challenges.clear();state.sessions.clear();state.identities.clear();});
async function signIn(){const c=await post('auth/challenge',{wallet:a.address});const signature=await a.signMessage({message:c.data.message});const v=await post('auth/verify',{id:c.data.id,signature});return {c,signature,v};}
describe('Wallet ownership authentication',()=>{
 it('binds origin, Robinhood chain and expiry, then isolates a fresh wallet identity',async()=>{const {c,v}=await signIn();expect(c.data.message).toContain('Chain ID: 46630');expect(c.data.message).toContain(origin);expect(v.status).toBe(200);const req={headers:{authorization:'Bearer '+v.data.token},get:()=>undefined} as any;expect(await owner(req)).toEqual({id:'wallet:'+a.address.toLowerCase(),wallet:a.address.toLowerCase()});expect(await ownerById('wallet:'+a.address.toLowerCase())).toEqual(await owner(req));await expect(ownerById('did:privy:old')).rejects.toThrow();req.get=()=>b.address;await expect(owner(req)).rejects.toThrow('wallet changed');});
 it('rejects forged signatures, disallowed origins and expired challenges',async()=>{expect((await post('auth/challenge',{wallet:a.address},undefined,'https://attacker.example')).status).toBe(403);const c=await post('auth/challenge',{wallet:a.address});const forged=await b.signMessage({message:c.data.message});expect((await post('auth/verify',{id:c.data.id,signature:forged})).status).toBe(401);state.challenges.get(c.data.id).expires=Date.now()-1;expect((await post('auth/verify',{id:c.data.id,signature:await a.signMessage({message:c.data.message})})).status).toBe(401);});
 it('consumes a challenge atomically and revokes logout sessions',async()=>{const c=await post('auth/challenge',{wallet:a.address});const signature=await a.signMessage({message:c.data.message});const [x,y]=await Promise.all([post('auth/verify',{id:c.data.id,signature}),post('auth/verify',{id:c.data.id,signature})]);expect([x.status,y.status].sort()).toEqual([200,401]);const token=(x.status===200?x:y).data.token;await post('auth/logout',{},token);await expect(owner({headers:{authorization:'Bearer '+token},get:()=>undefined} as any)).rejects.toThrow('expired');});
});
describe('Bundled escrow history',()=>{
 it('uses verified contract events and frozen recipients instead of bundler tx.from',()=>{const escrow='0x0000000000000000000000000000000000000010',topics=encodeEventTopics({abi:escrowEvents,eventName:'Registered',args:{epoch:9n,wallet:a.address,userId:('0x'+'ab'.repeat(32)) as Hex}}),log={address:escrow,data:encodeAbiParameters([{type:'uint256'}],[1000n]),topics:topics as Hex[],logIndex:3};expect(walletEscrowEvents([log],escrow,a.address)).toEqual([{epoch:'9',kind:'register',index:3}]);expect(walletEscrowEvents([log],escrow,b.address)).toEqual([]);expect(walletEscrowEvents([{...log,address:b.address}],escrow,a.address)).toEqual([]);});
});
