import { applyAction, connection, createWorld, tick } from './engine';
import { RULESET_ID } from './rules';
import type { Action, Entrant, Mode, World } from './types';
export type ReplayHeader={version:2;rulesHash:string;seed:number;mode:Mode;capacity:number;entrants:Entrant[]};
export type ReplayInput={tick:number;id:string;action:Action}|{tick:number;id:string;connected:boolean};
export function replay(header:ReplayHeader,events:ReplayInput[],endTick:number):World {
  if(header.version!==2||header.rulesHash!==RULESET_ID||!Number.isSafeInteger(endTick)||endTick<0||endTick>216000)throw new Error('Unsupported replay');
  const w=createWorld(header.mode,header.seed,header.entrants,header.capacity);
  for(const e of events){if(!Number.isSafeInteger(e.tick)||e.tick<w.tick||e.tick>endTick||!w.players.some(p=>p.id===e.id))throw new Error('Invalid event');while(w.tick<e.tick&&!w.finished)tick(w);if(w.finished)throw new Error('Input after completion');if('action'in e){if(!applyAction(w,e.id,e.action))throw new Error('Rejected replay action');}else connection(w,e.id,e.connected);}
  while(w.tick<endTick&&!w.finished)tick(w);return w;
}
