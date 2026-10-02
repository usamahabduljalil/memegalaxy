export const HUNT_VERSION='stock-hunt-v1';
export const HUNT_DEFAULTS=Object.freeze({minInterval:180,maxInterval:420,lifetime:60,contactTicks:15,dailyLimit:5,baseUnits:'10000000000000000',maxMultiplier:20000});
export const STOCK_ASSETS=[
 {symbol:'TSLA',address:'0xc9f9c86933092bbbfff3ccb4b105a4a94bf3bd4e',decimals:18},
 {symbol:'AMZN',address:'0x5884ad2f920c162cfbbacc88c9c51aa75ec09e02',decimals:18},
 {symbol:'NFLX',address:'0x3b8262a63d25f0477c4dde23f83cfe22cb768c93',decimals:18},
] as const;
export type Skin={id:string;name:string;tier:'Common'|'Rare'|'Premium'|'Veteran'|'VIP';theme:'Cosmos'|'Animals'|'Memes'|'Crypto';color:string;accent:string;face:'planet'|'cat'|'frog'|'fox'|'star';multiplier:number;mass:number;seconds:number;paid:boolean};
export const SKINS:Skin[]=[
 {id:'luna',name:'Luna Scout',tier:'Common',theme:'Cosmos',color:'#8476ed',accent:'#c8c3ff',face:'planet',multiplier:10000,mass:0,seconds:0,paid:false},
 {id:'comet-cat',name:'Comet Cat',tier:'Common',theme:'Animals',color:'#e8ac6a',accent:'#ffdfb1',face:'cat',multiplier:10000,mass:0,seconds:0,paid:false},
 {id:'orbit-frog',name:'Orbit Frog',tier:'Rare',theme:'Memes',color:'#87c861',accent:'#dbffac',face:'frog',multiplier:11000,mass:1000,seconds:0,paid:false},
 {id:'blue-moon',name:'Blue Moon',tier:'Rare',theme:'Cosmos',color:'#4d99d2',accent:'#b5efff',face:'planet',multiplier:11000,mass:1000,seconds:0,paid:false},
 {id:'solar-fox',name:'Solar Fox',tier:'Premium',theme:'Animals',color:'#ef805c',accent:'#ffcf88',face:'fox',multiplier:12500,mass:0,seconds:0,paid:true},
 {id:'nebula',name:'Nebula Dream',tier:'Premium',theme:'Cosmos',color:'#ad67d8',accent:'#edbaff',face:'planet',multiplier:12500,mass:0,seconds:0,paid:true},
 {id:'star-voyager',name:'Star Voyager',tier:'Veteran',theme:'Cosmos',color:'#dbb957',accent:'#fff1b2',face:'star',multiplier:15000,mass:5000,seconds:18000,paid:false},
 {id:'elder-cat',name:'Elder Cat',tier:'Veteran',theme:'Animals',color:'#709db2',accent:'#d5f2ff',face:'cat',multiplier:15000,mass:5000,seconds:18000,paid:false},
 {id:'supernova',name:'Supernova Royal',tier:'VIP',theme:'Cosmos',color:'#d575cc',accent:'#ffefb0',face:'star',multiplier:20000,mass:10000,seconds:0,paid:true},
 {id:'cosmic-fox',name:'Cosmic Fox',tier:'VIP',theme:'Animals',color:'#7673e8',accent:'#d8fdad',face:'fox',multiplier:20000,mass:10000,seconds:0,paid:true},
];
export function lagosDay(ms=Date.now()){return new Date(ms+3600000).toISOString().slice(0,10);}
export function rewardWeek(ms=Date.now()){const local=new Date(ms+3600000);local.setUTCHours(0,0,0,0);local.setUTCDate(local.getUTCDate()-((local.getUTCDay()+6)%7));const start=local.getTime()-3600000;return {start:Math.floor(start/1000),unlock:Math.floor((start+604800000)/1000)};}
export function pickupAmount(base:string,multiplier:number){if(!Number.isInteger(multiplier)||multiplier<10000||multiplier>20000)throw Error('Invalid skin multiplier');return (BigInt(base)*BigInt(multiplier)/10000n).toString();}
