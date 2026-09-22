import 'dotenv/config';
import { Pool } from 'pg';
export const db=new Pool({connectionString:process.env.MEMEGALAXY_DATABASE_URL??process.env.DATABASE_URL,max:10,connectionTimeoutMillis:5000});
export const persistent=!!(process.env.MEMEGALAXY_DATABASE_URL??process.env.DATABASE_URL);
export async function migrateGalaxy(){await db.query(`
CREATE TABLE IF NOT EXISTS mg_agents(id uuid PRIMARY KEY,owner text NOT NULL,wallet text NOT NULL,name varchar(24) NOT NULL,description varchar(300) NOT NULL DEFAULT '',provider varchar(60) NOT NULL DEFAULT '',personality varchar(20) NOT NULL,key_hash text UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mg_matches(id text PRIMARY KEY,deployment text NOT NULL,mode text NOT NULL,rules text NOT NULL,header jsonb NOT NULL,status text NOT NULL,checkpoint jsonb,checkpoint_tick integer NOT NULL DEFAULT 0,result jsonb,heartbeat timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS mg_events(match_id text REFERENCES mg_matches(id),sequence integer NOT NULL,events jsonb NOT NULL,PRIMARY KEY(match_id,sequence));
CREATE TABLE IF NOT EXISTS mg_stats(player_id text PRIMARY KEY,name text NOT NULL,controller text NOT NULL,matches integer NOT NULL DEFAULT 0,wins integer NOT NULL DEFAULT 0,peak_mass double precision NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS mg_stat_awards(match_id text NOT NULL,player_id text NOT NULL,PRIMARY KEY(match_id,player_id));
CREATE TABLE IF NOT EXISTS mg_epochs(deployment text NOT NULL,id bigint NOT NULL,status text NOT NULL,secret text NOT NULL,commitment text NOT NULL,PRIMARY KEY(deployment,id));
CREATE TABLE IF NOT EXISTS mg_entries(deployment text NOT NULL,epoch bigint NOT NULL,wallet text NOT NULL,owner text NOT NULL,player_id text NOT NULL,name varchar(24) NOT NULL,controller text NOT NULL,controller_hash text NOT NULL,confirmed boolean NOT NULL DEFAULT false,PRIMARY KEY(deployment,epoch,wallet));
CREATE TABLE IF NOT EXISTS mg_jobs(id text PRIMARY KEY,deployment text NOT NULL,epoch bigint NOT NULL,arena integer NOT NULL,seed bigint NOT NULL,roster jsonb NOT NULL,budget numeric(30,0) NOT NULL,starts_at bigint NOT NULL,status text NOT NULL DEFAULT 'pending',room_id text,claim_time timestamptz,UNIQUE(deployment,epoch,arena));
CREATE TABLE IF NOT EXISTS mg_transactions(operation_key text PRIMARY KEY,deployment text NOT NULL,epoch bigint,wallet text,kind text NOT NULL,status text NOT NULL,hash text,raw text,updated_at timestamptz NOT NULL DEFAULT now());
`);}
