import { Room, type Client } from '@colyseus/core';
import { createHash } from 'node:crypto';
import { createGame, markConnection, rankPlayers, publicSnapshot, setIntent, stepGame, type GameState } from '../shared/game';
import { query } from './db';
import { encodeFrame } from '../shared/wire';
import { canonicalJSON } from '../shared/canonical';
import { verifyAdmission } from './auth';
export class ArenaRoom extends Room {
  maxClients=50;autoDispose=false;
  game!:GameState;arenaId='';startsAt=0;events:unknown[]=[];sequence=0;tick=0;lastFlush=0;lastBroadcast=0;
  saving=Promise.resolve();ending=false;replayDigest=createHash('sha256');
  wallets=new Map<string,string>();inputBudget=new Map<string,{time:number;count:number;seq:number}>();
  async onCreate(options:{arenaId:string}){
    this.arenaId=String(options.arenaId);const {rows}=await query('SELECT * FROM arenas WHERE id=$1 AND status=$2',[this.arenaId,'pending']);const row=rows[0];if(!row)throw new Error('Arena unavailable');
    this.lastBroadcast=Number(row.chain_arena)%3;this.startsAt=Number(row.starts_at);if(Date.now()/1000-this.startsAt>10)throw new Error('Arena start window missed');
    this.game=createGame(row.roster,Number(row.seed));this.game.players.forEach(p=>markConnection(this.game,p.id,false));
    while(this.game.elapsed+1/30<Math.max(0,Date.now()/1000-this.startsAt)){stepGame(this.game,1/30);this.tick++;}
    await query("UPDATE arenas SET status='active',room_id=$2,heartbeat=now() WHERE id=$1",[this.arenaId,this.roomId]);
    this.events.push({type:'initial',version:1,seed:row.seed,roster:row.roster,startsAt:this.startsAt});
    this.onMessage('input',(client,payload)=>{
      const wallet=this.wallets.get(client.sessionId);if(!wallet||!payload||!Number.isFinite(payload.x)||!Number.isFinite(payload.y)||!Number.isSafeInteger(payload.seq))return;
      const b=this.inputBudget.get(wallet)??{time:Date.now(),count:0,seq:-1};if(Date.now()-b.time>=1000){b.time=Date.now();b.count=0;}if(++b.count>40||payload.seq<=b.seq)return;b.seq=payload.seq;this.inputBudget.set(wallet,b);
      setIntent(this.game,wallet,payload);this.events.push({tick:this.tick,type:'input',wallet,x:payload.x,y:payload.y});
    });
    this.setSimulationInterval(()=>this.advance(),1000/30);
  }
  async onAuth(_client:Client,options:{token:string}){
    const auth=await verifyAdmission(options.token,this.arenaId);if(!this.game.players.some(p=>p.id===auth.wallet))throw new Error('Not registered');
    if([...this.wallets.values()].includes(auth.wallet))throw new Error('This wallet already has a connected session');return auth;
  }
  onJoin(client:Client,_options:unknown,auth:{wallet:string}){if([...this.wallets.values()].includes(auth.wallet)){void client.leave(4003);return;}this.wallets.set(client.sessionId,auth.wallet);this.inputBudget.set(auth.wallet,{time:Date.now(),count:0,seq:-1});markConnection(this.game,auth.wallet,true);this.events.push({tick:this.tick,type:'connected',wallet:auth.wallet});client.send('identity',{id:auth.wallet});client.send('snapshot',publicSnapshot(this.game));}
  onLeave(client:Client){const wallet=this.wallets.get(client.sessionId);if(wallet){this.wallets.delete(client.sessionId);markConnection(this.game,wallet,false);this.events.push({tick:this.tick,type:'disconnected',wallet});}}
  advance(){
    if(this.ending)return;
    try{
      const before=performance.now(),target=Math.min(600,Date.now()/1000-this.startsAt);
      // Bounded catch-up. A stalled process must invalidate, never invent a fast-forward result.
      if(target-this.game.elapsed>3){void this.fail('Simulation fell behind');return;}
      while(this.game.elapsed+1/30<=target+1e-7&&!this.game.finished){stepGame(this.game,1/30);this.tick++;}
      if(this.tick-this.lastBroadcast>=3){this.lastBroadcast=this.tick;this.broadcast('frame',encodeFrame(this.game));}
      if(this.tick-this.lastFlush>=30){this.lastFlush=this.tick;this.flush();}
      if(performance.now()-before>33)console.warn('Slow arena tick',this.arenaId);
      if(this.game.finished)void this.finish();
    }catch(error){void this.fail(error instanceof Error?error.message:'Simulation error');}
  }
  flush(){const events=this.events.splice(0),seq=this.sequence++;this.replayDigest.update(canonicalJSON(events));this.saving=this.saving.then(async()=>{await query('INSERT INTO replays(arena_id,sequence,events) VALUES($1,$2,$3)',[this.arenaId,seq,JSON.stringify(events)]);await query('UPDATE arenas SET heartbeat=now() WHERE id=$1',[this.arenaId]);});this.saving.catch(()=>{void this.fail('Replay persistence failed');});}
  async finish(){if(this.ending)return;this.ending=true;try{this.flush();await this.saving;const result=rankPlayers(this.game).map((p,i)=>({wallet:p.id,name:p.name,rank:i+1,mass:p.mass,earned:p.earned,eliminatedAt:p.eliminatedAt}));const replayHash='0x'+this.replayDigest.digest('hex');await query("UPDATE arenas SET status='completed',result=$2,replay_hash=$3,ended_at=$4,heartbeat=now() WHERE id=$1",[this.arenaId,JSON.stringify(result),replayHash,Math.min(this.startsAt+600,Math.floor(this.startsAt+this.game.elapsed))]);this.broadcast('result',result);this.clock.setTimeout(()=>void this.disconnect(),30000);}catch{await this.fail('Unable to save results');}}
  async fail(reason:string){this.ending=true;this.broadcast('invalid',{message:'This arena could not finish. Your entry and deposit will be returned.'});try{await query("UPDATE arenas SET status='invalid',error=$2 WHERE id=$1 AND status IN ('pending','active')",[this.arenaId,reason.slice(0,200)]);}catch{console.error('Arena failure awaiting worker recovery',this.arenaId);}void this.disconnect();}
  async onDispose(){if(!this.ending)await this.fail('Room disposed before completion');}
}
