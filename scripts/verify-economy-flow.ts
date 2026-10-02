import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import ganache from 'ganache';
import express from 'express';
import {createPublicClient,http,encodeDeployData,encodeFunctionData,erc20Abi,type Address,type Hex} from 'viem';
import {rewardWeek} from '../shared/galaxy/economy';
import {huntVaultAbi,retirementAbi,merkleTree,rewardLeaf} from '../shared/galaxy/economy-chain';
import {createWorld,tick} from '../shared/galaxy/engine';
import {huntCollector} from '../shared/galaxy/hunt';
import {compile} from './compile-contracts';

// Local chain + temporary PostgreSQL schema. Never awards a production account.
const schema='mg_flow_verify_'+randomUUID().replaceAll('-','');
const pool=new Pool({connectionString:process.env.MEMEGALAXY_DATABASE_URL??process.env.DATABASE_URL});
const node=ganache.server({logging:{quiet:true},chain:{chainId:46630},wallet:{totalAccounts:4}});
await node.listen(0,'127.0.0.1');
const port=(node.address() as {port:number}).port;
const accounts=Object.entries(node.provider.getInitialAccounts());
const address=(i:number)=>accounts[i][0] as Address;
process.env.ROBINHOOD_RPC_URL=`http://127.0.0.1:${port}`;
process.env.REGISTRAR_PRIVATE_KEY=(accounts[1][1] as any).secretKey;
process.env.MEMEGALAXY_OPERATOR_PRIVATE_KEY=process.env.REGISTRAR_PRIVATE_KEY;
process.env.MEMEGALAXY_ECONOMY_ADMINS=address(0);
process.env.MEMEGALAXY_ECONOMY_CONFIRMATIONS='2';
process.env.MEMEGALAXY_ECONOMY_START_BLOCK='0';
const rpc=createPublicClient({transport:http(process.env.ROBINHOOD_RPC_URL),cacheTime:0});
const artifact=(name:string)=>JSON.parse(readFileSync(`artifacts/${name}.json`,'utf8'));
async function deploy(name:string,args:unknown[]=[]){const hash=await node.provider.request({method:'eth_sendTransaction',params:[{from:address(0),data:encodeDeployData({...artifact(name),args}),gas:'0xe4e1c0'}]}) as Hex;const r=await rpc.getTransactionReceipt({hash});assert.equal(r.status,'success');return r.contractAddress!;}
async function send(i:number,to:Address,abi:any,fn:string,args:unknown[]=[]){const hash=await node.provider.request({method:'eth_sendTransaction',params:[{from:address(i),to,data:encodeFunctionData({abi,functionName:fn,args}),gas:'0x7a1200'}]}) as Hex;assert.equal((await rpc.getTransactionReceipt({hash})).status,'success',fn);return hash;}
const realNow=Date.now;let clock=realNow();Date.now=()=>clock;
let database:Pool|undefined,web:ReturnType<express.Express['listen']>|undefined,created=false;
try{
 compile();
 const token=await deploy('TestMemeGalaxy',[address(0)]),asset=await deploy('TestMemeGalaxy',[address(0)]),vault=await deploy('GalaxyHuntVault',[address(0),address(1)]),retirement=await deploy('GalaxyRetirement',[token,address(0),address(1)]);
 process.env.MEMEGALAXY_HUNT_VAULT=vault;process.env.MEMEGALAXY_RETIREMENT_ADDRESS=retirement;process.env.MEMEGALAXY_TOKEN_ADDRESS=token;
 const store=await import('../server/galaxy/store');database=store.db;await pool.query('CREATE SCHEMA '+schema);created=true;store.db.options.options='-c search_path='+schema;await store.migrateGalaxy();
 const {economyRoutes}=await import('../server/galaxy/economy-routes'),{trustedOwner,publicPlayerId}=await import('../server/galaxy/auth');
 const economy=await import('../server/galaxy/economy'),{economyCycle}=await import('../server/galaxy/economy-worker');
 const users={admin:{id:'fixture-admin',wallet:address(0).toLowerCase()},human:{id:'fixture-human',wallet:address(2).toLowerCase()},other:{id:'fixture-other',wallet:address(3).toLowerCase()}};
 const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as any)[trustedOwner]=users[req.headers['x-fixture'] as keyof typeof users]??users.human;next();});
 economyRoutes(app,fn=>(req,res,next)=>{Promise.resolve(fn(req,res)).catch(next);},async()=>'fixture-room');
 app.use((e:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(e.status??400).json({error:e.message}));
 web=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>web!.once('listening',resolve));const apiPort=(web.address() as {port:number}).port;
 async function api(path:string,body?:unknown,who='human',method=body===undefined?'GET':'POST'){const r=await fetch(`http://127.0.0.1:${apiPort}/api/v2/`+path,{method,headers:{'Content-Type':'application/json','x-fixture':who},body:body===undefined?undefined:JSON.stringify(body)});const v=await r.json();if(!r.ok)throw Object.assign(Error(v.error),{status:r.status});return v;}
 await assert.rejects(api('admin/economy'),{status:403});await api('profile',{name:'Cosmic Tester'},'human','PATCH');assert.equal((await api('economy')).profile.name,'Cosmic Tester');
 const task=await api('admin/tasks',{title:'Controlled verification task',instructions:'Manual proof fixture',platform:'other',target:'https://example.com',reward:25,budget:25,maxParticipants:1,startsAt:new Date(clock-60000).toISOString(),endsAt:new Date(clock+3600000).toISOString(),enabled:true},'admin');
 await api('tasks/'+task.id+'/submit',{identity:'fixture-one',proof:'Controlled evidence'});await api('tasks/'+task.id+'/submit',{identity:'fixture-one',proof:'Controlled evidence'});assert.equal((await store.db.query('SELECT count(*) FROM mg_task_submissions')).rows[0].count,'1');
 await api('tasks/'+task.id+'/submit',{identity:'fixture-two',proof:'Other evidence'},'other');const submissions=(await api('admin/economy',undefined,'admin')).submissions;
 const first=submissions.find((s:any)=>s.owner===users.human.id),second=submissions.find((s:any)=>s.owner===users.other.id);
 await assert.rejects(api('admin/reviews/'+first.id,{status:'approved',reason:'Attempted reviewer impersonation'},'other'),{status:403});
 await api('admin/reviews/'+first.id,{status:'approved',reason:'Evidence verified'},'admin');await api('admin/reviews/'+first.id,{status:'approved',reason:'Duplicate review'},'admin');await assert.rejects(api('admin/reviews/'+second.id,{status:'approved',reason:'Beyond issuance budget'},'admin'));
 assert.equal((await api('gusd')).balance,'25');
 await api('admin/skins/solar-fox',{price:25,published:true,multiplier:12500,mass:0,seconds:0},'admin','PATCH');
 await Promise.all(Array.from({length:4},()=>api('skins/solar-fox/unlock',{})));assert.equal((await api('gusd')).balance,'0');await api('skins/solar-fox/equip',{});await assert.rejects(api('skins/solar-fox/equip',{},'other'));
 const cfg=(await api('admin/economy',undefined,'admin')).config.settings;
 await api('admin/config',{...cfg,enabled:true,retirement:{enabled:true,version:1,tokens:'100000000000000000000',credits:40}},'admin');
 await send(0,retirement,retirementAbi,'configure',[1n,true]);await send(0,token,erc20Abi,'transfer',[address(2),1000n*10n**18n]);
 const quote=await api('retirement/quote',{amount:'100'});assert.equal(quote.credits,'40');await send(2,token,erc20Abi,'approve',[retirement,BigInt(quote.amount)]);
 await send(2,retirement,retirementAbi,'retire',[quote.id,quote.owner,BigInt(quote.amount),BigInt(quote.credits),BigInt(quote.version),BigInt(quote.expiry),quote.signature]);
 // Deliberately omit the client transaction-report API; the confirmed event scanner must recover it.
 await send(0,asset,erc20Abi,'transfer',[vault,10n**18n]);await store.db.query('DELETE FROM mg_stock_assets');await store.db.query('INSERT INTO mg_stock_assets(address,symbol,decimals,enabled) VALUES($1,$2,18,true)',[asset.toLowerCase(),'TEST']);
 for(let i=0;i<3;i++)await node.provider.request({method:'evm_mine',params:[]});clock+=20000;await economyCycle();await economyCycle();assert.equal((await api('gusd')).balance,'40');assert.equal((await api('gusd')).quotes[0].status,'credited');
 const foreignWeek=BigInt(rewardWeek(clock).start-604800),foreignAmount=990000000000000000n,foreignTree=merkleTree([rewardLeaf(vault,asset,foreignWeek,0n,address(3),foreignAmount)]);
 await send(1,vault,huntVaultAbi,'publish',[asset,foreignWeek,foreignTree.root,foreignAmount]);for(let i=0;i<3;i++)await node.provider.request({method:'evm_mine',params:[]});clock+=20000;await economyCycle();assert.equal(await economy.reserveDrop('fixture-room'),null,'Untracked onchain obligations must consume available inventory');
 await send(3,vault,huntVaultAbi,'claim',[asset,foreignWeek,0n,address(3),foreignAmount,foreignTree.proof(0)]);await send(0,asset,erc20Abi,'transfer',[vault,10n**18n]);for(let i=0;i<3;i++)await node.provider.request({method:'evm_mine',params:[]});clock+=20000;await economyCycle();
 const admission=await api('hunt/admission',{});assert.equal(admission.multiplier,12500);const session=(await store.db.query('SELECT * FROM mg_hunt_sessions')).rows[0];
 await api('skins/luna/equip',{});assert.equal(session.skin,'solar-fox');await assert.rejects(api('hunt/admission',{}));
 const drop=await economy.reserveDrop('fixture-room');assert(drop);const id=publicPlayerId(users.human.id),world=createWorld('hunt',44,[{id,name:'Cosmic Tester',controller:'human',skin:session.skin}]);world.tick=100;world.cells[0].x=0;world.cells[0].y=0;
 const entity={...drop,x:0,y:0},contacts=new Map();assert.equal(huntCollector(world,entity,contacts,new Set([id])),undefined);world.tick=115;assert.equal(huntCollector(world,entity,contacts,new Set([id])),id);
 const collected=await economy.collectDrop(drop.id,session.id);assert(collected&&'amount'in collected);assert.equal(collected.amount,'12500000000000000');assert.equal(await economy.collectDrop(drop.id,session.id),null);world.cells=[];tick(world);for(let i=0;i<90;i++)tick(world);assert.equal(world.cells[0].mass,100);assert.equal((await api('hunt/rewards')).assets[0].amount,'12500000000000000');
 clock=rewardWeek(clock).unlock*1000+20000;await node.provider.request({method:'evm_setTime',params:[new Date(clock)]});for(let i=0;i<3;i++)await node.provider.request({method:'evm_mine',params:[]});await economyCycle();
 for(let i=0;i<3;i++)await node.provider.request({method:'evm_mine',params:[]});clock+=20000;await economyCycle();const rewards=await api('hunt/rewards');assert.equal(rewards.claims[0].state,'published');const claim=rewards.claims[0];
 await send(3,vault,huntVaultAbi,'claim',[asset,BigInt(claim.week),BigInt(claim.idx),claim.wallet,BigInt(claim.amount),claim.proof]);for(let i=0;i<3;i++)await node.provider.request({method:'evm_mine',params:[]});clock+=20000;await economyCycle();
 assert.equal((await api('hunt/rewards')).claims[0].claimed,true);assert.equal(await rpc.readContract({address:asset,abi:erc20Abi,functionName:'balanceOf',args:[address(2)]}),12500000000000000n);assert.equal((await api('gusd')).balance,'40');
 console.log('PASS full economy flow: profile edit; protected admin APIs; manual task review and budget; idempotent skin purchase; quoted retirement; missing-hash restart reconciliation; authoritative pickup; rewards survive death; frozen skin/recipient; Monday allocation; funded wallet claim and confirmed history. All fixtures isolated.');
}finally{Date.now=realNow;if(web)await new Promise<void>(resolve=>web!.close(()=>resolve()));if(database)await database.end();if(created)await pool.query('DROP SCHEMA '+schema+' CASCADE');await pool.end();await node.close();}
