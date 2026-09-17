import { createGame,markConnection,setIntent,stepGame,rankPlayers,type Entrant } from './game';
import { RULES } from './economics';
export type ReplayEvent=
  |{type:'initial';version:number;seed:number;roster:Entrant[];startsAt:number}
  |{type:'input';tick:number;wallet:string;x:number;y:number}
  |{type:'connected'|'disconnected';tick:number;wallet:string};
export function replayArena(events:ReplayEvent[]){
  const initial=events[0];
  if(initial?.type!=='initial'||initial.version!==RULES.version)throw new Error('Unsupported replay rules version');
  const game=createGame(initial.roster,Number(initial.seed));
  game.players.forEach(p=>markConnection(game,p.id,false));
  let tick=0;
  for(const event of events.slice(1)){
    if(event.type==='initial'||!Number.isSafeInteger(event.tick)||event.tick<tick||event.tick>18000)throw new Error('Invalid replay event order');
    while(tick<event.tick&&!game.finished){stepGame(game,1/30);tick++;}
    if(game.finished)throw new Error('Replay includes input after the game finished');
    if(!game.players.some(p=>p.id===event.wallet))throw new Error('Replay contains a nonparticipant');
    if(event.type==='input')setIntent(game,event.wallet,event);
    else markConnection(game,event.wallet,event.type==='connected');
  }
  while(!game.finished&&tick<=18000){stepGame(game,1/30);tick++;}
  return {game,result:rankPlayers(game).map((p,i)=>({wallet:p.id,name:p.name,rank:i+1,mass:p.mass,earned:p.earned,eliminatedAt:p.eliminatedAt}))};
}
