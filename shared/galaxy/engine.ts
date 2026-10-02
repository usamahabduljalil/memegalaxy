import { GALAXY_RULES as R, RULESET_ID, rulesFor, radius, speed, mergeDelay } from './rules';
import { SpatialGrid } from './spatial';
import type { Action, Cell, Entrant, Mode, Observation, Player, Vec, World } from './types';
export function random(w:World){w.rng=(w.rng+0x6D2B79F5)>>>0;let t=w.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
const distance=(a:Vec,b:Vec)=>Math.hypot(a.x-b.x,a.y-b.y);
const unit=(x:number,y:number):Vec=>{const d=Math.hypot(x,y);return d>0?{x:x/Math.max(1,d),y:y/Math.max(1,d)}:{x:0,y:0};};
const point=(w:World):Vec=>({x:(random(w)*2-1)*(w.size/2-100),y:(random(w)*2-1)*(w.size/2-100)});
export const massOf=(w:World,id:string)=>w.cells.reduce((sum,c)=>sum+(c.owner===id?c.mass:0),0);
export function createWorld(mode:Mode,seed:number,entrants:Entrant[]=[],capacity=100,rulesHash=RULESET_ID):World {
  if(!Number.isInteger(capacity)||capacity<2||capacity>100||entrants.length>capacity||new Set(entrants.map(e=>e.id)).size!==entrants.length)throw new Error('Invalid room roster');
  const tuning=rulesFor(rulesHash);
  const w:World={version:2,rulesHash,mode,capacity,tick:0,size:Math.max(4000,800*Math.sqrt(capacity)),safeHalf:0,seed,rng:seed,nextId:1,players:[],cells:[],food:[],pellets:[],objects:[],finished:false};w.safeHalf=w.size/2;
  for(let i=0;i<capacity*R.foodPerSlot;i++)w.food.push({...point(w),id:w.nextId++,mass:tuning.foodMass});
  for(let i=0;i<Math.max(4,Math.ceil(capacity/5));i++)w.objects.push({...point(w),id:w.nextId++,kind:'nova',feeds:0});
  entrants.forEach(e=>addPlayer(w,e));return w;
}
export function addPlayer(w:World,e:Entrant){if(w.players.length>=w.capacity||w.players.some(p=>p.id===e.id)||w.finished)throw new Error('Room full or duplicate entrant');const p:Player={...e,alive:true,intent:{x:0,y:0},earned:0,peakMass:100,lastMass:100,eliminatedTick:null,protectedUntil:w.tick+R.protectionTicks,disconnectedTick:null,respawnTick:0,tie:random(w),seq:-1,nextEject:0,nextSplit:0};w.players.push(p);spawn(w,p);}
function spawn(w:World,p:Player){let pos=point(w);for(let i=0;i<100;i++){pos=point(w);if(w.cells.every(c=>distance(c,pos)>radius(c.mass)+160)&&w.objects.every(o=>distance(o,pos)>160))break;}w.cells.push({...pos,id:w.nextId++,owner:p.id,mass:100,vx:0,vy:0,mx:0,my:0,mergeAt:w.tick});p.alive=true;p.intent={x:0,y:0};p.eliminatedTick=null;p.protectedUntil=w.tick+90;p.lastMass=100;}
export function connection(w:World,id:string,connected:boolean){const p=w.players.find(p=>p.id===id);if(p){p.disconnectedTick=connected?null:w.tick;p.intent={x:0,y:0};}}
export function applyAction(w:World,id:string,a:Action):boolean {
  const p=w.players.find(p=>p.id===id);if(!p||!p.alive||w.finished||p.disconnectedTick!==null||!a||!Number.isSafeInteger(a.seq)||a.seq<0||a.seq<=p.seq||!['MOVE','WAIT','SPLIT','EJECT'].includes(a.type))return false;
  if(a.type!=='WAIT'&&(!Number.isFinite(a.x)||!Number.isFinite(a.y)||Math.abs(a.x!)>1||Math.abs(a.y!)>1))return false;
  p.seq=a.seq;const aim=unit(a.x??0,a.y??0);
  if(a.type==='WAIT'){p.intent={x:0,y:0};return true;}if(a.type==='MOVE'){p.intent=aim;return true;}
  const cells=w.cells.filter(c=>c.owner===id).sort((a,b)=>b.mass-a.mass||a.id-b.id);
  if(a.type==='SPLIT'){if(w.tick<p.nextSplit||!Math.hypot(aim.x,aim.y))return false;p.nextSplit=w.tick+9;let count=cells.length;for(const c of cells){if(count>=R.maxCells)break;if(c.mass<R.splitMinimum)continue;c.mass/=2;c.mergeAt=w.tick+mergeDelay(c.mass);const r=radius(c.mass);w.cells.push({...c,id:w.nextId++,x:c.x+aim.x*r,y:c.y+aim.y*r,vx:aim.x*650,vy:aim.y*650});count++;}return true;}
  if(w.tick<p.nextEject||!Math.hypot(aim.x,aim.y))return false;p.nextEject=w.tick+6;
  for(const c of cells){if(c.mass<32||w.pellets.length>=R.maxPellets)continue;c.mass-=R.ejectCost;const r=radius(c.mass)+15;w.pellets.push({id:w.nextId++,x:c.x+aim.x*r,y:c.y+aim.y*r,mass:R.ejectMass,vx:aim.x*380,vy:aim.y*380,source:id,expires:w.tick+900});}return true;
}
export function rankings(w:World){const mass=new Map<string,number>();for(const c of w.cells)mass.set(c.owner,(mass.get(c.owner)??0)+c.mass);return [...w.players].sort((a,b)=>Number(b.alive)-Number(a.alive)||(a.alive?(mass.get(b.id)??0)-(mass.get(a.id)??0):(b.eliminatedTick??0)-(a.eliminatedTick??0)||b.lastMass-a.lastMass)||b.earned-a.earned||a.tie-b.tie||a.id.localeCompare(b.id));}
export function tick(w:World){
  if(w.finished)return;w.tick++;const dt=1/30,seconds=w.tick/30,tuning=rulesFor(w.rulesHash),players=new Map(w.players.map(p=>[p.id,p]));
  w.safeHalf=w.mode==='prize'?w.size/2*Math.pow(.5,Math.max(0,seconds-60)/180):w.size/2;
  const beforeMass=new Map<string,number>();for(const c of w.cells)beforeMass.set(c.owner,(beforeMass.get(c.owner)??0)+c.mass);for(const p of w.players)p.lastMass=beforeMass.get(p.id)??0;
  for(const c of w.cells){const p=players.get(c.owner)!;const moving=p.disconnectedTick===null,cellSpeed=speed(c.mass,w.rulesHash);c.mx+=(p.intent.x*cellSpeed-c.mx)*Math.min(1,dt*tuning.steeringResponse);c.my+=(p.intent.y*cellSpeed-c.my)*Math.min(1,dt*tuning.steeringResponse);if(!moving){c.mx=0;c.my=0;c.vx=0;c.vy=0;}c.x+=(c.vx+c.mx)*dt;c.y+=(c.vy+c.my)*dt;c.vx*=.86;c.vy*=.86;const edge=Math.max(0,w.size/2-radius(c.mass));c.x=Math.max(-edge,Math.min(edge,c.x));c.y=Math.max(-edge,Math.min(edge,c.y));if(w.mode==='prize'){let loss=0;if(Math.max(Math.abs(c.x),Math.abs(c.y))+radius(c.mass)>w.safeHalf)loss+=.08+seconds/3000;if(seconds>1200)loss+=(seconds-1200)/600;c.mass*=Math.exp(-loss*dt);}}
  for(const p of w.pellets){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.9;p.vy*=.9;}
  // Choose each victim's predator against one immutable phase snapshot. Resolve largest first.
  const grid=new SpatialGrid<Cell>(256);w.cells.forEach(c=>grid.insert(c));const maxRadius=Math.max(0,...w.cells.map(c=>radius(c.mass)));const consumed=new Set<number>();
  const victims=[...w.cells].sort((a,b)=>b.mass-a.mass||a.id-b.id);const targets=new Map<number,Cell>();
  for(const v of victims){const vp=players.get(v.owner)!;if(vp.protectedUntil>w.tick)continue;let predator:Cell|undefined;const victimRadius=radius(v.mass);grid.forEach(v,maxRadius,c=>{if(c.owner===v.owner||players.get(c.owner)!.protectedUntil>w.tick||c.mass<v.mass*R.eatingRatio||distance(c,v)>=radius(c.mass)-victimRadius*.35)return;if(!predator||c.mass>predator.mass||c.mass===predator.mass&&(players.get(c.owner)!.tie<players.get(predator.owner)!.tie||players.get(c.owner)!.tie===players.get(predator.owner)!.tie&&c.id<predator.id))predator=c;});if(predator)targets.set(v.id,predator);}
  const gains=new Map<number,number>();
  for(const v of victims){const predator=targets.get(v.id);if(!predator||consumed.has(predator.id))continue;consumed.add(v.id);gains.set(predator.id,(gains.get(predator.id)??0)+v.mass);players.get(predator.owner)!.earned+=v.mass;}
  for(const c of w.cells)c.mass+=gains.get(c.id)??0;w.cells=w.cells.filter(c=>!consumed.has(c.id));
  // Consumables use a fresh index after combat. No player-array ordering advantage.
  const eatGrid=new SpatialGrid<Cell>(256);w.cells.forEach(c=>eatGrid.insert(c));const reach=Math.max(0,...w.cells.map(c=>radius(c.mass)));
  const collector=(v:Vec,source?:string)=>{let best:Cell|undefined;eatGrid.forEach(v,reach,c=>{if(c.owner===source||distance(c,v)>=radius(c.mass))return;if(!best||c.mass>best.mass||c.mass===best.mass&&(players.get(c.owner)!.tie<players.get(best.owner)!.tie||players.get(c.owner)!.tie===players.get(best.owner)!.tie&&c.id<best.id))best=c;});return best;};
  w.food=w.food.filter(f=>{const c=collector(f);if(c)c.mass+=f.mass;return !c;});
  w.pellets=w.pellets.filter(f=>{if(f.expires<=w.tick)return false;const nova=w.objects.find(o=>distance(o,f)<45);if(nova){nova.feeds++;if(nova.feeds>=7){nova.feeds=0;if(w.objects.length<R.maxObjects){const d=unit(f.vx,f.vy),half=w.size/2-50;w.objects.push({id:w.nextId++,kind:'nova',feeds:0,x:Math.max(-half,Math.min(half,nova.x+d.x*120)),y:Math.max(-half,Math.min(half,nova.y+d.y*120))});}}return false;}const c=collector(f,w.tick<f.expires-870?f.source:undefined);if(c)c.mass+=f.mass;return !c;});
  for(const o of [...w.objects]){const c=w.cells.filter(c=>c.mass>=180&&distance(c,o)<radius(c.mass)-15).sort((a,b)=>b.mass-a.mass||a.id-b.id)[0];if(!c)continue;const count=w.cells.filter(x=>x.owner===c.owner).length,parts=Math.min(4,R.maxCells-count+1);if(parts<2)continue;c.mass/=parts;c.mergeAt=w.tick+mergeDelay(c.mass);for(let i=1;i<parts;i++){const a=i*Math.PI*2/parts;w.cells.push({...c,id:w.nextId++,vx:Math.cos(a)*400,vy:Math.sin(a)*400});}w.objects=w.objects.filter(x=>x.id!==o.id);}
  const removed=new Set<number>(),owned=new Map<string,Cell[]>();for(const c of w.cells){const group=owned.get(c.owner);if(group)group.push(c);else owned.set(c.owner,[c]);}
  for(const p of w.players){const cells=(owned.get(p.id)??[]).sort((a,b)=>a.id-b.id);for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){const a=cells[i],b=cells[j];if(removed.has(a.id)||removed.has(b.id))continue;const d=distance(a,b),sum=radius(a.mass)+radius(b.mass);if(d>=sum)continue;if(w.tick>=Math.max(a.mergeAt,b.mergeAt)){a.x=(a.x*a.mass+b.x*b.mass)/(a.mass+b.mass);a.y=(a.y*a.mass+b.y*b.mass)/(a.mass+b.mass);a.mass+=b.mass;removed.add(b.id);}else {const angle=(a.id+b.id)*2.39996;const dx=d>.001?(b.x-a.x)/d:Math.cos(angle),dy=d>.001?(b.y-a.y)/d:Math.sin(angle),push=Math.min(sum-d,6)/2;a.x-=dx*push;a.y-=dy*push;b.x+=dx*push;b.y+=dy*push;}}}
  w.cells=w.cells.filter(c=>!removed.has(c.id)&&c.mass>=R.minimumMass&&!(players.get(c.owner)!.disconnectedTick!==null&&w.tick-players.get(c.owner)!.disconnectedTick!>=R.reconnectTicks));
  const afterMass=new Map<string,number>();for(const c of w.cells)afterMass.set(c.owner,(afterMass.get(c.owner)??0)+c.mass);for(const p of w.players){p.peakMass=Math.max(p.peakMass,afterMass.get(p.id)??0);if(p.alive&&!afterMass.has(p.id)){p.alive=false;p.eliminatedTick=w.tick;p.respawnTick=w.tick+R.respawnTicks;p.intent={x:0,y:0};}if(!p.alive&&w.mode!=='prize'&&p.disconnectedTick===null&&w.tick>=p.respawnTick)spawn(w,p);}
  if(w.tick%3===0)for(let i=0;i<3&&w.food.length<w.capacity*R.foodPerSlot;i++)w.food.push({...point(w),id:w.nextId++,mass:tuning.foodMass});
  if(w.mode==='prize'&&w.players.length>1&&w.players.filter(p=>p.alive).length<=1)w.finished=true;
}
export function standings(w:World){const mass=new Map<string,number>(),counts=new Map<string,number>();for(const c of w.cells){mass.set(c.owner,(mass.get(c.owner)??0)+c.mass);counts.set(c.owner,(counts.get(c.owner)??0)+1);}return rankings(w).slice(0,10).map((p,i)=>({id:p.id,name:p.name,controller:p.controller,mass:mass.get(p.id)??0,cells:counts.get(p.id)??0,alive:p.alive,rank:i+1}));}
export function observe(w:World,id:string,board=standings(w)):Observation{
  const mine=w.cells.filter(c=>c.owner===id),total=mine.reduce((n,c)=>n+c.mass,0);const center={x:mine.reduce((n,c)=>n+c.x*c.mass,0)/(total||1),y:mine.reduce((n,c)=>n+c.y*c.mass,0)/(total||1)};const half=Math.min(w.size/2,Math.max(650,...mine.map(c=>distance(c,center)+radius(c.mass)+400)));
  const visible=(v:Vec)=>Math.abs(v.x-center.x)<=half&&Math.abs(v.y-center.y)<=half;
  const cells=w.cells.filter(c=>c.owner===id||visible(c)).map(({id,owner,x,y,mass,mergeAt})=>({id,owner,x,y,mass,mergeAt}));const ids=new Set(cells.map(c=>c.owner));
  return {protocol:2,tick:w.tick,alive:w.players.filter(p=>p.alive).length,mode:w.mode,size:w.size,safeHalf:w.safeHalf,finished:w.finished,self:id,viewport:{...center,half},cells,food:w.food.filter(visible).map(f=>({...f})),pellets:w.pellets.filter(visible).map(({id,x,y,mass})=>({id,x,y,mass})),objects:w.objects.filter(visible).map(o=>({...o})),leaderboard:board,names:Object.fromEntries(w.players.filter(p=>ids.has(p.id)).map(p=>[p.id,{name:p.name,controller:p.controller,protected:p.protectedUntil>w.tick,...(p.skin?{skin:p.skin}:{})}]))};
}
