import assert from 'node:assert/strict';
import { encodeFrame } from '../shared/wire';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { Server, Room, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Worker } from 'node:worker_threads';
import { createGame, publicSnapshot, setIntent, stepGame, type GameState } from '../shared/game';

// Isolated loopback harness. It exercises the real transport and simulation,
// without granting access to funded rooms or bypassing production authentication.
const arenas:LoadRoom[]=[];
class LoadRoom extends Room {
  maxClients=50; autoDispose=false; game!:GameState;
  onCreate(options:{index:number}) {
    this.game=createGame(Array.from({length:50},(_,i)=>({id:String(i),name:`Load ${i}`,deposit:1000+i*60})),options.index+500);
    this.onMessage('input',(client,input)=>{
      const index=this.clients.indexOf(client);
      if(index>=0)setIntent(this.game,String(index),input);
    });
    arenas.push(this);
  }
}
const httpServer=createServer();
const server=new Server({transport:new WebSocketTransport({server:httpServer,maxPayload:4096}),greet:false});
server.define('load',LoadRoom);
const workers:Worker[]=[],roomIds:string[]=[];
let tickTimer:ReturnType<typeof setInterval>|undefined;
const samples:number[]=[],delays:number[]=[];
try {
  await server.listen(0,'127.0.0.1');
  const address=httpServer.address() as {port:number};
  const endpoint=`ws://127.0.0.1:${address.port}`;
  for(let i=0;i<10;i++)roomIds.push((await matchMaker.createRoom('load',{index:i})).roomId);
  const completed:Promise<{count:number;minimumSnapshots:number}>[]=[];
  const ready:Promise<unknown>[]=[];
  for(let i=0;i<2;i++){
    const worker=new Worker(new URL('./socket-clients.mjs',import.meta.url),{workerData:{endpoint,rooms:roomIds.slice(i*5,i*5+5)}});workers.push(worker);
    ready.push(new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',m=>{if(m.ready)resolve(m);if(m.error)reject(new Error(m.error));});}));
    completed.push(new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',m=>{if(m.done)resolve(m);if(m.error)reject(new Error(m.error));});}));
  }
  await Promise.all(ready);
  let ticks=0,previous=performance.now();const startedAt=previous;
  tickTimer=setInterval(()=>{
    const start=performance.now();delays.push(start-previous);previous=start;
    const target=Math.floor((start-startedAt)*30/1000);
    while(ticks<target){for(let i=0;i<arenas.length;i++){const arena=arenas[i];stepGame(arena.game,1/30);if(ticks%3===i%3)arena.broadcast('snapshot',encodeFrame(arena.game));}ticks++;}
    samples.push(performance.now()-start);
  },1000/30);
  await new Promise(resolve=>setTimeout(resolve,30000));
  clearInterval(tickTimer);workers.forEach(worker=>worker.postMessage('stop'));
  const totals=await Promise.all(completed);
  const percentile=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.floor(values.length*.95)];
  const p95=percentile(samples),minSnapshots=Math.min(...totals.map(t=>t.minimumSnapshots));
  const report={arenas:10,connections:totals.reduce((n,t)=>n+t.count,0),durationSeconds:30,ticks,p95TickMs:+p95.toFixed(2),p95IntervalMs:+percentile(delays).toFixed(2),minimumSnapshotsPerClient:minSnapshots,passed:p95<33&&ticks>=850&&minSnapshots>=280,note:'Loopback WebSocket transport and shared simulation. Production Privy, PostgreSQL, WAN latency, and mobile FPS require separate verification.'};
  console.log(JSON.stringify(report,null,2));
  assert.equal(report.passed,true,'500-connection transport test did not meet its budget');
} finally {
  clearInterval(tickTimer);
  await Promise.allSettled(workers.map(worker=>worker.terminate()));
  await server.gracefullyShutdown(false);
}
