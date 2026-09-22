import { randomBytes,createHash } from 'node:crypto';
import { PrivyClient } from '@privy-io/server-auth';
import { SignJWT,jwtVerify } from 'jose';
import type { Request } from 'express';
import { db } from './store';
const secret=process.env.MEMEGALAXY_ADMISSION_SECRET??process.env.ADMISSION_SECRET;
if(process.env.NODE_ENV==='production'&&(!secret||secret.length<32))throw new Error('Configure a 32-character admission secret');
const key=new TextEncoder().encode(secret??randomBytes(32).toString('hex'));
const privy=process.env.PRIVY_APP_ID&&process.env.PRIVY_APP_SECRET?new PrivyClient(process.env.PRIVY_APP_ID,process.env.PRIVY_APP_SECRET):null;
export async function owner(req:Request){if(!privy)throw Object.assign(new Error('Email authentication is not configured'),{status:503});const jwt=req.headers.authorization?.replace(/^Bearer /,'');if(!jwt)throw Object.assign(new Error('Sign in first'),{status:401});try{const claims=await privy.verifyAuthToken(jwt),u=await privy.getUser(claims.userId);const wallet=u.linkedAccounts.find(a=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy') as {address:string}|undefined;if(!wallet)throw new Error('Wallet required');return {id:claims.userId,wallet:wallet.address.toLowerCase()};}catch{throw Object.assign(new Error('Invalid session'),{status:401});}}
export const hashKey=(key:string)=>createHash('sha256').update(key).digest('hex');
export const publicPlayerId=(ownerId:string)=>`human:${createHash('sha256').update(ownerId).digest('hex').slice(0,32)}`;
export async function agent(req:Request){const key=req.headers.authorization?.replace(/^Bearer /,'');if(!key||key.length>200)throw Object.assign(new Error('Agent credential required'),{status:401});const {rows}=await db.query('SELECT id,owner,wallet,name,personality FROM mg_agents WHERE key_hash=$1',[hashKey(key)]);if(!rows[0])throw Object.assign(new Error('Invalid or revoked agent credential'),{status:401});return rows[0] as {id:string;owner:string;wallet:string;name:string;personality:string};}
export type Admission={id:string;name:string;controller:'human'|'agent';roomId:string;owner:string;scope:'free'|'prize'|'spectator'};
export async function agentActive(id:string,owner:string){if(!id.startsWith('agent:'))return false;const {rowCount}=await db.query('SELECT 1 FROM mg_agents WHERE id=$1 AND owner=$2 AND key_hash IS NOT NULL',[id.slice(6),owner]);return rowCount===1;}
export async function issueAdmission(a:Admission){return new SignJWT(a).setProtectedHeader({alg:'HS256'}).setIssuer('memegalaxy-v2').setAudience('arena').setIssuedAt().setExpirationTime('60s').sign(key);}
export async function verifyAdmission(token:string,roomId:string){const {payload}=await jwtVerify(token,key,{issuer:'memegalaxy-v2',audience:'arena',algorithms:['HS256']});if(payload.roomId!==roomId||typeof payload.id!=='string'||typeof payload.name!=='string'||!['human','agent'].includes(String(payload.controller))||!['free','prize','spectator'].includes(String(payload.scope)))throw new Error('Invalid room admission');return payload as unknown as Admission;}
