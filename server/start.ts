export {};
const role=process.env.SERVICE_ROLE||process.argv[2];
if(role==='galaxy-game')await import('./galaxy/index');
else if(role==='galaxy-worker')await import('./galaxy/worker');
else {const {migrate}=await import('./migrate');await migrate();if(role==='game')await import('./index');else if(role==='worker')await import('./worker');else throw new Error('Expected game, worker, galaxy-game or galaxy-worker service role');}
