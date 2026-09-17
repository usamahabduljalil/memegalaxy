import { parseAbi } from 'viem';
import { chain,escrowAddress } from './chain';
import { pool,query } from './db';

const events=parseAbi([
  'event Registered(uint256 indexed epoch,address indexed wallet,bytes32 indexed userId,uint256 amount)',
  'event Cancelled(uint256 indexed epoch,address indexed wallet)',
]);

// Backfill from deployment, not the current roster: a player can join and cancel
// between worker polls. Commit events and the cursor together for restart safety.
export async function indexEntryHistory(){
  const start=process.env.ESCROW_DEPLOYMENT_BLOCK;
  if(!start)return;
  if(!/^\d+$/.test(start))throw new Error('Invalid ESCROW_DEPLOYMENT_BLOCK');
  const address=escrowAddress(),key=`entries:${address.toLowerCase()}`;
  const row=(await query('SELECT block_number FROM chain_cursors WHERE name=$1',[key])).rows[0];
  const fromBlock=row?BigInt(row.block_number)+1n:BigInt(start);
  const finalized=(await chain.getBlock({blockTag:'finalized'})).number;
  if(fromBlock>finalized)return;
  const toBlock=fromBlock+499n<finalized?fromBlock+499n:finalized;
  const logs=await chain.getLogs({address,events,fromBlock,toBlock,strict:true});
  const connection=await pool.connect();
  try{
    await connection.query('BEGIN');
    for(const log of logs){
      await connection.query("INSERT INTO transactions(operation_key,epoch_id,wallet,kind,tx_hash,status) VALUES($1,$2,$3,$4,$5,'confirmed') ON CONFLICT(operation_key) DO NOTHING",[
        `event:${log.transactionHash}:${log.logIndex}`,log.args.epoch.toString(),log.args.wallet.toLowerCase(),log.eventName==='Registered'?'Registration':'Cancellation refund',log.transactionHash,
      ]);
    }
    await connection.query('INSERT INTO chain_cursors(name,block_number) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET block_number=$2',[key,toBlock.toString()]);
    await connection.query('COMMIT');
  }catch(error){await connection.query('ROLLBACK');throw error;}
  finally{connection.release();}
}
