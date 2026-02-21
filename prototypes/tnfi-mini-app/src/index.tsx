import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import WebApp from '@twa-dev/sdk';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

const TONCONNECT_MANIFEST_URL = 'https://tnftfi.ru/tonconnect-manifest.json';

// Инициализация Telegram Web App SDK. 
// Это обязательно нужно сделать до рендеринга App.
WebApp.ready();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <TonConnectUIProvider
      manifestUrl={TONCONNECT_MANIFEST_URL}
      actionsConfiguration={{ returnStrategy: 'back' }}
    >
      <App />
    </TonConnectUIProvider>
  </React.StrictMode>
);
