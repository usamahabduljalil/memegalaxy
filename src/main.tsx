import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './Experience';
import './style.css';
import './game.css';
import './orbit-theme.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
