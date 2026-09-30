import express from 'express';
import Provider from 'oidc-provider';
import { createLocalJWKSet,jwtVerify,generateKeyPair,exportJWK } from 'jose';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { db } from './store';
import { owner,ownerById } from './auth';
import { agentInput,createAgent,listAgents,updateAgent,practice,stopRun,runStatus,draftEntry,failure } from './agents';
import { epoch,read,escrow,paid } from './chain';
const scopes=['mg:read','mg:agents','mg:entry'];
export class OAuthStore {
 constructor(private name:string){}
 async upsert(id:string,payload:any,expiresIn?:number){await db.query('INSERT INTO mg_oauth(type,id,payload,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(type,id) DO UPDATE SET payload=$3,expires_at=$4',[this.name,id,payload,expiresIn?new Date(Date.now()+expiresIn*1000):null]);}
 async find(id:string){const row=(await db.query('SELECT payload,consumed_at FROM mg_oauth WHERE type=$1 AND id=$2 AND (expires_at IS NULL OR expires_at>now())',[this.name,id])).rows[0];return row?{...row.payload,...(row.consumed_at?{consumed:Math.floor(new Date(row.consumed_at).getTime()/1000)}:{})}:undefined;}
 async findByUid(uid:string){return (await db.query("SELECT payload FROM mg_oauth WHERE type=$1 AND payload->>'uid'=$2 AND (expires_at IS NULL OR expires_at>now())",[this.name,uid])).rows[0]?.payload;}
 async findByUserCode(code:string){return (await db.query("SELECT payload FROM mg_oauth WHERE type=$1 AND payload->>'userCode'=$2 AND (expires_at IS NULL OR expires_at>now())",[this.name,code])).rows[0]?.payload;}
 async consume(id:string){await db.query('UPDATE mg_oauth SET consumed_at=now() WHERE type=$1 AND id=$2',[this.name,id]);}
 async destroy(id:string){await db.query('DELETE FROM mg_oauth WHERE type=$1 AND id=$2',[this.name,id]);}
 async revokeByGrantId(id:string){await db.query("DELETE FROM mg_oauth WHERE payload->>'grantId'=$1",[id]);}
}
export async function configureMcp(app:express.Express){
 const origin=process.env.MEMEGALAXY_API_URL??'http://127.0.0.1:2568',resource=origin+'/mcp',issuer=origin+'/oauth',site=process.env.MEMEGALAXY_SITE_URL??'http://127.0.0.1:5173';
 let keys=process.env.MCP_JWKS?JSON.parse(process.env.MCP_JWKS):undefined;
 if(!keys&&process.env.NODE_ENV!=='production'){const pair=await generateKeyPair('RS256',{extractable:true});keys={keys:[{...await exportJWK(pair.privateKey),kid:'development',alg:'RS256',use:'sig'}]};}
 const enabled=!!keys&&!!(process.env.MCP_COOKIE_SECRET||process.env.NODE_ENV!=='production');
 app.get('/api/v2/mcp/config',(_req,res)=>res.json({enabled,endpoint:resource,clients:[],scopes,model:process.env.MEMEGALAXY_AGENT_MODEL??'gpt-6-luna'}));
 if(!enabled){app.all('/mcp',(_req,res)=>res.status(503).json({error:'MCP connection is being configured'}));return;}
 const provider=new Provider(issuer,{adapter:OAuthStore,jwks:keys,cookies:{keys:[process.env.MCP_COOKIE_SECRET??'development-only-cookie-secret-32chars'],long:{sameSite:'none',secure:true},short:{sameSite:'none',secure:true}},clients:[],scopes:['openid','offline_access',...scopes],pkce:{required:()=>true},ttl:{AccessToken:900,AuthorizationCode:120,RefreshToken:30*86400,Interaction:600},features:{devInteractions:{enabled:false},registration:{enabled:true},resourceIndicators:{enabled:true,defaultResource:()=>resource,getResourceServerInfo:(_ctx,value)=>{if(value!==resource)throw new Error('Invalid MCP resource');return {scope:scopes.join(' '),audience:resource,accessTokenTTL:900,accessTokenFormat:'jwt',jwt:{sign:{alg:'RS256'}}};}}},findAccount:async(_ctx,id)=>({accountId:id,claims:async()=>({sub:id})}),extraTokenClaims:(_ctx,token)=>({grant_id:'grantId' in token?token.grantId:undefined}),interactions:{url:(_ctx,interaction)=>`${origin}/oauth/interaction/${interaction.uid}`},issueRefreshToken:()=>true});
 provider.proxy=true;
 app.get('/.well-known/oauth-protected-resource/mcp',(_req,res)=>res.json({resource,authorization_servers:[issuer],scopes_supported:scopes,bearer_methods_supported:['header']}));
 app.get('/.well-known/oauth-protected-resource',(_req,res)=>res.json({resource,authorization_servers:[issuer],scopes_supported:scopes}));
 app.get('/oauth/interaction/:uid',async(req,res,next)=>{try{const info=await provider.interactionDetails(req,res);res.redirect(`${site}/#mcp-authorize?uid=${encodeURIComponent(info.uid)}`);}catch(e){next(e);}});
 app.get('/api/v2/mcp/interaction/:uid',async(req,res,next)=>{try{const row=await new OAuthStore('Interaction').find(String(req.params.uid));if(!row)throw failure('Connection request expired',404);const client=await provider.Client.find(String(row.params.client_id));res.json({uid:req.params.uid,name:client?.clientName??'MCP client',scopes:String(row.params.scope??'').split(' ').filter(s=>scopes.includes(s))});}catch(e){next(e);}});
 app.post('/oauth/interaction/:uid/complete',express.urlencoded({extended:false,limit:'8kb'}),async(req,res,next)=>{try{const info=await provider.interactionDetails(req,res);if(info.uid!==req.params.uid)throw failure('Invalid connection request',400);req.headers.authorization=`Bearer ${req.body.privyToken}`;if(req.body.wallet)req.headers['x-memegalaxy-wallet']=String(req.body.wallet);const auth=await owner(req);const client=await provider.Client.find(String(info.params.client_id));const grant=new provider.Grant({accountId:auth.id,clientId:String(info.params.client_id)});const requested=String(info.params.scope??'mg:read').split(' ').filter(s=>scopes.includes(s));grant.addOIDCScope(String(info.params.scope??'openid'));grant.addResourceScope(resource,requested.join(' '));const grantId=await grant.save();await db.query('INSERT INTO mg_mcp_connections(grant_id,owner,client_id,name) VALUES($1,$2,$3,$4)',[grantId,auth.id,String(info.params.client_id),client?.clientName??'MCP client']);await provider.interactionFinished(req,res,{login:{accountId:auth.id},consent:{grantId}},{mergeWithLastSubmission:false});}catch(e){next(e);}});
 app.get('/.well-known/oauth-authorization-server/oauth',(_req,res)=>res.redirect(307,issuer+'/.well-known/openid-configuration'));
 app.get('/.well-known/oauth-authorization-server',(_req,res)=>res.redirect(307,issuer+'/.well-known/openid-configuration'));
 app.use('/oauth',provider.callback());
 const publicKeys={keys:keys.keys.map((jwk:any)=>{const {d,p,q,dp,dq,qi,...publicKey}=jwk;return publicKey;})};const jwks=createLocalJWKSet(publicKeys);
 app.post('/mcp',async(req,res)=>{
  let server:McpServer|undefined,transport:StreamableHTTPServerTransport|undefined;
  try{const token=req.headers.authorization?.replace(/^Bearer /,'');if(!token)throw failure('Connect this MCP client to your wallet',401);const {payload}=await jwtVerify(token,jwks,{issuer,audience:resource,algorithms:['RS256']});const connection=(await db.query('SELECT * FROM mg_mcp_connections WHERE grant_id=$1 AND owner=$2 AND revoked_at IS NULL',[payload.grant_id,payload.sub])).rows[0];if(!connection)throw failure('This MCP connection was revoked',401);const auth=await ownerById(String(payload.sub));const granted=String(payload.scope??'').split(' ');
   server=new McpServer({name:'MEMEGalaxy',version:'3.0.0'});
   const tool=(name:string,description:string,shape:Record<string,z.ZodTypeAny>,scope:string,readOnly:boolean,fn:(args:any)=>Promise<unknown>)=>server!.registerTool(name,{description,inputSchema:shape,annotations:{readOnlyHint:readOnly,destructiveHint:false,idempotentHint:readOnly,openWorldHint:false}},async(args)=>{if(!granted.includes(scope))return {isError:true,content:[{type:'text',text:'This connection needs '+scope+' permission. Reconnect and approve that scope.'}]};try{const result=await fn(args);await db.query('UPDATE mg_mcp_connections SET verified_at=now() WHERE grant_id=$1',[connection.grant_id]);return {content:[{type:'text',text:JSON.stringify(result)}]};}catch(e){return {isError:true,content:[{type:'text',text:e instanceof Error?e.message:'Action unavailable'}]};}});
   tool('get_lobby','Inspect the current testnet prize epoch and requirements.',{},'mg:read',true,async()=>{const e=await epoch();return {epoch:e?{...e,id:String(e.id),entropyBlock:String(e.entropyBlock)}:null,pool:escrow?String(await read('availablePrize')):'0',enabled:paid,entryFee:'1 test USDC',minimumDeposit:'1000 MEMEGALAXY'};});
   tool('list_agents','List your owned hosted agents and their status.',{},'mg:read',true,()=>listAgents(auth));
   tool('create_agent','Create a hosted agent. Use a stable idempotency value when retrying.',agentInput.shape,'mg:agents',false,args=>createAgent(auth,args));
   tool('configure_agent','Edit an agent for future matches. Active prize configurations stay frozen.',{agentId:z.string().uuid(),...agentInput.shape},'mg:agents',false,args=>updateAgent(auth,args.agentId,args));
   tool('start_practice','Run your agent in hosted free play for up to five minutes.',{agentId:z.string().uuid()},'mg:agents',false,args=>practice(auth,args.agentId));
   tool('stop_practice','Stop a hosted practice run. This tool cannot forfeit a prize match.',{runId:z.string().uuid()},'mg:agents',false,args=>stopRun(auth,args.runId));
   tool('get_agent_status','Get your agent run and its visibility-limited observation.',{runId:z.string().uuid()},'mg:read',true,args=>runStatus(auth,args.runId));
   tool('prepare_prize_entry','Prepare a prize-entry review link. The owner must approve deposit, fee and gas in their wallet.',{agentId:z.string().uuid(),deposit:z.string().default('1000'),idempotency:z.string().min(8).max(100)},'mg:entry',false,args=>draftEntry(auth,args));
   tool('get_results','Read your latest agent prize results.',{},'mg:read',true,async()=>{const ids=(await listAgents(auth)).map(a=>`agent:${a.id}`);return (await db.query("SELECT id,status,result FROM mg_matches WHERE status='completed' AND EXISTS(SELECT 1 FROM jsonb_array_elements(result) p WHERE p->>'id'=ANY($1::text[])) ORDER BY heartbeat DESC LIMIT 10",[ids])).rows;});
   transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});await server.connect(transport);res.on('close',()=>{void transport?.close();void server?.close();});await transport.handleRequest(req,res,req.body);
  }catch(e){const status=(e as any).status??401;if(!res.headersSent){res.setHeader('WWW-Authenticate',`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`);res.status(status).json({error:status===401?'MCP authorization required':'MCP request failed'});}}
 });
 app.get('/mcp',(_req,res)=>res.status(405).set('Allow','POST').end());
}
