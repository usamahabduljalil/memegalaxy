import { useState } from 'react';
import { encodeFunctionData,formatUnits } from 'viem';
import { escrowAbi } from '../shared/chain';
import { addresses,rpc,useWallet } from './wallet';

/** Direct contract access remains usable when the game API or worker is offline. */
export default function RecoveryControls({onChange}:{onChange:()=>Promise<void>}){
  const wallet=useWallet();
  const [epoch,setEpoch]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [entry,setEntry]=useState<{id:bigint;amount:bigint;arena:bigint;reward:bigint;tokenClaimed:boolean;usdcClaimed:boolean;status:number;arenaStatus:number;deadline:number}|null>(null);
  async function lookup(){
    if(!addresses.escrow||!wallet.address)throw new Error('Wallet and testnet escrow must be configured.');
    if(epoch&&!/^[1-9]\d{0,17}$/.test(epoch))throw new Error('Enter a valid epoch number.');
    const id=epoch?BigInt(epoch):await rpc.readContract({address:addresses.escrow,abi:escrowAbi,functionName:'currentEpoch'});
    const [e,p]=await Promise.all([
      rpc.readContract({address:addresses.escrow,abi:escrowAbi,functionName:'epochInfo',args:[id]}),
      rpc.readContract({address:addresses.escrow,abi:escrowAbi,functionName:'entryInfo',args:[id,wallet.address]}),
    ]);
    if(p[0]===0n){setEntry(null);throw new Error('This wallet has no active deposit in that epoch.');}
    const a=p[1]>0n?await rpc.readContract({address:addresses.escrow,abi:escrowAbi,functionName:'arenaInfo',args:[id,p[1]]}):null;
    setEpoch(String(id));setEntry({id,amount:p[0],arena:p[1],reward:p[2],tokenClaimed:p[3],usdcClaimed:p[4],status:e[0],arenaStatus:a?.status??0,deadline:Number(e[2])});
  }
  async function action(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn();}catch(error){setMessage(error instanceof Error?error.message:'Please retry.');}finally{setBusy(false);}}
  async function send(kind:'cancel'|'recoverArena'|'claimToken'|'claimUSDC'){
    if(!entry||!addresses.escrow||!wallet.address)return;
    const args=kind==='cancel'?[entry.id]:kind==='recoverArena'?[entry.id,entry.arena]:[entry.id,wallet.address];
    await wallet.send(addresses.escrow,encodeFunctionData({abi:escrowAbi,functionName:kind,args:args as any}));
    if(kind==='cancel')setEntry(null);else await lookup();
    await onChange();setMessage('Transaction confirmed on Arc.');
  }
  const timeout=!!entry&&Date.now()/1000>=entry.deadline+3600;
  const tokenReady=entry&&(entry.status===3||(entry.status===2&&timeout&&entry.arenaStatus>=2));
  const usdcReady=entry&&(entry.arenaStatus>=2||(entry.status===3&&entry.arena===0n));
  return <section className="direct-recovery"><h3>Find an entry on Arc</h3><p className="muted">Works directly with escrow, even when the game service is offline. These transactions cost gas.</p>
    <label htmlFor="recovery-epoch">Epoch number <small>(blank = latest)</small></label>
    <div className="name-edit"><input id="recovery-epoch" inputMode="numeric" value={epoch} onChange={e=>{setEpoch(e.target.value);setEntry(null);}} placeholder="Latest epoch"/><button disabled={busy||!addresses.escrow} onClick={()=>void action(lookup)}>{busy?'Checking…':'Find'}</button></div>
    {entry&&<><p>{Number(formatUnits(entry.amount,18)).toLocaleString()} DOMINATE · {entry.tokenClaimed?'returned':'in escrow'}</p><div className="recovery-buttons">
      {entry.status===1&&<button disabled={busy} onClick={()=>void action(()=>send('cancel'))}>Cancel & refund</button>}
      {entry.status===2&&entry.arenaStatus===1&&<button disabled={busy||!timeout} onClick={()=>void action(()=>send('recoverArena'))}>Recover arena</button>}
      <button disabled={busy||!tokenReady||entry.tokenClaimed} onClick={()=>void action(()=>send('claimToken'))}>{entry.tokenClaimed?'Tokens returned':'Return tokens'}</button>
      <button disabled={busy||!usdcReady||entry.usdcClaimed} onClick={()=>void action(()=>send('claimUSDC'))}>{entry.usdcClaimed?'USDC paid':'Claim USDC'}</button>
    </div>{entry.status===2&&entry.arenaStatus===1&&!timeout&&<p className="muted">Timeout recovery opens {new Date((entry.deadline+3600)*1000).toLocaleString()}.</p>}</>}
    {message&&<p className="modal-notice" role="status">{message}</p>}
  </section>;
}
