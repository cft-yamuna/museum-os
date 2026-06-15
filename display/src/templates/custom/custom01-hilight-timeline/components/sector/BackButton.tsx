import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

interface BackButtonProps {
  onBack: () => void;
}

export default function BackButton({ onBack }: BackButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useGSAP(() => {
    const el = btnRef.current;
    if (!el) return;

    gsap.fromTo(el,
      { opacity: 0, x: -20 },
      { opacity: 1, x: 0, duration: 0.4, delay: 0.8, ease: 'power2.out' },
    );
  }, { scope: btnRef });

  return (
    <button
      ref={btnRef}
      onClick={onBack}
      style={{
        position: 'absolute',
        top: '80%',
        left: '2%',
        transform: 'translateY(-50%)',
        zIndex: 100,
        width: 120,
        height: 120,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: 0,
        opacity: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-label="Back to overview"
    >
      {/* Thick rounded chevron — matches reference design */}
      <svg
        width="216"
        height="216"
        viewBox="0 0 72 72"
        fill="none"
      >
        {/* Upper arm (lighter) */}
        <line
          x1="42" y1="20"
          x2="26" y2="36"
          stroke="rgba(200, 200, 200, 1.0)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Lower arm (lighter) */}
        <line
          x1="26" y1="36"
          x2="42" y2="52"
          stroke="rgba(200, 200, 200, 1.0)"
          strokeWidth="12"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
