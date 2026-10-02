import {randomBytes,randomUUID,createHash} from 'node:crypto';
import type express from 'express';
import {rateLimit} from 'express-rate-limit';
import {z} from 'zod';
import {getAddress,isAddress,type Address,type Hex} from 'viem';
import {createSiweMessage} from 'viem/siwe';
import {db,persistent} from './store';
import {chain} from './chain';

const sessionHours=24;
export const sessionHash=(token:string)=>createHash('sha256').update(token).digest('hex');
const fail=(message:string,status=401)=>Object.assign(new Error(message),{status});
export function walletOrigins(){return new Set((process.env.MEMEGALAXY_WEB_ORIGINS??process.env.WEB_ORIGINS??'http://127.0.0.1:5173,http://localhost:5173').split(',').concat(process.env.MEMEGALAXY_SITE_URL??'',process.env.MEMEGALAXY_API_URL??'').filter(Boolean).map(s=>new URL(s).origin));}
export function requireWalletOrigin(origin:string|undefined){if(!origin||!walletOrigins().has(origin))throw fail('Open MEMEGalaxy from an approved site to sign in.',403);return origin;}
export async function verifyWalletProof(address:Address,message:string,signature:Hex){
 // viem's deployless verifier supports EOAs, ERC-1271 accounts, and EIP-6492
 // counterfactual accounts on the application's chain. Never trust client claims.
 return chain.verifyMessage({address,message,signature});
}
type Route=(fn:(req:express.Request,res:express.Response)=>Promise<unknown>)=>express.RequestHandler;
export function walletAuthRoutes(app:express.Express,route:Route){
 const limited=rateLimit({windowMs:60000,limit:12});
 app.post('/api/v2/auth/challenge',limited,route(async(req,res)=>{
  if(!persistent)throw fail('Persistent wallet authentication is unavailable.',503);
  const origin=requireWalletOrigin(req.get('Origin'));
  const {wallet}=z.object({wallet:z.string().refine(isAddress,'Invalid Ethereum wallet').transform(v=>getAddress(v))}).parse(req.body);
  const id=randomUUID(),nonce=randomBytes(24).toString('hex'),issuedAt=new Date(),expiresAt=new Date(issuedAt.getTime()+5*60000);
  const message=createSiweMessage({domain:new URL(origin).host,address:wallet,statement:'Sign in to MEMEGalaxy. This message verifies ownership only; it cannot spend tokens or approve transactions.',uri:origin,version:'1',chainId:46630,nonce,issuedAt,expirationTime:expiresAt,requestId:id});
  await db.query("DELETE FROM mg_wallet_challenges WHERE expires_at<now()-interval '1 day'");
  await db.query("DELETE FROM mg_wallet_sessions WHERE expires_at<now()");
  await db.query('INSERT INTO mg_wallet_challenges(id,wallet,origin,message,expires_at) VALUES($1,$2,$3,$4,$5)',[id,wallet.toLowerCase(),origin,message,expiresAt]);
  res.setHeader('Cache-Control','no-store');res.json({id,message,chainId:46630,expiresAt:expiresAt.toISOString()});
 }));
 app.post('/api/v2/auth/verify',limited,route(async(req,res)=>{
  const origin=requireWalletOrigin(req.get('Origin'));
  const {id,signature}=z.object({id:z.string().uuid(),signature:z.string().regex(/^0x[0-9a-fA-F]+$/).max(12000)}).parse(req.body);
  const proof=(await db.query('SELECT wallet,origin,message FROM mg_wallet_challenges WHERE id=$1 AND consumed_at IS NULL AND expires_at>now()',[id])).rows[0];
  if(!proof||proof.origin!==origin)throw fail('This sign-in request expired. Please try again.');
  let valid=false;try{valid=await verifyWalletProof(proof.wallet,proof.message,signature as Hex);}catch{throw fail('Wallet verification could not reach Robinhood testnet. Please retry.',503);}
  if(!valid)throw fail('The signature does not belong to this wallet.');
  const token=randomBytes(32).toString('hex'),identity='wallet:'+proof.wallet,expiresAt=new Date(Date.now()+sessionHours*3600000);
  const c=await db.connect();try{
   await c.query('BEGIN');
   const consumed=await c.query('UPDATE mg_wallet_challenges SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING id',[id]);
   if(!consumed.rowCount)throw fail('This sign-in request was already used or expired.');
   await c.query('INSERT INTO mg_wallet_identities(wallet,owner) VALUES($1,$2) ON CONFLICT(wallet) DO NOTHING',[proof.wallet,identity]);
   await c.query('INSERT INTO mg_owners(owner,wallet) VALUES($1,$2) ON CONFLICT(owner) DO NOTHING',[identity,proof.wallet]);
   await c.query('INSERT INTO mg_wallet_sessions(token_hash,owner,wallet,expires_at) VALUES($1,$2,$3,$4)',[sessionHash(token),identity,proof.wallet,expiresAt]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  res.setHeader('Cache-Control','no-store');res.json({token,wallet:proof.wallet,expiresAt:expiresAt.toISOString()});
 }));
 app.post('/api/v2/auth/logout',route(async(req,res)=>{
  const token=req.headers.authorization?.replace(/^Bearer /,'');if(token&&/^[a-f0-9]{64}$/.test(token))await db.query('DELETE FROM mg_wallet_sessions WHERE token_hash=$1',[sessionHash(token)]);
  res.sendStatus(204);
 }));
}
