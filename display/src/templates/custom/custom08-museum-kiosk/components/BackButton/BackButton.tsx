import './BackButton.css';

interface BackButtonProps {
  readonly visible: boolean;
  readonly label?: string;
  readonly onTap: () => void;
}

export function BackButton({ visible, onTap }: BackButtonProps) {
  if (!visible) return null;

  return (
    <button
      className="back-button touch-press"
      onPointerUp={onTap}
    >
      <img
        className="back-button__icon"
        src="/display/templates/custom08/elements/back-button.svg"
        alt="Back"
        draggable={false}
      />
    </button>
  );
}
