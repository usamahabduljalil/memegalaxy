import {erc20Abi,encodeFunctionData,keccak256,parseEventLogs,type Address,type Hex} from 'viem';
import {chain,signer} from './chain';
import {db} from './store';
import {transaction,credit} from './economy';
import {rewardWeek} from '../../shared/galaxy/economy';
import {huntVaultAbi,retirementAbi,claimKey,rewardLeaf,merkleTree} from '../../shared/galaxy/economy-chain';
const vault=process.env.MEMEGALAXY_HUNT_VAULT as Address|undefined;
const retirement=process.env.MEMEGALAXY_RETIREMENT_ADDRESS as Address|undefined;
/** Durable signed outbox, separate from prize transaction identities. */
async function publish(asset:Address,week:bigint,root:Hex,total:bigint){if(!vault)return;
 const current=await chain.readContract({address:vault,abi:huntVaultAbi,functionName:'allocations',args:[asset,week]});if(current[0]!==`0x${'0'.repeat(64)}`){if(current[0]!==root)throw Error('Allocation root mismatch');const head=await chain.getBlockNumber(),confirmed=head-confirmations();if(confirmed>=0n&&(await chain.readContract({address:vault,abi:huntVaultAbi,functionName:'allocations',args:[asset,week],blockNumber:confirmed}))[0]===root)await db.query("UPDATE mg_stock_weeks SET state='published' WHERE asset=$1 AND week=$2",[asset,week.toString()]);return;}
 const key=`${vault}:${asset}:${week}`,wallet=signer('MEMEGALAXY_OPERATOR_PRIVATE_KEY');let tx=(await db.query('SELECT * FROM mg_economy_transactions WHERE id=$1',[key])).rows[0];
 if(tx?.raw){try{const receipt=await chain.getTransactionReceipt({hash:tx.hash});if(receipt.status==='reverted')await db.query("UPDATE mg_economy_transactions SET raw=NULL,status='failed' WHERE id=$1",[key]);else return;}catch(e){if((e as Error).name!=='TransactionReceiptNotFoundError')throw e;const nonce=await chain.getTransactionCount({address:wallet.account.address});if(nonce>Number(tx.nonce)){await db.query("UPDATE mg_economy_transactions SET raw=NULL,status='replaced' WHERE id=$1",[key]);}else{await chain.sendRawTransaction({serializedTransaction:tx.raw}).catch(()=>{});return;}}tx=undefined;}
 await chain.simulateContract({account:wallet.account,address:vault,abi:huntVaultAbi,functionName:'publish',args:[asset,week,root,total]});
 const request=await wallet.prepareTransactionRequest({to:vault,data:encodeFunctionData({abi:huntVaultAbi,functionName:'publish',args:[asset,week,root,total]})}),raw=await wallet.signTransaction(request),hash=keccak256(raw);
 await db.query("INSERT INTO mg_economy_transactions(id,hash,raw,nonce,status) VALUES($1,$2,$3,$4,'submitted') ON CONFLICT(id) DO UPDATE SET hash=$2,raw=$3,nonce=$4,status='submitted'",[key,hash,raw,request.nonce]);await db.query('UPDATE mg_stock_weeks SET hash=$3 WHERE asset=$1 AND week=$2',[asset,week.toString(),hash]);await chain.sendRawTransaction({serializedTransaction:raw});
}
const confirmations=()=>BigInt(Math.max(2,Math.floor(Number(process.env.MEMEGALAXY_ECONOMY_CONFIRMATIONS??12))));
let lastScan=0;
/** Confirmed event cursor recovers transactions even when the client never reports their hash. */
async function syncEconomy(head:bigint){
 const confirmed=head-confirmations();if(confirmed<0n)return;
 const id=`46630:${vault??''}:${retirement??''}`;
 const saved=(await db.query('SELECT block_number FROM mg_economy_cursors WHERE id=$1',[id])).rows[0];
 const start=BigInt(process.env.MEMEGALAXY_ECONOMY_START_BLOCK??String(confirmed>2000n?confirmed-2000n:0n));
 const from=saved?BigInt(saved.block_number)+1n:start,to=from+9999n<confirmed?from+9999n:confirmed;
 const logs=from<=to?await chain.getLogs({address:[vault,retirement].filter(Boolean) as Address[],fromBlock:from,toBlock:to}):[];
 const claims=vault?parseEventLogs({abi:huntVaultAbi,eventName:'Claimed',logs:logs.filter(l=>l.address.toLowerCase()===vault.toLowerCase())}):[];
 const retirements=retirement?parseEventLogs({abi:retirementAbi,eventName:'Retired',logs:logs.filter(l=>l.address.toLowerCase()===retirement.toLowerCase())}):[];
 const assets=vault?(await db.query('SELECT address FROM mg_stock_assets')).rows:[];
 const balances=to<confirmed?[]:await Promise.all(assets.map(async a=>({address:a.address,balance:await chain.readContract({address:a.address,abi:erc20Abi,functionName:'balanceOf',args:[vault!],blockNumber:to<confirmed?to:confirmed}),liability:await chain.readContract({address:vault!,abi:huntVaultAbi,functionName:'liability',args:[a.address],blockNumber:to<confirmed?to:confirmed})})));
 await transaction(async c=>{
  await c.query("SELECT pg_advisory_xact_lock(hashtext('stock-rewards'))");
  // Historical logs may be available without archived token state. Suspend offers
  // during backfill; only refresh inventory when logs reach the confirmed balance block.
  if(to<confirmed)await c.query('UPDATE mg_stock_assets SET observed_at=NULL');
  for(const log of claims)await c.query('UPDATE mg_stock_claims SET claimed=true,hash=$6 WHERE asset=$1 AND week=$2 AND idx=$3 AND wallet=$4 AND amount=$5',[log.args.asset.toLowerCase(),log.args.week.toString(),Number(log.args.index),log.args.wallet.toLowerCase(),log.args.amount.toString(),log.transactionHash]);
  for(const a of balances)await c.query("UPDATE mg_stock_assets SET balance=$2,observed_at=$3,external_liability=GREATEST(0,$4::numeric-COALESCE((SELECT sum(x.amount) FROM mg_stock_claims x JOIN mg_stock_weeks w USING(asset,week) WHERE x.asset=$1 AND NOT x.claimed AND w.state='published'),0)) WHERE address=$1",[a.address,a.balance.toString(),to>=confirmed?new Date():null,a.liability.toString()]);
  for(const log of retirements)await c.query("UPDATE mg_retire_quotes SET hash=$2,status='submitted' WHERE id=$1 AND status<>'credited' AND wallet=$3 AND owner_hash=$4 AND amount=$5 AND credits=$6 AND version=$7",[log.args.id,log.transactionHash,log.args.wallet.toLowerCase(),log.args.owner,log.args.amount.toString(),log.args.credits.toString(),Number(log.args.version)]);
  if(from<=to)await c.query('INSERT INTO mg_economy_cursors(id,block_number) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET block_number=$2',[id,to.toString()]);
 });return to>=confirmed;
}
export async function economyCycle(){if(!vault&&!retirement)return;if(await chain.getChainId()!==46630)throw Error('Economy requires Robinhood testnet');
 const lock=await db.connect();try{if(!(await lock.query("SELECT pg_try_advisory_lock(hashtext('galaxy-economy-worker')) AS locked")).rows[0].locked)return;
 const head=await chain.getBlockNumber();if(Date.now()-lastScan>=10000){const caughtUp=await syncEconomy(head);lastScan=caughtUp?Date.now():0;}
 if(vault){
  await transaction(async c=>{await c.query("SELECT pg_advisory_xact_lock(hashtext('stock-rewards'))");await c.query("UPDATE mg_stock_drops SET state='expired' WHERE state='reserved' AND expires_at<=now()");const groups=(await c.query('SELECT DISTINCT r.asset,r.week FROM mg_stock_rewards r LEFT JOIN mg_stock_weeks w ON w.asset=r.asset AND w.week=r.week WHERE r.week<$1 AND w.week IS NULL',[rewardWeek().start])).rows;
   for(const g of groups){const rows=(await c.query('SELECT wallet,sum(amount)::text AS amount FROM mg_stock_rewards WHERE asset=$1 AND week=$2 GROUP BY wallet ORDER BY wallet',[g.asset,g.week])).rows;const leaves=rows.map((r,i)=>rewardLeaf(vault!,g.asset,BigInt(g.week),BigInt(i),r.wallet,BigInt(r.amount))),tree=merkleTree(leaves);await c.query('INSERT INTO mg_stock_weeks(asset,week,root,total) VALUES($1,$2,$3,$4)',[g.asset,g.week,tree.root,rows.reduce((n,r)=>n+BigInt(r.amount),0n).toString()]);for(let i=0;i<rows.length;i++)await c.query('INSERT INTO mg_stock_claims(asset,week,idx,wallet,amount,proof) VALUES($1,$2,$3,$4,$5,$6)',[g.asset,g.week,i,rows[i].wallet,rows[i].amount,JSON.stringify(tree.proof(i))]);}
  });
  for(const w of (await db.query("SELECT * FROM mg_stock_weeks WHERE state='prepared' ORDER BY week,asset")).rows)await publish(w.asset,BigInt(w.week),w.root,BigInt(w.total));
 }
 if(retirement){const depth=confirmations();for(const q of (await db.query("SELECT * FROM mg_retire_quotes WHERE hash IS NOT NULL AND status='submitted' ORDER BY created_at LIMIT 100")).rows){
  let receipt;try{receipt=await chain.getTransactionReceipt({hash:q.hash});}catch(e){if((e as Error).name==='TransactionReceiptNotFoundError')continue;throw e;}if(receipt.status!=='success'){await db.query("UPDATE mg_retire_quotes SET status='failed' WHERE id=$1",[q.id]);continue;}if(head<receipt.blockNumber+depth)continue;
  const logs=parseEventLogs({abi:retirementAbi,eventName:'Retired',logs:receipt.logs.filter(l=>l.address.toLowerCase()===retirement.toLowerCase())});const event=logs.find(l=>l.args.id===q.id);if(!event||event.args.wallet.toLowerCase()!==q.wallet||event.args.owner!==q.owner_hash||event.args.amount.toString()!==q.amount||event.args.credits.toString()!==q.credits||event.args.version!==BigInt(q.version)){await db.query("UPDATE mg_retire_quotes SET status='invalid',hash=NULL WHERE id=$1",[q.id]);continue;}
  const block=await chain.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)continue;
  await transaction(async c=>{await credit(c,q.owner,BigInt(q.credits),'retirement','retire:'+retirement+':'+q.id);await c.query("UPDATE mg_retire_quotes SET status='credited',block_hash=$2,block_number=$3 WHERE id=$1",[q.id,receipt.blockHash,receipt.blockNumber.toString()]);});
 }}
 }finally{await lock.query("SELECT pg_advisory_unlock(hashtext('galaxy-economy-worker'))");lock.release();}}
