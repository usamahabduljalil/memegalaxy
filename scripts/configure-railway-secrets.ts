import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { parse } from 'dotenv';
const cli=process.argv[2];if(!cli)throw new Error('Provide the Railway executable path');
const env=parse(readFileSync('.env','utf8'));
const targets=[
  {id:'80a636ce-d697-447a-b4c4-8c052858ac89',keys:['PRIVY_APP_SECRET','REGISTRAR_PRIVATE_KEY']},
  {id:'ce23cb8b-f9f2-42b0-8545-8871dbeb6f4b',keys:['RESULT_SIGNER_PRIVATE_KEY']},
];
for(const target of targets)for(const name of target.keys){
  const value=env[name];if(!value){console.log(`Not configured yet: ${name}`);continue;}
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(cli,['variable','set',name,'--stdin','--skip-deploys','--service',target.id],{stdio:['pipe','ignore','pipe'],windowsHide:true});
    child.stderr.resume();child.on('error',()=>reject(new Error(`Could not configure ${name}`)));
    child.on('close',code=>code===0?resolve():reject(new Error(`Could not configure ${name}; check Railway connectivity`)));
    child.stdin.end(value);
  });
  console.log(`Configured ${name} in its assigned service.`);
}
