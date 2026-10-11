import { Component, type ReactNode } from 'react';
import { t } from '../i18n';

/** Last line of defence: never leave players looking at a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('UI crashed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
        <h1 className="font-display text-3xl text-sambal-600">{t('crash.title')}</h1>
        <p className="max-w-md text-kopi-700">{t('crash.body')}</p>
        <button className="btn-primary" onClick={() => location.reload()}>
          {t('crash.reload')}
        </button>
      </div>
    );
  }
}
