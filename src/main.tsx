import React from 'react';import {createRoot} from 'react-dom/client';
import '@fontsource-variable/fraunces/index.css';
import '@fontsource/dm-sans/400.css';import '@fontsource/dm-sans/500.css';import '@fontsource/dm-sans/600.css';import '@fontsource/dm-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import './style.css';import './brand-story.css';import App from './App';
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{});});}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
