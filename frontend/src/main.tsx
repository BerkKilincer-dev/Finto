import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { AnnouncerProvider } from './hooks/useAnnouncer.tsx';
import { AccessibilitySettingsProvider } from './hooks/useAccessibilitySettings.tsx';
import { I18nProvider } from './hooks/useI18n.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <I18nProvider>
        <AccessibilitySettingsProvider>
          <AnnouncerProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </AnnouncerProvider>
        </AccessibilitySettingsProvider>
      </I18nProvider>
    </ErrorBoundary>
  </StrictMode>,
);
