import { expect,it } from 'vitest';
import { createGame,publicSnapshot,rankPlayers,setIntent,stepGame } from '../shared/game';
import { applyFrame,encodeFrame } from '../shared/wire';

it('compact frames preserve positions, mass, effects and server standings',()=>{
  const game=createGame(Array.from({length:50},(_,i)=>({id:`wallet-${i}`,name:`Player ${i}`,deposit:1000+i*60})),56);
  const baseline=publicSnapshot(game);
  for(let tick=0;tick<300;tick++){setIntent(game,'wallet-0',{x:.2,y:.3});stepGame(game,1/30);}
  const frame=encodeFrame(game),rendered=applyFrame(baseline,frame),snapshot=publicSnapshot(game);
  expect(rendered.players).toEqual(snapshot.players);
  expect(rendered.gifts).toEqual(snapshot.gifts);
  expect(rankPlayers(rendered).map(p=>p.id)).toEqual(rankPlayers(game).map(p=>p.id));
  expect(JSON.stringify(frame).length).toBeLessThan(JSON.stringify(snapshot).length*.65);
  expect(frame).not.toHaveProperty('rng');
});
it('rejects frames that change the admitted roster',()=>{
  const game=createGame([{id:'a',name:'A',deposit:1000}],1);
  expect(()=>applyFrame(game,{elapsed:0,radius:1,finished:false,players:[],gifts:[]})).toThrow('roster');
});
