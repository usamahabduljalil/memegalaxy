import {createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode} from 'react';
import {PrivyProvider,usePrivy,useWallets,useConnectWallet,useLoginWithSiwe,useLinkWithSiwe,useLogin} from '@privy-io/react-auth';
import {createWalletClient,custom,getAddress} from 'viem';
import {mainnet} from 'viem/chains';
import {Wallet,Mail,X,ShieldCheck} from 'lucide-react';
import {robinhoodTestnet} from '../../shared/galaxy/chain';
import {useDialogFocus} from './useDialogFocus';
import {walletPlayerName} from '../../shared/galaxy/player-name';
export const galaxyApi=import.meta.env.VITE_MEMEGALAXY_API_URL||'http://127.0.0.1:2568';
export type PrizeState={enabled:boolean;escrow?:`0x${string}`;token?:`0x${string}`;usdc?:`0x${string}`;faucet?:`0x${string}`;pool:string;timing?:{underfilledRolloverMinutes:number;randomness:string};epoch:null|{id:string;status:number;deadline:number;count:number;recovery:number;finished:number;arenas:number}};
type Wallet=ReturnType<typeof useWallets>['wallets'][number];
type Session={playerName:string;refreshProfile:(signal?:AbortSignal)=>Promise<void>;ready:boolean;authenticated:boolean;wallet?:Wallet;wallets:Wallet[];connect:()=>void;linkWallet:()=>void;disconnect:()=>Promise<void>;selectWallet:(wallet:Wallet)=>Promise<void>;api:(path:string,method?:string,body?:unknown,signal?:AbortSignal)=>Promise<any>;getAccessToken:()=>Promise<string|null>;lobby?:PrizeState;refreshLobby:()=>Promise<void>;error:string};
export const GalaxySessionContext=createContext<Session|null>(null);
export function useGalaxySession(){const value=useContext(GalaxySessionContext);if(!value)throw new Error('Galaxy session is missing');return value;}
function SessionProvider({children}:{children:ReactNode}){
 const {ready,authenticated,logout,getAccessToken}=usePrivy(),{wallets}=useWallets();
 const [selected,setSelected]=useState(()=>localStorage.getItem('mg-selected-wallet')??''),[error,setError]=useState(''),[lobby,setLobby]=useState<PrizeState>(),[chooser,setChooser]=useState(false),[verifying,setVerifying]=useState(false);
 const [profile,setProfile]=useState<{wallet:string;name:string}|null>(null);
 const siwe=useLoginWithSiwe(),link=useLinkWithSiwe();
 const {login}=useLogin({onError:code=>setError(code==='exited_auth_flow'?'':'Email sign-in failed ('+code+'). Please retry.')});
 const {connectWallet}=useConnectWallet({onError:()=>setError('Wallet connection was cancelled or unavailable. Please retry.'),onSuccess:async({wallet:connected})=>{
  if(!('getEthereumProvider' in connected)){setError('Choose the Ethereum account in your wallet.');return;}
  setVerifying(true);setError('');setChooser(true);
  try{
   const address=getAddress(connected.address),proof=authenticated?link:siwe;
   // EOA ownership proof is independent of Robinhood game transactions. A supported SIWE
   // verification network avoids custom-testnet RPC verification failures across wallet clients.
   const message=await proof.generateSiweMessage({address,chainId:'eip155:1'});
   const client=createWalletClient({account:address,transport:custom(await connected.getEthereumProvider())});
   const signature=await client.signMessage({message});
   if(authenticated)await link.linkWithSiwe({message,signature,chainId:'eip155:1',walletClientType:connected.walletClientType,connectorType:connected.connectorType});
   else {await siwe.loginWithSiwe({message,signature,walletClientType:connected.walletClientType,connectorType:connected.connectorType});localStorage.setItem('mg-selected-wallet',address);setSelected(address);}
   setChooser(false);
  }catch(e){const reason=(e as Error).message??'Signature verification failed';setError('Wallet sign-in failed: '+reason.slice(0,240));}
  finally{setVerifying(false);}
 }});
 useDialogFocus(chooser,()=>{if(!verifying)setChooser(false);});
 const wallet=wallets.find(w=>w.address.toLowerCase()===selected.toLowerCase())??wallets.find(w=>w.walletClientType==='privy')??wallets[0];
 const api=useCallback(async(path:string,method='GET',body?:unknown,signal?:AbortSignal)=>{const token=await getAccessToken();const res=await fetch(`${galaxyApi}/api/v2/${path}`,{method,signal,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(wallet?{'X-Memegalaxy-Wallet':wallet.address}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});if(res.status===204)return null;const result=await res.json();if(!res.ok)throw new Error(result.error??'Service unavailable');return result;},[getAccessToken,wallet?.address]);
 const refreshProfile=useCallback(async(signal?:AbortSignal)=>{if(!authenticated||!wallet){setProfile(null);return;}const result=await api('profile','GET',undefined,signal);if(!signal?.aborted)setProfile({wallet:wallet.address.toLowerCase(),name:result.name});},[authenticated,api,wallet?.address]);
 useEffect(()=>{const abort=new AbortController();setProfile(null);void refreshProfile(abort.signal).catch(()=>{});return()=>abort.abort();},[refreshProfile]);
 const playerName=profile&&wallet&&profile.wallet===wallet.address.toLowerCase()?profile.name:walletPlayerName(wallet?.address);
 const refreshLobby=useCallback(async()=>{try{const res=await fetch(galaxyApi+'/api/v2/prizes');if(!res.ok)throw new Error();setLobby(await res.json());}catch{setError('Live match information is temporarily unavailable.');}},[]);
 useEffect(()=>{void refreshLobby();const id=setInterval(()=>void refreshLobby(),8000);return()=>clearInterval(id);},[refreshLobby]);
 useEffect(()=>{if(authenticated&&wallet)void api('session/wallet','POST',{}).catch(e=>setError(e.message));},[authenticated,wallet?.address,api]);
 async function selectWallet(next:Wallet){const token=await getAccessToken();const res=await fetch(galaxyApi+'/api/v2/session/wallet',{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Memegalaxy-Wallet':next.address,'Content-Type':'application/json'},body:'{}'});if(!res.ok){setError((await res.json()).error);return;}localStorage.setItem('mg-selected-wallet',next.address);setSelected(next.address);setError('');}
 const value=useMemo(()=>({playerName,refreshProfile,ready,authenticated,wallet,wallets,connect:()=>{setError('');setChooser(true);},linkWallet:()=>{setError('');connectWallet();},disconnect:async()=>{await logout();setProfile(null);setSelected('');setError('');localStorage.removeItem('mg-selected-wallet');},selectWallet,api,getAccessToken,lobby,refreshLobby,error}),[playerName,refreshProfile,ready,authenticated,wallet,wallets,api,getAccessToken,lobby,refreshLobby,error,connectWallet]);
 return <GalaxySessionContext.Provider value={value}>{children}{chooser&&<div className="mg-dialog-backdrop"><section className="mg-dialog mg-connect-dialog" role="dialog" aria-modal="true" aria-labelledby="mg-connect-title"><div className="mg-card-top"><h2 id="mg-connect-title">{verifying?'Verify your wallet':'Enter the galaxy'}</h2><button className="mg-button icon" aria-label="Close connection" disabled={verifying} onClick={()=>setChooser(false)}><X size={20}/></button></div><p>Choose your external wallet or use the email wallet you already own.</p>{error&&<div className="mg-notice error" role="alert">{error}</div>}{verifying?<div className="mg-signing-state"><ShieldCheck size={32}/><strong>Confirm the ownership message in your wallet</strong><p>No transaction, deposit, or gas is involved.</p></div>:<div className="mg-stack"><button className="mg-button primary" onClick={()=>{setChooser(false);connectWallet();}}><Wallet size={18}/>Connect external wallet</button><button className="mg-button secondary" onClick={()=>{setChooser(false);login({loginMethods:['email']});}}><Mail size={18}/>Continue with email</button><small className="mg-inline-note">Gameplay and financial transactions stay on Robinhood testnet. Email users can link an external wallet from the account menu.</small></div>}</section></div>}</GalaxySessionContext.Provider>;
}
export default function GalaxySession({children}:{children:ReactNode}){const appId=import.meta.env.VITE_PRIVY_APP_ID;if(!appId)return <div className="mg-notice">Wallet sign-in is not configured.</div>;return <PrivyProvider appId={appId} config={{loginMethods:['wallet','email'],appearance:{theme:'dark',accentColor:'#a78bfa',walletChainType:'ethereum-only'},defaultChain:robinhoodTestnet,supportedChains:[robinhoodTestnet,mainnet],embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'}}}}><SessionProvider>{children}</SessionProvider></PrivyProvider>;}
