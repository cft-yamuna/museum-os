/* ─── Category ─── */
export type CategoryId = 'origin' | 'businesses' | 'community';

export interface Category {
  readonly id: CategoryId;
  readonly label: string;
  readonly color: string;
  readonly colorDim: string;
  readonly description: string;
  readonly galleryIds: readonly GalleryId[];
}

/* ─── Gallery ─── */
export type GalleryId =
  | 'prologue'
  | 'hilight-experience'
  | 'people-garden'
  | 'it-story'
  | 'consumer-care'
  | 'factory-experience'
  | 'spirit-of-hilight'
  | 'wintrol'
  | 'foundation';

export interface Gallery {
  readonly id: GalleryId;
  readonly name: string;
  readonly color: string;
  readonly cardColor: string;
  readonly categoryId: CategoryId;
  readonly svgGroupId: string;
  readonly textGroupId: string;
  readonly timeToExplore: string;
  readonly description: string;
  readonly highlightIds: readonly string[];
}

/* ─── Highlight (individual exhibit) ─── */
export interface Highlight {
  readonly id: string;
  readonly galleryId: GalleryId;
  readonly title: string;
  readonly description: string;
  readonly imageSrc: string;
  readonly positionOnMap: { readonly x: number; readonly y: number };
}

/* ─── View State Machine ─── */
export type ViewScreen =
  | 'screensaver'
  | 'categories'
  | 'category-view'
  | 'gallery-view';

export interface ViewState {
  readonly screen: ViewScreen;
  readonly activeCategoryId: CategoryId | null;
  readonly activeGalleryId: GalleryId | null;
}

/* ─── Navigation Actions ─── */
export type NavigationAction =
  | { readonly type: 'TAP_SCREENSAVER' }
  | { readonly type: 'SELECT_CATEGORY'; readonly categoryId: CategoryId }
  | { readonly type: 'SELECT_GALLERY'; readonly galleryId: GalleryId }
  | { readonly type: 'GO_BACK' }
  | { readonly type: 'RESET_TO_SCREENSAVER' };

/* ─── Map Viewport ─── */
export interface MapViewport {
  readonly transform: string;
  readonly label: string;
}

/* ─── Editor Config Types ─── */
export type ColorStateName = 'default' | 'category_active' | 'category_inactive' | 'gallery_active' | 'gallery_inactive';

export interface ColorStateConfig {
  visibility: 'visible' | 'hidden';
  opacity: number;
  fillOverride: string | null;
  elementFills: Record<string, string> | null;
  textVisibility: 'visible' | 'hidden';
  textFill: string | null;
}

export interface PoiConfig {
  id: string;
  galleryId: string;
  title: string;
  description: string;
  imageUrl: string;
  icon: string;
  iconColor: string;
  positionX: number;
  positionY: number;
  sortOrder: number;
  photoPosition?: 'top' | 'bottom' | 'left' | 'right';
}

export interface CategoryOverride {
  viewingTime: string;
}

export interface ElementPlacement {
  id: string;
  elementId: string;
  label: string;
  positionX: number;
  positionY: number;
  scale: number;
}

export interface EditorConfig {
  colorStates: Record<string, Record<ColorStateName, ColorStateConfig>>;
  pois: PoiConfig[];
  customIcons: unknown[];
  outlineAssignments: Record<string, string[]>;
  categoryOverrides?: Record<string, CategoryOverride>;
  elementAssignments?: Record<string, string>;
  elementPlacements?: ElementPlacement[];
  handHintEnabled?: Record<string, boolean>;
}
