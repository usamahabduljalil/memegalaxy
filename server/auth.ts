import { PrivyClient } from '@privy-io/server-auth';
import { SignJWT, jwtVerify } from 'jose';
import { config } from './config';
import type { Request } from 'express';
const privy=config.privyId&&config.privySecret?new PrivyClient(config.privyId,config.privySecret):null;
export async function authenticate(req:Request){
  if(!privy)throw Object.assign(new Error('Email sign-in is not configured yet.'),{status:503});
  const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)throw Object.assign(new Error('Sign in to continue.'),{status:401});
  try {const claims=await privy.verifyAuthToken(token);const user=await privy.getUser(claims.userId);
    const wallet=user.linkedAccounts.find((a:any)=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy') as {address:string}|undefined;
    if(!wallet)throw new Error('Embedded wallet required');return {userId:claims.userId,wallet:wallet.address.toLowerCase() as `0x${string}`};
  }catch {throw Object.assign(new Error('Your session expired. Sign in again.'),{status:401});}
}
function admissionKey(){if(!config.admissionSecret||config.admissionSecret.length<32)throw new Error('Admission signing is not configured');return new TextEncoder().encode(config.admissionSecret);}
export async function admissionToken(wallet:string,arenaId:string,userId:string){return new SignJWT({wallet,arenaId}).setProtectedHeader({alg:'HS256'}).setSubject(userId).setIssuer('big-circle').setAudience('arena').setIssuedAt().setExpirationTime('60s').sign(admissionKey());}
export async function verifyAdmission(token:string,arenaId:string){const {payload}=await jwtVerify(token,admissionKey(),{issuer:'big-circle',audience:'arena',algorithms:['HS256']});if(payload.arenaId!==arenaId||typeof payload.wallet!=='string')throw new Error('Wrong arena');return {wallet:payload.wallet,userId:payload.sub!};}
