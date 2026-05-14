import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { AnnouncerProvider } from './hooks/useAnnouncer.tsx';
import { AccessibilitySettingsProvider } from './hooks/useAccessibilitySettings.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessibilitySettingsProvider>
      <AnnouncerProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AnnouncerProvider>
    </AccessibilitySettingsProvider>
  </StrictMode>,
);
