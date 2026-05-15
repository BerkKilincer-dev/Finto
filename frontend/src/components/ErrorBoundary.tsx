import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

/**
 * Tek bir render hatası tüm uygulamayı çökertmesin diye en dış sarmalayıcı.
 * Hata UI'ı klavye + ekran okuyucu erişilebilir.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Bilinmeyen bir hata oluştu.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Yakalanan hata:', error, info);
  }

  handleReload = (): void => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="min-h-screen flex items-center justify-center bg-white dark:bg-black text-slate-900 dark:text-white p-6"
      >
        <div className="max-w-lg w-full border-2 border-red-600 p-6 space-y-4">
          <h1 className="text-2xl font-black">Beklenmeyen bir hata oluştu</h1>
          <p className="text-base">
            Sayfayı yenileyerek tekrar deneyebilirsiniz. Hata devam ederse bize bildirin.
          </p>
          <pre className="text-sm bg-slate-100 dark:bg-slate-900 p-3 overflow-auto max-h-40">
            {this.state.message}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            className="px-5 py-3 bg-blue-700 text-white font-black border-2 border-slate-900 dark:border-white"
          >
            Sayfayı yenile
          </button>
        </div>
      </div>
    );
  }
}
