import './polyfills';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './GameApp';
import './style.css';
import './game.css';
import { WalletProvider } from './wallet';
createRoot(document.getElementById('root')!).render(<React.StrictMode><WalletProvider><App /></WalletProvider></React.StrictMode>);
