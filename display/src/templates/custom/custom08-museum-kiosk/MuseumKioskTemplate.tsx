import { useNavigationState } from './hooks/useNavigationState';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { MuseumMap } from './components/MuseumMap/MuseumMap';
import { Screensaver } from './components/Screensaver/Screensaver';
import { CategoryCircles } from './components/CategoryCircles/CategoryCircles';
import { BackButton } from './components/BackButton/BackButton';
import { MiniMap } from './components/MiniMap/MiniMap';
import { GalleryPanel } from './components/GalleryPanel/GalleryPanel';
import { CategoryInfoPanel } from './components/CategoryInfoPanel/CategoryInfoPanel';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import './styles/global.css';
import './styles/animations.css';
import './styles/app.css';

interface MuseumKioskConfig {
  idleTimeoutMs?: number;
  poiImageOverrides?: Record<string, string>;
  [key: string]: unknown;
}

interface MuseumKioskTemplateProps {
  config: MuseumKioskConfig;
  instanceId: string;
}

export function MuseumKioskTemplate({ config }: MuseumKioskTemplateProps) {
  const {
    state,
    tapScreensaver,
    selectCategory,
    selectGallery,
    deselectGallery,
    goBack,
    resetToScreensaver,
  } = useNavigationState();

  useIdleTimeout(
    state.screen === 'screensaver',
    resetToScreensaver,
    config.idleTimeoutMs
  );

  const isScreensaver = state.screen === 'screensaver';
  const isCategories = state.screen === 'categories';
  const isCategoryView = state.screen === 'category-view';
  const isGalleryView = state.screen === 'gallery-view';
  const poiImageOverrides = config.poiImageOverrides
    && typeof config.poiImageOverrides === 'object'
    ? config.poiImageOverrides as Record<string, string>
    : undefined;

  return (
    <div className="custom08-museum-kiosk" style={{ width: '100%', height: '100%' }}>
      <ErrorBoundary>
        <div className="app" data-screen={state.screen}>
          {/* Map layer -- always visible, zoom controlled by state */}
          <MuseumMap
            viewState={state}
            onSelectCategory={selectCategory}
            onSelectGallery={selectGallery}
            onDeselectGallery={deselectGallery}
            poiImageOverrides={poiImageOverrides}
          />

          {/* Screensaver overlay */}
          <Screensaver
            visible={isScreensaver}
            onTap={tapScreensaver}
          />

          {/* Categories panel: persistent on screensaver + categories for smooth transition */}
          {(isScreensaver || isCategories) && (
            <div className="categories-panel" data-state={isCategories ? 'open' : 'idle'}>
              <CategoryCircles visible={isCategories} onSelect={selectCategory} />
            </div>
          )}

          {/* Back button (visible on category-view and gallery-view) */}
          <BackButton
            visible={isCategoryView || isGalleryView}
            onTap={goBack}
          />

          {/* Category info panel (visible on category-view and gallery-view) */}
          <CategoryInfoPanel
            visible={isCategoryView || isGalleryView}
            categoryId={state.activeCategoryId}
          />

          {/* Mini map (visible on category-view and gallery-view) */}
          <MiniMap
            visible={isCategoryView || isGalleryView}
            activeCategoryId={state.activeCategoryId}
            activeGalleryId={state.activeGalleryId}
          />

          {/* Gallery info panel (visible on gallery-view) */}
          <GalleryPanel
            visible={isGalleryView}
            galleryId={state.activeGalleryId}
          />
        </div>
      </ErrorBoundary>
    </div>
  );
}
