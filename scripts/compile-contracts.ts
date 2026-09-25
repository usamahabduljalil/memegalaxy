import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);const solc=require('solc');
export function compile(){
  const names=['BigCircle.sol','TestDominate.sol','MockUSDC.sol','MemeGalaxyEscrow.sol','MemeGalaxyEscrowV3.sol','TestMemeGalaxy.sol'];
  const input={language:'Solidity',sources:Object.fromEntries(names.map(n=>[n,{content:readFileSync(resolve('contracts',n),'utf8')}])),settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
  const output=JSON.parse(solc.compile(JSON.stringify(input),{import:(name:string)=>{try{return {contents:readFileSync(resolve('node_modules',name),'utf8')}}catch{return {error:`Missing ${name}`}}}}));
  const errors=(output.errors??[]).filter((e:any)=>e.severity==='error');if(errors.length)throw new Error(errors.map((e:any)=>e.formattedMessage).join('\n'));
  mkdirSync('artifacts',{recursive:true});const artifacts:Record<string,{abi:any;bytecode:`0x${string}`}>={};
  for(const file of names)for(const [name,c] of Object.entries(output.contracts[file]) as [string,any][]){const artifact={abi:c.abi,bytecode:('0x'+c.evm.bytecode.object) as `0x${string}`};artifacts[name]=artifact;writeFileSync(resolve('artifacts',`${name}.json`),JSON.stringify(artifact,null,2));const bytes=c.evm.deployedBytecode.object.length/2;if(bytes>24576)throw new Error(`${name} exceeds EVM code size limit`);console.log(`${name}: ${bytes} deployed bytes`);}
  return artifacts;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/compile-contracts.ts'))compile();
