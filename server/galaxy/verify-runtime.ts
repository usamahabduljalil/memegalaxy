import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {db} from './store';
import {createAgent,practice,runStatus,stopRun,hostedAvailable} from './agents';
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms)),auth={id:'diagnostic:'+randomUUID(),wallet:'0x'+'0'.repeat(40)};
let runId:string|undefined,agentId:string|undefined;
try{
 for(let i=0;i<20&&!await hostedAvailable();i++)await delay(1000);
 const a=await createAgent(auth,{name:'Release probe',description:'Hosted free-play verification. Not a prize entrant.',personality:'survivor'});agentId=a.id;
 const run=await practice(auth,a.id);runId=run.id;
 let observed=false,model=false,lastMessage='';
 for(let i=0;i<35;i++){await delay(1000);const status=await runStatus(auth,run.id);lastMessage=status.message;if(status.observation?.tick>30&&status.observation.cells.some((c:any)=>c.owner==='agent:'+a.id))observed=true;if(status.decisions?.length)model=true;if(observed&&model)break;if(['failed','stopped'].includes(status.status))throw new Error('Hosted diagnostic run failed');}
 if(!observed)throw new Error('Hosted diagnostic never received owned arena state');
 console.log('Hosted runtime verified: queued entry, automatic admission, authoritative state, continuous movement with no browser connected.');
 console.log('Hosted model guidance verified:',model);
 if(!model)console.log('Local strategy fallback:',lastMessage);
 if(process.send){const before=await runStatus(auth,run.id),roomId=before.room_id,tick=before.observation.tick;process.send('verify-runtime-restart');await delay(10000);let reconnected=false;for(let i=0;i<10;i++){const after=await runStatus(auth,run.id);if(after.room_id===roomId&&after.status==='running'&&after.observation?.tick>tick&&after.observation.cells.some((c:any)=>c.owner==='agent:'+a.id)){reconnected=true;break;}await delay(1000);}if(!reconnected)throw new Error('Hosted runtime restart did not reconnect within grace period');console.log('Hosted runtime restart verified: exclusive lease reclaimed, same room, restored controller and advancing owned state.');}
}finally{if(runId)await stopRun(auth,runId).catch(()=>{});if(agentId)await db.query('UPDATE mg_agents SET hosted_enabled=false WHERE id=$1',[agentId]);await db.end();}
