import { randomBytes,createHash } from 'node:crypto';
import {sessionHash} from './wallet-auth';
import { SignJWT,jwtVerify } from 'jose';
import type { Request } from 'express';
import { db,persistent } from './store';
const secret=process.env.MEMEGALAXY_ADMISSION_SECRET??process.env.ADMISSION_SECRET;
if(process.env.NODE_ENV==='production'&&(!secret||secret.length<32))throw new Error('Configure a 32-character admission secret');
const key=new TextEncoder().encode(secret??randomBytes(32).toString('hex'));
export type Owner={id:string;wallet:string};
export const trustedOwner=Symbol('verified owner');
export async function ownerById(id:string,selected?:string):Promise<Owner>{
 if(!persistent)throw Object.assign(new Error('Wallet authentication is unavailable'),{status:503});
 const wallet=(await db.query('SELECT wallet FROM mg_wallet_identities WHERE owner=$1',[id])).rows[0]?.wallet;
 if(!wallet||selected&&selected.toLowerCase()!==wallet)throw Object.assign(new Error('Verify ownership of this wallet first'),{status:401});
 return {id,wallet};
}
export async function owner(req:Request):Promise<Owner>{
 const verified=(req as Request&{[trustedOwner]?:Owner})[trustedOwner];if(verified)return verified;
 const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)throw Object.assign(new Error('Connect your wallet first'),{status:401});
 if(!/^[a-f0-9]{64}$/.test(token))throw Object.assign(new Error('Your session expired. Connect again.'),{status:401});
 const session=(await db.query('SELECT owner,wallet FROM mg_wallet_sessions WHERE token_hash=$1 AND expires_at>now()',[sessionHash(token)])).rows[0];
 const selected=req.get('X-Memegalaxy-Wallet');
 if(!session||selected&&selected.toLowerCase()!==session.wallet)throw Object.assign(new Error('Your session expired or wallet changed. Connect again.'),{status:401});
 return {id:session.owner,wallet:session.wallet};
}
export const hashKey=(key:string)=>createHash('sha256').update(key).digest('hex');
export {publicPlayerId} from './identity';
export async function agent(req:Request){const key=req.headers.authorization?.replace(/^Bearer /,'');if(!key||key.length>200)throw Object.assign(new Error('Agent credential required'),{status:401});const {rows}=await db.query('SELECT id,owner,wallet,name,personality FROM mg_agents WHERE key_hash=$1',[hashKey(key)]);if(!rows[0])throw Object.assign(new Error('Invalid or revoked agent credential'),{status:401});return rows[0] as {id:string;owner:string;wallet:string;name:string;personality:string};}
export type Admission={id:string;name:string;controller:'human'|'agent';roomId:string;owner:string;scope:'free'|'prize'|'hunt'|'spectator';runId?:string;huntSession?:string;skin?:string};
export async function agentActive(id:string,owner:string,runId?:string){if(!id.startsWith('agent:'))return false;if(runId)return (await db.query("SELECT 1 FROM mg_agent_runs r JOIN mg_agents a ON a.id=r.agent_id WHERE r.id=$1 AND r.owner=$2 AND r.agent_id=$3 AND a.hosted_enabled AND r.status IN ('joining','running','reconnecting') AND r.lease_until>now()",[runId,owner,id.slice(6)])).rowCount===1;const {rowCount}=await db.query('SELECT 1 FROM mg_agents WHERE id=$1 AND owner=$2 AND key_hash IS NOT NULL',[id.slice(6),owner]);return rowCount===1;}
export async function issueAdmission(a:Admission){return new SignJWT(a).setProtectedHeader({alg:'HS256'}).setIssuer('memegalaxy-v2').setAudience('arena').setIssuedAt().setExpirationTime('60s').sign(key);}
export async function verifyAdmission(token:string,roomId:string){const {payload}=await jwtVerify(token,key,{issuer:'memegalaxy-v2',audience:'arena',algorithms:['HS256']});if(typeof payload.owner!=='string'||payload.runId!==undefined&&(typeof payload.runId!=='string'||!/^[0-9a-f-]{36}$/.test(payload.runId))||payload.roomId!==roomId||typeof payload.id!=='string'||typeof payload.name!=='string'||!['human','agent'].includes(String(payload.controller))||!['free','prize','hunt','spectator'].includes(String(payload.scope)))throw new Error('Invalid room admission');return payload as unknown as Admission;}
