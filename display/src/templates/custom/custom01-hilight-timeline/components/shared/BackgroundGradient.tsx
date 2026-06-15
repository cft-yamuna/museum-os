import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ANIMATION } from '../../constants/animation';

interface BackgroundGradientProps {
  sectorColor?: string | null;
}

export default function BackgroundGradient({ sectorColor = null }: BackgroundGradientProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;

    gsap.to(el, {
      opacity: sectorColor ? 1 : 0,
      duration: ANIMATION.sectorTransition.colorGradient.duration,
      ease: 'power2.inOut',
    });
  }, [sectorColor]);

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, #C3C7C8 0%, #d1cece 33%, #DEDBD4 100%)',
        }}
      />
      <div
        ref={overlayRef}
        style={{
          position: 'absolute',
          inset: 0,
          background: sectorColor
            ? `linear-gradient(180deg, transparent 0%, transparent 40%, ${sectorColor}33 70%, ${sectorColor}66 100%)`
            : 'transparent',
          opacity: 0,
          pointerEvents: 'none',
          zIndex: 30,
        }}
      />
    </>
  );
}
