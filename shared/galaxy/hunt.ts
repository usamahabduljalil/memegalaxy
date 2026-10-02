import type {World,Vec} from './types';
import {radius} from './rules';
export type HuntDrop=Vec&{id:string;asset:string;symbol:string;expires:number;version:number};
export type DropContact={cell:number;since:number};
/** Only authoritative cells may collect; a changed cell resets sustained contact. */
export function huntCollector(world:World,drop:HuntDrop,contacts:Map<string,DropContact>,eligible:ReadonlySet<string>,requiredTicks=15):string|undefined {
 const touching=new Set<string>();
 const nearby=new Map<string,typeof world.cells>();for(const cell of world.cells)if(Math.hypot(cell.x-drop.x,cell.y-drop.y)<=radius(cell.mass)+12){const group=nearby.get(cell.owner);if(group)group.push(cell);else nearby.set(cell.owner,[cell]);}
 const candidates=world.players.filter(p=>p.controller==='human'&&p.alive&&p.disconnectedTick===null&&p.protectedUntil<=world.tick&&eligible.has(p.id)).sort((a,b)=>a.tie-b.tie||a.id.localeCompare(b.id));
 for(const p of candidates){const prior=contacts.get(p.id);const cells=(nearby.get(p.id)??[]).sort((a,b)=>a.id-b.id);const cell=cells.find(c=>c.id===prior?.cell)??cells[0];if(!cell)continue;touching.add(p.id);if(!prior||prior.cell!==cell.id)contacts.set(p.id,{cell:cell.id,since:world.tick});}
 for(const id of contacts.keys())if(!touching.has(id))contacts.delete(id);
 return candidates.find(p=>contacts.has(p.id)&&world.tick-contacts.get(p.id)!.since>=requiredTicks)?.id;
}
