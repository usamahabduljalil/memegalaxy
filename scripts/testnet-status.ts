import 'dotenv/config';
import { createPublicClient,formatUnits,http } from 'viem';
import { readFileSync } from 'node:fs';
import { arcTestnet } from '../shared/chain';
const accounts=JSON.parse(readFileSync('.local/testnet-accounts.json','utf8'));
const client=createPublicClient({chain:arcTestnet,transport:http(process.env.ARC_RPC_URL||arcTestnet.rpcUrls.default.http[0],{timeout:15000,retryCount:0})});
if(await client.getChainId()!==5042002)throw new Error('Expected Arc testnet');
for(const role of ['deployer','result_signer']){
  const amount=await client.getBalance({address:accounts[role]});
  console.log(`${role}: ${accounts[role]} | ${formatUnits(amount,18)} test USDC`);
}
console.log(`Privy server secret configured locally: ${Boolean(process.env.PRIVY_APP_SECRET)}`);
