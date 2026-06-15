import { useState } from 'react';

interface ImageSlideProps {
  src: string;
  fit?: 'cover' | 'contain';
  backgroundColor?: string;
  alt?: string;
}

export function ImageSlide({
  src,
  fit = 'cover',
  backgroundColor = '#000',
}: ImageSlideProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        backgroundColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <span style={{ color: '#666', fontSize: '14px' }}>Image unavailable</span>
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      backgroundColor,
      overflow: 'hidden',
    }}>
      <img
        src={src}
        alt=""
        onLoad={() => { setIsLoaded(true); }}
        onError={() => { setHasError(true); }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: fit,
          opacity: isLoaded ? 1 : 0,
          transition: 'opacity 300ms ease-in-out',
          transform: 'translateZ(0)',
        }}
        draggable={false}
      />
    </div>
  );
}
