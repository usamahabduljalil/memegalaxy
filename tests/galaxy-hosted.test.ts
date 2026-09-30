import {describe,it,expect} from 'vitest';
import {budgetDay,agentInput,agentConfig} from '../server/galaxy/agents';
import {estimateCost,DAILY_LIMIT,RUN_LIMIT,compactObservation} from '../server/galaxy/model';
import {createWorld,observe} from '../shared/galaxy/engine';
describe('Hosted agent boundaries',()=>{
 it('resets the accounting day at Lagos midnight rather than UTC midnight',()=>{expect(budgetDay(new Date('2026-09-30T22:59:59Z'))).toBe('2026-09-30');expect(budgetDay(new Date('2026-09-30T23:00:00Z'))).toBe('2026-10-01');});
 it('bounds owner instructions and rejects unsupported personalities',()=>{expect(()=>agentInput.parse({name:'a',instructions:'a'.repeat(1001)})).toThrow();expect(()=>agentInput.parse({name:'a',personality:'team'})).toThrow();});
 it('captures registration configuration without sharing mutable profile fields',()=>{const a={name:'Before',personality:'hunter',instructions:'Protect',version:1};const frozen=agentConfig(a);a.name='After';a.instructions='Changed';expect(frozen.name).toBe('Before');expect(frozen.instructions).toBe('Protect');});
 it('reserves integer microdollars conservatively and fixes spending ceilings',()=>{expect(estimateCost(1001,51)).toBe(151);expect(DAILY_LIMIT).toBe(10000000);expect(RUN_LIMIT).toBe(250000);});
 it('compacts only a visibility-filtered observation and excludes names/private inputs',()=>{const w=createWorld('free',31,[{id:'a',name:'Private-looking name',controller:'agent'},{id:'b',name:'Other',controller:'human'}],100);const o=observe(w,'a'),c=compactObservation(o);expect(c.food.length).toBeLessThanOrEqual(24);expect(c.cells.every(cell=>o.cells.some(v=>v.id===cell.id))).toBe(true);expect(JSON.stringify(c)).not.toContain('Private-looking');expect(c).not.toHaveProperty('names');expect(c).not.toHaveProperty('inputs');});
});