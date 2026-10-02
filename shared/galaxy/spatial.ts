import type { Vec } from './types';
/** Rebuilt at simulation phase boundaries: deterministic insertion/query ordering. */
export class SpatialGrid<T extends Vec> {
  private buckets = new Map<number,Map<number,T[]>>();
  private minX=Infinity;private maxX=-Infinity;private minY=Infinity;private maxY=-Infinity;
  constructor(private width=160) {}
  insert(item:T) { const x=Math.floor(item.x/this.width),y=Math.floor(item.y/this.width);let column=this.buckets.get(x);if(!column){column=new Map();this.buckets.set(x,column);}const bucket=column.get(y);if(bucket)bucket.push(item);else column.set(y,[item]);this.minX=Math.min(this.minX,x);this.maxX=Math.max(this.maxX,x);this.minY=Math.min(this.minY,y);this.maxY=Math.max(this.maxY,y); }
  forEach(point:Vec,reach:number,visit:(item:T)=>void){const fromX=Math.max(this.minX,Math.floor((point.x-reach)/this.width)),toX=Math.min(this.maxX,Math.floor((point.x+reach)/this.width)),fromY=Math.max(this.minY,Math.floor((point.y-reach)/this.width)),toY=Math.min(this.maxY,Math.floor((point.y+reach)/this.width));for(let x=fromX;x<=toX;x++){const column=this.buckets.get(x);if(!column)continue;for(let y=fromY;y<=toY;y++){const bucket=column.get(y);if(bucket)for(const item of bucket)visit(item);}}}
  query(point:Vec, reach:number):T[] { const out:T[]=[];this.forEach(point,reach,item=>out.push(item));return out; }
}
