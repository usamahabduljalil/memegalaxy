import 'dotenv/config';
import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {createPublicClient,createWalletClient,http,encodeDeployData,encodeFunctionData,erc20Abi,keccak256,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {robinhoodTestnet} from '../shared/galaxy/chain';
import {STOCK_ASSETS} from '../shared/galaxy/economy';
import {compile} from './compile-contracts';
const prior=JSON.parse(readFileSync('deploy/robinhood-testnet-v4.json','utf8'));
const account=privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex),operator=privateKeyToAccount(process.env.REGISTRAR_PRIVATE_KEY as Hex).address;
if(account.address.toLowerCase()!=='0x82eacd27a39a68f78e43a1c2e3f3b920b29a7652'||operator.toLowerCase()!==prior.operator.toLowerCase())throw Error('Unexpected test-only deployment roles');
const rpc=createPublicClient({chain:robinhoodTestnet,transport:http()}),wallet=createWalletClient({account,chain:robinhoodTestnet,transport:http()});if(await rpc.getChainId()!==46630)throw Error('Testnet only');
mkdirSync('.local',{recursive:true});const file='.local/economy-deployment-progress.json';const progress=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{attempts:{}};
function save(){writeFileSync(file+'.tmp',JSON.stringify(progress,null,2),{mode:0o600});renameSync(file+'.tmp',file);}
async function send(name:string,data:Hex,to?:Address){let attempt=progress.attempts[name];if(!attempt){const raw=await wallet.signTransaction(await wallet.prepareTransactionRequest({data,...(to?{to}:{})}));attempt={hash:keccak256(raw),raw};progress.attempts[name]=attempt;save();}if(attempt.raw)await rpc.sendRawTransaction({serializedTransaction:attempt.raw}).catch(()=>{});const receipt=await rpc.waitForTransactionReceipt({hash:attempt.hash,timeout:120000});if(receipt.status!=='success')throw Error(name+' reverted');delete attempt.raw;save();console.log(name,receipt.transactionHash);return receipt;}
const artifacts=compile();const v=await send('Deploy Stock Hunt vault',encodeDeployData({...artifacts.GalaxyHuntVault,args:[account.address,operator]})),r=await send('Deploy retirement sink',encodeDeployData({...artifacts.GalaxyRetirement,args:[prior.token,account.address,operator]}));
const vault=v.contractAddress!,retirement=r.contractAddress!;if(!vault||!retirement)throw Error('Missing deployed address');
const funding:Record<string,string>={};for(const a of STOCK_ASSETS){const receipt=await send('Fund '+a.symbol,encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[vault,10n**18n]}),a.address);funding[a.symbol]=receipt.transactionHash;}
writeFileSync('deploy/robinhood-economy-testnet.json',JSON.stringify({chainId:46630,admin:account.address,publisher:operator,quoter:operator,token:prior.token,vault,retirement,vaultDeployment:v.transactionHash,retirementDeployment:r.transactionHash,assets:STOCK_ASSETS,seedPerAsset:'1',funding},null,2)+'\n');console.log('Economy deployed; reward drops and retirement offers remain disabled.',vault,retirement);
