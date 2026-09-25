import 'dotenv/config';
import { createRequire } from 'node:module';
import { createPublicClient,createWalletClient,encodeDeployData,http,parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { robinhoodTestnet } from '../shared/galaxy/chain';
const require=createRequire(import.meta.url),solc=require('solc');
const source='pragma solidity ^0.8.30; contract ParentEntropyProbe { function snapshot(uint256 target) external view returns(uint256,bytes32) { return(block.number,blockhash(target)); } }';
const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Probe.sol':{content:source}},settings:{evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
const contract=compiled.contracts['Probe.sol'].ParentEntropyProbe;
const key=process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`|undefined;if(!key)throw new Error('Missing test-only deployer key');
const account=privateKeyToAccount(key),rpc=process.env.ROBINHOOD_RPC_URL??robinhoodTestnet.rpcUrls.default.http[0];
const chain=createPublicClient({chain:robinhoodTestnet,transport:http(rpc)}),wallet=createWalletClient({account,chain:robinhoodTestnet,transport:http(rpc)});
const parent=createPublicClient({transport:http(process.env.SEPOLIA_RPC_URL??'https://ethereum-sepolia-rpc.publicnode.com')});
if(await chain.getChainId()!==46630||await parent.getChainId()!==11155111)throw new Error('Unexpected chain');
const hash=await wallet.sendTransaction({data:encodeDeployData({abi:contract.abi,bytecode:(`0x${contract.evm.bytecode.object}`) as `0x${string}`})});
const receipt=await chain.waitForTransactionReceipt({hash});if(receipt.status!=='success'||!receipt.contractAddress)throw new Error('Probe deployment failed');
const address=receipt.contractAddress,abi=parseAbi(['function snapshot(uint256) view returns(uint256,bytes32)']);
const [initial]=await chain.readContract({address,abi,functionName:'snapshot',args:[0n]});
const target=initial+2n,started=Date.now();
while(Date.now()-started<180000){
 const [current,observed]=await chain.readContract({address,abi,functionName:'snapshot',args:[target]});
 if(current>target&&observed!==`0x${'0'.repeat(64)}`){
  const neighbors=await Promise.all([target-1n,target,target+1n].map(blockNumber=>parent.getBlock({blockNumber})));
  console.log(JSON.stringify({probe:address,transaction:hash,initial:initial.toString(),target:target.toString(),availableAt:current.toString(),observed,neighborHashes:neighbors.map(b=>({number:b.number.toString(),hash:b.hash})),elapsedSeconds:Math.round((Date.now()-started)/1000)}));process.exit(0);
 }
 await new Promise(resolve=>setTimeout(resolve,2000));
}
throw new Error('Parent hash not visible within three minutes');
