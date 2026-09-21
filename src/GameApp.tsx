import { ArrowUpRight,Check,ChevronRight,CircleDot,Clock3,Copy,Crosshair,ExternalLink,HelpCircle,LoaderCircle,LogOut,RotateCcw,ShieldCheck,Sparkles,Trophy,Volume2,VolumeX,Wallet,X,Zap } from 'lucide-react';

import { useCallback,useEffect,useRef,useState } from 'react';

import type { Room } from 'colyseus.js';

import { encodeFunctionData,erc20Abi,formatUnits,parseUnits,type Hex,type Address } from 'viem';

import Arena from './Arena';

import RecoveryControls from './RecoveryControls';

import { applyFrame } from '../shared/wire';

import { addresses,allowance,approvalData,estimateGasCost,rpc,useWallet } from './wallet';

import { escrowAbi,faucetAbi } from '../shared/chain';

import { rankPlayers,type GameState,type Vec } from '../shared/game';

type Lobby={status:string;message?:string;id?:string;deadline?:number;count:number;pool:string;entryEnabled?:boolean;arenas?:any[]};

const API=import.meta.env.VITE_API_URL||'http://localhost:2567',WS=import.meta.env.VITE_WS_URL||API.replace(/^http/,'ws');

const money=(raw:string|bigint)=>Number(formatUnits(BigInt(raw),6)).toLocaleString(undefined,{maximumFractionDigits:2});

const short=(s:string)=>`${s.slice(0,6)}…${s.slice(-4)}`;

const duration=(s:number)=>`${Math.floor(Math.max(0,s)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,s)%60).toString().padStart(2,'0')}`;

const initialLobby:Lobby={status:'unavailable',count:0,pool:'0',message:'Connecting to the game service…'};

