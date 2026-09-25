import assert from 'node:assert/strict';
import ganache from 'ganache';
import { createPublicClient,createWalletClient,custom,defineChain,keccak256,concatHex,encodeDeployData,encodeFunctionData,type Address,type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { compile } from './compile-contracts';
import { galaxyEntryTypes as entryTypes } from '../shared/galaxy/chain';
const controller=keccak256('0x1234'),ruleset=keccak256(new TextEncoder().encode('memegalaxy-v2.0.0'));
const artifacts=compile();
const provider=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:110},chain:{chainId:31337,hardfork:'shanghai'},miner:{blockGasLimit:30000000}});
const network=defineChain({id:31337,name:'Local',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://localhost']}}});
const accounts=Object.values(provider.getInitialAccounts()).map((a:any)=>privateKeyToAccount(a.secretKey as Hex));
const client=createPublicClient({chain:network,transport:custom(provider as any),cacheTime:0,pollingInterval:10});
const wallets=accounts.map(account=>createWalletClient({account,chain:network,transport:custom(provider as any)}));
// Ganache's eager miner completes each submitted transaction before returning its hash.
async function deploy(name:string,args:unknown[]=[]){const hash=await provider.request({method:'eth_sendTransaction',params:[{from:accounts[0].address,data:encodeDeployData({...artifacts[name],args}),gas:'0xe4e1c0'}]}) as Hex;const r=await client.getTransactionReceipt({hash});assert.equal(r.status,'success');return r.contractAddress!;}
async function send(index:number,address:Address,abi:any,fn:string,args:unknown[]=[]){const hash=await provider.request({method:'eth_sendTransaction',params:[{from:accounts[index].address,to:address,data:encodeFunctionData({abi,functionName:fn,args}),gas:'0x1312d00'}]}) as Hex;const r=await client.getTransactionReceipt({hash});assert.equal(r.status,'success',`${fn} reverted`);return r;}
async function fails(index:number,address:Address,abi:any,fn:string,args:unknown[]=[]){await assert.rejects(()=>client.simulateContract({account:accounts[index],address,abi,functionName:fn,args}));}
const tokenAbi=artifacts.TestMemeGalaxy.abi,stableAbi=artifacts.MockUSDC.abi,abi=artifacts.MemeGalaxyEscrowV3.abi;
let checks=0;const pass=(label:string)=>{checks++;console.log(`PASS ${label}`);};
try{
 const token=await deploy('TestMemeGalaxy',[accounts[0].address]),usdc=await deploy('MockUSDC'),escrow=await deploy('MemeGalaxyEscrowV3',[token,usdc,accounts[0].address,accounts[0].address,accounts[1].address,accounts[2].address,accounts[0].address]);
 const read=async(fn:string,args:unknown[]=[])=>client.readContract({address:escrow,abi,functionName:fn,args}) as any;
 const balance=async(asset:Address,who:Address)=>client.readContract({address:asset,abi:tokenAbi,functionName:'balanceOf',args:[who]}) as Promise<bigint>;
 await send(0,usdc,stableAbi,'transfer',[escrow,500000000n]);
 for(let i=3;i<13;i++){await send(0,token,tokenAbi,'transfer',[accounts[i].address,10000n*10n**18n]);await send(0,usdc,stableAbi,'transfer',[accounts[i].address,10000000n]);await send(i,token,tokenAbi,'approve',[escrow,2n**256n-1n]);await send(i,usdc,stableAbi,'approve',[escrow,2n**256n-1n]);}
 const secret=('0x'+'ab'.repeat(32)) as Hex;
 async function registration(i:number,epoch:bigint,amount=1000n*10n**18n){const nonce=await read('nonces',[accounts[i].address]),expiry=(await client.getBlock()).timestamp+10000n,userId=keccak256(accounts[i].address);const signature=await wallets[1].signTypedData({domain:{name:'MEMEGalaxy',version:'2',chainId:31337,verifyingContract:escrow},types:entryTypes,primaryType:'Entry',message:{epoch,wallet:accounts[i].address,userId,controller,ruleset,amount,nonce,expiry}});return [epoch,userId,controller,amount,expiry,signature];}
 await send(0,escrow,abi,'openEpoch',[keccak256(secret)]);
 for(let i=3;i<12;i++)await send(i,escrow,abi,'register',await registration(i,1n));
 assert.equal((await read('epochInfo',[1n]))[3],9n);await provider.request({method:'evm_increaseTime',params:[1201]});await provider.request({method:'evm_mine',params:[]});
 await fails(0,escrow,abi,'requestEntropy',[1n]);await send(0,escrow,abi,'rollover',[1n]);
 const rolled=(await read('epochInfo',[1n]))[1] as bigint;
 assert.equal(rolled-(await client.getBlock()).timestamp,300n);
 pass('nine players roll over for five minutes without another charge');
 const before=await balance(token,accounts[3].address),beforeUSD=await balance(usdc,accounts[3].address);await send(3,escrow,abi,'cancel',[1n]);assert.equal(await balance(token,accounts[3].address),before+1000n*10n**18n);assert.equal(await balance(usdc,accounts[3].address),beforeUSD+1000000n);pass('waiting cancellation refunds exact tokens and fee');
 await send(3,escrow,abi,'register',await registration(3,1n));await send(12,escrow,abi,'register',await registration(12,1n));await fails(3,escrow,abi,'register',await registration(3,1n));pass('duplicate registrations rejected');
 await provider.request({method:'evm_increaseTime',params:[301]});await provider.request({method:'evm_mine',params:[]});await send(0,escrow,abi,'requestEntropy',[1n]);for(let i=0;i<3;i++)await provider.request({method:'evm_mine',params:[]});
 const entropyHash=await read('entropyHash',[1n]);assert.notEqual(entropyHash,'0x'+'0'.repeat(64));
 const roster=await read('roster',[1n]);await send(0,escrow,abi,'startEpoch',[1n,secret,roster]);assert.equal((await read('epochInfo',[1n]))[7],keccak256(concatHex([secret,entropyHash])));assert.equal(await read('availablePrize'),0n);await fails(3,escrow,abi,'cancel',[1n]);await fails(3,escrow,abi,'claimToken',[1n,accounts[3].address]);pass('start reserves prizes and locks deposits');
 const winners=[accounts[3].address,accounts[4].address,accounts[5].address],stamp=(await client.getBlock()).timestamp;
 await fails(3,escrow,abi,'finalizeArena',[1n,1n,winners,keccak256(secret),stamp]);await fails(0,escrow,abi,'finalizeArena',[1n,1n,[accounts[0].address,...winners.slice(1)],keccak256(secret),stamp]);await fails(0,escrow,abi,'finalizeArena',[1n,1n,[winners[0],winners[0],winners[2]],keccak256(secret),stamp]);pass('outsiders, arbitrary recipients, and duplicate winners rejected');
 await send(0,escrow,abi,'finalizeArena',[1n,1n,winners,keccak256(secret),stamp]);assert.equal((await read('entryInfo',[1n,winners[0]]))[2],250000000n);assert.equal((await read('entryInfo',[1n,winners[1]]))[2],150000000n);assert.equal((await read('entryInfo',[1n,winners[2]]))[2],100000000n);
 for(let i=3;i<13;i++){await send(0,escrow,abi,'claimToken',[1n,accounts[i].address]);await send(0,escrow,abi,'claimUSDC',[1n,accounts[i].address]);assert.equal(await balance(token,accounts[i].address),10000n*10n**18n);}
 assert.equal(await read('tokenLiability'),0n);assert.equal(await read('prizeLiability'),0n);assert.equal(await read('feeLiability'),0n);assert.equal(await read('operationsOwed'),10000000n);await fails(0,escrow,abi,'claimUSDC',[1n,winners[0]]);await send(0,escrow,abi,'payOperations');assert.equal(await balance(usdc,escrow),0n);pass('50:30:20 prizes, all deposits returned, no double claims');
 await send(0,usdc,stableAbi,'transfer',[escrow,100000000n]);await send(0,escrow,abi,'openEpoch',[keccak256(secret)]);for(let i=3;i<13;i++)await send(i,escrow,abi,'register',await registration(i,2n));await provider.request({method:'evm_increaseTime',params:[1201]});await provider.request({method:'evm_mine',params:[]});await send(0,escrow,abi,'requestEntropy',[2n]);for(let i=0;i<3;i++)await provider.request({method:'evm_mine',params:[]});await send(0,escrow,abi,'startEpoch',[2n,secret,await read('roster',[2n])]);await fails(3,escrow,abi,'recoverArena',[2n,1n]);await provider.request({method:'evm_increaseTime',params:[7201]});await provider.request({method:'evm_mine',params:[]});await send(3,escrow,abi,'recoverArena',[2n,1n]);
 await fails(0,escrow,abi,'finalizeArena',[2n,1n,winners,keccak256(secret),(await client.getBlock()).timestamp]);for(let i=3;i<13;i++){const before=await balance(usdc,accounts[i].address);await send(i,escrow,abi,'claimUSDC',[2n,accounts[i].address]);assert.equal(await balance(usdc,accounts[i].address),before+1000000n);await send(i,escrow,abi,'claimToken',[2n,accounts[i].address]);}
 assert.equal(await read('availablePrize'),100000000n);assert.equal(await read('feeLiability'),0n);pass('permissionless timeout refunds fees and releases prize reservation');
 await send(0,escrow,abi,'pauseEntries',[true]);await send(0,escrow,abi,'openEpoch',[keccak256(secret)]);await fails(3,escrow,abi,'register',await registration(3,3n));pass('entry pause enforced');

 await send(0,escrow,abi,'pauseEntries',[false]);
 await send(0,usdc,stableAbi,'transfer',[escrow,7n]);
 for(let i=13;i<104;i++){await send(0,token,tokenAbi,'transfer',[accounts[i].address,10000n*10n**18n]);await send(0,usdc,stableAbi,'transfer',[accounts[i].address,10000000n]);await send(i,token,tokenAbi,'approve',[escrow,2n**256n-1n]);await send(i,usdc,stableAbi,'approve',[escrow,2n**256n-1n]);}
 for(let i=3;i<104;i++)await send(i,escrow,abi,'register',await registration(i,3n));
 await provider.request({method:'evm_increaseTime',params:[1201]});await provider.request({method:'evm_mine',params:[]});await send(0,escrow,abi,'requestEntropy',[3n]);for(let i=0;i<3;i++)await provider.request({method:'evm_mine',params:[]});
 const roster3=await read('roster',[3n]);await send(0,escrow,abi,'startEpoch',[3n,secret,roster3]);
 const a1=await read('arenaInfo',[3n,1n]),a2=await read('arenaInfo',[3n,2n]);
 assert.equal((await read('entryInfo',[3n,roster3[50]]))[1],1n);assert.equal((await read('entryInfo',[3n,roster3[51]]))[1],2n);
 assert.equal(a1.budget+a2.budget,100000007n);assert.equal(a1.budget,100000007n*51n/101n+1n);pass('101 entrants form 51/50 arenas with exact prize rounding');
 await send(0,escrow,abi,'finalizeArena',[3n,1n,winners,keccak256(secret),(await client.getBlock()).timestamp]);
 await send(0,usdc,stableAbi,'setBlocked',[winners[0],true]);await fails(0,escrow,abi,'claimUSDC',[3n,winners[0]]);
 assert.equal((await read('entryInfo',[3n,winners[0]]))[4],false);await send(0,escrow,abi,'claimUSDC',[3n,winners[1]]);await send(0,escrow,abi,'claimUSDC',[3n,winners[2]]);
 await send(0,usdc,stableAbi,'setBlocked',[winners[0],false]);await send(0,escrow,abi,'claimUSDC',[3n,winners[0]]);pass('blocked recipient cannot block other payouts and can retry');
 await fails(0,escrow,abi,'claimToken',[3n,winners[0]]);await provider.request({method:'evm_increaseTime',params:[7201]});await provider.request({method:'evm_mine',params:[]});
 await send(0,escrow,abi,'claimToken',[3n,winners[0]]);assert.equal((await read('epochInfo',[3n]))[0],2);pass('timeout token return works independently of another unresolved arena');
 await send(3,escrow,abi,'recoverArena',[3n,2n]);assert.equal((await read('arenaInfo',[3n,1n])).status,2);assert.equal(await read('availablePrize'),a2.budget);pass('invalid arena releases only its allocation and preserves valid results');
 console.log(`${checks} contract scenarios passed.`);
}finally{await provider.disconnect();}
