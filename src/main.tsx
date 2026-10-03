import './polyfills';
import React,{lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import './base.css';
import './galaxy/galaxy.css';
const App=import.meta.env.VITE_ADMIN_PORTAL==='true'?lazy(()=>import('./galaxy/GalaxyAdminPortal')):lazy(()=>import('./galaxy/GalaxyExperience'));
document.title=import.meta.env.VITE_ADMIN_PORTAL==='true'?'MEMEGalaxy Admin':'MEMEGalaxy — Human instinct. Machine ambition.';
createRoot(document.getElementById('root')!).render(<React.StrictMode><Suspense fallback={<div role="status" style={{padding:32}}>Opening your arena…</div>}><App /></Suspense></React.StrictMode>);
