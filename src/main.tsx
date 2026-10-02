import './polyfills';
import React,{lazy,Suspense} from 'react';
import { createRoot } from 'react-dom/client';
const isGalaxy=import.meta.env.DEV||location.hostname==='memegalaxy.usamahabduljalil21.chatgpt.site'||import.meta.env.VITE_MEMEGALAXY_LIVE==='true'||new URLSearchParams(location.search).get('preview')==='memegalaxy';
// Keep each dynamic import separate so Vite preloads its matching CSS.
const App=isGalaxy?lazy(()=>import('./galaxy/GalaxyExperience')):lazy(()=>import('./Experience'));
import './style.css';
import './game.css';
import './orbit-theme.css';
// Load the preview theme with the initial page, including hosted lazy routes.
import './galaxy/galaxy.css';
document.title=isGalaxy?'MEMEGalaxy — Human instinct. Machine ambition.':'Big Circle — Legacy Arc beta';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Suspense fallback={<div role="status" style={{padding:32}}>Opening your arena…</div>}><App /></Suspense></React.StrictMode>);
