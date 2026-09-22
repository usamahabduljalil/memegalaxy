import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, observe } from '../shared/galaxy/engine';
import { runAgent } from '../sdk/agent';
const transport=vi.hoisted(()=>({callbacks:null as any,send:vi.fn(),close:vi.fn(async()=>{})}));
vi.mock('../sdk/connection',()=>({connectArena:vi.fn(async(_server,_ticket,callbacks)=>{transport.callbacks=callbacks;return {send:transport.send,close:transport.close};})}));
const observation=()=>observe(createWorld('free',42,[{id:'a',name:'A',controller:'agent'}]),'a');
describe('external agent runner',()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({roomId:'room',token:'ticket',personality:'hunter'})})));});
 afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
 it('uses the profile personality and resets sequence on reconnect',async()=>{
  const decide=vi.fn(async(_observation:unknown,_personality:string)=>({type:'WAIT' as const}));const runner=await runAgent({server:'http://localhost',apiKey:'test',adapter:{decide}});
  transport.callbacks.identity({id:'a',seq:8});transport.callbacks.frame(observation());await vi.advanceTimersByTimeAsync(2100);
  expect(transport.send.mock.calls[0][0].seq).toBe(9);expect(decide.mock.calls[0][1]).toBe('hunter');
  transport.callbacks.state('Reconnecting');const count=transport.send.mock.calls.length;await vi.advanceTimersByTimeAsync(500);expect(transport.send).toHaveBeenCalledTimes(count);
  transport.callbacks.identity({id:'a',seq:100});transport.callbacks.frame(observation());await vi.advanceTimersByTimeAsync(70);expect(transport.send.mock.lastCall?.[0].seq).toBe(101);await runner.close();
 });
 it('keeps one model request outstanding while movement continues',async()=>{
  const decide=vi.fn(()=>new Promise<any>(()=>{}));const runner=await runAgent({server:'http://localhost',apiKey:'test',adapter:{decide}});
  transport.callbacks.frame(observation());await vi.advanceTimersByTimeAsync(10000);expect(decide).toHaveBeenCalledTimes(1);expect(transport.send.mock.calls.length).toBeGreaterThan(100);await runner.close();
 });
 it('rejects invalid adapter actions and stops all timers after closure',async()=>{
  const runner=await runAgent({server:'http://localhost',apiKey:'test',adapter:{decide:async()=>({type:'TELEPORT'} as any)}});
  transport.callbacks.frame(observation());await vi.advanceTimersByTimeAsync(2500);expect(transport.send.mock.calls.every(([a])=>a.type!=='TELEPORT')).toBe(true);
  transport.callbacks.closed();const count=transport.send.mock.calls.length;await vi.advanceTimersByTimeAsync(5000);expect(transport.send).toHaveBeenCalledTimes(count);await runner.close();
 });
 it('discards a model response that arrives after its deadline',async()=>{
  let resolve!:(v:any)=>void;const runner=await runAgent({server:'http://localhost',apiKey:'test',adapter:{decide:()=>new Promise(r=>{resolve=r;})}});
  transport.callbacks.frame(observation());await vi.advanceTimersByTimeAsync(6100);resolve({type:'SPLIT',x:1,y:0});await vi.advanceTimersByTimeAsync(100);expect(transport.send.mock.calls.some(([a])=>a.type==='SPLIT')).toBe(false);await runner.close();
 });
});
