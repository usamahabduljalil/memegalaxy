import { addPlayer,applyAction, connection, createWorld, tick } from './engine';
import { rulesFor } from './rules';
import type { Action, Entrant, Mode, World } from './types';
export type ReplayHeader={version:2;rulesHash:string;seed:number;mode:Mode;capacity:number;entrants:Entrant[]};
export type ReplayInput={tick:number;join:Entrant}|{tick:number;system:Record<string,unknown>}|{tick:number;id:string;action:Action}|{tick:number;id:string;connected:boolean};
export function replay(header:ReplayHeader,events:ReplayInput[],endTick:number):World {
  if(header.version!==2||!Number.isSafeInteger(endTick)||endTick<0||endTick>216000)throw new Error('Unsupported replay');
  rulesFor(header.rulesHash);
  const w=createWorld(header.mode,header.seed,header.entrants,header.capacity,header.rulesHash);
  for(const e of events){if(!Number.isSafeInteger(e.tick)||e.tick<w.tick||e.tick>endTick||('id'in e&&!w.players.some(p=>p.id===e.id)))throw new Error('Invalid event');while(w.tick<e.tick&&!w.finished)tick(w);if(w.finished)throw new Error('Input after completion');if('join'in e){addPlayer(w,e.join);}else if('system'in e){if(e.system.kind==='skin-equipped'){const player=w.players.find(p=>p.id===e.system.id);if(!player||typeof e.system.skin!=='string')throw new Error('Invalid skin event');player.skin=e.system.skin;}if(e.system.kind==='players-left'){if(header.mode==='prize'||!Array.isArray(e.system.ids)||e.system.ids.some(id=>typeof id!=='string'))throw new Error('Invalid player removal');const ids=new Set(e.system.ids);w.players=w.players.filter(p=>!ids.has(p.id));w.cells=w.cells.filter(c=>!ids.has(c.owner));}continue;}else if('action'in e){if(!applyAction(w,e.id,e.action))throw new Error('Rejected replay action');}else connection(w,e.id,e.connected);}
  while(w.tick<endTick&&!w.finished)tick(w);return w;
}
