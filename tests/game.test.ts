import { describe, expect, it } from 'vitest';
import { createGame, stepGame, rankPlayers, setIntent, radiusForMass } from '../shared/game';
import { allocatePrizes, arenaSizes, splitPool } from '../shared/economics';
const entrants = (n:number) => Array.from({length:n},(_,i)=>({id:`p${i}`,name:`Player ${i}`,deposit:1000}));
describe('epoch economics',()=>{
  it.each([[9,[]],[10,[10]],[50,[50]],[51,[26,25]],[499,[50,50,50,50,50,50,50,50,50,49]],[500,Array(10).fill(50)]])('balances %i entrants', (n,expected)=>expect(arenaSizes(n as number)).toEqual(expected));
  it('rejects a 501st entrant',()=>expect(()=>arenaSizes(501)).toThrow());
  it('preserves every micro-USDC',()=>{const shares=splitPool(100000001n,[26,25]);expect(shares.reduce((a,b)=>a+b,0n)).toBe(100000001n);for(const share of shares)expect(allocatePrizes(share).reduce((a,b)=>a+b,0n)).toBe(share);});
});
describe('deterministic simulation',()=>{
  it('caps initial advantage at twice the radius',()=>{const g=createGame([{id:'a',name:'a',deposit:1000},{id:'b',name:'b',deposit:100000}],12);expect(radiusForMass(g.players[1].mass)/radiusForMass(g.players[0].mass)).toBe(2);});
  it('conserves mass across multiple simultaneous attackers',()=>{const g=createGame(entrants(3),12);g.elapsed=4;g.players.forEach((p,i)=>{p.x=i;p.y=0;p.mass=i===0?1000:3000});const before=g.players.reduce((a,b)=>a+b.mass,0);stepGame(g,1/30);expect(g.players[0].mass).toBeCloseTo(995);expect(g.players.reduce((a,b)=>a+b.mass,0)).toBeCloseTo(before);});
  it('initial protection prevents absorption',()=>{const g=createGame(entrants(2),12);g.players.forEach(p=>{p.x=0;p.y=0});g.players[1].mass=3000;stepGame(g,1/30);expect(g.players[0].mass).toBe(1000);});
  it('boundary loss never credits a rival',()=>{const g=createGame(entrants(2),12);g.players[0].x=g.radius;g.players[0].y=0;stepGame(g,1/30);expect(g.players[0].mass).toBeLessThan(1000);expect(g.players[1].mass).toBe(1000);});
  it('shrinks at minute boundaries',()=>{const g=createGame(entrants(2),12);g.elapsed=59.99;stepGame(g,.02);expect(g.radius).toBeCloseTo(g.initialRadius*.9);});
  it('reproduces a complete input sequence',()=>{const a=createGame(entrants(10),123);const b=createGame(entrants(10),123);for(let i=0;i<1000;i++){setIntent(a,'p0',{x:Math.sin(i),y:Math.cos(i)});setIntent(b,'p0',{x:Math.sin(i),y:Math.cos(i)});stepGame(a,1/30);stepGame(b,1/30)}expect(a).toEqual(b);});
  it('survivors outrank eliminated players',()=>{const g=createGame(entrants(3),12);g.players[0].alive=false;g.players[0].eliminatedAt=5;g.players[0].mass=99999;expect(rankPlayers(g)[2].id).toBe('p0');});
  it('stops at ten minutes and rejects invalid movement',()=>{const g=createGame(entrants(2),12);setIntent(g,'p0',{x:Infinity,y:0});expect(g.players[0].intent.x).toBe(0);g.elapsed=599.99;stepGame(g,.02);expect(g.finished).toBe(true);});
});
