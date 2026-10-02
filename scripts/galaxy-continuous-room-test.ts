import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Server,matchMaker,WebSocketTransport} from '../server/galaxy/colyseus';
import {Client,type Room} from 'colyseus.js';
import {availableRoom} from '../server/galaxy/matchmaking';

// Disposable local rooms. No Privy accounts, database, rewards or chain transactions.
process.env.DATABASE_URL='';process.env.MEMEGALAXY_DATABASE_URL='';
const {GalaxyRoom,roomCreationKey}=await import('../server/galaxy/room');
const {issueAdmission}=await import('../server/galaxy/auth');
const http=createServer(),server=new Server({transport:new WebSocketTransport({server:http})});
server.define('galaxy',GalaxyRoom);await server.listen(0,'127.0.0.1');
const client=new Client(`ws://127.0.0.1:${(http.address() as {port:number}).port}`),connections:Room[]=[];
const eventually=async(predicate:()=>boolean|Promise<boolean>)=>{const end=Date.now()+3000;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error('Room transition timed out');};
let room:InstanceType<typeof GalaxyRoom>|undefined;
try{
  const reservation=await matchMaker.createRoom('galaxy',{mode:'free',seed:412,serviceKey:roomCreationKey});room=matchMaker.getLocalRoomById(reservation.roomId) as InstanceType<typeof GalaxyRoom>;
  const join=async(id:string,spectator=false,skin='luna',name=id)=>{
    const token=await issueAdmission({id,name,skin,controller:'human',owner:id,roomId:reservation.roomId,scope:spectator?'spectator':'free'});
    const connection=await client.joinById(reservation.roomId,{token});connection.onMessage('identity',()=>{});connection.onMessage('frame',()=>{});connection.onMessage('result',()=>{});connections.push(connection);return connection;
  };
  for(let i=0;i<99;i++)await join('guest:'+i);
  for(let i=0;i<20;i++)await join('spectator:'+i,true);
  const listing=(await matchMaker.query({roomId:reservation.roomId}))[0];
  assert.equal(listing.clients,119);assert.equal(listing.metadata.players,99);assert.equal(listing.metadata.spectators,20);assert.equal(availableRoom([listing],'free')?.roomId,reservation.roomId);
  const final=await join('guest:99');assert.equal(room.world.players.length,100);
  await assert.rejects(()=>join('guest:100'),'101st player must not enter');
  const original=room.world.players.find(p=>p.id==='guest:99')!;original.peakMass=2000;room.world.cells.filter(c=>c.owner===original.id).forEach(c=>c.mass=2000);
  await final.leave();await eventually(()=>!room!.world.players.some(p=>p.id==='guest:99'));
  const returning=await join('guest:99',false,'solar-fox','Updated name');
  const fresh=room.world.players.find(p=>p.id==='guest:99')!;
  assert.equal(fresh.skin,'solar-fox');assert.equal(fresh.name,'Updated name');assert.equal(room.world.cells.filter(c=>c.owner===fresh.id).reduce((n,c)=>n+c.mass,0),100);
  // An unexpected network interruption retains the same cells for reconnect.
  room.world.cells.filter(c=>c.owner===fresh.id).forEach(c=>c.mass=700);const reconnect=returning.reconnectionToken;
  returning.connection.close(4100);await eventually(()=>room!.world.players.find(p=>p.id===fresh.id)?.disconnectedTick!==null);
  const restored=await client.reconnect(reconnect);restored.onMessage('identity',()=>{});restored.onMessage('frame',()=>{});restored.onMessage('result',()=>{});connections.push(restored);
  await eventually(()=>room!.world.players.find(p=>p.id===fresh.id)?.disconnectedTick===null);
  assert(room.world.cells.filter(c=>c.owner===fresh.id).reduce((n,c)=>n+c.mass,0)>=700);
  console.log('PASS: 100 players + 20 spectators; full-room rejection; intentional reentry resets mass/name/skin; network reconnection preserves cells.');
}finally{
  await Promise.allSettled(connections.filter(c=>c.connection.isOpen).map(c=>c.leave()));await room?.disconnect();await server.gracefullyShutdown(false);
}
