import {zeroDevWallet} from '@zerodev/wallet-react';
import {createConfig,http} from 'wagmi';
import {injected} from 'wagmi/connectors';
import {QueryClient} from '@tanstack/react-query';
import {robinhoodTestnet} from '../../shared/galaxy/chain';
export const zeroDevProjectId=import.meta.env.VITE_ZERODEV_PROJECT_ID;
// Re-enable only after ZeroDev support resolves OTP and real email delivery passes.
export const zeroDevEmailEnabled=import.meta.env.VITE_ZERODEV_EMAIL_ENABLED==='true';
export const walletConfig=createConfig({chains:[robinhoodTestnet],connectors:[...(zeroDevProjectId?[zeroDevWallet({projectId:zeroDevProjectId,aaHost:'https://rpc.zerodev.app',chains:[robinhoodTestnet],mode:'7702'})]:[]),injected({shimDisconnect:true})],multiInjectedProviderDiscovery:true,transports:{[robinhoodTestnet.id]:http()}});
export const walletQueryClient=new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false}}});
