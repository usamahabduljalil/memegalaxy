import type { Action, Observation, Vec } from './types';
import { radius, speed } from './rules';
export type Strategy = { type:'MOVE'|'CHASE'|'ESCAPE'|'SPLIT'|'EJECT'|'WAIT'; x?:number;y?:number;target?:number };
export type Personality = 'hunter'|'survivor'|'opportunist';
const aim=(a:Vec,b:Vec)=>{const x=b.x-a.x,y=b.y-a.y,d=Math.hypot(x,y)||1;return {x:x/d,y:y/d};};
/** A fast safety controller takes priority over delayed strategic decisions. */
export function safeZoneSteering(o:Observation):Strategy|undefined {
  const mine=o.cells.filter(c=>c.owner===o.self);if(!mine.length)return;
  const contraction=o.mode==='prize'&&o.tick>=1800?o.safeHalf*Math.LN2/180:0;
  const danger=mine.map(c=>({cell:c,clearance:o.safeHalf-Math.max(Math.abs(c.x),Math.abs(c.y))-radius(c.mass),margin:Math.min(o.safeHalf*.4,Math.max(80,speed(c.mass)*1.5+contraction*2))})).filter(c=>c.clearance<c.margin).sort((a,b)=>a.clearance-b.clearance||a.cell.id-b.cell.id);
  if(!danger.length)return;
  // Include cell radii; the camera centroid alone can be inside while a split cell is outside.
  const origin=Math.hypot(o.viewport.x,o.viewport.y)>1?o.viewport:danger[0].cell;
  return {type:'MOVE',...aim(origin,{x:0,y:0})};
}
export function survival(o:Observation,personality:Personality='survivor'):Strategy {
  const mine=o.cells.filter(c=>c.owner===o.self);if(!mine.length)return {type:'WAIT'};const smallest=Math.min(...mine.map(c=>c.mass)),largest=Math.max(...mine.map(c=>c.mass));
  const safety=safeZoneSteering(o);if(safety)return safety;
  const rivals=o.cells.filter(c=>c.owner!==o.self).sort((a,b)=>Math.hypot(a.x-o.viewport.x,a.y-o.viewport.y)-Math.hypot(b.x-o.viewport.x,b.y-o.viewport.y));
  const threat=rivals.find(c=>c.mass>smallest*1.25&&Math.hypot(c.x-o.viewport.x,c.y-o.viewport.y)<400);
  if(threat)return {type:'ESCAPE',target:threat.id};
  const prey=rivals.find(c=>largest>=c.mass*1.4&&!o.names[c.owner]?.protected);
  if(prey&&personality!=='survivor')return {type:'CHASE',target:prey.id};
  const food=[...o.food,...o.pellets].filter(f=>Math.max(Math.abs(f.x),Math.abs(f.y))+radius(largest)+80<o.safeHalf).sort((a,b)=>Math.hypot(a.x-o.viewport.x,a.y-o.viewport.y)-Math.hypot(b.x-o.viewport.x,b.y-o.viewport.y))[0];
  return food?{type:'MOVE',...aim(o.viewport,food)}:{type:'MOVE',x:Math.cos(o.tick/300),y:Math.sin(o.tick/300)};
}
export function control(o:Observation,strategy:Strategy,seq:number):Action {
  const safety=safeZoneSteering(o);if(safety)strategy=safety;
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
