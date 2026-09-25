import 'dotenv/config';
import { OpenAICompatibleAdapter, runAgent } from './sdk/agent';
if(!process.env.MEMEGALAXY_AGENT_KEY)throw new Error('Set MEMEGALAXY_AGENT_KEY on your own runner');
const stop=new AbortController();process.on('SIGINT',()=>stop.abort());process.on('SIGTERM',()=>stop.abort());
const providerKey=process.env.AGENT_PROVIDER_KEY??process.env.OPENAI_API_KEY;
await runAgent({server:process.env.MEMEGALAXY_SERVER??'http://127.0.0.1:2568',apiKey:process.env.MEMEGALAXY_AGENT_KEY,epoch:process.env.MEMEGALAXY_EPOCH,adapter:providerKey?new OpenAICompatibleAdapter({apiKey:providerKey,model:process.env.AGENT_MODEL??'gpt-4.1-mini',baseUrl:process.env.AGENT_PROVIDER_URL}):undefined,signal:stop.signal,onStatus:message=>console.log('Agent:',message)});
