/** Recover submitted work independently; a missing receipt must not block every operation. */
export type PendingTransaction={operation_key:string;hash:string;raw:string|null};
export type TransactionRecovery={
 receipt:(hash:string)=>Promise<{status:'success'|'reverted'}|undefined>;
 identity:(raw:string)=>Promise<{sender:string;nonce:number}>;
 nonce:(sender:string)=>Promise<number>;
 broadcast:(raw:string)=>Promise<void>;
 terminal:(row:PendingTransaction,status:'confirmed'|'failed',reason?:string)=>Promise<void>;
};
export async function recoverTransactions(rows:PendingTransaction[],io:TransactionRecovery){
 const nonces=new Map<string,Promise<number>>();
 for(const row of rows){
  const receipt=await io.receipt(row.hash);
  if(receipt){await io.terminal(row,receipt.status==='success'?'confirmed':'failed');continue;}
  if(!row.raw)continue;
  const {sender,nonce}=await io.identity(row.raw);let latest=nonces.get(sender);
  if(!latest){latest=io.nonce(sender);nonces.set(sender,latest);}
  // A nonce already used at the latest chain state indicates this hash was replaced. Retry the operation only after checking live contract state.
  if(await latest>nonce){await io.terminal(row,'failed','nonce-consumed');continue;}
  await io.broadcast(row.raw);
 }
}
