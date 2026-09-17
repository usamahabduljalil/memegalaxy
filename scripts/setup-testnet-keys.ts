import { readFileSync,writeFileSync,renameSync,mkdirSync } from 'node:fs';
import { generatePrivateKey,privateKeyToAccount } from 'viem/accounts';
import { parse } from 'dotenv';
import type { Hex } from 'viem';

let source=readFileSync('.env','utf8');const env=parse(source);
if(env.CHAIN_ID!=='5042002')throw new Error('Key setup is restricted to Arc testnet configuration');
function save(name:string,value:string){
  const pattern=new RegExp(`^${name}=.*$`,'m');
  source=pattern.test(source)?source.replace(pattern,`${name}=${value}`):source+`\n${name}=${value}\n`;
  env[name]=value;
}
const addresses:Record<string,string>={};
for(const role of ['DEPLOYER','RESULT_SIGNER','REGISTRAR']){
  const name=`${role}_PRIVATE_KEY`;
  if(!env[name])save(name,generatePrivateKey());
  addresses[role.toLowerCase()]=privateKeyToAccount(env[name] as Hex).address;
}
if(new Set(Object.values(addresses)).size!==3)throw new Error('Testnet role keys must be distinct');
// Administration stays outside the hosted services. These defaults are test-only.
if(!env.ADMIN_ADDRESS)save('ADMIN_ADDRESS',addresses.deployer);
if(!env.OPERATIONS_ADDRESS)save('OPERATIONS_ADDRESS',addresses.deployer);
writeFileSync('.env.tmp',source,{mode:0o600});renameSync('.env.tmp','.env');
mkdirSync('.local',{recursive:true});
writeFileSync('.local/testnet-accounts.json',JSON.stringify({chainId:5042002,...addresses,admin:env.ADMIN_ADDRESS,operations:env.OPERATIONS_ADDRESS},null,2));
console.log(JSON.stringify({chainId:5042002,...addresses,admin:env.ADMIN_ADDRESS,operations:env.OPERATIONS_ADDRESS},null,2));
console.log('Private keys saved only to ignored .env. Fund deployer and result_signer with Arc testnet USDC.');
