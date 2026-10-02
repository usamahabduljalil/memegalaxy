import assert from 'node:assert/strict';
import {erc20Abi,parseAbi,type Address} from 'viem';
import {STOCK_ASSETS} from '../../shared/galaxy/economy';
import {chain} from './chain';
import {db,migrateGalaxy} from './store';
import {config,transaction,audit} from './economy';
// One-time activation of the agreed, funded testnet defaults; never overrides admin offers.
try{
 await migrateGalaxy();assert.equal(await chain.getChainId(),46630);
 const vault=process.env.MEMEGALAXY_HUNT_VAULT as Address,admin=process.env.MEMEGALAXY_ECONOMY_ADMINS?.split(',')[0] as Address;
 assert(vault&&admin);const roles=parseAbi(['function hasRole(bytes32,address) view returns(bool)']);assert(await chain.readContract({address:vault,abi:roles,functionName:'hasRole',args:[`0x${'0'.repeat(64)}`,admin]}));
 const block=await chain.getBlockNumber()-BigInt(process.env.MEMEGALAXY_ECONOMY_CONFIRMATIONS??12);
 const verified=await Promise.all(STOCK_ASSETS.map(async a=>{
  const [code,symbol,decimals,balance]=await Promise.all([chain.getCode({address:a.address,blockNumber:block}),chain.readContract({address:a.address,abi:erc20Abi,functionName:'symbol',blockNumber:block}),chain.readContract({address:a.address,abi:erc20Abi,functionName:'decimals',blockNumber:block}),chain.readContract({address:a.address,abi:erc20Abi,functionName:'balanceOf',args:[vault],blockNumber:block})]);
  assert(code&&code!=='0x');assert.equal(symbol,a.symbol);assert.equal(decimals,18);assert(balance>=20000000000000000n);return {...a,balance};
 }));
 await transaction(async c=>{await c.query("SELECT pg_advisory_xact_lock(hashtext('economy-settings'))");const cfg=await config(c),actor=(await c.query('SELECT actor FROM mg_economy_config WHERE version=$1',[cfg.version])).rows[0].actor;
  if(actor!=='bootstrap'){console.log('Existing operator configuration preserved; no default activation applied.');return;}
  for(const a of verified)await c.query('UPDATE mg_stock_assets SET enabled=true,balance=$2,observed_at=now() WHERE address=$1',[a.address,a.balance.toString()]);
  await c.query('INSERT INTO mg_economy_config(settings,actor) VALUES($1,$2)',[{...cfg.settings,enabled:true},'testnet-release']);await audit(c,'testnet-release','funded-hunt-activation',vault,{admin,assets:verified.map(a=>a.symbol),baseUnits:cfg.settings.baseUnits});
  console.log('Funded Stock Hunt defaults enabled. Paid skins, task issuance and retirement rates remain operator-configured.');
 });
}finally{await db.end();}
