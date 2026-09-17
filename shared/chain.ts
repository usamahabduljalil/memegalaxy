import { defineChain, parseAbi } from 'viem';
export const arcTestnet=defineChain({id:5042002,name:'Arc Testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:['https://rpc.testnet.arc.io']}},blockExplorers:{default:{name:'Arc Explorer',url:'https://explorer.testnet.arc.io'}},testnet:true});
export const entryTypes={Entry:[{name:'epoch',type:'uint256'},{name:'wallet',type:'address'},{name:'userId',type:'bytes32'},{name:'amount',type:'uint256'},{name:'nonce',type:'uint256'},{name:'expiry',type:'uint256'}]} as const;
export const escrowAbi=parseAbi([
  'function currentEpoch() view returns (uint256)', 'function availablePrize() view returns (uint256)', 'function nonces(address) view returns (uint256)', 'function entriesPaused() view returns (bool)', 'function operationsOwed() view returns (uint256)',
  'function epochInfo(uint256) view returns (uint8 status,uint256 deadline,uint256 matchDeadline,uint256 count,uint256 arenas,uint256 finished,bytes32 commitment,bytes32 seed,uint256 entropyBlock)',
  'function roster(uint256) view returns (address[])', 'function entryInfo(uint256,address) view returns (uint256 amount,uint256 arena,uint256 reward,bool tokenClaimed,bool usdcClaimed)',
  'function arenaInfo(uint256,uint256) view returns ((uint256 budget,uint8 status,address[3] winners,uint256 startedAt))',
  'function register(uint256,bytes32,uint256,uint256,bytes)', 'function cancel(uint256)', 'function claimToken(uint256,address)', 'function claimUSDC(uint256,address)',
  'function openEpoch(bytes32) returns (uint256)','function rollover(uint256)','function requestEntropy(uint256)', 'function abandonExpiredEntropy(uint256)',
  'function startEpoch(uint256,bytes32,address[])','function finalizeArena(uint256,uint256,address[3],bytes32,uint256)','function invalidateArena(uint256,uint256)','function recoverArena(uint256,uint256)','function payOperations()',
]);
export const faucetAbi=parseAbi(['function claim()','function nextClaim(address) view returns (uint256)']);
