import 'dotenv/config';
import { createPublicClient,createWalletClient,encodeFunctionData,http,parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'node:fs';
import { robinhoodTestnet } from '../shared/galaxy/chain';

const previous=JSON.parse(readFileSync('deploy/robinhood-testnet.json','utf8'));
const key=process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`|undefined;
if(!key)throw new Error('Missing test-only deployer key');
const account=privateKeyToAccount(key);
if(account.address.toLowerCase()!==previous.deployer.toLowerCase())throw new Error('Unexpected administrator');
const address=previous.escrow as `0x${string}`;
const abi=parseAbi([
 'function currentEpoch() view returns(uint256)',
 'function epochInfo(uint256) view returns(uint8,uint256,uint256,uint256,uint256,uint256,bytes32,bytes32,uint256)',
 'function entriesPaused() view returns(bool)',
 'function pauseEntries(bool)'
]);
const transport=http(process.env.ROBINHOOD_RPC_URL??robinhoodTestnet.rpcUrls.default.http[0]);
const chain=createPublicClient({chain:robinhoodTestnet,transport});
const wallet=createWalletClient({account,chain:robinhoodTestnet,transport});
if(await chain.getChainId()!==46630)throw new Error('Robinhood testnet only');
const id=await chain.readContract({address,abi,functionName:'currentEpoch'});
const info=await chain.readContract({address,abi,functionName:'epochInfo',args:[id]});
if(Number(info[0])!==1||Number(info[3])>1)throw new Error('Legacy epoch state changed; inspect before pausing');
if(await chain.readContract({address,abi,functionName:'entriesPaused'})){console.log('Legacy entries already paused');process.exit(0);}
await chain.simulateContract({account,address,abi,functionName:'pauseEntries',args:[true]});
const hash=await wallet.sendTransaction({to:address,data:encodeFunctionData({abi,functionName:'pauseEntries',args:[true]})});
const receipt=await chain.waitForTransactionReceipt({hash});
if(receipt.status!=='success')throw new Error('Pause reverted');
if(!await chain.readContract({address,abi,functionName:'entriesPaused'}))throw new Error('Pause did not persist');
console.log(JSON.stringify({hash,epoch:id.toString(),registered:info[3].toString(),entriesPaused:true}));
