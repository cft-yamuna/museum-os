import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSiteStore } from '../stores/site';
import { useToastStore } from '../stores/toast';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import type { Device } from '../lib/types';
import {
  ChevronRight,
  Cpu,
  Link2,
  Monitor,
  Save,
} from 'lucide-react';

/** Convert a display name into a URL-safe slug */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Validate slug format: lowercase alphanumeric + hyphens, no leading/trailing hyphens */
function validateSlug(slug: string): string | null {
  if (!slug) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    if (/^-/.test(slug) || /-$/.test(slug)) {
      return 'Slug must not start or end with a hyphen';
    }
    return 'Slug may only contain lowercase letters, numbers, and hyphens';
  }
  return null;
}

export function DeviceCreatePage() {
  const navigate = useNavigate();
  const activeSiteId = useSiteStore((s) => s.activeSiteId);
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [type, setType] = useState('display');
  const [ipAddress, setIpAddress] = useState('');
  const [macAddress, setMacAddress] = useState('');
  const [comPort, setComPort] = useState('');

  // Track whether user has manually edited the slug
  const slugManuallyEdited = useRef(false);

  const slugError = slug ? validateSlug(slug) : null;
  const displayUrl = slug ? `${window.location.protocol}//${window.location.hostname}:3401/display/${slug}` : '';

  const handleNameChange = (value: string) => {
    setDisplayName(value);
    if (!slugManuallyEdited.current) {
      setSlug(toSlug(value));
    }
  };

  const handleSlugChange = (value: string) => {
    slugManuallyEdited.current = true;
    // Normalize: only allow valid slug characters as the user types
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  };

  // Create device mutation
  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Device>('/devices', {
        site_id: activeSiteId,
        display_name: displayName.trim(),
        slug: slug || undefined,
        type,
        ip_address: ipAddress.trim() || undefined,
        mac_address: macAddress.trim() || undefined,
        config: comPort.trim() ? { com_port: comPort.trim() } : undefined,
      }),
    onSuccess: (device) => {
      addToast('success', 'Device created');
      queryClient.invalidateQueries({ queryKey: ['devices', activeSiteId] });
      navigate(`/devices/${device.id}`, { replace: true });
    },
    onError: (err) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to create device');
    },
  });

  const canSave = displayName.trim() && !slugError;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <nav className="flex items-center gap-1.5 text-base">
          <button onClick={() => navigate('/devices')} className="text-surface-500 hover:text-surface-700">
            Devices
          </button>
          <ChevronRight className="h-4 w-4 text-surface-400" />
          <span className="text-surface-900">New Device</span>
        </nav>
        <h1 className="text-3xl font-bold text-surface-900 tracking-tight mt-1">Add New Device</h1>
      </div>

      {/* Save button bar */}
      <div className="flex justify-end">
        <Button
          onClick={() => createMutation.mutate()}
          loading={createMutation.isPending}
          disabled={!canSave}
          size="lg"
          className="h-11 px-6 rounded-xl text-base"
        >
          <Save className="h-4.5 w-4.5" />
          Create Device
        </Button>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Device Identity */}
        <div className="bryzos-card rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--glass-border)] flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary-100 flex items-center justify-center shrink-0">
              <Monitor className="h-5 w-5 text-primary-600" />
            </div>
            <h2 className="text-lg font-bold text-surface-900">Device Identity</h2>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. Lobby Screen 1"
                autoFocus
                className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="e.g. lobby-screen-1"
                className={`h-10 w-full px-3.5 rounded-xl border card-bg text-base text-surface-700 placeholder:text-surface-400 font-mono focus:outline-none focus:ring-2 transition-all ${
                  slugError
                    ? 'border-red-300 focus:ring-red-500/30'
                    : 'border-surface-300 focus:ring-primary-500/30 focus:border-primary-400'
                }`}
              />
              {slugError && (
                <p className="text-sm text-red-600 mt-1.5">{slugError}</p>
              )}
              {!slugError && slug && (
                <div className="mt-2 flex items-center gap-2 text-sm text-surface-500 bg-surface-50 rounded-lg px-3 py-2">
                  <Link2 className="h-4 w-4 text-surface-400 shrink-0" />
                  <span className="font-mono truncate">{displayUrl}</span>
                </div>
              )}
              {!slug && (
                <p className="text-sm text-surface-400 mt-1.5">
                  Auto-generated from display name. Used in the device display URL.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Hardware */}
        <div className="bryzos-card rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--glass-border)] flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
              <Cpu className="h-5 w-5 text-amber-600 dark:text-amber-300" />
            </div>
            <h2 className="text-lg font-bold text-surface-900">Hardware</h2>
          </div>
          <div className="p-5 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">Device Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
              >
                <option value="display">Display</option>
                <option value="kiosk">Kiosk</option>
                <option value="projector">Projector</option>
                <option value="audio">Audio</option>
                <option value="lighting">Lighting</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">IP Address</label>
              <input
                type="text"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="e.g. 192.168.0.137"
                className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
              />
              <p className="text-sm text-surface-400 mt-1.5">
                Optional. Helps auto-provision the correct display on the network.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">MAC Address</label>
              <input
                type="text"
                value={macAddress}
                onChange={(e) => setMacAddress(e.target.value)}
                placeholder="e.g. AA:BB:CC:DD:EE:FF"
                className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
              />
              <p className="text-sm text-surface-400 mt-1.5">
                Required for Wake-on-LAN. Leave blank if unknown.
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-surface-600 mb-1.5">COM Port</label>
              <input
                type="text"
                value={comPort}
                onChange={(e) => setComPort(e.target.value)}
                placeholder="e.g. COM3 or /dev/ttyUSB0"
                className="h-10 w-full px-3.5 rounded-xl border border-surface-300 card-bg text-base text-surface-700 placeholder:text-surface-400 font-mono focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
              />
              <p className="text-sm text-surface-400 mt-1.5">
                For hardware like monophone or ESP32. Leave blank if no hardware.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
