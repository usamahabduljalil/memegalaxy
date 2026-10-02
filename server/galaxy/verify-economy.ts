import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {db,migrateGalaxy} from './store';
import {transaction,credit,profile,unlock,equip,huntSession,reserveDrop,collectDrop,config,wardrobe,rewardBalance,requireAdmin} from './economy';
import {STOCK_ASSETS} from '../../shared/galaxy/economy';
const schema='mg_economy_verify_'+randomUUID().replaceAll('-','');
const admin=new Pool({connectionString:process.env.MEMEGALAXY_DATABASE_URL??process.env.DATABASE_URL,connectionTimeoutMillis:5000});let created=false;
try{
 await admin.query('CREATE SCHEMA '+schema);created=true;db.options.options='-c search_path='+schema;await migrateGalaxy();
 const one={id:'test-economy-one',wallet:'0x'+'1'.repeat(40)},two={id:'test-economy-two',wallet:'0x'+'2'.repeat(40)};
 await assert.rejects(async()=>requireAdmin(one));
 await Promise.all(Array.from({length:8},()=>transaction(c=>credit(c,one.id,100n,'test','same-credit'))));assert.equal((await db.query('SELECT balance FROM mg_credit_accounts WHERE owner=$1',[one.id])).rows[0].balance,'100');
 const spends=await Promise.allSettled(Array.from({length:8},(_,i)=>transaction(c=>credit(c,one.id,-30n,'test','spend-'+i))));assert.equal(spends.filter(r=>r.status==='fulfilled').length,3);assert.equal((await db.query('SELECT balance FROM mg_credit_accounts WHERE owner=$1',[one.id])).rows[0].balance,'10');
 await profile(one);await assert.rejects(unlock(one,'orbit-frog'));await db.query('UPDATE mg_profiles SET peak_mass=1000 WHERE owner=$1',[one.id]);await unlock(one,'orbit-frog');await equip(one,'orbit-frog');assert.equal((await wardrobe(one)).profile.skin,'orbit-frog');await assert.rejects(equip(two,'orbit-frog'));await assert.rejects(unlock(one,'solar-fox'));
 await db.query("UPDATE mg_skins SET price=10 WHERE id='solar-fox'");await Promise.all(Array.from({length:5},()=>unlock(one,'solar-fox')));assert.equal((await db.query('SELECT balance FROM mg_credit_accounts WHERE owner=$1',[one.id])).rows[0].balance,'0');
 const sessions=await Promise.allSettled(Array.from({length:4},()=>huntSession(one,'room-a')));assert.equal(sessions.filter(r=>r.status==='fulfilled').length,1);const session=sessions.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof huntSession>>>;assert.equal(session.value.multiplier,11000);await assert.rejects(huntSession({...two,wallet:one.wallet},'room-b'));
 const cfg=await config();await db.query('INSERT INTO mg_economy_config(settings,actor) VALUES($1,$2)',[{...cfg.settings,enabled:true,dailyLimit:2},'test']);await db.query('UPDATE mg_stock_assets SET enabled=true,balance=$1,observed_at=now()',['40000000000000000']);
 await db.query('UPDATE mg_stock_assets SET external_liability=balance');assert.equal(await reserveDrop('room-a'),null);await db.query('UPDATE mg_stock_assets SET external_liability=0');
 // Reserve all inventory concurrently; no asset may be overbooked.
 const drops=(await Promise.all(Array.from({length:10},()=>reserveDrop('room-a')))).filter(Boolean);assert.equal(drops.length,6);const awards=await Promise.all(Array.from({length:8},()=>collectDrop(drops[0]!.id,session.value.id)));assert.equal(awards.filter(a=>a&&'amount'in a).length,1);
 const second=await collectDrop(drops[1]!.id,session.value.id);assert(second&&'amount'in second);const capped=await collectDrop(drops[2]!.id,session.value.id);assert(capped&&'limited'in capped);assert.equal((await rewardBalance(one)).remaining,0);
 const rows=(await db.query('SELECT * FROM mg_stock_rewards')).rows;assert.equal(rows.length,2);assert(rows.every(r=>r.wallet===one.wallet&&r.amount==='11000000000000000'));
 await db.query('UPDATE mg_profiles SET skin=$2 WHERE owner=$1',[one.id,'supernova']);assert.equal((await db.query('SELECT multiplier FROM mg_hunt_sessions WHERE id=$1',[session.value.id])).rows[0].multiplier,11000);
 await db.query("UPDATE mg_hunt_sessions SET lease_until=now()-interval '1 second' WHERE id=$1",[session.value.id]);assert.equal(await collectDrop(drops[3]!.id,session.value.id),null);
 console.log('Economy database checks passed: isolated schema, atomic/idempotent GUSD, no overspend, unlock ownership, concurrent purchases, session uniqueness, reservation conservation, exactly-once pickup, daily caps, frozen bonus/wallet and expired-session rejection.');
}finally{await db.end();if(created)await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
