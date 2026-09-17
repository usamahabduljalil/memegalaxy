import { performance } from 'node:perf_hooks';
import { createGame,setIntent,stepGame,steerBots } from '../shared/game';
const rooms=Array.from({length:10},(_,r)=>createGame(Array.from({length:50},(_,i)=>({id:`${r}-${i}`,name:'Load player',deposit:1000+i*60,bot:true})),r+123));
const samples:number[]=[];for(let tick=0;tick<1800;tick++){const start=performance.now();for(const room of rooms){if(tick%6===0)steerBots(room);stepGame(room,1/30);if(tick%3===0)JSON.stringify(room);}samples.push(performance.now()-start);}
samples.sort((a,b)=>a-b);const p95=samples[Math.floor(samples.length*.95)];console.log(JSON.stringify({arenas:10,simulatedPlayers:500,ticks:1800,p95TickMs:+p95.toFixed(2),budgetMs:33,passed:p95<33,note:'Simulation and serialization benchmark; not a network connection load test.'},null,2));if(p95>=33)process.exitCode=1;
