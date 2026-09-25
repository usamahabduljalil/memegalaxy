import 'dotenv/config';
import { createPublicClient,createWalletClient,encodeDeployData,encodeFunctionData,erc20Abi,http,keccak256,type Address,type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { existsSync,mkdirSync,readFileSync,renameSync,writeFileSync } from 'node:fs';
import { robinhoodTestnet } from '../shared/galaxy/chain';
import { compile } from './compile-contracts';

type Attempt={hash:Hex;raw?:Hex;address?:Address;confirmed?:boolean};
const previous=JSON.parse(readFileSync('deploy/robinhood-testnet-v3.json','utf8'));
const deployer=process.env.DEPLOYER_PRIVATE_KEY as Hex|undefined;
const registrar=process.env.REGISTRAR_PRIVATE_KEY as Hex|undefined;
const result=process.env.RESULT_SIGNER_PRIVATE_KEY as Hex|undefined;
if(!deployer||!registrar||!result)throw new Error('Missing test-only deployment keys');
const account=privateKeyToAccount(deployer);
const operator=privateKeyToAccount(registrar).address;
const resultSigner=privateKeyToAccount(result).address;
if(account.address.toLowerCase()!==previous.deployer.toLowerCase()
 ||operator.toLowerCase()!==previous.operator.toLowerCase()
 ||resultSigner.toLowerCase()!==previous.resultSigner.toLowerCase())
 throw new Error('Test-only roles differ from the existing deployment');
const chain=createPublicClient({chain:robinhoodTestnet,transport:http(process.env.ROBINHOOD_RPC_URL??robinhoodTestnet.rpcUrls.default.http[0])});
const wallet=createWalletClient({account,chain:robinhoodTestnet,transport:http(process.env.ROBINHOOD_RPC_URL??robinhoodTestnet.rpcUrls.default.http[0])});
if(await chain.getChainId()!==46630)throw new Error('Robinhood testnet only');
const token=previous.token as Address,usdc=previous.usdc as Address;
const seed=1000n*10n**6n;
if(await chain.readContract({address:usdc,abi:erc20Abi,functionName:'balanceOf',args:[account.address]})<seed)
 throw new Error('Deployer lacks 1,000 mock test USDC');
if(await chain.getBalance({address:account.address})<1000000000000000n)
 throw new Error('Deployer lacks testnet ETH for escrow deployment');
const path='.local/memegalaxy-v4-progress.json';
const configuration={chainId:46630,deployer:account.address,operator,resultSigner,token,usdc,previousEscrow:previous.escrow};
mkdirSync('.local',{recursive:true});
const progress:{configuration:typeof configuration;attempts:Record<string,Attempt>}=existsSync(path)
 ?JSON.parse(readFileSync(path,'utf8')):{configuration,attempts:{}};
if(JSON.stringify(progress.configuration)!==JSON.stringify(configuration))
 throw new Error('Saved v3 deployment configuration mismatch');
function save(){writeFileSync(path+'.tmp',JSON.stringify(progress,null,2),{mode:0o600});renameSync(path+'.tmp',path);}
async function send(name:string,data:Hex,to?:Address){
 let attempt=progress.attempts[name];
 if(!attempt){
  const raw=await wallet.signTransaction(await wallet.prepareTransactionRequest({data,...(to?{to}:{})}));
  attempt={hash:keccak256(raw),raw};progress.attempts[name]=attempt;save();
 }
 if(!attempt.confirmed&&attempt.raw)try{await chain.sendRawTransaction({serializedTransaction:attempt.raw});}catch{}
 const receipt=await chain.waitForTransactionReceipt({hash:attempt.hash,timeout:120000});
 if(receipt.status!=='success')throw new Error(name+' reverted');
 attempt.confirmed=true;attempt.address=receipt.contractAddress??undefined;delete attempt.raw;save();
 console.log(name,attempt.hash);
 return receipt;
}
const artifact=compile().MemeGalaxyEscrowV4;
const deployment=await send('MemeGalaxyEscrowV4',encodeDeployData({...artifact,args:[token,usdc,account.address,operator,operator,account.address,resultSigner]}));
const escrow=deployment.contractAddress;
if(!escrow)throw new Error('No v4 escrow address');
const onchainRuleset=await chain.readContract({address:escrow,abi:artifact.abi,functionName:'RULESET'});
if(onchainRuleset!==keccak256(new TextEncoder().encode('memegalaxy-v2.1.0')))throw new Error('Wrong onchain gameplay ruleset');
const funding=await send('Seed v4 mock test prize pool',encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[escrow,seed]}),usdc);
const balance=await chain.readContract({address:usdc,abi:erc20Abi,functionName:'balanceOf',args:[escrow]});
if(balance<seed)throw new Error('V4 escrow prize balance is below seed');
mkdirSync('deploy',{recursive:true});
writeFileSync('deploy/robinhood-testnet-v4.json',JSON.stringify({...configuration,escrow,faucet:previous.faucet,seededTestUSDC:'1000',deploymentBlock:deployment.blockNumber.toString(),deploymentTx:deployment.transactionHash,fundingTx:funding.transactionHash},null,2)+'\n');
console.log('V4 escrow staged:',escrow);
