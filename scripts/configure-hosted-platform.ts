import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {parse} from 'dotenv';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
const cli=process.argv[2];if(!cli)throw new Error('Provide Railway executable path');
const api='fb28bdb3-f2b4-484f-a0ea-b1c2d5b6dd3f';
const env={...parse(readFileSync('.env','utf8')),...parse(readFileSync('.env.local','utf8'))};
if(!env.OPENAI_API_KEY)throw new Error('Add OPENAI_API_KEY to .env.local');
const path='.env.mcp';let mcp=existsSync(path)?parse(readFileSync(path,'utf8')):undefined;
if(!mcp){const pair=generateKeyPairSync('rsa',{modulusLength:2048}),jwk=pair.privateKey.export({format:'jwk'});mcp={MCP_JWKS:JSON.stringify({keys:[{...jwk,kid:randomBytes(12).toString('hex'),alg:'RS256',use:'sig'}]}),MCP_COOKIE_SECRET:randomBytes(48).toString('hex')};writeFileSync(path,Object.entries(mcp).map(([k,v])=>k+"='"+v+"'").join('\n')+'\n');}
const values={OPENAI_API_KEY:env.OPENAI_API_KEY,...mcp,MEMEGALAXY_API_URL:'https://memegalaxy-staging-production.up.railway.app',MEMEGALAXY_SITE_URL:'https://memegalaxy.usamahabduljalil21.chatgpt.site',MEMEGALAXY_HOSTED_RUNTIME:'true',MEMEGALAXY_VERIFY_HOSTED:'true'};
for(const [key,value]of Object.entries(values)){await new Promise<void>((resolve,reject)=>{const child=spawn(cli,['variable','set',key,'--stdin','--skip-deploys','--service',api],{stdio:['pipe','ignore','pipe'],windowsHide:true});child.stderr.resume();child.on('error',()=>reject(new Error('Could not configure '+key)));child.on('close',code=>code===0?resolve():reject(new Error('Could not configure '+key)));child.stdin.end(value);});console.log('Configured '+key+' in MEMEGalaxy service.');}
