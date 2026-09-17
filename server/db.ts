import { Pool } from 'pg';
import { config } from './config';
export const pool=new Pool({connectionString:config.databaseUrl,max:10,connectionTimeoutMillis:5000,idleTimeoutMillis:30000});
pool.on('error',error=>console.error('Database connection error:',error.message));
export async function query<T extends import('pg').QueryResultRow=any>(sql:string,values:unknown[]=[]){return pool.query<T>(sql,values);}
export async function heartbeat(name:string,detail:Record<string,unknown>={}){await query('INSERT INTO service_health(name,detail) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET heartbeat=now(),detail=$2',[name,detail]);}
