import { RedisPresence } from '@colyseus/redis-presence';
import type { Presence } from '@colyseus/core';
/** Colyseus 0.16 core added channels() after redis-presence 0.16 shipped.
 * Keep the adapter's internal EventEmitter intact and bridge the public API. */
class CompatibleRedis extends RedisPresence {
  async listChannels(pattern='*'):Promise<string[]>{return await this.pub.pubsub('CHANNELS',pattern) as string[];}
  listenerLimit(count:number){this.channels.setMaxListeners(count);}
}
export function sharedPresence(url:string):Presence {
  const redis=new CompatibleRedis(url);
  return new Proxy(redis,{get(target,property,receiver){
    if(property==='channels')return target.listChannels.bind(target);
    if(property==='setMaxListeners')return target.listenerLimit.bind(target);
    const value=Reflect.get(target,property,receiver);
    return typeof value==='function'?value.bind(target):value;
  }}) as unknown as Presence;
}
