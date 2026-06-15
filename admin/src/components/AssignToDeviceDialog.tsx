import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Monitor, ListMusic, X } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../stores/toast';
import { Button } from './ui/Button';
import type { Device } from '../lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssignToDeviceDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  /** For video content -> video-loop */
  contentUrl?: string;
  contentName?: string;
  /** For playlist -> slideshow */
  playlistId?: string;
  playlistName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildVideoLoopConfig(contentUrl: string) {
  const instanceId = crypto.randomUUID();
  return {
    templateType: 'video-loop',
    instanceId,
    appUrl: `/apps/video-loop/${instanceId}`,
    appConfig: {
      videoUrl: contentUrl,
      muted: false,
      volume: 100,
      fit: 'cover',
    },
  };
}

function buildSlideshowConfig(playlistId: string) {
  const instanceId = crypto.randomUUID();
  return {
    templateType: 'slideshow',
    instanceId,
    appUrl: `/apps/slideshow/${instanceId}`,
    appConfig: {
      playlistId,
      defaultDuration: 8,
      transition: 'fade',
      transitionDuration: 500,
      fit: 'cover',
      shuffle: false,
      loop: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AssignToDeviceDialog({
  open,
  onClose,
  siteId,
  contentUrl,
  contentName,
  playlistId,
  playlistName,
}: AssignToDeviceDialogProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();

  const isVideo = Boolean(contentUrl);
  const displayName = isVideo ? contentName : playlistName;
  const templateLabel = isVideo ? 'Video Loop' : 'Slideshow';

  // Fetch devices for the site
  const { data: devices = [], isLoading: devicesLoading } = useQuery({
    queryKey: ['devices', siteId],
    queryFn: () => api.get<Device[]>(`/devices?site_id=${siteId}`),
    enabled: open && Boolean(siteId),
  });

  // Assign mutation
  const mutation = useMutation({
    mutationFn: async () => {
      const config = isVideo
        ? buildVideoLoopConfig(contentUrl!)
        : buildSlideshowConfig(playlistId!);

      return api.put(`/devices/${selectedDeviceId}`, { config });
    },
    onSuccess: () => {
      const device = devices.find((d) => d.id === selectedDeviceId);
      addToast(
        'success',
        `Assigned "${displayName}" to ${device?.display_name ?? 'device'}`
      );
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      handleClose();
    },
    onError: (err: Error) => {
      addToast('error', err.message);
    },
  });

  const handleClose = useCallback(() => {
    if (mutation.isPending) return;
    setSelectedDeviceId('');
    onClose();
  }, [mutation.isPending, onClose]);

  const handleSubmit = useCallback(() => {
    if (!selectedDeviceId) return;
    mutation.mutate();
  }, [selectedDeviceId, mutation]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative bryzos-card rounded-3xl shadow-xl w-full max-w-sm mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)]">
          <h2 className="text-sm font-medium text-surface-900">
            Display on Device
          </h2>
          <button
            onClick={handleClose}
            disabled={mutation.isPending}
            aria-label="Close dialog"
            className="h-8 w-8 inline-flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 disabled:opacity-50 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {/* Content preview */}
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">
              Content
            </label>
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-50 border border-surface-200">
              {isVideo ? (
                <Monitor className="h-4 w-4 text-surface-400 shrink-0" />
              ) : (
                <ListMusic className="h-4 w-4 text-surface-400 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-surface-900 truncate">
                  {displayName}
                </div>
                <div className="text-[11px] text-surface-400">
                  {templateLabel}
                </div>
              </div>
            </div>
          </div>

          {/* Device picker */}
          <div>
            <label className="block text-xs font-medium text-surface-500 mb-1">
              Device
            </label>
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={devicesLoading}
              className="h-8 w-full px-2.5 rounded-xl border border-surface-300 bg-surface-100 text-[13px] text-surface-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">
                {devicesLoading ? 'Loading devices...' : 'Select a device...'}
              </option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.display_name} ({device.type}) - {device.status}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--glass-border)]">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!selectedDeviceId || mutation.isPending}
            loading={mutation.isPending}
          >
            Go
          </Button>
        </div>
      </div>
    </div>
  );
}
