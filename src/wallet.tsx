import { createContext,useContext,useMemo,type ReactNode } from 'react';
import GalaxySession,{useGalaxySession} from './galaxy/GalaxySession';
import { createPublicClient,createWalletClient,custom,http,encodeFunctionData,erc20Abi,formatUnits,type Address,type Hex } from 'viem';
import { arcTestnet } from '../shared/chain';

export const rpc=createPublicClient({chain:arcTestnet,transport:http(import.meta.env.VITE_RPC_URL||arcTestnet.rpcUrls.default.http[0])});
export const addresses={escrow:import.meta.env.VITE_ESCROW_ADDRESS as Address|undefined,dominate:import.meta.env.VITE_DOMINATE_ADDRESS as Address|undefined,usdc:import.meta.env.VITE_USDC_ADDRESS as Address|undefined,faucet:import.meta.env.VITE_FAUCET_ADDRESS as Address|undefined};
type WalletContext={configured:boolean;ready:boolean;authenticated:boolean;address?:Address;login:()=>void;logout:()=>Promise<void>;getToken:()=>Promise<string|null>;send:(to:Address,data:Hex)=>Promise<Hex>};
const missing=async()=>{throw new Error('Wallet sign-in is not configured yet. Practice is available now.');};
const context=createContext<WalletContext>({configured:false,ready:true,authenticated:false,login:()=>{},logout:async()=>{},getToken:async()=>null,send:missing});
function Connected({children}:{children:ReactNode}){const session=useGalaxySession(),wallet=session.wallet;const value=useMemo<WalletContext>(()=>({configured:true,ready:session.ready,authenticated:session.authenticated,address:wallet?.address,login:session.connect,logout:session.disconnect,getToken:session.getAccessToken,send:async(to,data)=>{if(!wallet)throw new Error('Connect the original external wallet.');await wallet.switchChain(arcTestnet.id);const client=createWalletClient({account:wallet.address,chain:arcTestnet,transport:custom(await wallet.getEthereumProvider())});const hash=await client.sendTransaction({to,data});const receipt=await rpc.waitForTransactionReceipt({hash,timeout:90000});if(receipt.status!=='success')throw new Error('Transaction reverted.');return hash;}}),[session,wallet]);return <context.Provider value={value}>{children}</context.Provider>;}
export function WalletProvider({children}:{children:ReactNode}){return <GalaxySession><Connected>{children}</Connected></GalaxySession>;}
export function useWallet(){return useContext(context);}
export async function allowance(wallet:Address,asset:Address,spender:Address){return rpc.readContract({address:asset,abi:erc20Abi,functionName:'allowance',args:[wallet,spender]});}
export function approvalData(spender:Address,amount:bigint){return encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[spender,amount]});}
export async function estimateGasCost(wallet:Address,transactions:{to:Address;data:Hex;fallbackGas?:bigint}[]){const price=await rpc.getGasPrice();let gas=0n,estimated=false;for(const t of transactions){try{gas+=await rpc.estimateGas({account:wallet,to:t.to,data:t.data});}catch(error){if(!t.fallbackGas)throw error;gas+=t.fallbackGas;estimated=true;}}return {amount:gas*price*12n/10n,approximate:estimated,text:formatUnits(gas*price*12n/10n,18)};}
