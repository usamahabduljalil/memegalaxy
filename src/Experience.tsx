import {useEffect,useRef,useState,lazy,Suspense} from 'react';
import {ArrowUpRight,ChevronRight,CircleDot,Play,Pause,X} from 'lucide-react';
const GameScreen=lazy(()=>import('./GameScreen'));
const poster='https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_105822_bf7c2d53-9957-4521-bbbf-7c1ab7a70130.png';
const film='https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260912_105953_21ad8049-9088-4a00-bad3-aee6b5575a2b.mp4';
export default function Experience(){
 const [route,setRoute]=useState(location.hash),[paused,setPaused]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 const video=useRef<HTMLVideoElement>(null),rules=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const sync=()=>{setRoute(location.hash);window.scrollTo(0,0);};window.addEventListener('hashchange',sync);return()=>window.removeEventListener('hashchange',sync);},[]);
 useEffect(()=>{const q=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setPaused(q.matches);q.addEventListener('change',sync);return()=>q.removeEventListener('change',sync);},[]);
 const inGame=route==='#play'||route==='#practice';
 useEffect(()=>{const v=video.current;if(!v)return;const sync=()=>{if(paused||document.hidden)v.pause();else void v.play().catch(()=>{});};sync();document.addEventListener('visibilitychange',sync);return()=>document.removeEventListener('visibilitychange',sync);},[paused,inGame]);
 if(inGame)return <Suspense fallback={<div className="experience-loading" role="status">Opening your orbit…</div>}><GameScreen practice={route==='#practice'}/></Suspense>;
 return <div className="landing">
  <video ref={video} className="landing-film" poster={poster} src={film} muted loop playsInline preload="metadata" aria-hidden="true" disablePictureInPicture/>
  <div className="landing-wash"/>
  <header className="landing-header"><a className="landing-brand" href="#" aria-label="Big Circle home"><CircleDot/><span>Big Circle</span></a><nav className="landing-nav" aria-label="Main navigation"><button onClick={()=>rules.current?.showModal()}>How to play</button><span/><a href="#practice">Free practice</a></nav><a className="landing-cta" href="#play">Enter the arena <span><ChevronRight/></span></a></header>
  <main className="landing-content"><section className="landing-copy"><p className="landing-eyebrow">A little circle. A bigger ambition.</p><h1><span>Own your orbit.</span><br/><span>Take the circle.</span></h1><a className="landing-play" href="#practice"><span><Play size={17} fill="currentColor"/></span>Small moves. Big possibilities.</a></section>
  <aside className="landing-panel"><div className="landing-panel-top"><span>THE FINAL THREE</span><CircleDot size={26}/></div><h2>A smaller circle.<br/>A bigger moment.</h2><p>Stay in. Grow stronger.<br/>Be the last one standing.</p><div className="landing-podium"><span><b>50<small>%</small></b>1st place</span><span><b>30<small>%</small></b>2nd place</span><span><b>20<small>%</small></b>3rd place</span></div><div className="landing-meter"><i/><i/><i/></div><small className="landing-pool-note">Share of each arena’s test USDC prize pool</small></aside></main>
  <footer className="landing-footer"><div className="landing-facts"><div><b>10<span>min</span></b><p>One round.<br/>Make it count.</p></div><i/><div><b>50</b><p>Players.<br/>One arena.</p></div></div><a className="landing-explore" href="#play"><img src={poster} alt=""/><span>Find your circle</span><i><ArrowUpRight/></i></a></footer>
  <div className="landing-baseline"><span>BUILT ON ARC <i/> TESTNET PREVIEW · TEST ASSETS ONLY</span><button onClick={()=>setPaused(v=>!v)} aria-label={paused?'Play background animation':'Pause background animation'}>{paused?<Play size={14}/>:<Pause size={14}/>}<span>{paused?'Motion off':'Motion on'}</span></button></div>
  <dialog className="landing-rules" ref={rules} aria-labelledby="landing-rules-title"><button className="landing-close" aria-label="Close how to play" onClick={()=>rules.current?.close()}><X/></button><p className="landing-eyebrow">FIND YOUR FLOW</p><h2 id="landing-rules-title">A few small moves.</h2><ol><li><b>Move smart.</b> Steer with your mouse, touch and drag, or use WASD. Smaller circles move faster.</li><li><b>Grow your circle.</b> Absorb smaller rivals and collect gifts. Keep clear of the shrinking boundary.</li><li><b>Stay in the game.</b> The final three share the arena prize. Combat changes game mass; your locked tokens return after the epoch.</li></ol><a href="#practice" className="landing-cta">Try free practice <span><ChevronRight/></span></a><p className="landing-disclaimer">Practice uses bots, with no deposits or prizes. Funded testnet games currently require an invitation.</p></dialog>
 </div>;
}
