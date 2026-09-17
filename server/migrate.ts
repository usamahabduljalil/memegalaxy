import { readFile } from 'node:fs/promises';
import { pool } from './db';
export async function migrate(){
const connection=await pool.connect();
try {
  await connection.query('BEGIN');
  await connection.query('SELECT pg_advisory_xact_lock(748220)');
  await connection.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
  await connection.query('COMMIT');
  console.log('Database schema ready.');
} catch(error){await connection.query('ROLLBACK');throw error;}
finally {connection.release();}
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/migrate.ts')){try{await migrate();}finally{await pool.end();}}
