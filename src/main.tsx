import React from 'react';
import ReactDOM from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { withoutScenarioDetails } from './telemetry';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <>
    <React.StrictMode>
      <App />
    </React.StrictMode>
    <Analytics beforeSend={withoutScenarioDetails} />
    <SpeedInsights beforeSend={withoutScenarioDetails} />
  </>,
);
