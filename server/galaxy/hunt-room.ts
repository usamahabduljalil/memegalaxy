import {randomInt} from 'node:crypto';
import {db} from './store';
import {collectDrop,config,dropsFunded,expireDrop,reserveDrop} from './economy';
import {huntCollector,type HuntDrop,type DropContact} from '../../shared/galaxy/hunt';
import {HUNT_DEFAULTS} from '../../shared/galaxy/economy';
import type {World,Observation} from '../../shared/galaxy/types';
import type {Admission} from './auth';
export class HuntRoom {
 drop?:HuntDrop;paused=true;private contacts=new Map<string,DropContact>();private limited=new Set<string>();private limitedDay='';private heartbeatBusy=false;private busy=false;private closed=false;private next=Date.now()+randomInt(180000,420001);private lastHeartbeat=0;private requiredTicks=15;
 constructor(private roomId:string,private sessions:()=>Admission[],private record:(event:Record<string,unknown>)=>void,private expired:(sessions:string[])=>void=()=>{}){}
 tick(world:World){if(this.closed)return;if(Date.now()-this.lastHeartbeat>5000){this.lastHeartbeat=Date.now();void this.heartbeat(world);}
  if(this.busy)return;
  if(this.drop&&Date.now()>=this.drop.expires){const id=this.drop.id;this.record({kind:'drop-expired',drop:id});this.drop=undefined;this.contacts.clear();void expireDrop(id).catch(()=>{this.paused=true;});}
  if(!this.drop&&Date.now()>=this.next&&this.sessions().length){this.busy=true;void this.spawn(world).finally(()=>{this.busy=false;});return;}
  if(this.paused||!this.drop)return;
  const eligible=new Set(this.sessions().filter(s=>!this.limited.has(s.id)).map(s=>s.id));const winner=huntCollector(world,this.drop,this.contacts,eligible,this.requiredTicks);if(!winner)return;
  const admission=this.sessions().find(s=>s.id===winner),drop=this.drop;if(!admission?.huntSession)return;
  const contactTick=world.tick;this.record({kind:'drop-contact',drop:drop.id,player:winner,contactTick,requiredTicks:this.requiredTicks});this.busy=true;void collectDrop(drop.id,admission.huntSession).then(result=>{if(result&&'limited'in result){this.limited.add(winner);this.contacts.delete(winner);return;}if(result){this.record({kind:'drop-collected',drop:drop.id,player:winner,contactTick,amount:result.amount});this.drop=undefined;this.contacts.clear();}else this.paused=true;}).catch(()=>{this.paused=true;}).finally(()=>{this.busy=false;});
 }
 private async heartbeat(world:World){if(this.heartbeatBusy)return;this.heartbeatBusy=true;try{
  const ids=this.sessions().filter(a=>world.players.find(p=>p.id===a.id)?.disconnectedTick===null).map(s=>s.huntSession);
  if(ids.length){const result=await db.query("UPDATE mg_hunt_sessions SET lease_until=now()+interval '30 seconds' WHERE id=ANY($1::uuid[]) AND room_id=$2 AND lease_until>now() RETURNING id",[ids,this.roomId]);if(this.closed)return;const renewed=new Set(result.rows.map(r=>r.id));const lost=ids.filter((id):id is string=>!!id&&!renewed.has(id));if(lost.length)this.expired(lost);}
  const cfg=await config();this.paused=this.drop?!cfg.settings.enabled:!await dropsFunded();const day=new Date(Date.now()+3600000).toISOString().slice(0,10);if(day!==this.limitedDay){this.limitedDay=day;this.limited.clear();}
 }catch{this.paused=true;}finally{this.heartbeatBusy=false;}}
 private async spawn(world:World){try{const reserved=await reserveDrop(this.roomId);const settings=reserved?.settings??HUNT_DEFAULTS;this.next=Date.now()+randomInt(settings.minInterval*1000,settings.maxInterval*1000+1);if(!reserved){this.paused=true;return;}if(this.closed){await expireDrop(reserved.id);return;}
  const half=Math.floor(world.size/2-160);this.drop={id:reserved.id,asset:reserved.asset,symbol:reserved.symbol,expires:reserved.expires,version:reserved.version,x:randomInt(-half,half+1),y:randomInt(-half,half+1)};this.requiredTicks=settings.contactTicks;this.paused=false;this.contacts.clear();this.record({kind:'drop-spawn',drop:this.drop,settings});
 }catch{this.paused=true;this.next=Date.now()+10000;}}
 view(o:Observation){const drop=this.drop;return {...o,hunt:{paused:this.paused,sector:drop?`${drop.y<0?'North':'South'}${drop.x<0?'west':'east'}`:null,drops:drop&&Math.abs(drop.x-o.viewport.x)<=o.viewport.half&&Math.abs(drop.y-o.viewport.y)<=o.viewport.half?[drop]:[]}};}
 async close(){this.closed=true;if(this.drop){this.record({kind:'drop-expired',drop:this.drop.id});await expireDrop(this.drop.id);}await db.query('DELETE FROM mg_hunt_sessions WHERE room_id=$1',[this.roomId]);}
}
