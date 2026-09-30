import { createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode } from 'react';
import { PrivyProvider,usePrivy,useWallets } from '@privy-io/react-auth';
import { robinhoodTestnet } from '../../shared/galaxy/chain';
export const galaxyApi=import.meta.env.VITE_MEMEGALAXY_API_URL||'http://127.0.0.1:2568';
export type PrizeState={enabled:boolean;escrow?:`0x${string}`;token?:`0x${string}`;usdc?:`0x${string}`;faucet?:`0x${string}`;pool:string;timing?:{underfilledRolloverMinutes:number;randomness:string};epoch:null|{id:string;status:number;deadline:number;count:number;recovery:number;finished:number;arenas:number}};
type Wallet=ReturnType<typeof useWallets>['wallets'][number];
type Session={ready:boolean;authenticated:boolean;wallet?:Wallet;wallets:Wallet[];connect:()=>void;disconnect:()=>Promise<void>;selectWallet:(wallet:Wallet)=>Promise<void>;api:(path:string,method?:string,body?:unknown,signal?:AbortSignal)=>Promise<any>;getAccessToken:()=>Promise<string|null>;lobby?:PrizeState;refreshLobby:()=>Promise<void>;error:string};
export const GalaxySessionContext=createContext<Session|null>(null);
export function useGalaxySession(){const value=useContext(GalaxySessionContext);if(!value)throw new Error('Galaxy session is missing');return value;}
function SessionProvider({children}:{children:ReactNode}){
 const {ready,authenticated,login,logout,getAccessToken}=usePrivy(),{wallets}=useWallets();
 const [selected,setSelected]=useState(()=>localStorage.getItem('mg-selected-wallet')??''),[error,setError]=useState(''),[lobby,setLobby]=useState<PrizeState>();
 const wallet=wallets.find(w=>w.address.toLowerCase()===selected.toLowerCase())??wallets.find(w=>w.walletClientType==='privy')??wallets[0];
 const api=useCallback(async(path:string,method='GET',body?:unknown,signal?:AbortSignal)=>{const token=await getAccessToken();const res=await fetch(`${galaxyApi}/api/v2/${path}`,{method,signal,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(wallet?{'X-Memegalaxy-Wallet':wallet.address}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});if(res.status===204)return null;const result=await res.json();if(!res.ok)throw new Error(result.error??'Service unavailable');return result;},[getAccessToken,wallet?.address]);
 const refreshLobby=useCallback(async()=>{try{const res=await fetch(galaxyApi+'/api/v2/prizes');if(!res.ok)throw new Error();setLobby(await res.json());}catch{setError('Live match information is temporarily unavailable.');}},[]);
 useEffect(()=>{void refreshLobby();const id=setInterval(()=>void refreshLobby(),8000);return()=>clearInterval(id);},[refreshLobby]);
 useEffect(()=>{if(authenticated&&wallet)void api('session/wallet','POST',{}).then(()=>setError('')).catch(e=>setError(e.message));},[authenticated,wallet?.address,api]);
 async function selectWallet(next:Wallet){const token=await getAccessToken();const res=await fetch(galaxyApi+'/api/v2/session/wallet',{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Memegalaxy-Wallet':next.address,'Content-Type':'application/json'},body:'{}'});if(!res.ok){setError((await res.json()).error);return;}localStorage.setItem('mg-selected-wallet',next.address);setSelected(next.address);setError('');}
 const value=useMemo(()=>({ready,authenticated,wallet,wallets,connect:()=>login(),disconnect:async()=>{await logout();setSelected('');localStorage.removeItem('mg-selected-wallet');},selectWallet,api,getAccessToken,lobby,refreshLobby,error}),[ready,authenticated,wallet,wallets,api,getAccessToken,lobby,refreshLobby,error]);
 return <GalaxySessionContext.Provider value={value}>{children}</GalaxySessionContext.Provider>;
}
export default function GalaxySession({children}:{children:ReactNode}){const appId=import.meta.env.VITE_PRIVY_APP_ID;if(!appId)return <div className="mg-notice">Wallet sign-in is not configured.</div>;return <PrivyProvider appId={appId} config={{loginMethods:['wallet','email'],appearance:{theme:'dark',accentColor:'#a78bfa',walletChainType:'ethereum-only'},defaultChain:robinhoodTestnet,supportedChains:[robinhoodTestnet],embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'}}}}><SessionProvider>{children}</SessionProvider></PrivyProvider>;}
