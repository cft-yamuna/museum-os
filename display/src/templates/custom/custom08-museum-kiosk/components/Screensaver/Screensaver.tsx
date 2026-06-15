import './Screensaver.css';

interface ScreensaverProps {
  readonly visible: boolean;
  readonly onTap: () => void;
}

export function Screensaver({ visible, onTap }: ScreensaverProps) {
  if (!visible) return null;

  return (
    <div className="screensaver" onPointerUp={onTap}>
      <img
        className="screensaver__layer screensaver__bg"
        src="/display/templates/custom08/elements/idle-screen-bg.svg"
        alt=""
        draggable={false}
      />
      <img
        className="screensaver__layer screensaver__map"
        src="/display/templates/custom08/elements/idle-screen-map.svg"
        alt=""
        draggable={false}
      />
      <div className="screensaver__layer screensaver__text">
        <h1 className="screensaver__heading">Welcome</h1>
        <p className="screensaver__body">
          Explore the galleries to discover chapters from
          Museum OS's journey: from its origins and values to
          its businesses and growth over time.
        </p>
        <p className="screensaver__cta">Tap to Begin</p>
      </div>
    </div>
  );
}
