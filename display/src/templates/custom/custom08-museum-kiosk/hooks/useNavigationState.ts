import { useReducer, useCallback } from 'react';
import type { ViewState, NavigationAction, CategoryId, GalleryId } from '../types';
import { galleriesById } from '../data/galleries';

const initialState: ViewState = {
  screen: 'screensaver',
  activeCategoryId: null,
  activeGalleryId: null,
};

function navigationReducer(state: ViewState, action: NavigationAction): ViewState {
  switch (action.type) {
    case 'TAP_SCREENSAVER':
      return {
        ...state,
        screen: 'categories',
        activeCategoryId: null,
        activeGalleryId: null,
      };

    case 'SELECT_CATEGORY':
      return {
        ...state,
        screen: 'category-view',
        activeCategoryId: action.categoryId,
        activeGalleryId: null,
      };

    case 'SELECT_GALLERY': {
      const gallery = galleriesById[action.galleryId];
      return {
        ...state,
        screen: 'gallery-view',
        activeGalleryId: action.galleryId,
        activeCategoryId: gallery ? gallery.categoryId : state.activeCategoryId,
      };
    }

    case 'GO_BACK': {
      if (state.screen === 'gallery-view') {
        return {
          ...state,
          screen: 'category-view',
          activeGalleryId: null,
        };
      }
      if (state.screen === 'category-view') {
        return {
          ...state,
          screen: 'categories',
          activeCategoryId: null,
          activeGalleryId: null,
        };
      }
      return state;
    }

    case 'RESET_TO_SCREENSAVER':
      return { ...initialState };

    default:
      return state;
  }
}

export function useNavigationState() {
  const [state, dispatch] = useReducer(navigationReducer, initialState);

  const tapScreensaver = useCallback(() => {
    dispatch({ type: 'TAP_SCREENSAVER' });
  }, []);

  const selectCategory = useCallback((categoryId: CategoryId) => {
    dispatch({ type: 'SELECT_CATEGORY', categoryId });
  }, []);

  const selectGallery = useCallback((galleryId: GalleryId) => {
    dispatch({ type: 'SELECT_GALLERY', galleryId });
  }, []);

  const deselectGallery = useCallback(() => {
    dispatch({ type: 'GO_BACK' });
  }, []);

  const goBack = useCallback(() => {
    dispatch({ type: 'GO_BACK' });
  }, []);

  const resetToScreensaver = useCallback(() => {
    dispatch({ type: 'RESET_TO_SCREENSAVER' });
  }, []);

  return {
    state,
    tapScreensaver,
    selectCategory,
    selectGallery,
    deselectGallery,
    goBack,
    resetToScreensaver,
  };
}
