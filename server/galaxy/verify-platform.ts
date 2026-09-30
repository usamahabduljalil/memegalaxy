import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db,migrateGalaxy} from './store';
import {createAgent,listAgents,updateAgent,practice,stopRun,runStatus,budgetDay} from './agents';
import {reserveModel,settleModel} from './model';
const schema='mg_verify_'+randomUUID().replaceAll('-',''),admin=new Pool({connectionString:process.env.MEMEGALAXY_DATABASE_URL??process.env.DATABASE_URL,connectionTimeoutMillis:5000});
let created=false;
try{
 await admin.query('CREATE SCHEMA '+schema);created=true;
 db.options.options='-c search_path='+schema;
 await migrateGalaxy();
 await db.query("INSERT INTO mg_runtime_instances(id,lease_until) VALUES('verification',now()+interval '1 minute')");
 const owner={id:'test-owner',wallet:'0x'+ '1'.repeat(40)},other={id:'different-owner',wallet:'0x'+'2'.repeat(40)};
 const input={name:'Verification',personality:'survivor',idempotency:'stable-verification'};
 const agents=await Promise.all(Array.from({length:6},()=>createAgent(owner,input)));assert(agents.every(a=>a.id===agents[0].id));assert.equal((await listAgents(owner)).length,1);
 await assert.rejects(updateAgent(other,agents[0].id,input));await assert.rejects(practice(other,agents[0].id));
 const launches=await Promise.all(Array.from({length:6},()=>practice(owner,agents[0].id)));assert(launches.every(r=>r.id===launches[0].id));const run=await runStatus(owner,launches[0].id);
 assert.equal(run.config.name,'Verification');await assert.rejects(runStatus(other,run.id));await assert.rejects(stopRun(other,run.id));
 const reservations=await Promise.allSettled(Array.from({length:10},()=>reserveModel(run.id,100000)));assert.equal(reservations.filter(r=>r.status==='fulfilled').length,2);const values=reservations.flatMap(r=>r.status==='fulfilled'?[r.value]:[]);await Promise.all(values.flatMap(v=>[settleModel(v,1000,true),settleModel(v,1000,true)]));
 const day=(await db.query('SELECT reserved,spent FROM mg_model_days WHERE day=$1',[budgetDay()])).rows[0];assert.equal(Number(day.reserved),0);assert.equal(Number(day.spent),2000);
 await db.query('UPDATE mg_model_days SET spent=9999999 WHERE day=$1',[budgetDay()]);await assert.rejects(reserveModel(run.id,2));
 await stopRun(owner,run.id);await assert.rejects(practice(owner,agents[0].id));
 await createAgent(owner,{name:'Second'});await createAgent(owner,{name:'Third'});await assert.rejects(createAgent(owner,{name:'Fourth'}));
 await db.query("UPDATE mg_agent_runs SET mode='prize',status='running' WHERE id=$1",[run.id]);await assert.rejects(stopRun(owner,run.id));await stopRun(owner,run.id,true);
 console.log('Hosted platform database checks passed: owner isolation, idempotency, one active run, practice quota, profile limit, atomic budgets, retry-safe accounting, explicit prize forfeiture.');
}finally{await db.end();if(created)await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
