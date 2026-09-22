import type { Action, Observation, Vec } from './types';
export type Strategy = { type:'MOVE'|'CHASE'|'ESCAPE'|'SPLIT'|'EJECT'|'WAIT'; x?:number;y?:number;target?:number };
export type Personality = 'hunter'|'survivor'|'opportunist';
const aim=(a:Vec,b:Vec)=>{const x=b.x-a.x,y=b.y-a.y,d=Math.hypot(x,y)||1;return {x:x/d,y:y/d};};
export function survival(o:Observation,personality:Personality='survivor'):Strategy {
  const mine=o.cells.filter(c=>c.owner===o.self);if(!mine.length)return {type:'WAIT'};const smallest=Math.min(...mine.map(c=>c.mass)),largest=Math.max(...mine.map(c=>c.mass));
  if(Math.max(Math.abs(o.viewport.x),Math.abs(o.viewport.y))>o.safeHalf-200)return {type:'MOVE',...aim(o.viewport,{x:0,y:0})};
  const rivals=o.cells.filter(c=>c.owner!==o.self).sort((a,b)=>Math.hypot(a.x-o.viewport.x,a.y-o.viewport.y)-Math.hypot(b.x-o.viewport.x,b.y-o.viewport.y));
  const threat=rivals.find(c=>c.mass>smallest*1.25&&Math.hypot(c.x-o.viewport.x,c.y-o.viewport.y)<400);
  if(threat)return {type:'ESCAPE',target:threat.id};
  const prey=rivals.find(c=>largest>=c.mass*1.4&&!o.names[c.owner]?.protected);
  if(prey&&personality!=='survivor')return {type:'CHASE',target:prey.id};
  const food=[...o.food,...o.pellets].sort((a,b)=>Math.hypot(a.x-o.viewport.x,a.y-o.viewport.y)-Math.hypot(b.x-o.viewport.x,b.y-o.viewport.y))[0];
  return food?{type:'MOVE',...aim(o.viewport,food)}:{type:'MOVE',x:Math.cos(o.tick/300),y:Math.sin(o.tick/300)};
}
export function control(o:Observation,strategy:Strategy,seq:number):Action {
  if(strategy.type==='CHASE'||strategy.type==='ESCAPE'){const target=o.cells.find(c=>c.id===strategy.target&&c.owner!==o.self);if(!target)return control(o,survival(o),seq);const v=aim(o.viewport,target);return {seq,type:'MOVE',x:v.x*(strategy.type==='ESCAPE'?-1:1),y:v.y*(strategy.type==='ESCAPE'?-1:1)};}
  if(strategy.type==='WAIT')return {type:'WAIT',seq};const x=strategy.x??0,y=strategy.y??0,d=Math.max(1,Math.hypot(x,y));return {seq,type:strategy.type,x:x/d,y:y/d};
}
export function parseStrategy(raw:unknown):Strategy {
  if(!raw||typeof raw!=='object')throw new Error('Invalid strategy');const a=raw as Strategy;
  if(!['MOVE','CHASE','ESCAPE','SPLIT','EJECT','WAIT'].includes(a.type))throw new Error('Invalid strategy type');
  if(a.type==='CHASE'||a.type==='ESCAPE'){if(!Number.isSafeInteger(a.target)||a.target!<0)throw new Error('Invalid target');return {type:a.type,target:a.target};}
  if(a.type==='WAIT')return {type:'WAIT'};
  if(!Number.isFinite(a.x)||!Number.isFinite(a.y)||Math.abs(a.x!)>1||Math.abs(a.y!)>1)throw new Error('Invalid aim');return {type:a.type,x:a.x,y:a.y};
}
