import React, { useState, useEffect, useRef } from 'react';
import { BRAND_NAME } from '@/lib/brand';

interface ErrorScreenProps {
  message: string;
  retryIn?: number; // seconds until auto-retry
  onRetry?: () => void;
}

export function ErrorScreen(props: ErrorScreenProps) {
  const message = props.message;
  const retryIn = props.retryIn;
  const onRetry = props.onRetry;

  const [countdown, setCountdown] = useState(retryIn || 0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!retryIn || retryIn <= 0) return;

    setCountdown(retryIn);

    timerRef.current = setInterval(() => {
      setCountdown((prev: number) => {
        if (prev <= 1) {
          if (timerRef.current !== null) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          if (onRetry) {
            setTimeout(onRetry, 0);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [retryIn, onRetry]);

  // ---- Styles ----

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    color: '#e0e0e0',
    fontFamily: "'DM Sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    zIndex: 9999,
    overflow: 'hidden',
  };

  const logoStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '6px',
    textTransform: 'uppercase' as const,
    color: '#555',
    marginBottom: '48px',
  };

  const iconContainerStyle: React.CSSProperties = {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: '2px solid #331a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '28px',
  };

  const iconStyle: React.CSSProperties = {
    fontSize: '24px',
    color: '#cc4444',
    fontWeight: 300,
    lineHeight: 1,
  };

  const messageStyle: React.CSSProperties = {
    fontSize: '14px',
    color: '#999',
    letterSpacing: '0.3px',
    textAlign: 'center',
    maxWidth: '400px',
    lineHeight: '1.6',
    marginBottom: '32px',
    padding: '0 24px',
  };

  const countdownStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#555',
    letterSpacing: '0.5px',
    marginBottom: '20px',
  };

  const buttonStyle: React.CSSProperties = {
    background: 'none',
    border: '1px solid #333',
    color: '#999',
    fontSize: '12px',
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    padding: '10px 28px',
    cursor: 'pointer',
    transition: 'border-color 0.2s, color 0.2s',
    fontFamily: 'inherit',
  };

  const keyframes = [
    '@keyframes lm-error-fade-in {',
    '  0% { opacity: 0; transform: translateY(8px); }',
    '  100% { opacity: 1; transform: translateY(0); }',
    '}',
  ].join('\n');

  const contentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    animation: 'lm-error-fade-in 0.4s ease-out',
  };

  return (
    <div style={containerStyle}>
      <style dangerouslySetInnerHTML={{ __html: keyframes }} />
      <div style={contentStyle}>
        <div style={logoStyle}>{BRAND_NAME}</div>
        <div style={iconContainerStyle}>
          <span style={iconStyle}>!</span>
        </div>
        <div style={messageStyle}>{message}</div>
        {retryIn && retryIn > 0 && countdown > 0 ? (
          <div style={countdownStyle}>
            {`Retrying in ${countdown}s`}
          </div>
        ) : null}
        {onRetry ? (
          <button
            style={buttonStyle}
            onClick={onRetry}
            onMouseOver={(e) => {
              const target = e.currentTarget;
              target.style.borderColor = '#666';
              target.style.color = '#ccc';
            }}
            onMouseOut={(e) => {
              const target = e.currentTarget;
              target.style.borderColor = '#333';
              target.style.color = '#999';
            }}
          >
            Retry Now
          </button>
        ) : null}
      </div>
    </div>
  );
}
