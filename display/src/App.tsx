import React, { useState, useCallback, useEffect } from 'react';
import { hasCredentials, initFromProvisioning } from '@/lib/config';
import { AppShell } from '@/components/core/AppShell';
import { ProvisioningScreen } from '@/components/ProvisioningScreen';
import { TemplateRouter } from '@/components/TemplateRouter';
import { ErrorScreen } from '@/components/core/ErrorScreen';

// ==========================================
// URL Parsing
// ==========================================

function getSlugFromUrl(): string {
  // URL pattern: /display/{slug}
  const path = window.location.pathname;
  const prefix = '/display/';
  if (path.indexOf(prefix) === 0) {
    let slug = path.substring(prefix.length);
    // Remove trailing slash
    if (slug.charAt(slug.length - 1) === '/') {
      slug = slug.substring(0, slug.length - 1);
    }
    return slug;
  }
  return '';
}

function getQueryParam(name: string): string {
  const search = window.location.search;
  if (!search || search.length < 2) return '';
  const pairs = search.substring(1).split('&');
  for (let i = 0; i < pairs.length; i++) {
    const parts = pairs[i].split('=');
    if (decodeURIComponent(parts[0]) === name) {
      return parts.length > 1 ? decodeURIComponent(parts[1]) : '';
    }
  }
  return '';
}

// ==========================================
// App Component
// ==========================================

function App() {
  const slug = getSlugFromUrl();
  const normalizedSlug = slug.toLowerCase();

  // Check for direct provisioning via query params
  const qDeviceId = getQueryParam('deviceId');
  const qApiKey = getQueryParam('apiKey');
  if (qDeviceId && qApiKey) {
    initFromProvisioning(qDeviceId, qApiKey);
  }

  const [isProvisioned, setIsProvisioned] = useState(hasCredentials());

  const handleProvisioned = useCallback(() => {
    setIsProvisioned(true);
  }, [setIsProvisioned]);

  useEffect(() => {
    const html = document.documentElement;
    const useGeneralSans = (
      normalizedSlug === 'd-av02'
      || normalizedSlug === 'c-av02'
      || normalizedSlug === 'c-av03'
    );
    html.classList.toggle('device-font-general-sans', useGeneralSans);

    return () => {
      html.classList.remove('device-font-general-sans');
    };
  }, [normalizedSlug]);

  // No slug in URL - show error
  if (!slug) {
    return React.createElement(ErrorScreen, {
      message: 'No device slug in URL.\n\nExpected: /display/{device-slug}\n\nPlease check the URL.',
    });
  }

  // Not provisioned - show provisioning screen
  if (!isProvisioned) {
    return React.createElement(ProvisioningScreen, {
      slug,
      onProvisioned: handleProvisioned,
    });
  }

  // Provisioned - render AppShell with template router
  return React.createElement(AppShell, {
    children: (appConfig, templateType, instanceId, revision) => {
      return React.createElement(TemplateRouter, {
        config: appConfig,
        templateType,
        instanceId,
        revision,
      });
    },
  });
}

export { App };
