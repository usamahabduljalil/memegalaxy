import { rankPlayers, type GameState } from './game';

// The frozen roster is sent once on admission. Frames carry changing values only.
// Keep full numeric precision so the displayed standings match server rankings.
export type ArenaFrame={
  elapsed:number; radius:number; finished:boolean;
  players:number[][];
  gifts:number[][];
};
export function encodeFrame(state:GameState):ArenaFrame {
  const ranks=new Map(rankPlayers(state).map((player,index)=>[player.id,index]));
  return {
    elapsed:state.elapsed,radius:state.radius,finished:state.finished,
    players:state.players.map(p=>[p.x,p.y,p.mass,p.earned,p.alive?1:0,p.eliminatedAt??-1,p.lastMass,p.boostUntil,ranks.get(p.id)!]),
    gifts:state.gifts.map(g=>[g.id,g.x,g.y,g.kind==='speed'?0:1,g.amount,g.expiresAt]),
  };
}
export function applyFrame(previous:GameState,frame:ArenaFrame):GameState {
  if(previous.players.length!==frame.players.length)throw new Error('Arena roster changed unexpectedly');
  return {...previous,elapsed:frame.elapsed,radius:frame.radius,finished:frame.finished,
    players:previous.players.map((p,i)=>{const v=frame.players[i];return {...p,x:v[0],y:v[1],mass:v[2],earned:v[3],alive:v[4]===1,eliminatedAt:v[5]<0?null:v[5],lastMass:v[6],boostUntil:v[7],tie:v[8]};}),
    gifts:frame.gifts.map(v=>({id:v[0],x:v[1],y:v[2],kind:v[3]===0?'speed':'mass',amount:v[4],expiresAt:v[5],contact:{}})),
  };
}
