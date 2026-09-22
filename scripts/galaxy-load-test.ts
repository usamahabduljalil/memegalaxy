import { performance } from 'node:perf_hooks';
import { createWorld,tick,observe,standings,applyAction } from '../shared/galaxy/engine';
const worlds=Array.from({length:5},(_,room)=>createWorld('free',room+1,Array.from({length:100},(_,i)=>({id:`${room}:${i}`,name:`Player ${i}`,controller:i%2?'human':'agent'}))));
for(const w of worlds)for(const p of w.players){const c=w.cells.find(c=>c.owner===p.id)!;c.mass=1000;applyAction(w,p.id,{seq:0,type:'SPLIT',x:1,y:0});}
const times:number[]=[];let bytes=0;for(let t=0;t<900;t++){for(const w of worlds){const start=performance.now();tick(w);if(t%3===0){const board=standings(w);for(const p of w.players)bytes+=JSON.stringify(observe(w,p.id,board)).length;}times.push(performance.now()-start);}}
times.sort((a,b)=>a-b);const p95=times[Math.floor(times.length*.95)];console.log(JSON.stringify({rooms:5,players:500,ticksPerRoom:900,p95TickAndSerializationMs:p95,generatedMegabytes:bytes/1e6,pass:p95<33},null,2));if(p95>=33)process.exitCode=1;
