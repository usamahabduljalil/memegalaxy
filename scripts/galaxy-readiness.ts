import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createPublicClient,http,parseAbi,keccak256,stringToHex,formatEther,type Address,type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
const deployment=JSON.parse(readFileSync('deploy/robinhood-testnet.json','utf8'));
const client=createPublicClient({transport:http('https://rpc.testnet.chain.robinhood.com')});
const abi=parseAbi(['function hasRole(bytes32,address) view returns(bool)','function currentEpoch() view returns(uint256)','function availablePrize() view returns(uint256)']);
if(await client.getChainId()!==46630)throw new Error('Robinhood testnet required');
for(const [key,role] of [['REGISTRAR_PRIVATE_KEY','REGISTRAR_ROLE'],['REGISTRAR_PRIVATE_KEY','OPERATOR_ROLE'],['RESULT_SIGNER_PRIVATE_KEY','RESULT_ROLE']]){
 const account=privateKeyToAccount(process.env[key] as Hex);
 const allowed=await client.readContract({address:deployment.escrow as Address,abi,functionName:'hasRole',args:[keccak256(stringToHex(role)),account.address]});
 const balance=await client.getBalance({address:account.address});
 if(!allowed||balance===0n)throw new Error(`${role} needs its role and testnet gas`);
 console.log(`${role}: verified; ${formatEther(balance)} test ETH`);
}
console.log('Epoch:',String(await client.readContract({address:deployment.escrow,abi,functionName:'currentEpoch'})));
console.log('Available test USDC:',Number(await client.readContract({address:deployment.escrow,abi,functionName:'availablePrize'}))/1e6);
const resultSigner=privateKeyToAccount(process.env.RESULT_SIGNER_PRIVATE_KEY as Hex).address;
for(const role of [keccak256(stringToHex('OPERATOR_ROLE')),`0x${'00'.repeat(32)}` as Hex]){
 if(await client.readContract({address:deployment.escrow,abi,functionName:'hasRole',args:[role,resultSigner]}))throw new Error('Result signer must not hold operator or treasury administration roles');
}
console.log('Result signer is isolated from epoch and treasury administration.');
