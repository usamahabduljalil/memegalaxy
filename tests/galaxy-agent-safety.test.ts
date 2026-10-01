import {describe,it,expect} from 'vitest';
import {control,survival,safeZoneSteering,type Strategy} from '../shared/galaxy/agent';
import {createWorld,observe,applyAction,tick} from '../shared/galaxy/engine';
const fixture=()=>{const w=createWorld('prize',51,[{id:'a',name:'Agent',controller:'agent'},{id:'b',name:'Rival',controller:'human'}],10);w.cells[0].x=1100;w.cells[0].y=0;w.safeHalf=1000;w.tick=3600;return {w,o:observe(w,'a')};};
describe('Agent safe-zone priority',()=>{
 it.each([{type:'WAIT'},{type:'MOVE',x:1,y:0},{type:'SPLIT',x:1,y:0},{type:'EJECT',x:1,y:0}] as Strategy[])('overrides a model $type outside the zone',strategy=>{const {o}=fixture();const action=control(o,strategy,7);expect(action.type).toBe('MOVE');expect(action.x).toBeLessThan(-.9);expect(action.seq).toBe(7);});
 it('notices an exposed split cell even when its viewport is inside',()=>{const {o}=fixture();o.viewport.x=0;o.viewport.y=0;o.cells[0].mass=400;expect(safeZoneSteering(o)?.x).toBeLessThan(0);});
 it('avoids boundary food rather than choosing a poisoned nearest target',()=>{const {o}=fixture();o.cells[0].x=0;o.cells[0].y=0;o.viewport.x=0;o.viewport.y=0;o.food=[{id:11,x:995,y:0,mass:4},{id:12,x:-300,y:0,mass:4}];expect(survival(o).x).toBeLessThan(0);});
 it('re-enters the shrinking zone despite repeated WAIT decisions',()=>{const {w}=fixture();w.food=[];w.objects=[];for(let i=0;i<180;i++){const o=observe(w,'a');applyAction(w,'a',control(o,{type:'WAIT'},i));tick(w);}expect(w.cells.find(c=>c.owner==='a')!.x).toBeLessThan(w.safeHalf-100);expect(w.players[0].alive).toBe(true);});
});
