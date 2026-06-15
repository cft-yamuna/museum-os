interface AmbientTitleProps {
  visible: boolean;
}

export default function AmbientTitle({ visible }: AmbientTitleProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 30,
        left: 0,
        right: 0,
        textAlign: 'center',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.6s ease',
        zIndex: 30,
        pointerEvents: 'none',
      }}
    >
      <h1
        style={{
          fontFamily: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
          fontSize: 45,
          fontWeight: 900,
          letterSpacing: '0.02em',
          color: '#000000',
          margin: 0,
          lineHeight: 1.2,
        }}
      >
        Museum OS's
        <br />
        Key Milestones
      </h1>
    </div>
  );
}
