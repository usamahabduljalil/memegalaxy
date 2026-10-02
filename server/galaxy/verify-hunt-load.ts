import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {Pool} from 'pg';
import {Client,type Room} from 'colyseus.js';
import {Server,matchMaker,WebSocketTransport} from './colyseus';
import {db,migrateGalaxy} from './store';
import {GalaxyRoom,roomCreationKey} from './room';
import {issueAdmission,publicPlayerId} from './auth';
import {huntSession,config} from './economy';
import {applyAction} from '../../shared/galaxy/engine';

const schema='mg_hunt_load_'+randomUUID().replaceAll('-','');
const admin=new Pool({connectionString:process.env.MEMEGALAXY_DATABASE_URL??process.env.DATABASE_URL});
const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http,maxPayload:4096})});
const connections:Room[]=[],rooms:string[]=[],instances:GalaxyRoom[]=[],frames=new Map<string,number>();let created=false,started=false;
server.define('galaxy',GalaxyRoom);
try{
 await admin.query('CREATE SCHEMA '+schema);created=true;db.options.options='-c search_path='+schema;await migrateGalaxy();
 const cfg=await config();await db.query('INSERT INTO mg_economy_config(settings,actor) VALUES($1,$2)',[{...cfg.settings,enabled:true,minInterval:30,maxInterval:40},'load-fixture']);
 await db.query('UPDATE mg_stock_assets SET enabled=true,balance=$1,observed_at=now()',['1000000000000000000']);
 await server.listen(0,'127.0.0.1');started=true;const client=new Client(`ws://127.0.0.1:${(http.address() as {port:number}).port}`);
 for(let a=0;a<5;a++){
  const room=await matchMaker.createRoom('galaxy',{mode:'hunt',seed:a+50,serviceKey:roomCreationKey});rooms.push(room.roomId);
  for(let batch=0;batch<100;batch+=10)await Promise.all(Array.from({length:10},async(_,j)=>{
   const i=batch+j,owner=`load-human-${a}-${i}`,auth={id:owner,wallet:`0x${(a*100+i+1).toString(16).padStart(40,'0')}`},session=await huntSession(auth,room.roomId),id=publicPlayerId(owner);
   const token=await issueAdmission({id,name:'Load '+i,controller:'human',owner,roomId:room.roomId,scope:'hunt',huntSession:session.id,skin:session.skin});
   const connection=await client.joinById(room.roomId,{token});connection.onMessage('identity',()=>{});frames.set(id,0);connection.onMessage('frame',()=>frames.set(id,(frames.get(id)??0)+1));connection.onMessage('invalid',()=>{process.exitCode=1;});connections.push(connection);
  }));
  const local=matchMaker.getLocalRoomById(room.roomId) as GalaxyRoom;
  instances.push(local);
  for(const p of local.world.players){const cell=local.world.cells.find(c=>c.owner===p.id);if(cell)cell.mass=4000;applyAction(local.world,p.id,{seq:0,type:'SPLIT',x:1,y:0});}
  // Trigger fixture drops now so load includes collision checks and reservation persistence.
  (local as any).hunt.next=Date.now();
 }
 let seq=1;const actions=setInterval(()=>{seq++;connections.forEach((r,i)=>r.send('action',{seq,type:seq%45===0?'SPLIT':'MOVE',x:Math.cos(i+seq/30),y:Math.sin(i+seq/30)}));},1000/15);
 const inventoryRefresh=setInterval(()=>void db.query('UPDATE mg_stock_assets SET observed_at=now()'),10000);
 await new Promise(resolve=>setTimeout(resolve,40000));clearInterval(actions);clearInterval(inventoryRefresh);
 const timings=rooms.map(id=>(matchMaker.getLocalRoomById(id) as GalaxyRoom).metrics),p95=(list:number[])=>{list.sort((a,b)=>a-b);return list[Math.floor(list.length*.95)];};
 const result={rooms:rooms.length,connections:connections.length,live:connections.filter(r=>r.connection.isOpen).length,minimumFrames:Math.min(...frames.values()),p95SimulationMs:p95(timings.flatMap(m=>m.simulation)),p95BroadcastMs:p95(timings.flatMap(m=>m.broadcast)),p95TotalMs:p95(timings.flatMap(m=>m.total)),drops:Number((await db.query('SELECT count(*) FROM mg_stock_drops')).rows[0].count),progressOwners:Number((await db.query('SELECT count(*) FROM mg_profiles WHERE active_seconds>0')).rows[0].count)};
 console.log('Stock Hunt persisted socket load:',JSON.stringify(result));assert.equal(result.live,500);assert(result.minimumFrames>=200);assert(result.p95TotalMs<33);assert(result.drops>=5);assert.equal(result.progressOwners,500);
 console.log('PASS five 100-human Stock Hunt rooms, multi-cell workload, 15 Hz inputs, visibility updates, leases, drop reservations and authoritative progress in an isolated schema.');
}finally{
 await Promise.allSettled(connections.map(r=>r.leave()));await Promise.allSettled(instances.map(r=>r.disconnect()));if(started)await server.gracefullyShutdown(false);await db.end();if(created)await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();
}
