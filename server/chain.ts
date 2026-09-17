import { createPublicClient, createWalletClient, http, type Hex, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet, escrowAbi } from '../shared/chain';
import { config } from './config';
import { query } from './db';
export const chain=createPublicClient({chain:arcTestnet,transport:http(config.rpc,{timeout:15000,retryCount:1,batch:{batchSize:50,wait:20}})});
export function escrowAddress(){if(!config.escrow)throw new Error('Escrow is not configured');return config.escrow;}
export async function readEpoch(id?:bigint){const epoch=id??await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'currentEpoch'});if(epoch===0n)return null;const v=await chain.readContract({address:escrowAddress(),abi:escrowAbi,functionName:'epochInfo',args:[epoch]});return {id:epoch,status:Number(v[0]),deadline:Number(v[1]),matchDeadline:Number(v[2]),count:Number(v[3]),arenas:Number(v[4]),finished:Number(v[5]),commitment:v[6],seed:v[7],entropyBlock:v[8]};}
export async function assertChain(){const id=await chain.getChainId();if(id!==5042002)throw new Error('RPC is not Arc testnet');}
export function signer(keyName:string){const key=process.env[keyName] as Hex|undefined;if(!key)throw new Error(`${keyName} is missing`);return createWalletClient({account:privateKeyToAccount(key),chain:arcTestnet,transport:http(config.rpc)});}
export async function writeEscrow(key:string,fn:string,args:readonly unknown[],metadata:{epoch?:bigint;wallet?:string;kind?:string}={}){
  await reconcilePending();
  const {rows}=await query('SELECT * FROM transactions WHERE operation_key=$1',[key]);const previous=rows[0];
  if(previous?.status==='confirmed')return previous.tx_hash as Hex;
  if(previous?.tx_hash&&previous.status==='submitted'){
    // Never resubmit an uncertain broadcast. Reconcile its receipt first.
    const receipt=await chain.waitForTransactionReceipt({hash:previous.tx_hash,timeout:20000});
    await query('UPDATE transactions SET status=$2,updated_at=now() WHERE operation_key=$1',[key,receipt.status==='success'?'confirmed':'failed']);
    if(receipt.status==='success')return previous.tx_hash as Hex;throw new Error('Previous transaction reverted; retry next cycle');
  }
  if(previous?.status==='broadcasting')throw new Error('Transaction requires nonce reconciliation before resubmission');
  await query(`INSERT INTO transactions(operation_key,epoch_id,wallet,kind,status,attempts) VALUES($1,$2,$3,$4,'preparing',1) ON CONFLICT(operation_key) DO UPDATE SET status='preparing',attempts=transactions.attempts+1,error=NULL,updated_at=now()`,[key,metadata.epoch?.toString()??null,metadata.wallet??null,metadata.kind??fn]);
  const wallet=signer('RESULT_SIGNER_PRIVATE_KEY');
  try{
    const request=await chain.simulateContract({account:wallet.account,address:escrowAddress(),abi:escrowAbi,functionName:fn as any,args:args as any});
    // Persist the signed transaction hash before broadcast: restart can safely rebroadcast identical bytes.
    const prepared=await wallet.prepareTransactionRequest({to:escrowAddress(),data:(await import('viem')).encodeFunctionData({abi:escrowAbi,functionName:fn as any,args:args as any}),gas:request.request.gas});
    const serialized=await wallet.signTransaction(prepared);
    const hash=(await import('viem')).keccak256(serialized);
    await query("UPDATE transactions SET tx_hash=$2,status='submitted',raw_tx=$3,error=NULL,updated_at=now() WHERE operation_key=$1",[key,hash,serialized]);
    await chain.sendRawTransaction({serializedTransaction:serialized});
    const receipt=await chain.waitForTransactionReceipt({hash,timeout:30000});if(receipt.status!=='success'){await query("UPDATE transactions SET status='failed',error='Transaction reverted' WHERE operation_key=$1",[key]);throw new Error('Transaction reverted');}
    await query("UPDATE transactions SET status='confirmed',error=NULL,updated_at=now() WHERE operation_key=$1",[key]);return hash;
  }catch(error){const message=error instanceof Error?error.message:'Transaction failed';await query("UPDATE transactions SET error=CASE WHEN status='submitted' THEN error ELSE $2 END,status=CASE WHEN status='submitted' THEN status ELSE 'failed' END,updated_at=now() WHERE operation_key=$1",[key,message.slice(0,300)]);throw error;}
}
export async function reconcilePending(){
  const {rows}=await query("SELECT * FROM transactions WHERE status='submitted' ORDER BY id");
  for(const row of rows){
    let receipt;
    try{receipt=await chain.getTransactionReceipt({hash:row.tx_hash});}catch(error){
      if(!row.raw_tx)throw new Error('Missing raw transaction for reconciliation');
      try{await chain.sendRawTransaction({serializedTransaction:row.raw_tx});}catch{/* Already known or an uncertain RPC response: receipt remains authoritative. */}
      receipt=await chain.waitForTransactionReceipt({hash:row.tx_hash,timeout:15000});
    }
    await query('UPDATE transactions SET status=$2,raw_tx=NULL,error=$3,updated_at=now() WHERE id=$1',[row.id,receipt.status==='success'?'confirmed':'failed',receipt.status==='success'?null:'Transaction reverted']);
  }
}
