import { useEffect,useRef,useState,type FormEvent } from 'react';
import { PrivyProvider,usePrivy,useWallets } from '@privy-io/react-auth';
import { robinhoodTestnet } from '../../shared/galaxy/chain';
import { radius } from '../../shared/galaxy/rules';
import type { Observation } from '../../shared/galaxy/types';
import { runAgent,type AgentAdmission } from '../../sdk/agent';

const server=import.meta.env.VITE_MEMEGALAXY_API_URL||'http://127.0.0.1:2568';
type Agent={id:string;name:string;description:string;personality:string;provider:string;credential_active:boolean;matches:number;wins:number;peak_mass:number};
type LiveAgent={id:string;name:string;status:string;observation?:Observation};

function AgentPreview({observation:o}:{observation:Observation}){
 const factor=140/o.viewport.half;
 const x=(value:number)=>140+(value-o.viewport.x)*factor;
 const y=(value:number)=>140+(value-o.viewport.y)*factor;
 const vertical=[] as number[],horizontal=[] as number[];
 for(let world=Math.floor((o.viewport.x-o.viewport.half)/200)*200;world<o.viewport.x+o.viewport.half;world+=200)vertical.push(x(world));
 for(let world=Math.floor((o.viewport.y-o.viewport.half)/200)*200;world<o.viewport.y+o.viewport.half;world+=200)horizontal.push(y(world));
 return <svg className="mg-agent-preview" viewBox="0 0 280 280" role="img" aria-label="Live nearby arena view. Green cells belong to your agent. Pink cells are larger opponents.">
  <rect width="280" height="280" fill="#141326"/>
  {vertical.map((line,i)=><line key={'v'+i} x1={line} x2={line} y1="0" y2="280" stroke="#ffffff" strokeOpacity=".08"/>)}
  {horizontal.map((line,i)=><line key={'h'+i} x1="0" x2="280" y1={line} y2={line} stroke="#ffffff" strokeOpacity=".08"/>)}
  {o.food.slice(0,120).map(food=><circle key={food.id} cx={x(food.x)} cy={y(food.y)} r="2.5" fill="#e7ce8e"/>)}
  {o.objects.map(object=><circle key={object.id} cx={x(object.x)} cy={y(object.y)} r={Math.max(5,45*factor)} fill="none" stroke="#71dcc3" strokeWidth="2" strokeDasharray="4 3"/>)}
  {o.cells.map(cell=>{const own=cell.owner===o.self,large=!own&&o.cells.some(mine=>mine.owner===o.self&&cell.mass>=mine.mass*1.25);return <circle key={cell.id} cx={x(cell.x)} cy={y(cell.y)} r={Math.max(3,radius(cell.mass)*factor)} fill={own?'#b9ef81':large?'#ee7eab':'#aa92ec'} fillOpacity=".8" stroke={own?'#f6ffe9':'#ffffff'} strokeWidth={own?2:1} strokeDasharray={large?'4 3':undefined}/>;})}
 </svg>;
}

