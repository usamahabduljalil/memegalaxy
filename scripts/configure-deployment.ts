import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const d=JSON.parse(readFileSync('.local/deployment.json','utf8'));
const values={...(d.escrowDeploymentBlock?{ESCROW_DEPLOYMENT_BLOCK:d.escrowDeploymentBlock}:{}),ESCROW_ADDRESS:d.escrow,DOMINATE_ADDRESS:d.dominate,FAUCET_ADDRESS:d.faucet,USDC_ADDRESS:d.usdc};
const local={...values,...Object.fromEntries(Object.entries(values).map(([k,v])=>['VITE_'+k,v])),VITE_API_URL:'https://big-circle-game-production.up.railway.app',VITE_WS_URL:'wss://big-circle-game-production.up.railway.app'};
let env=readFileSync('.env','utf8');for(const [k,v] of Object.entries(local)){const re=new RegExp('^'+k+'=.*$','m');env=re.test(env)?env.replace(re,k+'='+v):env+'\n'+k+'='+v+'\n';}writeFileSync('.env',env,{mode:0o600});
for(const service of ['80a636ce-d697-447a-b4c4-8c052858ac89','ce23cb8b-f9f2-42b0-8545-8871dbeb6f4b']){const r=spawnSync(process.argv[2],['variable','set','--service',service,'--skip-deploys',...Object.entries(values).map(([k,v])=>k+'='+v)],{stdio:'pipe',timeout:90000});if(r.status!==0)throw new Error('Public contract configuration failed for '+service);console.log('Configured contract addresses for '+service)}
console.log('Local client points to the hosted API.');
