import type { Vec } from './types';
/** Rebuilt at simulation phase boundaries: deterministic insertion/query ordering. */
export class SpatialGrid<T extends Vec> {
  private buckets = new Map<string,T[]>();
  constructor(private width=160) {}
  insert(item:T) { const key=`${Math.floor(item.x/this.width)},${Math.floor(item.y/this.width)}`; const bucket=this.buckets.get(key); if(bucket)bucket.push(item);else this.buckets.set(key,[item]); }
  query(point:Vec, reach:number):T[] { const out:T[]=[];for(let x=Math.floor((point.x-reach)/this.width);x<=Math.floor((point.x+reach)/this.width);x++)for(let y=Math.floor((point.y-reach)/this.width);y<=Math.floor((point.y+reach)/this.width);y++)out.push(...(this.buckets.get(`${x},${y}`)??[]));return out; }
}
