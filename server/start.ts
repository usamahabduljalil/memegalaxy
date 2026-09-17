import { migrate } from './migrate';
await migrate();
const role=process.env.SERVICE_ROLE||process.argv[2];
if(role==='game')await import('./index');
else if(role==='worker')await import('./worker');
else throw new Error('Expected game or worker service role');
