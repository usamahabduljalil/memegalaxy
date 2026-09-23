import 'dotenv/config';
import { createPublicClient, http, parseAbi, formatUnits } from 'viem';
import { robinhoodTestnet } from '../shared/galaxy/chain';

const address = (process.env.MEMEGALAXY_ESCROW_ADDRESS ?? '0x9abc7283af8bcb13b617ce8519fa74b3ba00da75') as `0x${string}`;
const client = createPublicClient({ chain: robinhoodTestnet, transport: http(process.env.ROBINHOOD_RPC_URL ?? robinhoodTestnet.rpcUrls.default.http[0]) });
const parent = createPublicClient({ transport: http(process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com') });
const abi = parseAbi([
  'function currentEpoch() view returns (uint256)',
  'function epochInfo(uint256) view returns (uint8,uint256,uint256,uint256,uint256,uint256,bytes32,bytes32,uint256)',
  'function availablePrize() view returns (uint256)',
  'function entriesPaused() view returns (bool)',
  'event EpochStarted(uint256 indexed id,uint256 deadline,uint256 budget,bytes32 seed)',
  'event EpochClosed(uint256 indexed id,uint256 endedAt)',
  'event RolledOver(uint256 indexed id,uint256 deadline)'
]);
const [latest, finalized, current, available, paused] = await Promise.all([
  client.getBlock(), client.getBlock({ blockTag: 'finalized' }),
  client.readContract({ address, abi, functionName: 'currentEpoch' }),
  client.readContract({ address, abi, functionName: 'availablePrize' }),
  client.readContract({ address, abi, functionName: 'entriesPaused' })
]);
console.log(JSON.stringify({ latest: latest.number.toString(), finalized: finalized.number.toString(), current: current.toString(), availableUSDC: formatUnits(available, 6), paused }));
const [parentLatest, parentFinalized] = await Promise.all([parent.getBlock(), parent.getBlock({ blockTag: 'finalized' })]);
console.log(JSON.stringify({ parentLatest: parentLatest.number.toString(), parentFinalized: parentFinalized.number.toString() }));
for (let id = 1n; id <= current; id++) {
  const e = await client.readContract({ address, abi, functionName: 'epochInfo', args: [id] });
  console.log(JSON.stringify({ id: id.toString(), status: e[0], deadline: new Date(Number(e[1])*1000).toISOString(), recovery: e[2].toString(), count: e[3].toString(), arenas: e[4].toString(), finished: e[5].toString(), seed: e[7], entropyBlock: e[8].toString() }));
  if (e[8] > 0n) {
    const [l1, l2] = await Promise.all([parent.getBlock({blockNumber:e[8]}), client.getBlock({blockNumber:e[8]})]);
    console.log(JSON.stringify({ entropyBlock: e[8].toString(), parentTime: new Date(Number(l1.timestamp)*1000).toISOString(), parentHash:l1.hash, rollupTime:new Date(Number(l2.timestamp)*1000).toISOString(), rollupHash:l2.hash }));
  }
}
