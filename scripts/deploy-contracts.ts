import 'dotenv/config';
import { createPublicClient,createWalletClient,encodeDeployData,encodeFunctionData,http,isAddress,keccak256,type Address,type Hex,erc20Abi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from '../shared/chain';
import { compile } from './compile-contracts';
import { existsSync,mkdirSync,readFileSync,writeFileSync,renameSync } from 'node:fs';

async function main(){
 const key=process.env.DEPLOYER_PRIVATE_KEY as Hex|undefined,stable=process.env.USDC_ADDRESS,admin=process.env.ADMIN_ADDRESS,ops=process.env.OPERATIONS_ADDRESS;
 if(!key||!stable||!isAddress(stable)||!admin||!isAddress(admin)||!ops||!isAddress(ops)||!process.env.RESULT_SIGNER_PRIVATE_KEY||!process.env.REGISTRAR_PRIVATE_KEY)throw new Error('Set the deployment environment values documented in README.md');
 const account=privateKeyToAccount(key),chain=createPublicClient({chain:arcTestnet,transport:http(process.env.ARC_RPC_URL||arcTestnet.rpcUrls.default.http[0])}),wallet=createWalletClient({account,chain:arcTestnet,transport:http(process.env.ARC_RPC_URL||arcTestnet.rpcUrls.default.http[0])});
 if(await chain.getChainId()!==5042002)throw new Error('Refusing to deploy outside Arc testnet');
 if(stable.toLowerCase()!=='0x3600000000000000000000000000000000000000')throw new Error('Expected canonical Arc testnet USDC');
 if(await chain.readContract({address:stable,abi:erc20Abi,functionName:'decimals'})!==6)throw new Error('USDC must have 6 decimals');
 const operator=privateKeyToAccount(process.env.RESULT_SIGNER_PRIVATE_KEY as Hex).address,registrar=privateKeyToAccount(process.env.REGISTRAR_PRIVATE_KEY as Hex).address;
 const configuration={deployer:account.address,stable,admin,operator,registrar,ops};
 const path='.local/deployment-progress.json';mkdirSync('.local',{recursive:true});
 type Attempt={hash:Hex;raw?:Hex;address?:Address;confirmed?:boolean};
 const progress:{configuration:typeof configuration;attempts:Record<string,Attempt>}=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{configuration,attempts:{}};
 if(JSON.stringify(configuration)!==JSON.stringify(progress.configuration))throw new Error('Deployment configuration changed; review the saved deployment before continuing');
 function save(){writeFileSync(path+'.tmp',JSON.stringify(progress,null,2),{mode:0o600});renameSync(path+'.tmp',path);}
 async function transact(name:string,data:Hex,to?:Address){
  let attempt=progress.attempts[name];
  if(!attempt){
   const request=await wallet.prepareTransactionRequest({data,...(to?{to}:{})});
   const raw=await wallet.signTransaction(request);
   attempt={hash:keccak256(raw),raw};progress.attempts[name]=attempt;save();
  }
  if(!attempt.confirmed&&attempt.raw){try{await chain.sendRawTransaction({serializedTransaction:attempt.raw});}catch{/* A receipt resolves uncertain broadcasts without issuing another transaction. */}}
  const receipt=await chain.waitForTransactionReceipt({hash:attempt.hash,timeout:120000});
  if(receipt.status!=='success')throw new Error(`Transaction reverted: ${name} (${attempt.hash})`);
  attempt.confirmed=true;attempt.address=receipt.contractAddress??undefined;delete attempt.raw;save();
  console.log(`${name} transaction: ${attempt.hash}`);return receipt;
 }
 const artifacts=compile();
 async function deploy(name:string,args:unknown[]=[]){const receipt=await transact(name,encodeDeployData({...artifacts[name],args}));if(!receipt.contractAddress)throw new Error(`Missing contract address: ${name}`);console.log(`${name}: ${receipt.contractAddress}`);return receipt.contractAddress;}
 const token=await deploy('TestDominate',[account.address]);
 const faucet=await deploy('DominateFaucet',[token]);
 const escrow=await deploy('BigCircle',[token,stable,admin,operator,registrar,ops]);
 await transact('FundTestFaucet',encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[faucet,1_000_000_000n*10n**18n]}),token);
 const escrowDeploymentBlock=(await chain.getTransactionReceipt({hash:progress.attempts.BigCircle.hash})).blockNumber.toString();
 writeFileSync('.local/deployment.json',JSON.stringify({chainId:5042002,escrowDeploymentBlock,dominate:token,faucet,escrow,usdc:stable,admin,operations:ops},null,2));
 console.log('Public deployment addresses saved. Seed the escrow separately with test USDC.');
}
main().catch(error=>{console.error(error.shortMessage||error.message||'Deployment failed');process.exitCode=1;});
