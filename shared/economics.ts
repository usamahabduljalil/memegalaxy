export const RULES = Object.freeze({version:1,minDeposit:1000,maxStartingMass:4000,minPlayers:10,maxPlayers:500,maxArenaPlayers:50,entryFee:1000000n,minPool:100000000n,maxPool:1000000000n,registrationSeconds:1200,matchSeconds:600,recoverySeconds:3600,tickRate:30,snapshotRate:10});
export function arenaSizes(count:number):number[]{
  if(!Number.isInteger(count)||count<0||count>RULES.maxPlayers)throw new Error('Invalid player count');
  if(count<RULES.minPlayers)return [];
  const n=Math.ceil(count/RULES.maxArenaPlayers),base=Math.floor(count/n);
  return Array.from({length:n},(_,i)=>base+(i<count%n?1:0));
}
export function splitPool(pool:bigint,sizes:number[]):bigint[]{
  if(pool<0n||!sizes.length||sizes.some(n=>!Number.isInteger(n)||n<=0))throw new Error('Invalid allocation');
  const total=BigInt(sizes.reduce((a,b)=>a+b,0));
  const shares=sizes.map(n=>pool*BigInt(n)/total);
  let remainder=pool-shares.reduce((a,b)=>a+b,0n);
  for(let i=0;remainder>0n;i++,remainder--)shares[i%shares.length]++;
  return shares;
}
export function allocatePrizes(pool:bigint):[bigint,bigint,bigint]{const second=pool*30n/100n,third=pool*20n/100n;return [pool-second-third,second,third];}
