import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>({ define: {'import.meta.env.VITE_ADMIN_PORTAL': JSON.stringify(mode==='admin'?'true':'false')}, plugins: [react()], server: { port: 5173, strictPort: true, watch: { ignored: ['**/.local/**', '**/.sites-runtime/**'] } }, build: { chunkSizeWarningLimit: 2000 } }));
