import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initTheme } from './stores/theme';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Initialize theme before render to avoid flash (defaults to rich dark)
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary variant="app">
      <App />
    </ErrorBoundary>
  </StrictMode>
);
