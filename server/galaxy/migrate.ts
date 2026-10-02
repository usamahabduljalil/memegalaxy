import {db,migrateGalaxy} from './store';
try{await migrateGalaxy();console.log('MEMEGalaxy database schema ready.');}finally{await db.end();}
