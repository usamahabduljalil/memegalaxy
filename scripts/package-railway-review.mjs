// Upload this explicit, secret-free tree with railway up --path-as-root --no-gitignore.
// Keep the normal worker image separate; only the staging game service needs the UI.
import {cpSync,existsSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,basename} from 'node:path';
const destination=resolve('.local/railway-web-review');
if(!existsSync('dist/index.html'))throw new Error('Run npm run build first');
mkdirSync(destination,{recursive:true});
for(const directory of ['server','shared','sdk','dist'])cpSync(directory,resolve(destination,directory),{recursive:true,filter:source=>!['node_modules','.local','.git'].includes(basename(source))&&!basename(source).startsWith('.env')&&!source.endsWith('.log')});
copyFileSync('Dockerfile.web-review',resolve(destination,'Dockerfile'));
console.log('Review artifact ready: '+destination);
