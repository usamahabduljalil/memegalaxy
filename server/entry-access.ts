import { isAddress } from 'viem';

export function entryAccess(mode='invite-only',wallets=''){
  if(mode!=='invite-only'&&mode!=='public')throw new Error('Invalid ENTRY_ACCESS_MODE');
  const invited=wallets.split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
  if(invited.some(wallet=>!isAddress(wallet)))throw new Error('Invalid BETA_TESTER_WALLETS address');
  return {mode,configured:mode==='public'||invited.length>0,allows:(wallet:string)=>mode==='public'||invited.includes(wallet.toLowerCase())};
}
