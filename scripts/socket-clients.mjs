import { parentPort,workerData } from 'node:worker_threads';
import { Client } from 'colyseus.js';
const connections=[],received=new Map();
let inputs;
try {
  for(const id of workerData.rooms)for(let offset=0;offset<50;offset+=10){
    const batch=await Promise.all(Array.from({length:10},()=>new Client(workerData.endpoint).joinById(id)));
    for(const room of batch){received.set(room,0);room.onMessage('snapshot',()=>received.set(room,received.get(room)+1));connections.push(room);}
  }
  let tick=0;
  inputs=setInterval(()=>{tick++;connections.forEach((room,i)=>room.send('input',{x:Math.sin(tick*.06+i),y:Math.cos(tick*.06+i)}));},100);
  parentPort.postMessage({ready:true,count:connections.length});
  parentPort.on('message',async message=>{
    if(message==='stop'){clearInterval(inputs);parentPort.postMessage({done:true,count:connections.length,minimumSnapshots:Math.min(...received.values())});await Promise.allSettled(connections.map(room=>room.leave()));parentPort.close();}
  });
} catch(error){clearInterval(inputs);parentPort.postMessage({error:String(error)});await Promise.allSettled(connections.map(room=>room.leave()));parentPort.close();}
