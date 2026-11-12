import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorText: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorText: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorText: error?.message || 'خطای نامشخص در بارگذاری برنامه' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App Uncaught Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, errorText: '' });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4" dir="rtl">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-100">
              مشکلی در بارگذاری رخ داد
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              برای بازیابی صفحه و ادامه کار، دکمه زیر را لمس کنید:
            </p>
            {this.state.errorText && (
              <p className="text-[11px] font-mono text-rose-400/80 bg-slate-950 p-2 rounded-lg break-all">
                {this.state.errorText}
              </p>
            )}
            <button
              onClick={this.handleReset}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>بارگذاری مجدد برنامه</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
