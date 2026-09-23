import 'dotenv/config';
import { readFileSync,writeFileSync,existsSync,mkdirSync } from 'node:fs';
import { createPublicClient,createWalletClient,http,erc20Abi,encodeFunctionData,parseAbi,keccak256,type Address,type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { robinhoodTestnet } from '../shared/galaxy/chain';

const deployment=JSON.parse(readFileSync('deploy/robinhood-testnet.json','utf8')) as {usdc:Address;escrow:Address;deployer:Address};
const amount=1000n*10n**6n;
const rpc=process.env.ROBINHOOD_RPC_URL??robinhoodTestnet.rpcUrls.default.http[0];
const chain=createPublicClient({chain:robinhoodTestnet,transport:http(rpc)});
if(await chain.getChainId()!==46630)throw new Error('Testnet only');
const available=()=>chain.readContract({address:deployment.escrow,abi:parseAbi(['function availablePrize() view returns(uint256)']),functionName:'availablePrize'});
if(await available()>=amount){console.log('Next prize pool is already funded');process.exit(0);}
const key=process.env.DEPLOYER_PRIVATE_KEY as Hex|undefined;
if(!key)throw new Error('Missing test-only deployer key in local .env');
const account=privateKeyToAccount(key);
if(account.address.toLowerCase()!==deployment.deployer.toLowerCase())throw new Error('Wrong test-only deployer key');
const balance=await chain.readContract({address:deployment.usdc,abi:erc20Abi,functionName:'balanceOf',args:[account.address]});
if(balance<amount)throw new Error('Insufficient mock test USDC');
const path='.local/galaxy-epoch-3-prize-funding.json';
mkdirSync('.local',{recursive:true});
let attempt: {hash:Hex;raw:Hex}|undefined=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):undefined;
if(!attempt){
  const wallet=createWalletClient({account,chain:robinhoodTestnet,transport:http(rpc)});
  const data=encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[deployment.escrow,amount]});
  const raw=await wallet.signTransaction(await wallet.prepareTransactionRequest({to:deployment.usdc,data}));
  attempt={hash:keccak256(raw),raw};
  writeFileSync(path,JSON.stringify(attempt),{mode:0o600,flag:'wx'});
}
try{await chain.sendRawTransaction({serializedTransaction:attempt.raw});}catch{/* Receipt may already exist after an interrupted run. */}
const receipt=await chain.waitForTransactionReceipt({hash:attempt.hash,timeout:120000});
if(receipt.status!=='success')throw new Error(`Funding transaction ${attempt.hash} failed`);
if(await available()<amount)throw new Error('Funding receipt succeeded but prize availability is still below 1,000 test USDC');
console.log(`Next prize pool funded: ${attempt.hash}`);
