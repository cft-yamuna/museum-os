import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchScreenshots, sendAgentCommand } from '../../lib/agentApi';
import { useToastStore } from '../../stores/toast';
import { Spinner } from '../ui/Spinner';
import { Camera, Maximize2, X } from 'lucide-react';
import type { Screenshot } from '../../lib/types';

interface ScreenshotViewerProps {
  deviceId: string;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString();
}

export function ScreenshotViewer({ deviceId }: ScreenshotViewerProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [capturing, setCapturing] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up capture timer on unmount
  useEffect(() => {
    return () => {
      if (captureTimerRef.current !== null) {
        clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    };
  }, []);

  const { data: screenshots = [], isLoading, refetch } = useQuery({
    queryKey: ['screenshots', deviceId],
    queryFn: () => fetchScreenshots(deviceId),
    enabled: !!deviceId,
  });

  const captureScreenshot = async () => {
    setCapturing(true);
    try {
      const result = await sendAgentCommand(deviceId, 'kiosk:screenshot', undefined, true, 15_000);
      // Check if the agent reported a failure
      const agentResult = result?.result;
      if (agentResult && 'error' in agentResult) {
        addToast('error', `Screenshot failed: ${agentResult.error}`);
        setCapturing(false);
        return;
      }
      if (result && !result.delivered) {
        addToast('error', 'Screenshot command could not be delivered to agent');
        setCapturing(false);
        return;
      }
      // Wait briefly for the upload to complete, then refetch
      captureTimerRef.current = setTimeout(() => {
        captureTimerRef.current = null;
        refetch();
        setCapturing(false);
      }, 2000);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Screenshot capture failed');
      setCapturing(false);
    }
  };

  const latest = screenshots[0] || null;

  return (
    <div className="space-y-3">
      {/* Header with capture button */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-surface-500 uppercase tracking-wider">
          Screenshots
        </h4>
        <button
          onClick={captureScreenshot}
          disabled={capturing}
          className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-xl border border-surface-300 card-bg text-[12px] font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50 transition-colors"
        >
          {capturing ? (
            <Spinner size="sm" className="text-surface-400" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
          Capture
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Spinner size="sm" className="text-surface-400" />
        </div>
      )}

      {!isLoading && !latest && (
        <div className="py-6 text-center text-[13px] text-surface-400 border border-dashed border-surface-200 rounded-xl">
          No screenshots yet. Click Capture to take one.
        </div>
      )}

      {!isLoading && latest && (
        <>
          {/* Main screenshot */}
          <div
            className="relative group cursor-pointer rounded-xl overflow-hidden border border-surface-200 bg-surface-50"
            onClick={() => setLightboxUrl(latest.url)}
          >
            <img
              src={latest.url}
              alt="Latest screenshot"
              className="w-full h-auto object-contain max-h-[320px]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-80 transition-opacity drop-shadow-md" />
            </div>
            <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 bg-gradient-to-t from-black/50 to-transparent">
              <span className="text-[11px] text-white/90">
                {formatTime(latest.timestamp)}
              </span>
            </div>
          </div>

          {/* Thumbnail strip */}
          {screenshots.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {screenshots.slice(0, 8).map((s: Screenshot) => (
                <button
                  key={s.filename}
                  onClick={() => setLightboxUrl(s.url)}
                  className="shrink-0 w-16 h-12 rounded border border-surface-200 overflow-hidden hover:border-primary-400 transition-colors"
                >
                  <img
                    src={s.url}
                    alt={`Screenshot ${s.filename}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Lightbox overlay */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={lightboxUrl}
            alt="Screenshot fullscreen"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
