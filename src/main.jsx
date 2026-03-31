import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App'
import './index.css'

Sentry.init({
  dsn: "https://fcee49eeaec122accdf54c42e6f33f3f@o4511136651345920.ingest.us.sentry.io/4511136713670656",
  tracesSampleRate: 0.5,
  enabled: import.meta.env.PROD,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
  ],
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
