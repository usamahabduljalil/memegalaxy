import { expect,it } from 'vitest';
import { createGame,markConnection,rankPlayers,setIntent,stepGame } from '../shared/game';
import { replayArena,type ReplayEvent } from '../shared/replay';
import { canonicalJSON } from '../shared/canonical';
it('preserves replay commitments when JSONB reorders object keys',()=>{
  expect(canonicalJSON([{tick:1,type:'input',data:{x:1,y:2}}])).toBe(canonicalJSON([{data:{y:2,x:1},type:'input',tick:1}]));
});
it('reproduces an authoritative match from connection and movement events',()=>{
  const roster=Array.from({length:10},(_,i)=>({id:String(i),name:`Player ${i}`,deposit:1000+i*200}));
  const events:ReplayEvent[]=[{type:'initial',version:1,seed:36,roster,startsAt:123}];
  const game=createGame(roster,36);game.players.forEach(p=>markConnection(game,p.id,false));
  for(let tick=0;!game.finished&&tick<18001;tick++){
    if(tick===3){markConnection(game,'0',true);events.push({type:'connected',tick,wallet:'0'});}
    if(tick===4){setIntent(game,'0',{x:.1,y:0});events.push({type:'input',tick,wallet:'0',x:.1,y:0});}
    stepGame(game,1/30);
  }
  const replay=replayArena(events);
  expect(replay.game).toEqual(game);
  expect(replay.result.map(p=>p.wallet)).toEqual(rankPlayers(game).map(p=>p.id));
  expect(()=>replayArena([...events,{type:'connected',tick:1,wallet:'0'}])).toThrow('order');
});