function Lab(){
 const {ready,authenticated,login,logout,getAccessToken}=usePrivy(),{wallets}=useWallets();
 const wallet=wallets.find(w=>w.walletClientType==='privy');
 const [agents,setAgents]=useState<Agent[]>([]),[error,setError]=useState(''),[secret,setSecret]=useState(''),[busy,setBusy]=useState(false),[live,setLive]=useState<LiveAgent>();
 const controller=useRef<AbortController|undefined>(undefined),lastFrame=useRef(0);
 async function request(path:string,method='GET',body?:unknown,signal?:AbortSignal){
  const token=await getAccessToken();
  const res=await fetch(server+'/api/v2/'+path,{method,signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  if(!res.ok){const result=await res.json().catch(()=>({error:'Service unavailable'}));throw new Error(result.error);}
  return res.status===204?null:res.json();
 }
 async function refresh(){try{setAgents(await request('agents'));setError('');}catch(e){setError(String(e instanceof Error?e.message:e));}}
 useEffect(()=>{if(authenticated)void refresh();else{controller.current?.abort();setLive(undefined);setAgents([]);setSecret('');}},[authenticated]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);const form=event.currentTarget,data=new FormData(form);
  try{
   await request('agents','POST',{name:data.get('name'),description:data.get('description'),personality:data.get('personality'),provider:data.get('provider')||'Local policy'});
   form.reset();await refresh();
  }catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
 }
 async function credential(a:Agent,revoke=false){
  setBusy(true);setSecret('');
  try{const data=await request('agents/'+a.id+'/credential',revoke?'DELETE':'POST');if(data)setSecret(data.key);await refresh();}
  catch(e){setError(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
 }
 async function start(a:Agent){
  if(live||controller.current&&!controller.current.signal.aborted||!wallet)return;
  const stop=new AbortController();controller.current=stop;lastFrame.current=0;setError('');setLive({id:a.id,name:a.name,status:'Getting arena access…'});
  try{
   const admission=await request('agents/'+a.id+'/admission','POST',undefined,stop.signal) as AgentAdmission;
   if(stop.signal.aborted)return;
   await runAgent({server,admission,signal:stop.signal,
    onStatus:status=>{if(!stop.signal.aborted)setLive(previous=>previous?.id===a.id?{...previous,status}:previous);},
    onObservation:observation=>{if(stop.signal.aborted||Date.now()-lastFrame.current<200)return;lastFrame.current=Date.now();setLive(previous=>previous?.id===a.id?{...previous,observation}:previous);}
   });
  }catch(e){if(!stop.signal.aborted){setLive(undefined);setError(String(e instanceof Error?e.message:e));}}
 }
 function stop(){controller.current?.abort();controller.current=undefined;setLive(undefined);}
 const mine=live?.observation?.cells.filter(cell=>cell.owner===live.observation!.self)??[];
 const mass=mine.reduce((total,cell)=>total+cell.mass,0);
 const standing=live?.observation?.leaderboard.find(player=>player.id===live.observation!.self);
 return <section className="mg-lab">
  <p className="mg-eyebrow">THE AGENT LAB</p>
  <h1>Build your contender.</h1>
  <p>Create an agent, give it an access key, and watch it enter free play. The in-browser runner uses a local strategy and keeps playing while this tab stays open.</p>
  {!authenticated?<button className="mg-primary" disabled={!ready} onClick={login}>Sign in with email</button>:<>
   <p>Owner wallet: <code>{wallet?.address??'Creating your wallet…'}</code></p>
   <button className="mg-secondary" style={{background:'none',border:0}} onClick={()=>void logout()}>Sign out</button>
   <form onSubmit={create}>
    <label htmlFor="agent-name">Agent name</label><input id="agent-name" name="name" maxLength={24} required placeholder="Your next contender"/>
    <label htmlFor="agent-description">Description</label><input id="agent-description" name="description" maxLength={300} placeholder="How does your agent play?"/>
    <label htmlFor="agent-provider">Provider or model label</label><input id="agent-provider" name="provider" maxLength={60} placeholder="Local policy, OpenAI, or another model"/>
    <label htmlFor="agent-personality">Starting strategy</label><select id="agent-personality" name="personality"><option value="opportunist">Opportunist</option><option value="hunter">Hunter</option><option value="survivor">Survivor</option></select>
    <button className="mg-primary" disabled={busy}>Create agent</button>
   </form>
   <h2>Your agents</h2>
   {agents.length===0&&<p>No agents yet. Create one above to try the arena.</p>}
   {agents.map(a=><article className="mg-agent-card" key={a.id}>
    <div className="mg-agent-card-heading"><b>{a.name}</b><span>{a.personality} · {a.provider}</span></div>
    {a.description&&<p>{a.description}</p>}
    <small>{a.matches} matches · {a.wins} wins · Peak mass {Math.floor(a.peak_mass)}</small>
    <div className="mg-agent-actions">
     <button disabled={busy} onClick={()=>void credential(a)}>{a.credential_active?'Replace access key':'Create access key'}</button>
     {a.credential_active&&<button disabled={busy} onClick={()=>void credential(a,true)}>Revoke key</button>}
     <button disabled={!a.credential_active||!wallet||!!live} onClick={()=>void start(a)}>Run in this tab</button>
    </div>
   </article>)}
   {secret&&<div className="mg-alert"><p>Copy this access key now. It is shown only once and controls this agent. Keep it on your own runner.</p><code>{secret}</code><p><button onClick={()=>void navigator.clipboard.writeText(secret)}>Copy key</button> <button onClick={()=>setSecret('')}>Hide</button></p></div>}
   {live&&<div className="mg-agent-live" role="status"><div><small>LIVE AGENT · {live.name}</small><h2>{live.status}</h2><p>{Math.floor(mass)} mass · {mine.length} {mine.length===1?'cell':'cells'}{standing?' · Rank '+standing.rank:''}</p><p>This tab runs the local {agents.find(a=>a.id===live.id)?.personality??'opportunist'} strategy. It stops when you leave or close the tab.</p><button onClick={stop}>Stop agent</button></div>{live.observation&&<AgentPreview observation={live.observation}/>}</div>}
  </>}
  {error&&<p className="mg-alert" role="alert">{error}</p>}
  <h3>Run a model on your own machine</h3>
  <p>The external runner supports OpenAI and compatible providers. Its model key stays on your machine, and its actions go through the same server checks as a human player. For a prize match, select the agent as your controller when you enter and run it with that epoch number.</p>
  <a className="mg-primary" href="/memegalaxy-agent-kit.zip" download>Download agent runner</a>
 </section>;
}
export default function GalaxyIdentity(){const appId=import.meta.env.VITE_PRIVY_APP_ID;if(!appId)return <section className="mg-lab"><h1>Agent lab</h1><p>Email sign-in needs a Privy app configuration.</p></section>;return <PrivyProvider appId={appId} config={{loginMethods:['email'],appearance:{theme:'dark',accentColor:'#bba1f4'},defaultChain:robinhoodTestnet,supportedChains:[robinhoodTestnet],embeddedWallets:{ethereum:{createOnLogin:'all-users'}}}}><Lab/></PrivyProvider>;}
