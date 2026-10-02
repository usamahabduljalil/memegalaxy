import {randomUUID,randomInt} from 'node:crypto';
import type {PoolClient} from 'pg';
import {db} from './store';
import type {Owner} from './auth';
import {publicPlayerId} from './identity';
import {walletPlayerName} from '../../shared/galaxy/player-name';
import {lagosDay,rewardWeek,pickupAmount,type Skin} from '../../shared/galaxy/economy';
export const problem=(message:string,status=409)=>Object.assign(new Error(message),{status});
export async function transaction<T>(fn:(c:PoolClient)=>Promise<T>){const c=await db.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function audit(c:PoolClient,actor:string,action:string,subject:string,detail:unknown){await c.query('INSERT INTO mg_economy_audit(actor,action,subject,detail) VALUES($1,$2,$3,$4)',[actor,action,subject,JSON.stringify(detail)]);}
export async function config(c:Pick<PoolClient,'query'>=db){return (await c.query('SELECT version,settings FROM mg_economy_config ORDER BY version DESC LIMIT 1')).rows[0];}
export async function profile(auth:Owner){const result=await db.query(`WITH previous AS (SELECT COALESCE(NULLIF((SELECT name FROM mg_stats WHERE player_id=$2),'Explorer'),NULLIF((SELECT name FROM mg_entries WHERE owner=$1 AND controller='human' ORDER BY epoch DESC LIMIT 1),'Explorer')) AS name)
 INSERT INTO mg_profiles(owner,name,name_custom) SELECT $1,COALESCE(name,$3),name IS NOT NULL FROM previous WHERE true
 ON CONFLICT(owner) DO UPDATE SET name=CASE WHEN mg_profiles.name_custom THEN mg_profiles.name ELSE $3 END
 RETURNING name,skin,peak_mass,active_seconds`,[auth.id,publicPlayerId(auth.id),walletPlayerName(auth.wallet)]);await db.query("INSERT INTO mg_skin_inventory(owner,skin,method) SELECT $1,id,'starter' FROM mg_skins WHERE published AND config->>'tier'='Common' ON CONFLICT DO NOTHING",[auth.id]);return result.rows[0];}
export function adminRoles(auth:Owner){const configured=process.env.MEMEGALAXY_ECONOMY_ADMINS??'';const entries=configured.split(',').map(s=>s.trim().toLowerCase());return entries.includes(auth.wallet.toLowerCase())?['economy','reviewer']:[];}
export function requireAdmin(auth:Owner,role='economy'){if(!adminRoles(auth).includes(role))throw problem('Economy administrator access required',403);}
export async function credit(c:PoolClient,owner:string,delta:bigint,kind:string,reference:string,actor?:string){
 await c.query('INSERT INTO mg_credit_accounts(owner) VALUES($1) ON CONFLICT DO NOTHING',[owner]);
 const account=(await c.query('SELECT balance FROM mg_credit_accounts WHERE owner=$1 FOR UPDATE',[owner])).rows[0];
 if((await c.query('SELECT 1 FROM mg_credit_ledger WHERE reference=$1',[reference])).rowCount)return false;
 if(delta===0n||BigInt(account.balance)+delta<0n)throw problem('Insufficient GUSD');
 await c.query('INSERT INTO mg_credit_ledger(owner,delta,kind,reference,actor) VALUES($1,$2,$3,$4,$5)',[owner,delta.toString(),kind,reference,actor??null]);
 await c.query('UPDATE mg_credit_accounts SET balance=balance+$2 WHERE owner=$1',[owner,delta.toString()]);return true;
}
export async function wardrobe(auth:Owner){const p=await profile(auth);const rows=(await db.query('SELECT s.*,i.skin IS NOT NULL AS owned FROM mg_skins s LEFT JOIN mg_skin_inventory i ON i.skin=s.id AND i.owner=$1 WHERE s.published OR i.skin IS NOT NULL ORDER BY s.id',[auth.id])).rows;return {profile:p,skins:rows.map(r=>({...r.config,price:r.price,published:r.published,version:r.version,owned:r.owned||r.config.tier==='Common',eligible:p.peak_mass>=r.config.mass&&Number(p.active_seconds)>=r.config.seconds}))};}
export async function unlock(auth:Owner,id:string){return transaction(async c=>{
 await c.query('INSERT INTO mg_profiles(owner) VALUES($1) ON CONFLICT DO NOTHING',[auth.id]);
 const p=(await c.query('SELECT * FROM mg_profiles WHERE owner=$1 FOR UPDATE',[auth.id])).rows[0],row=(await c.query('SELECT * FROM mg_skins WHERE id=$1 AND published FOR SHARE',[id])).rows[0];if(!row)throw problem('Skin unavailable',404);
 if((await c.query('SELECT 1 FROM mg_skin_inventory WHERE owner=$1 AND skin=$2',[auth.id,id])).rowCount)return {unlocked:true};
 const skin=row.config as Skin;if(p.peak_mass<skin.mass||Number(p.active_seconds)<skin.seconds)throw problem('Achievement requirements are not met');
 if(skin.paid){if(row.price===null||BigInt(row.price)<=0n)throw problem('This offer is not configured yet');await credit(c,auth.id,-BigInt(row.price),'skin','skin:'+auth.id+':'+id);}
 await c.query('INSERT INTO mg_skin_inventory(owner,skin,method) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[auth.id,id,skin.paid?'purchase':'achievement']);return {unlocked:true};
 });}
export async function equip(auth:Owner,id:string){const w=await wardrobe(auth);if(!w.skins.some(s=>s.id===id&&s.owned))throw problem('Unlock this skin first');await db.query('UPDATE mg_profiles SET skin=$2,updated_at=now() WHERE owner=$1',[auth.id,id]);return {equipped:id};}
export async function huntSession(auth:Owner,roomId:string){const p=await profile(auth);return transaction(async c=>{
 await c.query('DELETE FROM mg_hunt_sessions WHERE lease_until<now()');
 if((await c.query('SELECT 1 FROM mg_hunt_sessions WHERE owner=$1 OR wallet=$2',[auth.id,auth.wallet])).rowCount)throw problem('You already have an active Stock Hunt session');
 const skin=(await c.query('SELECT config FROM mg_skins WHERE id=$1',[p.skin])).rows[0]?.config as Skin|undefined;
 const owned=skin&&(skin.tier==='Common'||(await c.query('SELECT 1 FROM mg_skin_inventory WHERE owner=$1 AND skin=$2',[auth.id,skin.id])).rowCount);
 const id=randomUUID(),equipped=owned?skin!.id:'luna',multiplier=owned?skin!.multiplier:10000;
 await c.query("INSERT INTO mg_hunt_sessions(id,owner,wallet,player_id,room_id,skin,multiplier,lease_until) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '65 seconds')",[id,auth.id,auth.wallet,publicPlayerId(auth.id),roomId,equipped,multiplier]);return {id,skin:equipped,multiplier,name:p.name};
 });}
export async function reserveDrop(roomId:string){return transaction(async c=>{
 await c.query("SELECT pg_advisory_xact_lock(hashtext('stock-rewards'))");const cfg=await config(c);if(!cfg?.settings.enabled)return null;
 const assets=(await c.query("SELECT a.*,a.external_liability+COALESCE((SELECT sum(reserved) FROM mg_stock_drops d WHERE d.asset=a.address AND d.state='reserved'),0)+COALESCE((SELECT sum(r.amount) FROM mg_stock_rewards r WHERE r.asset=a.address),0)-COALESCE((SELECT sum(x.amount) FROM mg_stock_claims x WHERE x.asset=a.address AND x.claimed),0) AS obligations FROM mg_stock_assets a WHERE a.enabled AND a.observed_at>now()-interval '30 seconds' ORDER BY a.address FOR UPDATE")).rows;
 const reserve=BigInt(cfg.settings.baseUnits)*2n,eligible=assets.filter(a=>BigInt(a.balance)-BigInt(a.obligations)>=reserve);if(!eligible.length)return null;
 const a=eligible[randomInt(eligible.length)],id=randomUUID(),expires=Date.now()+cfg.settings.lifetime*1000;
 await c.query("INSERT INTO mg_stock_drops(id,room_id,asset,reserved,base,config_version,config,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",[id,roomId,a.address,reserve.toString(),cfg.settings.baseUnits,cfg.version,cfg.settings,new Date(expires)]);
 return {id,asset:a.address,symbol:a.symbol,expires,version:cfg.version,settings:cfg.settings};
 });}
export async function dropsFunded(){const cfg=await config();if(!cfg?.settings.enabled)return false;const r=await db.query("SELECT 1 FROM mg_stock_assets a WHERE a.enabled AND a.observed_at>now()-interval '30 seconds' AND a.balance-a.external_liability-COALESCE((SELECT sum(reserved) FROM mg_stock_drops d WHERE d.asset=a.address AND d.state='reserved'),0)-COALESCE((SELECT sum(amount) FROM mg_stock_rewards r WHERE r.asset=a.address),0)+COALESCE((SELECT sum(amount) FROM mg_stock_claims c WHERE c.asset=a.address AND c.claimed),0)>=$1 LIMIT 1",[(BigInt(cfg.settings.baseUnits)*2n).toString()]);return !!r.rowCount;}
export async function collectDrop(dropId:string,sessionId:string){return transaction(async c=>{
 await c.query("SELECT pg_advisory_xact_lock(hashtext('stock-rewards'))");
 if(!(await config(c)).settings.enabled)return null;
 const d=(await c.query('SELECT * FROM mg_stock_drops WHERE id=$1 FOR UPDATE',[dropId])).rows[0];const s=(await c.query('SELECT * FROM mg_hunt_sessions WHERE id=$1 AND lease_until>now() FOR UPDATE',[sessionId])).rows[0];
 if(!d||d.state!=='reserved'||!s||s.room_id!==d.room_id||new Date(d.expires_at).getTime()<=Date.now())return null;
 const day=lagosDay(),count=Number((await c.query('SELECT count(*) FROM mg_stock_rewards WHERE day=$1 AND (owner=$2 OR wallet=$3)',[day,s.owner,s.wallet])).rows[0].count);if(count>=d.config.dailyLimit)return {limited:true};
 const amount=pickupAmount(d.base,s.multiplier),week=rewardWeek();
 await c.query('INSERT INTO mg_stock_rewards(id,drop_id,owner,wallet,asset,amount,skin,multiplier,config_version,week,day) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[randomUUID(),dropId,s.owner,s.wallet,d.asset,amount,s.skin,s.multiplier,d.config_version,week.start,day]);
 await c.query("UPDATE mg_stock_drops SET state='collected' WHERE id=$1",[dropId]);return {amount,asset:d.asset,remaining:Math.max(0,d.config.dailyLimit-count-1),unlock:week.unlock};
 });}
export async function expireDrop(id:string){await db.query("UPDATE mg_stock_drops SET state='expired' WHERE id=$1 AND state='reserved'",[id]);}
export async function rewardBalance(auth:Owner){const cfg=await config(),day=lagosDay();const count=Number((await db.query('SELECT count(*) FROM mg_stock_rewards WHERE day=$1 AND (owner=$2 OR wallet=$3)',[day,auth.id,auth.wallet])).rows[0].count);return {remaining:Math.max(0,(cfg?.settings.dailyLimit??5)-count),unlock:rewardWeek().unlock,enabled:!!cfg?.settings.enabled,assets:(await db.query('SELECT r.asset,a.symbol,r.wallet,r.week,sum(r.amount)::text AS amount FROM mg_stock_rewards r JOIN mg_stock_assets a ON a.address=r.asset WHERE (r.owner=$1 OR r.wallet=$2) GROUP BY r.asset,a.symbol,r.wallet,r.week ORDER BY r.week DESC',[auth.id,auth.wallet])).rows,claims:(await db.query("SELECT c.*,a.symbol,w.state FROM mg_stock_claims c JOIN mg_stock_weeks w USING(asset,week) JOIN mg_stock_assets a ON a.address=c.asset WHERE EXISTS(SELECT 1 FROM mg_stock_rewards r WHERE (r.owner=$1 OR r.wallet=$2) AND r.wallet=c.wallet AND r.week=c.week AND r.asset=c.asset) ORDER BY c.week DESC",[auth.id,auth.wallet])).rows,catalog:(await db.query('SELECT address,symbol,decimals FROM mg_stock_assets ORDER BY symbol')).rows,vault:process.env.MEMEGALAXY_HUNT_VAULT??null};}
