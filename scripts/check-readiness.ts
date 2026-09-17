import 'dotenv/config';
import { createPublicClient,erc20Abi,http,isAddress } from 'viem';
import { arcTestnet } from '../shared/chain';
const client=createPublicClient({chain:arcTestnet,transport:http(process.env.ARC_RPC_URL||arcTestnet.rpcUrls.default.http[0],{timeout:15000,retryCount:0})});
const missing=['DATABASE_URL','PRIVY_APP_SECRET','ADMISSION_SECRET','ESCROW_ADDRESS','DOMINATE_ADDRESS','RESULT_SIGNER_PRIVATE_KEY','REGISTRAR_PRIVATE_KEY'].filter(name=>!process.env[name]);
// Report names only. Never print connection strings, private keys or auth secrets.
console.log('Missing service settings:',missing.length?missing.join(', '):'none');
const stable=process.env.USDC_ADDRESS;
if(!stable||!isAddress(stable))throw new Error('Set the public Arc USDC address');
const [id,decimals,block]=await Promise.all([client.getChainId(),client.readContract({address:stable,abi:erc20Abi,functionName:'decimals'}),client.getBlock({blockTag:'finalized'})]);
if(id!==5042002||decimals!==6)throw new Error('Unexpected network or USDC interface');
console.log(`Verified Arc testnet ${id}, six-decimal USDC, finalized block ${block.number}.`);
if(missing.length)console.log('Funded entry must remain disabled until configuration and end-to-end checks pass.');
