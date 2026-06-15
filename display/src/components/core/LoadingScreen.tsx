import React from 'react';
import { BRAND_NAME } from '@/lib/brand';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen(props: LoadingScreenProps) {
  const message = props.message;

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

  const spinnerContainerStyle: React.CSSProperties = {
    position: 'relative',
    width: '48px',
    height: '48px',
    marginBottom: '32px',
  };

  const messageStyle: React.CSSProperties = {
    fontSize: '13px',
    color: '#666',
    letterSpacing: '0.5px',
    textAlign: 'center',
    maxWidth: '300px',
    lineHeight: '1.5',
  };

  // CSS keyframes injected via style tag
  const keyframes = [
    '@keyframes lm-spin {',
    '  0% { transform: rotate(0deg); }',
    '  100% { transform: rotate(360deg); }',
    '}',
    '@keyframes lm-pulse {',
    '  0%, 100% { opacity: 0.3; }',
    '  50% { opacity: 0.8; }',
    '}',
  ].join('\n');

  const spinnerStyle: React.CSSProperties = {
    width: '48px',
    height: '48px',
    border: '2px solid #1a1a1a',
    borderTopColor: '#888',
    borderRadius: '50%',
    animation: 'lm-spin 1s linear infinite',
    boxSizing: 'border-box',
  };

  const dotStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: '6px',
    height: '6px',
    marginTop: '-3px',
    marginLeft: '-3px',
    borderRadius: '50%',
    backgroundColor: '#888',
    animation: 'lm-pulse 1.5s ease-in-out infinite',
  };

  return (
    <div style={containerStyle}>
      <style dangerouslySetInnerHTML={{ __html: keyframes }} />
      <div style={logoStyle}>{BRAND_NAME}</div>
      <div style={spinnerContainerStyle}>
        <div style={spinnerStyle} />
        <div style={dotStyle} />
      </div>
      {message ? <div style={messageStyle}>{message}</div> : null}
    </div>
  );
}
