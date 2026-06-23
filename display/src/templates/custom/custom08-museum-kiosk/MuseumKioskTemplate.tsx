import { useCallback } from 'react';
import { useNavigationState } from './hooks/useNavigationState';
import { useIdleTimeout } from './hooks/useIdleTimeout';
import { useInteractionTelemetry } from '../../../hooks/useInteractionTelemetry';
import type { CategoryId, GalleryId } from './types';
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

  const track = useInteractionTelemetry();

  // Wrap navigation handlers to emit engagement telemetry at the moments the
  // visitor actually acts. No extra input listeners are added — these fire only
  // on real semantic actions, so the render/animation hot paths are untouched.
  const handleTapScreensaver = useCallback(() => {
    track('screensaver-wake');
    tapScreensaver();
  }, [track, tapScreensaver]);

  const handleSelectCategory = useCallback((categoryId: CategoryId) => {
    track('navigate', { target: categoryId });
    selectCategory(categoryId);
  }, [track, selectCategory]);

  const handleSelectGallery = useCallback((galleryId: GalleryId) => {
    track('navigate', { target: galleryId });
    selectGallery(galleryId);
  }, [track, selectGallery]);

  const handleGoBack = useCallback(() => {
    track('button-press', { target: 'back' });
    goBack();
  }, [track, goBack]);

  const handleResetToScreensaver = useCallback(() => {
    track('idle-reset');
    resetToScreensaver();
  }, [track, resetToScreensaver]);

  useIdleTimeout(
    state.screen === 'screensaver',
    handleResetToScreensaver,
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
            onSelectCategory={handleSelectCategory}
            onSelectGallery={handleSelectGallery}
            onDeselectGallery={deselectGallery}
            poiImageOverrides={poiImageOverrides}
          />

          {/* Screensaver overlay */}
          <Screensaver
            visible={isScreensaver}
            onTap={handleTapScreensaver}
          />

          {/* Categories panel: persistent on screensaver + categories for smooth transition */}
          {(isScreensaver || isCategories) && (
            <div className="categories-panel" data-state={isCategories ? 'open' : 'idle'}>
              <CategoryCircles visible={isCategories} onSelect={handleSelectCategory} />
            </div>
          )}

          {/* Back button (visible on category-view and gallery-view) */}
          <BackButton
            visible={isCategoryView || isGalleryView}
            onTap={handleGoBack}
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
