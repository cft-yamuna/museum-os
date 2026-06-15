import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initFromProvisioning } from '@/lib/config';
import { BRAND_NAME } from '@/lib/brand';

// ==========================================
// Types
// ==========================================

interface ProvisioningScreenProps {
  slug: string;
  onProvisioned: () => void;
}

interface ProvisionResult {
  deviceId: string;
  apiKey: string;
}

interface PairingResult {
  requiresPairing: boolean;
  code?: string;
}

// ==========================================
// Constants
// ==========================================

const POLL_INTERVAL = 3000; // 3 seconds
const API_BASE = `${window.location.origin}/api`;

// ==========================================
// ProvisioningScreen Component
// ==========================================

function ProvisioningScreen(props: ProvisioningScreenProps) {
  const slug = props.slug;
  const onProvisioned = props.onProvisioned;

  const [state, setState] = useState<'checking' | 'pairing' | 'error'>('checking');
  const [pairingCode, setPairingCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const mountedRef = useRef(true);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // Try auto-provision by IP
  const attemptProvision = useCallback(() => {
    setState('checking');

    fetch(`${API_BASE}/devices/provision/${encodeURIComponent(slug)}`)
      .then((res) => res.json())
      .then((data: ProvisionResult | PairingResult) => {
        if (!mountedRef.current) return;

        // Check if provisioned (has deviceId + apiKey)
        if ('deviceId' in data && 'apiKey' in data) {
          const result = data as ProvisionResult;
          initFromProvisioning(result.deviceId, result.apiKey);
          onProvisioned();
          return;
        }

        // Needs pairing
        const pairingData = data as PairingResult;
        if (pairingData.requiresPairing && pairingData.code) {
          setPairingCode(pairingData.code);
          setState('pairing');
          startPolling(pairingData.code);
        } else {
          setErrorMsg(`Device not found: ${slug}`);
          setState('error');
        }
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setState('error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, onProvisioned]);

  // Poll for pairing completion
  const startPolling = useCallback((code: string) => {
    const poll = () => {
      if (!mountedRef.current) return;

      fetch(`${API_BASE}/devices/provision/${encodeURIComponent(slug)}/status?code=${encodeURIComponent(code)}`)
        .then((res) => res.json())
        .then((data: ProvisionResult | { paired: false }) => {
          if (!mountedRef.current) return;

          if ('deviceId' in data && 'apiKey' in data) {
            const result = data as ProvisionResult;
            initFromProvisioning(result.deviceId, result.apiKey);
            onProvisioned();
            return;
          }

          // Not yet paired, poll again
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL);
        })
        .catch(() => {
          if (!mountedRef.current) return;
          // Retry on error
          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL);
        });
    };

    pollTimerRef.current = setTimeout(poll, POLL_INTERVAL);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, onProvisioned]);

  // Start provisioning on mount
  useEffect(() => {
    attemptProvision();
  }, [attemptProvision]);

  // ---- Styles ----

  const containerStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#0a0a0a',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#fff',
  };

  const logoStyle: React.CSSProperties = {
    fontSize: '32px',
    fontWeight: 700,
    letterSpacing: '6px',
    textTransform: 'uppercase' as const,
    marginBottom: '48px',
    opacity: 0.9,
  };

  const codeContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '12px',
    marginBottom: '32px',
  };

  const codeDigitStyle: React.CSSProperties = {
    width: '64px',
    height: '80px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '36px',
    fontWeight: 700,
    fontFamily: 'monospace',
    border: '1px solid rgba(255, 255, 255, 0.2)',
  };

  const statusStyle: React.CSSProperties = {
    fontSize: '16px',
    opacity: 0.6,
    marginTop: '8px',
  };

  const slugStyle: React.CSSProperties = {
    fontSize: '14px',
    opacity: 0.4,
    marginTop: '24px',
    fontFamily: 'monospace',
  };

  const errorStyle: React.CSSProperties = {
    color: '#ef4444',
    fontSize: '16px',
    marginBottom: '24px',
    textAlign: 'center' as const,
    maxWidth: '400px',
  };

  const retryButtonStyle: React.CSSProperties = {
    padding: '12px 32px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
  };

  // ---- Render ----

  if (state === 'checking') {
    return React.createElement('div', { style: containerStyle },
      React.createElement('div', { style: logoStyle }, BRAND_NAME),
      React.createElement('div', { style: statusStyle }, 'Connecting to server...'),
      React.createElement('div', { style: slugStyle }, slug)
    );
  }

  if (state === 'error') {
    return React.createElement('div', { style: containerStyle },
      React.createElement('div', { style: logoStyle }, BRAND_NAME),
      React.createElement('div', { style: errorStyle }, errorMsg),
      React.createElement('button', {
        style: retryButtonStyle,
        onClick: attemptProvision,
      }, 'Retry'),
      React.createElement('div', { style: slugStyle }, slug)
    );
  }

  // Pairing state
  const codeDigits = pairingCode.split('').map((digit, i) => {
    return React.createElement('div', { key: i, style: codeDigitStyle }, digit);
  });

  return React.createElement('div', { style: containerStyle },
    React.createElement('div', { style: logoStyle }, BRAND_NAME),
    React.createElement('div', { style: { fontSize: '18px', marginBottom: '24px', opacity: 0.8 } },
      'Enter this code in the admin panel'),
    React.createElement('div', { style: codeContainerStyle }, codeDigits),
    React.createElement('div', { style: statusStyle }, 'Waiting for admin to pair this device...'),
    React.createElement('div', { style: slugStyle }, slug)
  );
}

export { ProvisioningScreen };
export type { ProvisioningScreenProps };
