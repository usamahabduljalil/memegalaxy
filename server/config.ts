import 'dotenv/config';
import { isAddress } from 'viem';
import { entryAccess } from './entry-access';
export const access=entryAccess(process.env.ENTRY_ACCESS_MODE,process.env.BETA_TESTER_WALLETS);
export const config={port:Number(process.env.PORT||2567),databaseUrl:process.env.DATABASE_URL,privyId:process.env.PRIVY_APP_ID,privySecret:process.env.PRIVY_APP_SECRET,admissionSecret:process.env.ADMISSION_SECRET,origins:(process.env.WEB_ORIGINS||'http://localhost:5173').split(',').map(s=>s.trim()),rpc:process.env.ARC_RPC_URL||'https://rpc.testnet.arc.io',chainId:Number(process.env.CHAIN_ID||5042002),escrow:process.env.ESCROW_ADDRESS as `0x${string}`|undefined,dominate:process.env.DOMINATE_ADDRESS as `0x${string}`|undefined,usdc:process.env.USDC_ADDRESS as `0x${string}`|undefined,paid:process.env.ENABLE_PAID_EPOCHS==='true'};
if(config.chainId!==5042002)throw new Error('This release only supports Arc testnet 5042002');
export function missingConfiguration(){return [!access.configured&&'BETA_TESTER_WALLETS',!config.databaseUrl&&'DATABASE_URL',!config.privyId&&'PRIVY_APP_ID',!config.privySecret&&'PRIVY_APP_SECRET',(!config.admissionSecret||config.admissionSecret.length<32)&&'ADMISSION_SECRET',(!config.escrow||!isAddress(config.escrow))&&'ESCROW_ADDRESS',!process.env.REGISTRAR_PRIVATE_KEY&&'REGISTRAR_PRIVATE_KEY'].filter(Boolean) as string[];}
