import { useState } from 'react';

export function Button({ children, variant = 'primary', className = '', disabled, ...props }) {
  const variants = {
    primary:
      'bg-forest text-white hover:bg-pine active:bg-sage-800 disabled:opacity-50 disabled:cursor-not-allowed',
    secondary:
      'bg-surface text-forest border border-divider hover:bg-sage-50 active:bg-sage-100 disabled:opacity-50',
    ghost: 'bg-transparent text-sage-700 hover:bg-sage-50 active:bg-sage-100',
    danger: 'bg-alert text-white hover:opacity-90 active:opacity-80',
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({ label, error, type, className = '', showPasswordToggle = false, ...props }) {
  const isPassword = type === 'password';
  const [showPassword, setShowPassword] = useState(false);
  const effectiveType = isPassword && showPassword ? 'text' : type;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-text-secondary">{label}</label>
      )}
      <div className="relative flex items-center">
        <input
          type={effectiveType}
          className={`w-full rounded-lg border bg-surface px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 ${
            isPassword && showPasswordToggle ? 'pr-11' : ''
          } ${error ? 'border-alert' : 'border-divider'}`}
          {...props}
        />
        {isPassword && showPasswordToggle && (
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'View password'}
            title={showPassword ? 'Hide password' : 'View password'}
            tabIndex={-1}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-forest transition-colors focus:outline-none"
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" x2="22" y1="2" y2="22" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && <span className="text-xs text-alert">{error}</span>}
    </div>
  );
}

export function Select({ label, error, children, className = '', ...props }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label className="text-sm font-medium text-text-secondary">{label}</label>
      )}
      <select
        className={`rounded-lg border bg-surface px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-sage-500 focus:ring-2 focus:ring-sage-500/20 ${
          error ? 'border-alert' : 'border-divider'
        }`}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-xs text-alert">{error}</span>}
    </div>
  );
}

export function Card({ children, className = '' }) {
  return (
    <div className={`rounded-xl border border-divider/80 p-6 shadow-sm backdrop-blur-md ${className.includes('bg-') ? '' : 'bg-surface/95'} ${className}`}>
      {children}
    </div>
  );
}

export function Alert({ children, variant = 'info' }) {
  const variants = {
    info: 'bg-sage-50 text-sage-800 border-sage-200',
    success: 'bg-mint/40 text-forest border-sage-300',
    error: 'bg-alert-muted text-alert border-alert/30',
    warning: 'bg-warning-muted text-amber-800 border-warning/30',
  };

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${variants[variant]}`}>
      {children}
    </div>
  );
}

export function Logo({ size = 'md', variant = 'dark' }) {
  const sizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
  };

  const isLight = variant === 'light';

  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${isLight ? 'bg-white/15 backdrop-blur-sm' : 'bg-forest'}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 8h12v2H6V8zm0 4h8v2H6v-2zm0 4h10v2H6v-2z"
            fill="#D8F3DC"
          />
          <circle cx="18" cy="7" r="3" fill="#52B788" />
        </svg>
      </div>
      <div>
        <div className={`font-semibold ${isLight ? 'text-white' : 'text-forest'} ${sizes[size]}`}>
          EcoCampus
        </div>
        <div className={`text-[11px] font-medium uppercase tracking-wider ${isLight ? 'text-white/70' : 'text-text-muted'}`}>
          Smart Waste Platform
        </div>
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-sage-200 border-t-forest" />
  );
}
