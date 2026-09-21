import { useEffect,useRef } from 'react';
import type Phaser from 'phaser';
import { createGame,rankPlayers,radiusForMass,setIntent,stepGame,steerBots,type GameState,type Vec } from '../shared/game';
type Props={mode:'preview'|'practice'|'online';runId:number;playerId:string;snapshot?:GameState;muted:boolean;onStats:(g:GameState)=>void;onInput:(v:Vec)=>void};
export default function Arena(props:Props){
  const host=useRef<HTMLDivElement>(null),latest=useRef(props);latest.current=props;
  useEffect(()=>{
    let cancelled=false,game:Phaser.Game|undefined;const element=host.current!;
    void import('phaser').then(({default:P})=>{
      if(cancelled)return;
      class ArenaScene extends P.Scene {
        graphics!:Phaser.GameObjects.Graphics;texts=new Map<string,Phaser.GameObjects.Text>();positions=new Map<string,Vec>();
        world=createGame([{id:'you',name:'YOU',deposit:2000},...['NOVA','SOL','ECHO','LUNA','ORBIT','PIXEL','COMET','ATLAS','MISO','PLUTO','BLOOM'].map((name,i)=>({id:`bot-${i}`,name:`BOT · ${name}`,deposit:1000+i*220,bot:true}))],props.runId+817);
        accumulator=0;statsAt=0;inputAt=0;pointer:Vec|null=null;dragging=false;keys=new Set<string>();audio:AudioContext|null=null;lastGiftCount=0;
        offsetX=0;offsetY=0;zoom=1;reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
        constructor(){super('arena');}
        create(){
          this.graphics=this.add.graphics();this.game.canvas.setAttribute('tabindex','0');this.game.canvas.setAttribute('aria-label','Big Circle arena. Move with your mouse, drag on touch, or use arrow keys and WASD.');
          const down=(e:PointerEvent)=>{if(latest.current.mode==='preview')return;this.game.canvas.focus({preventScroll:true});this.dragging=true;if(e.pointerType==='touch')this.game.canvas.setPointerCapture(e.pointerId);move(e);};
          const move=(e:PointerEvent)=>{if(e.pointerType==='touch'&&!this.dragging)return;const r=this.game.canvas.getBoundingClientRect();this.pointer={x:(e.clientX-r.left)*this.scale.width/r.width,y:(e.clientY-r.top)*this.scale.height/r.height};};
          const up=()=>{this.dragging=false;if(matchMedia('(pointer: coarse)').matches)this.pointer=null;};
          const keydown=(e:KeyboardEvent)=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){e.preventDefault();this.keys.add(e.key);this.pointer=null;}};
          const keyup=(e:KeyboardEvent)=>{this.keys.delete(e.key);};const blur=()=>{this.keys.clear();this.pointer=null;this.dragging=false;};
          this.game.canvas.addEventListener('pointerdown',down);this.game.canvas.addEventListener('pointermove',move);this.game.canvas.addEventListener('pointerup',up);this.game.canvas.addEventListener('pointercancel',up);this.game.canvas.addEventListener('keydown',keydown);this.game.canvas.addEventListener('keyup',keyup);this.game.canvas.addEventListener('blur',blur);
          this.events.once('shutdown',()=>{this.game.canvas.removeEventListener('pointerdown',down);this.game.canvas.removeEventListener('pointermove',move);this.game.canvas.removeEventListener('pointerup',up);this.game.canvas.removeEventListener('pointercancel',up);this.game.canvas.removeEventListener('keydown',keydown);this.game.canvas.removeEventListener('keyup',keyup);this.game.canvas.removeEventListener('blur',blur);void this.audio?.close();});
          if(latest.current.mode==='preview'){this.world=createGame([{id:'you',name:'YOU',deposit:2600},{id:'a',name:'BOT · NOVA',deposit:1600},{id:'b',name:'BOT · SOL',deposit:1100},{id:'c',name:'BOT · ECHO',deposit:1300}],817);const spots=[[-.25,-.17],[.4,.23],[-.35,.49],[.36,-.51]];this.world.players.forEach((p,i)=>{p.x=spots[i][0]*this.world.radius;p.y=spots[i][1]*this.world.radius;});this.world.gifts=[{id:1,x:this.world.radius*.03,y:this.world.radius*.46,kind:'mass',amount:300,expiresAt:99999,contact:{}},{id:2,x:this.world.radius*.12,y:-this.world.radius*.51,kind:'speed',amount:0,expiresAt:99999,contact:{}}];}
        }
        label(key:string,text:string,x:number,y:number,size:number,color:string,alpha=1){let t=this.texts.get(key);if(!t){t=this.add.text(x,y,text,{fontFamily:'Inter, sans-serif',fontSize:`${size}px`,color,align:'center'}).setOrigin(.5);this.texts.set(key,t);}t.setText(text).setPosition(x,y).setFontSize(size).setColor(color).setAlpha(alpha).setVisible(true);return t;}
        update(time:number,delta:number){
          const p=latest.current;let state=p.mode==='online'?p.snapshot:this.world;if(!state)return;const w=this.scale.width,h=this.scale.height;this.offsetX=w/2;this.offsetY=h/2;this.zoom=Math.min(w-48,h-58)/(state.initialRadius*2);
          const you=state.players.find(c=>c.id===p.playerId);let intent={x:0,y:0};
          if(you?.alive&&p.mode!=='preview'){
            if(this.keys.size)intent={x:Number(this.keys.has('ArrowRight')||this.keys.has('d'))-Number(this.keys.has('ArrowLeft')||this.keys.has('a')),y:Number(this.keys.has('ArrowDown')||this.keys.has('s'))-Number(this.keys.has('ArrowUp')||this.keys.has('w'))};
            else if(this.pointer){const dx=(this.pointer.x-this.offsetX)/this.zoom-you.x,dy=(this.pointer.y-this.offsetY)/this.zoom-you.y,d=Math.hypot(dx,dy);if(d>5)intent={x:dx/Math.max(30,d),y:dy/Math.max(30,d)};}
            if(p.mode==='practice')setIntent(state,you.id,intent);else if(time-this.inputAt>=33){p.onInput(intent);this.inputAt=time;}
          }
          if(p.mode==='practice'&&!state.finished){this.accumulator+=Math.min(delta,100)/1000;while(this.accumulator>=1/30){steerBots(state);stepGame(state,1/30);this.accumulator-=1/30;}}
          if(time-this.statsAt>=150&&p.mode!=='preview'){this.statsAt=time;p.onStats({...state,players:state.players.map(x=>({...x}))});}
          if(state.gifts.length<this.lastGiftCount&&!p.muted&&!this.reduced){try{this.audio??=new AudioContext();if(this.audio.state==='running'){const osc=this.audio.createOscillator(),gain=this.audio.createGain();osc.connect(gain);gain.connect(this.audio.destination);gain.gain.setValueAtTime(.018,this.audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,this.audio.currentTime+.15);osc.frequency.value=660;osc.start();osc.stop(this.audio.currentTime+.15);}else void this.audio.resume();}catch{/* Audio is optional. */}}this.lastGiftCount=state.gifts.length;
          const g=this.graphics;g.clear();this.texts.forEach(t=>t.setVisible(false));g.fillStyle(0xd6e4f1,.5);g.fillCircle(this.offsetX,this.offsetY,state.radius*this.zoom);
          const ring=state.radius*this.zoom;g.lineStyle(20,0x426b9d,.035);g.strokeCircle(this.offsetX,this.offsetY,ring);g.lineStyle(8,0x749ac5,.045);g.strokeCircle(this.offsetX,this.offsetY,ring);g.lineStyle(1.4,0x426b9d,.55);g.strokeCircle(this.offsetX,this.offsetY,ring);
          const warning=state.elapsed>=55&&state.elapsed%60>=55&&!state.finished;if(warning){g.lineStyle(4,0xf8b47c,this.reduced?.6:.4+Math.sin(time/150)*.2);g.strokeCircle(this.offsetX,this.offsetY,ring);this.label('warning','BOUNDARY SHRINKING',w/2,26,12,'#985129');}
          for(const gift of state.gifts){const x=this.offsetX+gift.x*this.zoom,y=this.offsetY+gift.y*this.zoom;g.fillStyle(gift.kind==='speed'?0x314327:0x302940,.95);g.lineStyle(1,gift.kind==='speed'?0xc4f66c:0xbca5f5,.8);g.fillRoundedRect(x-12,y-12,24,24,7);g.strokeRoundedRect(x-12,y-12,24,24,7);this.label(`gift-${gift.id}`,gift.kind==='speed'?'ϟ':'✦',x,y,17,gift.kind==='speed'?'#d9ff9b':'#d1baff');if(gift.kind==='mass')this.label(`gift-number-${gift.id}`,`+${gift.amount}`,x,y+22,10,'#6d568d');}
          for(const cell of [...state.players].sort((a,b)=>a.mass-b.mass)){
            if(!cell.alive)continue;const old=this.positions.get(cell.id)??cell;const alpha=p.mode==='online'&&!this.reduced?Math.min(1,delta/85):1;const pos={x:old.x+(cell.x-old.x)*alpha,y:old.y+(cell.y-old.y)*alpha};this.positions.set(cell.id,pos);
            const x=this.offsetX+pos.x*this.zoom,y=this.offsetY+pos.y*this.zoom;let r=radiusForMass(cell.mass)*this.zoom;if(p.mode==='preview')r*=2.4;r=Math.max(5,r);
            const mine=cell.id===p.playerId;const threatened=you&&cell.mass>=you.mass*1.1&&!mine;
            g.fillStyle(cell.color,.035);g.fillCircle(x,y,r+12);g.fillStyle(cell.color,.08);g.fillCircle(x,y,r+5);g.fillStyle(cell.color,.9);g.fillCircle(x,y,r);g.lineStyle(1.5,0xffffff,mine?.7:.25);g.strokeCircle(x,y,r);g.fillStyle(0xffffff,.12);g.fillEllipse(x-r*.25,y-r*.36,r*.8,r*.45);
            if(cell.boostUntil>state.elapsed){g.lineStyle(2,0xe2ff93,.75);g.strokeCircle(x,y,r+4);}
            const eye=Math.max(1.2,r*.075);g.fillStyle(0x142118,.9);g.fillEllipse(x-r*.2,y-r*.12,eye*1.4,eye*2);g.fillEllipse(x+r*.2,y-r*.12,eye*1.4,eye*2);g.lineStyle(Math.max(1,r*.025),0x142118,.75);g.beginPath();g.arc(x,y+r*.02,r*.16,0,Math.PI);g.strokePath();
            if(r>23){this.label(`name-${cell.id}`,mine?'YOU':cell.name,x,y+r*.35,Math.max(9,Math.min(11,r*.18)),'#142118');this.label(`mass-${cell.id}`,Math.floor(cell.mass).toLocaleString(),x,y+r*.62,Math.max(9,Math.min(11,r*.17)),'#26332b');}
            else this.label(`name-${cell.id}`,mine?'YOU':cell.name,x,y+r+10,10,mine?'#315b8e':'#4d5b77');
            if(mine){g.lineStyle(1,0xd7fca4,.45);g.strokeCircle(x,y,r+8);if(Math.hypot(cell.x,cell.y)+radiusForMass(cell.mass)>=state.radius)this.label('danger','MOVE INWARD',x,y-r-17,12,'#985129');}
            if(threatened&&r>15)this.label(`threat-${cell.id}`,'!',x+r*.65,y-r*.65,12,'#fff0df');
          }
          if(p.mode==='preview')this.label('hint','A little strategy goes a long way.',w/2,h-20,12,'#778599');
          else if(!you?.alive&&!state.finished)this.label('spectating','SPECTATING · your deposit stays safe',w/2,h-20,12,'#59627e');
        }
      }
      game=new P.Game({type:P.AUTO,parent:element,transparent:true,antialias:true,scale:{mode:P.Scale.RESIZE,width:element.clientWidth,height:element.clientHeight},scene:ArenaScene,render:{powerPreference:'low-power'},audio:{noAudio:true},banner:false});
    }).catch(()=>{if(!cancelled)element.textContent='The arena could not load. Please refresh and try again.';});
    return()=>{cancelled=true;game?.destroy(true);};
  },[props.mode,props.runId]);
  return <div className="phaser-host" ref={host}/>;
}
