import { RULES } from './economics';
export type Vec={x:number;y:number};
export type Entrant={id:string;name:string;deposit:number;bot?:boolean};
export type Player=Entrant & Vec & {mass:number;earned:number;alive:boolean;eliminatedAt:number|null;lastMass:number;intent:Vec;boostUntil:number;disconnectedAt:number|null;tie:number;color:number};
export type Gift=Vec & {id:number;kind:'speed'|'mass';amount:number;expiresAt:number;contact:Record<string,number>};
export type GameState={version:number;elapsed:number;initialRadius:number;radius:number;players:Player[];gifts:Gift[];seed:number;rng:number;nextGift:number;giftId:number;finished:boolean};
export const COLORS=[0xc4f66c,0xb19bf4,0xf1ac87,0x80cfe3,0xf0cf72,0xf194bb,0x7ae4bf,0x93acf5];
export function random(s:GameState){s.rng=(s.rng+0x6D2B79F5)>>>0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
const distanceSquared=(a:Vec,b:Vec)=>{const x=a.x-b.x,y=a.y-b.y;return x*x+y*y;};
export function radiusForMass(mass:number){return 16*Math.sqrt(Math.max(0,mass)/1000);}
export function speedForMass(mass:number){return Math.max(70,Math.min(220,180*Math.pow(1000/Math.max(100,mass),.2)));}
export function createGame(entrants:Entrant[],seed:number):GameState{
  const s:GameState={version:RULES.version,elapsed:0,initialRadius:72*Math.sqrt(Math.max(2,entrants.length)),radius:0,players:[],gifts:[],seed,rng:seed,nextGift:5,giftId:0,finished:false};s.radius=s.initialRadius;
  for(const [i,e] of entrants.entries()){
    const mass=Math.min(RULES.maxStartingMass,Math.max(RULES.minDeposit,e.deposit));let x=0,y=0;
    for(let attempt=0;attempt<500;attempt++){const a=random(s)*Math.PI*2,r=Math.sqrt(random(s))*(s.radius-radiusForMass(mass)-30);x=Math.cos(a)*r;y=Math.sin(a)*r;if(s.players.every(p=>Math.hypot(p.x-x,p.y-y)>radiusForMass(p.mass)+radiusForMass(mass)+10))break;}
    s.players.push({...e,x,y,mass,earned:0,alive:true,eliminatedAt:null,lastMass:mass,intent:{x:0,y:0},boostUntil:0,disconnectedAt:null,tie:random(s),color:COLORS[i%COLORS.length]});
  }
  s.nextGift=5+random(s)*5;return s;
}
export function setIntent(s:GameState,id:string,v:Vec){const p=s.players.find(p=>p.id===id);if(!p||!p.alive||!Number.isFinite(v.x)||!Number.isFinite(v.y))return;const len=Math.hypot(v.x,v.y);p.intent=len>1?{x:v.x/len,y:v.y/len}:{x:v.x,y:v.y};}
export function markConnection(s:GameState,id:string,connected:boolean){const p=s.players.find(p=>p.id===id);if(p){p.disconnectedAt=connected?null:s.elapsed;p.intent={x:0,y:0};}}
export function rankPlayers(s:GameState){return [...s.players].sort((a,b)=>Number(b.alive)-Number(a.alive)||(a.alive?b.mass-a.mass:(b.eliminatedAt??0)-(a.eliminatedAt??0)||b.lastMass-a.lastMass)||b.earned-a.earned||a.tie-b.tie||a.id.localeCompare(b.id));}
/** Public render state excludes future randomness, uncollected pickup progress, and opponent inputs. */
export function publicSnapshot(s:GameState):GameState{const ranks=new Map(rankPlayers(s).map((p,i)=>[p.id,i]));return {...s,seed:0,rng:0,nextGift:0,players:s.players.map(p=>({...p,intent:{x:0,y:0},disconnectedAt:null,tie:ranks.get(p.id)!})),gifts:s.gifts.map(g=>({...g,contact:{}}))};}
export function stepGame(s:GameState,dt:number){
  if(s.finished||dt<=0||dt>.1)return;s.elapsed=Math.min(RULES.matchSeconds,s.elapsed+dt);if(s.elapsed>RULES.matchSeconds-1e-7)s.elapsed=RULES.matchSeconds;s.radius=s.initialRadius*Math.pow(.9,Math.min(9,Math.floor(s.elapsed/60)));
  const alive=s.players.filter(p=>p.alive),deltas=new Map(alive.map(p=>[p.id,0])),earnings=new Map(alive.map(p=>[p.id,0]));
  for(const p of alive){
    if(p.disconnectedAt===null){const speed=speedForMass(p.mass)*(p.boostUntil>s.elapsed?1.4:1);p.x+=p.intent.x*speed*dt;p.y+=p.intent.y*speed*dt;}
    const d=Math.hypot(p.x,p.y);if(d>s.initialRadius+100){p.x*=((s.initialRadius+100)/d);p.y*=((s.initialRadius+100)/d);}
    if(Math.hypot(p.x,p.y)+radiusForMass(p.mass)>=s.radius)deltas.set(p.id,deltas.get(p.id)!-p.mass*.2*dt);
  }
  const radii=new Map(alive.map(p=>[p.id,radiusForMass(p.mass)]));
  if(s.elapsed>=3){
    for(const victim of alive){
      const predators=alive.filter(p=>p!==victim&&p.mass>=victim.mass*1.1&&distanceSquared(p,victim)<=(radii.get(p.id)!+radii.get(victim.id)!)**2);
      if(predators.length){const consumed=victim.mass*.15*dt;deltas.set(victim.id,deltas.get(victim.id)!-consumed);for(const p of predators){deltas.set(p.id,deltas.get(p.id)!+consumed/predators.length);earnings.set(p.id,earnings.get(p.id)!+consumed/predators.length);}}
    }
  }
  // Calculate all transfers before changing any mass; no player-order advantage.
  for(const p of alive){p.lastMass=p.mass;p.mass=Math.max(0,p.mass+deltas.get(p.id)!);p.earned+=earnings.get(p.id)!;if(p.mass<100||(p.disconnectedAt!==null&&s.elapsed-p.disconnectedAt>=20)){p.alive=false;p.eliminatedAt=s.elapsed;p.intent={x:0,y:0};}}
  // Near-equal circles separate symmetrically, using a seeded direction at identical centers.
  for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++){const a=alive[i],b=alive[j];if(!a.alive||!b.alive||Math.max(a.mass,b.mass)>=Math.min(a.mass,b.mass)*1.1)continue;let dx=b.x-a.x,dy=b.y-a.y;const d=Math.hypot(dx,dy),sum=radiusForMass(a.mass)+radiusForMass(b.mass);if(d>=sum)continue;if(d<.001){dx=Math.cos(a.tie*6.28);dy=Math.sin(a.tie*6.28);}else{dx/=d;dy/=d;}const push=Math.min(sum-d,80*dt)/2;a.x-=dx*push;a.y-=dy*push;b.x+=dx*push;b.y+=dy*push;}
  s.gifts=s.gifts.filter(g=>g.expiresAt>s.elapsed);
  if(s.elapsed>=s.nextGift){s.nextGift=s.elapsed+5+random(s)*5;if(s.gifts.length<3){const a=random(s)*Math.PI*2,r=Math.sqrt(random(s))*Math.max(0,s.radius-45);s.gifts.push({id:++s.giftId,x:Math.cos(a)*r,y:Math.sin(a)*r,kind:random(s)<.5?'speed':'mass',amount:100+Math.floor(random(s)*401),expiresAt:s.elapsed+6,contact:{}});}}
  for(const g of [...s.gifts]){const touching=s.players.filter(p=>p.alive&&Math.hypot(p.x-g.x,p.y-g.y)<=radiusForMass(p.mass)+10);for(const id of Object.keys(g.contact))if(!touching.some(p=>p.id===id))delete g.contact[id];for(const p of touching)g.contact[p.id]=(g.contact[p.id]??0)+dt;const collector=touching.filter(p=>g.contact[p.id]>=.3).sort((a,b)=>a.tie-b.tie)[0];if(collector){if(g.kind==='speed')collector.boostUntil=s.elapsed+5;else collector.mass+=g.amount;s.gifts=s.gifts.filter(x=>x.id!==g.id);}}
  if(s.players.filter(p=>p.alive).length<=1||s.elapsed>=RULES.matchSeconds)s.finished=true;
}
export function steerBots(s:GameState){for(const p of s.players.filter(p=>p.bot&&p.alive)){let target:Vec={x:0,y:0};const threat=s.players.filter(x=>x.alive&&x.mass>p.mass*1.1&&x!==p).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];if(Math.hypot(p.x,p.y)>s.radius-radiusForMass(p.mass)-35){target={x:-p.x,y:-p.y};}else if(threat&&Math.hypot(threat.x-p.x,threat.y-p.y)<radiusForMass(threat.mass)+radiusForMass(p.mass)+75){target={x:p.x-threat.x,y:p.y-threat.y};}else{const prey=s.players.filter(x=>x.alive&&x!==p&&p.mass>=x.mass*1.1);const goals=[...s.gifts,...prey].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));if(goals.length)target={x:goals[0].x-p.x,y:goals[0].y-p.y};else target={x:Math.cos(s.elapsed*.3+p.tie*20)*s.radius*.4-p.x,y:Math.sin(s.elapsed*.3+p.tie*20)*s.radius*.4-p.y};}setIntent(s,p.id,target);}}
