import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <>
    <React.StrictMode>
      <App />
    </React.StrictMode>
    <Analytics beforeSend={event => {
      const url = new URL(event.url);
      url.search = '';
      url.hash = '';
      return { ...event, url: url.toString() };
    }} />
  </>,
);
