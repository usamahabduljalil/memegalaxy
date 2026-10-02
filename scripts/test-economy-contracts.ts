import assert from 'node:assert/strict';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,defineChain,encodeDeployData,encodeFunctionData,keccak256,toHex,type Address,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {compile} from './compile-contracts';
import {rewardWeek} from '../shared/galaxy/economy';
import {merkleTree,rewardLeaf,retirementTypes} from '../shared/galaxy/economy-chain';
const artifacts=compile(),provider=ganache.provider({logging:{quiet:true},chain:{chainId:31337},wallet:{totalAccounts:5}});
const accounts=Object.values(provider.getInitialAccounts()).map((a:any)=>privateKeyToAccount(a.secretKey as Hex));
const network=defineChain({id:31337,name:'Local',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://localhost']}}});
const rpc=createPublicClient({chain:network,transport:custom(provider as any),cacheTime:0}),wallets=accounts.map(account=>createWalletClient({account,chain:network,transport:custom(provider as any)}));
async function deploy(name:string,args:unknown[]=[]){const hash=await provider.request({method:'eth_sendTransaction',params:[{from:accounts[0].address,data:encodeDeployData({...artifacts[name],args}),gas:'0xe4e1c0'}]}) as Hex;const r=await rpc.getTransactionReceipt({hash});assert.equal(r.status,'success');return r.contractAddress!;}
async function send(i:number,address:Address,abi:any,fn:string,args:unknown[]=[]){const hash=await provider.request({method:'eth_sendTransaction',params:[{from:accounts[i].address,to:address,data:encodeFunctionData({abi,functionName:fn,args}),gas:'0x7a1200'}]}) as Hex;const r=await rpc.getTransactionReceipt({hash});assert.equal(r.status,'success',fn);return r;}
async function fails(i:number,address:Address,abi:any,fn:string,args:unknown[]=[]){await assert.rejects(()=>rpc.simulateContract({account:accounts[i],address,abi,functionName:fn,args}));}
try{
 const token=await deploy('TestMemeGalaxy',[accounts[0].address]),asset=await deploy('MockUSDC'),vault=await deploy('GalaxyHuntVault',[accounts[0].address,accounts[1].address]),retire=await deploy('GalaxyRetirement',[token,accounts[0].address,accounts[1].address]);
 const va=artifacts.GalaxyHuntVault.abi,ra=artifacts.GalaxyRetirement.abi,ta=artifacts.TestMemeGalaxy.abi,sa=artifacts.MockUSDC.abi;
 const read=(address:Address,abi:any,functionName:string,args:unknown[]=[])=>rpc.readContract({address,abi,functionName,args}) as Promise<any>;
 const week=BigInt(rewardWeek(Number((await rpc.getBlock()).timestamp)*1000).start-604800),values=[{wallet:accounts[2].address,amount:11n},{wallet:accounts[3].address,amount:19n},{wallet:accounts[4].address,amount:7n}];
 const tree=merkleTree(values.map((v,i)=>rewardLeaf(vault,asset,week,BigInt(i),v.wallet,v.amount,31337n)));
 await fails(1,vault,va,'publish',[asset,week,tree.root,37n]);await send(0,asset,sa,'transfer',[vault,100n]);await fails(2,vault,va,'publish',[asset,week,tree.root,37n]);await fails(1,vault,va,'publish',[asset,week+604800n,tree.root,37n]);await send(1,vault,va,'publish',[asset,week,tree.root,37n]);await fails(1,vault,va,'publish',[asset,week,tree.root,37n]);
 await fails(2,vault,va,'claim',[asset,week,0n,accounts[4].address,11n,tree.proof(0)]);await fails(2,vault,va,'claim',[asset,week,0n,accounts[2].address,12n,tree.proof(0)]);
 await send(0,asset,sa,'setBlocked',[accounts[2].address,true]);await fails(2,vault,va,'claim',[asset,week,0n,accounts[2].address,11n,tree.proof(0)]);assert.equal(await read(vault,va,'liability',[asset]),37n);await send(0,asset,sa,'setBlocked',[accounts[2].address,false]);
 for(let i=0;i<values.length;i++){const v=values[i];await send(4,vault,va,'claim',[asset,week,BigInt(i),v.wallet,v.amount,tree.proof(i)]);assert.equal(await read(asset,sa,'balanceOf',[v.wallet]),v.amount);}
 await fails(2,vault,va,'claim',[asset,week,0n,accounts[2].address,11n,tree.proof(0)]);assert.equal(await read(vault,va,'liability',[asset]),0n);console.log('PASS funded immutable weekly allocations, unlock time, signer isolation, recipient binding, odd Merkle proofs, duplicate claims and conservation');
 await send(0,token,ta,'transfer',[accounts[2].address,1000n]);await send(2,token,ta,'approve',[retire,1000n]);await send(0,retire,ra,'configure',[1n,true]);const owner=keccak256(toHex('owner')),id=keccak256(toHex('quote')),expiry=(await rpc.getBlock()).timestamp+300n;
 const message={id,wallet:accounts[2].address,owner,amount:100n,credits:5n,version:1n,expiry};const signature=await wallets[1].signTypedData({domain:{name:'GalaxyRetirement',version:'1',chainId:31337,verifyingContract:retire},types:retirementTypes,primaryType:'Retire',message});const args=[id,owner,100n,5n,1n,expiry,signature];
 await fails(3,retire,ra,'retire',args);await fails(2,retire,ra,'retire',[id,owner,100n,6n,1n,expiry,signature]);const supply=await read(token,ta,'totalSupply');await send(2,retire,ra,'retire',args);await fails(2,retire,ra,'retire',args);assert.equal(await read(token,ta,'balanceOf',[retire]),100n);assert.equal(await read(token,ta,'totalSupply'),supply);await fails(2,retire,ra,'configure',[2n,true]);await send(0,retire,ra,'configure',[2n,false]);await fails(2,retire,ra,'retire',args);assert(!ra.some((a:any)=>a.type==='function'&&/withdraw|rescue|sweep/.test(a.name)));assert(!va.some((a:any)=>a.type==='function'&&/withdraw|rescue|sweep/.test(a.name)));console.log('PASS permanent retirement, exact quote binding, signer roles, replay protection, rate invalidation, no withdrawal surface and unchanged supply');
}finally{await provider.disconnect();}
