/**
 * DandelionAnimation — experimentation page with tunable animation modes.
 * Single dandelion with floating animation + switchable strand effects.
 * Control panel lets you pick modes and adjust parameters live.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import gsap from 'gsap';
import FloatingDandelion from './FloatingDandelion';
import { MODES } from './dandelionModes';
import type { AnimationModeDef } from './dandelionModes';
import type { DandelionHandle } from '../../types';

function getDefaults(mode: AnimationModeDef): Record<string, number> {
  const values: Record<string, number> = {};
  mode.params.forEach((p) => { values[p.key] = p.default; });
  return values;
}

function resetPaths(paths: Element[]) {
  paths.forEach((path) => {
    gsap.killTweensOf(path);
    gsap.set(path, { clearProps: 'all' });
    path.removeAttribute('transform');
    path.removeAttribute('data-svg-origin');
    path.removeAttribute('style');
  });
}

const DandelionAnimation = () => {
  const dandelionRef = useRef<DandelionHandle>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const [modeId, setModeId] = useState(MODES[0].id);
  const [params, setParams] = useState<Record<string, number>>(getDefaults(MODES[0]));

  const mode = MODES.find((m) => m.id === modeId)!;

  // Apply animation whenever mode or params change
  useEffect(() => {
    const container = dandelionRef.current?.getContainer();
    if (!container) return;

    const paths = Array.from(container.querySelectorAll('svg g path'));
    if (!paths.length) return;

    cleanupRef.current?.();
    resetPaths(paths);
    cleanupRef.current = mode.apply(paths, params);

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [modeId, params, mode]);

  const handleModeChange = useCallback((newModeId: string) => {
    const newMode = MODES.find((m) => m.id === newModeId)!;
    setModeId(newModeId);
    setParams(getDefaults(newMode));
  }, []);

  const handleParamChange = useCallback((key: string, value: number) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#0a0a14' }}>
      {/* Canvas */}
      <div
        style={{
          position: 'relative',
          width: 1080,
          height: 1920,
          margin: '0 auto',
          overflow: 'hidden',
          background: 'radial-gradient(ellipse at 50% 40%, #2a2a3e 0%, #1a1a2e 40%, #0d0d1a 100%)',
        }}
      >
        <FloatingDandelion
          ref={dandelionRef}
          color="#f48182"
          glowColor="rgba(244, 129, 130, 0.4)"
          size={350}
          x={365}
          y={785}
          label=""
          delay={0}
        />
      </div>

      {/* Control Panel */}
      <div
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          width: 280,
          padding: '16px 16px 12px',
          background: 'rgba(20, 20, 30, 0.95)',
          borderRadius: 8,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          color: '#b0b0b8',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: 13,
          backdropFilter: 'blur(12px)',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase' as const,
            color: '#7a7a84',
            marginBottom: 12,
          }}
        >
          Animation Controls
        </div>

        {/* Mode dropdown */}
        <label style={{ display: 'block', marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#7a7a84', marginBottom: 4 }}>Mode</div>
          <select
            value={modeId}
            onChange={(e) => handleModeChange(e.target.value)}
            style={{
              width: '100%',
              padding: '6px 8px',
              background: '#16161e',
              color: '#d0d0d8',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 6,
              fontSize: 13,
              outline: 'none',
            }}
          >
            {MODES.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255, 255, 255, 0.06)', margin: '0 0 12px' }} />

        {/* Parameter sliders */}
        {mode.params.map((p) => (
          <label key={p.key} style={{ display: 'block', marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 12, color: '#7a7a84' }}>{p.label}</span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                  color: '#d0d0d8',
                }}
              >
                {params[p.key]}
              </span>
            </div>
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={params[p.key]}
              onChange={(e) => handleParamChange(p.key, Number(e.target.value))}
              style={{ width: '100%', accentColor: '#f48182', height: 4 }}
            />
          </label>
        ))}
      </div>
    </div>
  );
};

export default DandelionAnimation;