export default function GameApp({initialPractice=false}:{initialPractice?:boolean}){

  const wallet=useWallet();

  const [lobby,setLobby]=useState<Lobby>(initialLobby),[me,setMe]=useState<any>(null),[mode,setMode]=useState<'preview'|'practice'|'online'>('preview'),[runId,setRunId]=useState(0),[stats,setStats]=useState<GameState>(),[snapshot,setSnapshot]=useState<GameState>(),[playerId,setPlayerId]=useState('you'),[deposit,setDeposit]=useState('2000'),[modal,setModal]=useState<'rules'|'wallet'|'confirm'|null>(null),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[muted,setMuted]=useState(()=>localStorage.getItem('bigcircle-muted')!=='false'),[now,setNow]=useState(Date.now()),[balances,setBalances]=useState<{dominate:bigint;usdc:bigint}|null>(null),[prepared,setPrepared]=useState<any>(null),[displayName,setDisplayName]=useState(''),[copied,setCopied]=useState(false);

  const room=useRef<Room|null>(null),sequence=useRef(0),profileLoaded=useRef(''),mounted=useRef(true),modalRef=useRef<HTMLElement>(null);

  const request=useCallback(async(path:string,options:RequestInit={})=>{const token=await wallet.getToken();const response=await fetch(`${API}${path}`,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...options.headers},signal:AbortSignal.timeout(12000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'Request failed');return data;},[wallet.getToken]);

  const refresh=useCallback(async()=>{try{const response=await fetch(`${API}/api/lobby`,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const next=await response.json();if(mounted.current)setLobby(next);}catch{if(mounted.current)setLobby({...initialLobby,message:'Practice is open. The funded game service is not connected yet.'});}if(wallet.authenticated){try{const profile=await request('/api/me');if(mounted.current){setMe(profile);if(profileLoaded.current!==profile.userId){setDisplayName(profile.name);profileLoaded.current=profile.userId;}}}catch{/* Account actions report errors separately. */}}},[wallet.authenticated,request]);

  const refreshBalances=useCallback(async()=>{if(!wallet.address)return;try{const [dominate,usdc]=await Promise.all([addresses.dominate?rpc.readContract({address:addresses.dominate,abi:erc20Abi,functionName:'balanceOf',args:[wallet.address]}):0n,addresses.usdc?rpc.readContract({address:addresses.usdc,abi:erc20Abi,functionName:'balanceOf',args:[wallet.address]}):0n]);if(mounted.current)setBalances({dominate,usdc});}catch{setNotice('Wallet balances could not refresh. Please retry.');}},[wallet.address]);

  useEffect(()=>{mounted.current=true;void refresh();const t=setInterval(()=>void refresh(),5000),clock=setInterval(()=>setNow(Date.now()),1000);return()=>{mounted.current=false;clearInterval(t);clearInterval(clock);};},[refresh]);

  useEffect(()=>{void refreshBalances();},[refreshBalances]);

  useEffect(()=>()=>{void room.current?.leave();},[]);

  useEffect(()=>{localStorage.setItem('bigcircle-muted',String(muted));},[muted]);

  useEffect(()=>{if(!modal)return;const previous=document.activeElement as HTMLElement;modalRef.current?.querySelector<HTMLElement>('button,input,a')?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)setModal(null);if(e.key==='Tab'){const els=Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled)')??[]);const first=els[0],last=els[els.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};},[modal,busy]);

  const action=async(label:string,fn:()=>Promise<void>)=>{if(busy)return;setBusy(label);setNotice('');try{await fn();}catch(error){setNotice(error instanceof Error?error.message:'Something went wrong. Please try again.');}finally{setBusy('');}};

  const practice=useCallback(()=>{void room.current?.leave();room.current=null;setStats(undefined);setSnapshot(undefined);setPlayerId('you');setMode('practice');setRunId(v=>v+1);setModal(null);document.getElementById('arena')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});},[]);

  useEffect(()=>{if(initialPractice)practice();},[initialPractice,practice]);
  const lobbyToolState=useRef(lobby);
  useEffect(()=>{lobbyToolState.current=lobby;},[lobby]);
  useEffect(()=>{const context=(document as any).modelContext;if(!context?.registerTool)return;const control=new AbortController();for(const tool of [{name:'read_big_circle_lobby',description:'Read the visible testnet lobby.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:(input:unknown)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object');return lobbyToolState.current;}},{name:'start_big_circle_practice',description:'Start free practice with bots. No wallets or funds are used.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:(input:unknown)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object');practice();return {mode:'practice',fundsUsed:false};}}])void Promise.resolve(context.registerTool(tool,{signal:control.signal})).catch(()=>{});return()=>control.abort();},[practice]);

  const intent=useCallback((v:Vec)=>{room.current?.send('input',{...v,seq:++sequence.current});},[]);

  async function joinArena(id:string){await action('Connecting to arena',async()=>{const a=await request(`/api/arenas/${id}/admission`,{method:'POST'});const {Client}=await import('colyseus.js');await room.current?.leave();const connection=await new Client(WS).joinById(a.roomId,{token:a.token});room.current=connection;sequence.current=0;setSnapshot(undefined);setStats(undefined);setPlayerId(wallet.address?.toLowerCase()||'');setMode('online');setRunId(v=>v+1);connection.onMessage('identity',d=>setPlayerId(d.id));connection.onMessage('snapshot',setSnapshot);connection.onMessage('frame',frame=>setSnapshot(previous=>previous?applyFrame(previous,frame):previous));connection.onMessage('result',()=>void refresh());connection.onMessage('invalid',d=>{setNotice(d.message);setMode('preview');});connection.onLeave(code=>{if(room.current===connection){room.current=null;setNotice(code===1000?'Arena connection closed.':'Connection lost. Rejoin within 20 seconds; your circle remains vulnerable.');}});});}

  async function prepareEntry(){if(!wallet.configured){setNotice('Email wallets will open once Privy is configured. You can practice now.');return;}if(!wallet.authenticated){wallet.login();return;}await action('Preparing entry',async()=>{

    if(!addresses.escrow||!addresses.dominate||!addresses.usdc||!wallet.address)throw new Error('Testnet contracts are not configured yet.');

    if(!/^\d+(\.\d{1,18})?$/.test(deposit))throw new Error('Enter a valid token amount.');const amount=parseUnits(deposit,18);if(amount<1000n*10n**18n)throw new Error('The minimum deposit is 1,000 DOMINATE.');

    const [tokenBalance,stableBalance]=await Promise.all([rpc.readContract({address:addresses.dominate,abi:erc20Abi,functionName:'balanceOf',args:[wallet.address]}),rpc.readContract({address:addresses.usdc,abi:erc20Abi,functionName:'balanceOf',args:[wallet.address]})]);if(tokenBalance<amount)throw new Error('Not enough test DOMINATE. Open your wallet to claim test tokens.');if(stableBalance<1000000n)throw new Error('You need at least 1 test USDC plus transaction gas.');

    const entry=await request('/api/entry/authorize',{method:'POST',body:JSON.stringify({deposit})});const txs:{to:Address;data:Hex;fallbackGas?:bigint}[]=[];

    if(await allowance(wallet.address,addresses.dominate,addresses.escrow)<amount)txs.push({to:addresses.dominate,data:approvalData(addresses.escrow,amount)});

    if(await allowance(wallet.address,addresses.usdc,addresses.escrow)<1000000n)txs.push({to:addresses.usdc,data:approvalData(addresses.escrow,1000000n)});

    txs.push({to:addresses.escrow,data:encodeFunctionData({abi:escrowAbi,functionName:'register',args:[BigInt(entry.epoch),entry.userId,BigInt(entry.amount),BigInt(entry.expiry),entry.signature]}),fallbackGas:450000n});

    const gas=await estimateGasCost(wallet.address,txs);if(await rpc.getBalance({address:wallet.address})<gas.amount+10n**18n)throw new Error('Add more test USDC for the entry fee and estimated gas.');setPrepared({entry,txs,gas});setModal('confirm');

  });}

  async function confirmEntry(){await action('Confirm each wallet transaction',async()=>{if(!prepared||Number(prepared.entry.expiry)*1000<=Date.now())throw new Error('Your entry quote expired. Prepare a new entry.');for(const tx of prepared.txs)await wallet.send(tx.to,tx.data);setModal(null);setPrepared(null);setNotice('Entry confirmed on Arc. Your tokens are held in escrow.');await refresh();await refreshBalances();});}

  const entry=me?.entries?.find((e:any)=>String(e.epoch_id)===lobby.id),meCell=stats?.players.find(p=>p.id===playerId),ranking=stats?rankPlayers(stats):[],rank=ranking.findIndex(p=>p.id===playerId)+1;

  async function cancelEntry(){await action('Returning your entry',async()=>{if(!entry||!addresses.escrow)throw new Error('No active entry.');await wallet.send(addresses.escrow,encodeFunctionData({abi:escrowAbi,functionName:'cancel',args:[BigInt(entry.epoch_id)]}));setNotice('Your deposit and entry fee have been returned.');await refresh();await refreshBalances();});}

  async function claim(epoch:string,kind:'claimToken'|'claimUSDC'){await action('Claiming from escrow',async()=>{if(!addresses.escrow||!wallet.address)throw new Error('Wallet not ready');await wallet.send(addresses.escrow,encodeFunctionData({abi:escrowAbi,functionName:kind,args:[BigInt(epoch),wallet.address]}));setNotice('Claim confirmed.');await refresh();await refreshBalances();});}

  async function recover(epoch:string,arena:number){await action('Recovering timed-out arena',async()=>{if(!addresses.escrow)throw new Error('Escrow unavailable');await wallet.send(addresses.escrow,encodeFunctionData({abi:escrowAbi,functionName:'recoverArena',args:[BigInt(epoch),BigInt(arena)]}));setNotice('Arena recovered. Its entry fees and deposits can now be claimed.');await refresh();});}

  return <div className="app"><header><a className="brand" href="#" aria-label="Big Circle home"><span className="brand-symbol"><CircleDot size={30}/></span> BIG CIRCLE <span className="beta">BETA</span></a><nav><button className="nav-active" onClick={()=>document.getElementById('arena')?.scrollIntoView({block:'center'})}>Play</button><button onClick={()=>setModal('rules')}>How to play</button></nav><div className="header-right"><span className="network">◈ Arc testnet</span><button className="wallet-btn" onClick={()=>{setModal('wallet');void refreshBalances();}}><Wallet size={16}/>{wallet.address?short(wallet.address):'Connect wallet'}</button></div></header>

    <main><div className="page-heading"><div><div className="eyebrow">SMALL CIRCLE. BIG AMBITIONS.</div><h1>Own your orbit<span>.</span></h1><p>Outmaneuver. Absorb. Be the last circle standing.</p></div><div className="test-tag"><ShieldCheck size={17}/><span>All skill. Only test tokens.<small>Arc testnet preview</small></span></div></div>

    {notice&&<div className="notice" role="status"><span>{notice}</span><button aria-label="Dismiss message" onClick={()=>setNotice('')}><X size={17}/></button></div>}

    <div className="game-layout"><section className="arena-panel" id="arena"><div className="arena-toolbar"><span className="arena-title"><CircleDot size={17}/> THE BIG CIRCLE</span><span className="preview-label">{mode==='practice'?'PRACTICE · BOTS':mode==='online'?`EPOCH ${lobby.id}`:'ARENA PREVIEW'}</span><button aria-label={muted?'Enable sound':'Mute sound'} onClick={()=>setMuted(!muted)}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button></div>

    <div className="arena-stage"><Arena mode={mode} runId={runId} playerId={playerId} snapshot={snapshot} muted={muted} onStats={setStats} onInput={intent}/>{mode!=='preview'&&stats&&<div className="match-hud"><span><Clock3 size={14}/>{duration(600-stats.elapsed)}</span><span>{stats.players.filter(p=>p.alive).length} remaining</span><span>{meCell?.alive?`#${rank}`:'Spectating'}</span></div>}{mode==='preview'&&<button className="canvas-play" onClick={practice}><Crosshair size={17}/> Jump into practice <ChevronRight size={17}/></button>}

    {stats?.finished&&<div className="result-overlay"><div><Trophy size={34}/><div className="eyebrow">{mode==='practice'?'PRACTICE COMPLETE':'ARENA COMPLETE'}</div><h2>{rank===1?'That’s your circle.':`You placed #${rank}`}</h2><p>{mode==='practice'?'No tokens used. Every round is a fresh start.':'Results are being settled on Arc. Your deposit stays protected.'}</p><ol>{ranking.slice(0,3).map((p,i)=><li key={p.id}><span>{i+1}. {p.id===playerId?'YOU':p.name}</span><b>{Math.floor(p.mass).toLocaleString()} mass</b></li>)}</ol><button className="primary" onClick={practice}><RotateCcw size={16}/> Play practice again</button><button className="subtle-button" onClick={()=>{setMode('preview');setStats(undefined);}}>Back to lobby</button></div></div>}</div>

    <div className="arena-bottom"><span><span className="legend-dot"/> {mode==='preview'?'Your circle':`${Math.floor(meCell?.mass??0).toLocaleString()} mass`}</span><span><Zap size={14}/> {meCell&&meCell.boostUntil>(stats?.elapsed??0)?`${Math.ceil(meCell.boostUntil-stats!.elapsed)}s boost`:'Speed boost'}</span><span><Sparkles size={14}/> Mass gift</span><span className="align-right">{mode==='practice'?'Practice · no tokens used':'10 min · Last circle wins'}</span></div></section>

    <aside><section className="join-card"><div className="card-heading"><span className="eyebrow">{lobby.status==='running'?'EPOCH IN PLAY':'NEXT EPOCH'}{lobby.id?` / ${lobby.id}`:''}</span><span className="status-pill">TESTNET</span></div><div className="pool-label">Epoch prize pool <span>TEST USDC</span></div><div className="pool-amount">{['unavailable','unconfigured'].includes(lobby.status)?'—':money(lobby.pool)}<small> USDC</small></div><p className="muted">{lobby.status==='registration'?`Starts in ${duration((lobby.deadline??0)-now/1000)}`:lobby.status==='running'?'Allocated across independent arenas':lobby.message||'Waiting for the next epoch'}</p><div className="payouts"><span><Trophy size={14}/> 1st <b>50%</b></span><span>2nd <b>30%</b></span><span>3rd <b>20%</b></span></div><div className="join-rule"><span>Players registered</span><b>{lobby.count} / 500</b></div><div className="progress"><i style={{width:`${Math.min(100,lobby.count/5)}%`}}/></div><small className="muted">10 players + 100 test USDC to start</small>

    <label className="deposit-label" htmlFor="deposit">Your deposit <span>$DOMINATE</span></label><div className="deposit-input"><input id="deposit" value={deposit} onChange={e=>setDeposit(e.target.value)} inputMode="decimal" disabled={!!entry||!!busy} aria-describedby="deposit-help"/><button onClick={()=>setDeposit('4000')} disabled={!!entry||!!busy}>4,000 MAX SIZE</button></div><p id="deposit-help" className="input-hint">{Number(deposit)>4000?'Above 4,000 tokens adds no starting advantage.':`Starting mass: ${Math.min(4000,Math.max(0,Number(deposit)||0)).toLocaleString()} · tokens return after play`}</p><div className="entry-row"><span>Entry fee</span><b>1 USDC + gas</b></div>

    {entry?<><div className="registered"><Check size={17}/> {Number(formatUnits(BigInt(entry.deposit),18)).toLocaleString()} tokens in escrow</div>{lobby.status==='registration'?<button className="primary" onClick={cancelEntry} disabled={!!busy}>Cancel & refund</button>:entry.arena_id&&entry.arena_status==='active'?<button className="primary" onClick={()=>joinArena(String(entry.arena_id))} disabled={!!busy}>Enter your arena <ArrowUpRight size={18}/></button>:<p className="muted">{lobby.status==='running'?'Preparing your arena…':'Your funds are being returned. Open your wallet for claims.'}</p>}</>:<button className="primary" onClick={prepareEntry} disabled={!!busy||!wallet.ready||(wallet.authenticated&&!lobby.entryEnabled)}>{busy?<><LoaderCircle className="spin" size={17}/>{busy}</>:wallet.authenticated?'Join next epoch':'Sign in to join'}{!busy&&<ArrowUpRight size={18}/>}</button>}<p className="deposit-note"><ShieldCheck size={14}/> Your deposited tokens return after the epoch.</p></section>

    <button className="practice-card" onClick={practice}><span className="practice-icon"><Crosshair size={23}/></span><span><b>{mode==='practice'?'A fresh start':'Find your flow'}</b><small>Free practice. No wallet needed.</small></span><ArrowUpRight size={20}/></button><button className="mobile-rules" onClick={()=>setModal('rules')}>How to play <HelpCircle size={15}/></button></aside></div>

    {mode!=='preview'&&stats&&<section className="live-strip"><span><b>{mode==='practice'?'PRACTICE':'LIVE ARENA'}</b> {mode==='practice'?'Bots are labeled · no prizes':`Locked: ${Number(formatUnits(BigInt(entry?.deposit??0),18)).toLocaleString()} DOMINATE`}</span><span>Mouse / touch drag / WASD</span>{mode==='online'&&!room.current&&entry?.arena_id&&<button onClick={()=>joinArena(String(entry.arena_id))}>Reconnect</button>}</section>}

    <div className="feature-row"><div><span>01</span><div><b>Move smart</b><p>Smaller circles are faster. Use it.</p></div></div><div><span>02</span><div><b>Grow your advantage</b><p>Absorb rivals. Chase the gifts.</p></div></div><div><span>03</span><div><b>Stay in the circle</b><p>The boundary shrinks every minute.</p></div></div></div>

    {!!lobby.arenas?.length&&<section className="arena-list"><h2>Inside this epoch</h2>{lobby.arenas.map(a=><div key={a.id}><span>Arena {a.chain_arena} <small>{a.status}</small></span><b>{money(a.budget)} test USDC</b>{a.replay_hash&&<a href={`${API}/api/arenas/${a.id}/replay`} target="_blank" rel="noreferrer">Replay record <ExternalLink size={13}/></a>}</div>)}</section>}

    <footer><span>Built for the orbit. Powered by Arc.</span><span><HelpCircle size={14}/> Test assets have no monetary value</span></footer></main>

    {modal&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)setModal(null);}}><section className="modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" aria-label="Close dialog" onClick={()=>setModal(null)} disabled={!!busy}><X size={20}/></button>

    {modal==='rules'&&<><div className="eyebrow">YOUR FIELD GUIDE</div><h2 id="modal-title">Small moves. Big plays.</h2><div className="rules-list"><p><b>Move toward your cursor.</b> On mobile, touch and drag. Arrow keys and WASD work while the arena is focused.</p><p><b>Stay in contact to absorb.</b> You need 10% more mass than your rival. More contact means more growth; near-equal circles push apart.</p><p><b>Keep away from the edge.</b> Boundary contact drains mass. The arena shrinks every minute, with a warning five seconds before.</p><p><b>Chase an opening.</b> Speed gifts boost you for five seconds. Mass gifts grow your circle; they never issue tokens.</p><p><b>Survive for the podium.</b> Each arena pays its top three 50:30:20. At ten minutes, survivors rank by mass, then combat growth. Earlier eliminations rank by survival time.</p><p><b>Your deposit is protected.</b> Tokens stay locked until the epoch finishes. Waiting entries can cancel for a refund; spent gas cannot be refunded.</p><p><b>One pool, many arenas.</b> Up to 1,000 test USDC is shared by player count across up to ten arenas. Underfilled epochs retry every 20 minutes without charging again.</p></div><button className="primary" onClick={practice}>Try it in practice <ArrowUpRight size={17}/></button></>}

    {modal==='confirm'&&prepared&&<><div className="eyebrow">ARC TESTNET ENTRY</div><h2 id="modal-title">Ready for your orbit?</h2><div className="confirmation"><span>Tokens locked <b>{Number(formatUnits(BigInt(prepared.entry.amount),18)).toLocaleString()} DOMINATE</b></span><span>Starting mass <b>{prepared.entry.startingMass.toLocaleString()}</b></span><span>Entry fee <b>1 test USDC</b></span><span>Estimated gas <b>~{Number(prepared.gas.text).toFixed(6)} USDC</b></span><span>Total USDC needed <b>~{(1+Number(prepared.gas.text)).toFixed(6)}</b></span></div><p>Gas is additional and nonrefundable. Your wallet may request token approvals before entry. Check each wallet estimate before signing.</p><button className="primary" onClick={confirmEntry} disabled={!!busy}>{busy?<><LoaderCircle className="spin" size={17}/>{busy}</>:'Confirm entry'}</button></>}

    {modal==='wallet'&&<><div className="eyebrow">YOUR SPACE</div><h2 id="modal-title">Your testnet wallet</h2>{!wallet.authenticated?<><p>Sign in with email to get an embedded wallet. No extension required.</p>{!wallet.configured&&<div className="notice">Email sign-in is awaiting the Privy app configuration. Free practice is ready.</div>}<button className="primary" disabled={!wallet.configured||!wallet.ready} onClick={()=>{setModal(null);wallet.login();}}>Continue with email <ArrowUpRight size={17}/></button><button className="subtle-button" onClick={practice}>Practice without signing in</button></>:<>

    <button className="wallet-address" onClick={()=>void action('Copying address',async()=>{await navigator.clipboard.writeText(wallet.address!);setCopied(true);setTimeout(()=>setCopied(false),2000);})}>{wallet.address||'Creating wallet…'}{copied?<Check size={16}/>:<Copy size={16}/>}</button><div className="balance-grid"><div><small>Available DOMINATE</small><b>{balances?Number(formatUnits(balances.dominate,18)).toLocaleString():'—'}</b></div><div><small>Available test USDC</small><b>{balances?money(balances.usdc):'—'}</b></div></div><p className="muted">Deposit test assets on Arc testnet only. USDC also pays network gas.</p><div className="wallet-actions"><button disabled={!addresses.faucet||!!busy} onClick={()=>void action('Claiming test DOMINATE',async()=>{await wallet.send(addresses.faucet!,encodeFunctionData({abi:faucetAbi,functionName:'claim'}));await refreshBalances();setNotice('10,000 test DOMINATE claimed. Next claim in 24 hours.');})}>Claim test DOMINATE <Sparkles size={15}/></button><a href="https://faucet.circle.com" target="_blank" rel="noreferrer">Get test USDC <ExternalLink size={15}/></a></div><label className="deposit-label" htmlFor="display-name">Your circle name</label><div className="name-edit"><input id="display-name" value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={24}/><button disabled={!!busy} onClick={()=>void action('Saving name',async()=>{await request('/api/profile',{method:'PUT',body:JSON.stringify({name:displayName})});setNotice('Circle name saved.');})}>Save</button></div>

    {!!me?.entries?.length&&<><h3>Entries & claims</h3><div className="claim-list">{me.entries.map((e:any)=><div key={e.epoch_id}><span>Epoch {e.epoch_id}<small>{e.arena_status||'Waiting'}</small></span>{e.chain_arena&&e.match_deadline&&now/1000>=Number(e.match_deadline)+3600&&!['settled','refunded'].includes(e.arena_status)&&<button disabled={!!busy} onClick={()=>void recover(String(e.epoch_id),e.chain_arena)}>Recover arena</button>}<button disabled={!!busy} onClick={()=>void claim(String(e.epoch_id),'claimToken')}>Return tokens</button><button disabled={!!busy} onClick={()=>void claim(String(e.epoch_id),'claimUSDC')}>Claim USDC</button></div>)}</div><p className="muted">Automatic transfers follow settlement. Manual claims cost gas. Recovery opens one hour after an unresolved match’s deadline; recover your arena, then claim your tokens and entry fee.</p></>}

    <RecoveryControls onChange={refreshBalances}/><h3>Recent transfers</h3>{me?.transactions?.length?<div className="tx-list">{me.transactions.map((t:any)=><div key={t.operation_key}><span>{t.kind==='claimToken'?'Token return':t.kind==='claimUSDC'?'USDC payment':t.kind}<small>{t.status}</small></span>{t.tx_hash?<a href={`https://explorer.testnet.arc.io/tx/${t.tx_hash}`} target="_blank" rel="noreferrer">View <ExternalLink size={12}/></a>:<span>Pending</span>}</div>)}</div>:<p className="muted">No transfers yet.</p>}<button className="subtle-button" onClick={()=>void action('Signing out',async()=>{await room.current?.leave();room.current=null;await wallet.logout();setMe(null);setBalances(null);setMode('preview');setStats(undefined);setModal(null);})}><LogOut size={15}/> Sign out</button></>}</>}

    {busy&&modal!=='confirm'&&<p className="modal-status"><LoaderCircle className="spin" size={15}/>{busy}</p>}{notice&&<p className="modal-notice" role="status">{notice}</p>}

    </section></div>}

  </div>;

}

