import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
export {};
const role=process.env.SERVICE_ROLE||process.argv[2]||'galaxy-game';
if(role==='galaxy-game'){
 if(process.env.MEMEGALAXY_VERIFY_ECONOMY_FLOW==='true')execFileSync(process.execPath,['--import','tsx','scripts/verify-economy-flow.ts'],{stdio:'inherit',timeout:180000});
 if(process.env.MEMEGALAXY_VERIFY_ECONOMY==='true')execFileSync(process.execPath,['--import','tsx','server/galaxy/verify-economy.ts'],{stdio:'inherit',timeout:120000});
 if(process.env.MEMEGALAXY_VERIFY_HUNT_LOAD==='true')execFileSync(process.execPath,['--import','tsx','server/galaxy/verify-hunt-load.ts'],{stdio:'inherit',timeout:180000});
 if(process.env.MEMEGALAXY_ACTIVATE_TEST_HUNT==='true')execFileSync(process.execPath,['--import','tsx','server/galaxy/activate-hunt.ts'],{stdio:'inherit',timeout:120000});
 if(process.env.MEMEGALAXY_VERIFY_HOSTED==='true')execFileSync(process.execPath,['--import','tsx','server/galaxy/verify-platform.ts'],{stdio:'inherit',timeout:60000});
 await import('./galaxy/index');
 if(process.env.MEMEGALAXY_HOSTED_RUNTIME==='true'){
  let child:ChildProcess|undefined,stopping=false,timer:ReturnType<typeof setTimeout>|undefined;
  const allowed=['PATH','NODE_ENV','MEMEGALAXY_DATABASE_URL','DATABASE_URL','MEMEGALAXY_ADMISSION_SECRET','ADMISSION_SECRET','MEMEGALAXY_API_URL','MEMEGALAXY_ESCROW_ADDRESS','MEMEGALAXY_TOKEN_ADDRESS','MEMEGALAXY_USDC_ADDRESS','MEMEGALAXY_ENTROPY_SOURCE','MEMEGALAXY_AGENT_MODEL','OPENAI_API_KEY'];
  const launch=()=>{const env:NodeJS.ProcessEnv={};for(const name of allowed)if(process.env[name])env[name]=process.env[name];env.PORT=process.env.MEMEGALAXY_AGENT_PORT??'2570';child=spawn(process.execPath,['--import','tsx','server/galaxy/runtime.ts'],{env,stdio:['ignore','inherit','inherit'],windowsHide:true});child.on('exit',()=>{if(!stopping)timer=setTimeout(launch,3000);});child.on('error',()=>console.error('Hosted runtime process could not start'));};
  launch();if(process.env.MEMEGALAXY_VERIFY_RUNTIME==='true'){const diagnostic=spawn(process.execPath,['--import','tsx','server/galaxy/verify-runtime.ts'],{stdio:['ignore','inherit','inherit','ipc'],windowsHide:true});diagnostic.on('message',message=>{if(message==='verify-runtime-restart')child?.kill('SIGTERM');});diagnostic.on('exit',code=>{if(code)console.error('Hosted runtime verification failed');});}process.on('SIGTERM',()=>{stopping=true;clearTimeout(timer);child?.kill('SIGTERM');});
 }
}else if(role==='galaxy-worker')await import('./galaxy/worker');
else if(role==='galaxy-agent')await import('./galaxy/runtime');
else throw new Error('Expected galaxy-game, galaxy-agent or galaxy-worker service role');
