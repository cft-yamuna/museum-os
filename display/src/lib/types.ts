// ==========================================
// Base App Config
// ==========================================
export interface AppConfig {
  instanceId: string;
  templateType: string;
  deviceId: string;
  name?: string;
}

// ==========================================
// APP 04 — Media Loop (was Video Loop / TPL-08)
// ==========================================
export interface VideoLoopConfig extends AppConfig {
  templateType: 'app04-media-loop';
  videoUrl: string;
  muted: boolean;
  volume: number; // 0-100
  fit: 'cover' | 'contain';
  backgroundColor: string;
  subtitlesEnabled?: boolean;   // show subtitles if available (default false)
  subtitlesUrl?: string;        // URL to VTT/SRT subtitle file
  idle?: IdleConfig;
  schedule?: ScheduleConfig;
}

// ==========================================
// APP 03 — Touch Carousel (was Slideshow / TPL-01)
// ==========================================
export interface SlideshowConfig extends AppConfig {
  templateType: 'app03-touch-carousel';
  playlistId: string;
  defaultDuration: number; // seconds
  transition: TransitionType;
  transitionDuration: number; // ms
  fit: 'cover' | 'contain';
  backgroundColor: string;
  shuffle: boolean;
  loop: boolean;
  displayMode?: 'carousel' | 'slideshow' | 'document-viewer'; // default 'carousel'
  carouselTimeout?: number;     // seconds before carousel strip auto-hides (default 5)
  inactivityTimeout?: number;   // seconds before resuming auto-play (default 30)
  documentHomeTimeoutSec?: number; // seconds before document viewer returns to home (default 30)
  carouselHeight?: number;      // px height of carousel strip thumbnails (default 100)
  showCaptions?: boolean;       // show captions/titles for media items (default false)
  captionPosition?: 'bottom' | 'top' | 'overlay'; // where captions appear (default 'bottom')
  audioOutput?: 'none' | 'monophone' | 'screen' | 'directional-speaker'; // audio output for video items
  controllerId?: string;        // ESP32 controller ID (for monophone)
  idle?: IdleConfig;
  schedule?: ScheduleConfig;
}

// ==========================================
// APP 01 — Monophone Audio (unified single + multi)
// ==========================================
export interface MonophoneAudioConfig extends AppConfig {
  templateType: 'app01-monophone-audio' | 'app01-monophone-audio-multi';
  mode: 'single' | 'multi';
  controllerId: string; // ESP32 controller ID
  delay: number; // startup delay in seconds (default 1)
  loop: boolean; // whether story auto-replays after ending
  fadeOutDuration: number; // ms (single mode)
  audioOutput?: 'monophone' | 'screen' | 'directional-speaker'; // where audio plays (default 'monophone')
  resetDelay?: number; // seconds cooldown after hangup before next pickup triggers (default 0)
  // Single-mode fields
  audioUrl?: string;
  idleImageUrl?: string;
  idleVideoUrl?: string;
  // Multi-mode fields
  buttons?: ButtonItem[];
  welcomeMessage?: string; // optional intro audio URL before button selection (multi mode)
  silenceGap?: number; // seconds of silence after story ends before welcome replays (default 3)
  idle: IdleConfig;
}

// Legacy alias
export type ButtonAudioConfig = MonophoneAudioConfig;

export interface ButtonItem {
  buttonId: number;
  label: string;
  audioUrl: string;
  imageUrl?: string;
  videoUrl?: string;
}

// ==========================================
// APP 02 — Monophone Video (was Video Sync / TPL-05)
// ==========================================
export interface VideoSyncConfig extends AppConfig {
  templateType: 'app02-monophone-video';
  videoUrl: string;           // Main video — plays AFTER trigger
  controllerId: string;
  fit: 'cover' | 'contain';
  backgroundColor: string;
  idle?: IdleConfig;
  triggerMode?: 'hardware' | 'touch' | 'both'; // default 'hardware'
  idleType?: 'image' | 'video';  // what to show BEFORE trigger (default 'image')
  idleImageUrl?: string;          // poster/still frame shown before trigger (when idleType='image')
  idleVideoUrl?: string;          // looping video shown before trigger (when idleType='video')
  transition?: 'fade-color' | 'fade-black' | 'dissolve';
  transitionDuration?: number;    // ms, duration of transition effect (default 600)
  fadeOutDuration?: number;       // ms, dissolve-to-black duration after playback ends (default 1000)
  delay?: number;                 // startup delay in seconds
  titleText?: string;             // text/title overlay on idle frame (optional)
  audioOutput?: 'monophone' | 'screen' | 'directional-speaker' | 'muted'; // where audio plays (default 'monophone')
  resetDelay?: number;            // seconds cooldown after video ends before next trigger (default 0)
}

// ==========================================
// APP 05 — Interactive Map (was Navigation Map / TPL-06)
// ==========================================
export interface NavMapConfig extends AppConfig {
  templateType: 'app05-interactive-map';
  mapImageUrl: string;
  hotspots: MapHotspot[];
  sections?: MapSection[];         // Navigation sections (e.g. Origin, Business, Culture, Philanthropy)
  showYouAreHere?: boolean;        // Show "You Are Here" marker (default true)
  youAreHereLabel?: string;        // Label for the marker (default "You Are Here")
  youAreHereX?: number;            // X position percentage 0-100
  youAreHereY?: number;            // Y position percentage 0-100
  showTimeEstimates?: boolean;     // Show time estimates per section (default true)
  showAnimatedPathways?: boolean;  // Show animated pathways to POIs (default false)
  idle: IdleConfig;
  inactivityTimeout: number; // ms
}

export interface MapSection {
  id: string;
  label: string;
  color: string;
  timeEstimate?: string; // e.g. "15 min"
}

export interface MapHotspot {
  id: string;
  label: string;
  description?: string;
  sectionId?: string; // which section this POI belongs to
  imageUrl?: string;  // optional image in popup
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number;
  height: number;
}

// ==========================================
// Touch Scroll (TPL-07)
// ==========================================
export interface TouchScrollConfig extends AppConfig {
  templateType: 'touch-scroll';
  contentUrl?: string; // URL to fetch scroll content (legacy)
  playlistId?: string; // playlist-based content (preferred)
  autoScroll: boolean;
  autoScrollSpeed: number; // pixels per second
  backgroundColor?: string;
  fit?: 'cover' | 'contain';
  resetToFirstFrame?: boolean; // scroll back to top after inactivity timeout
  idle?: IdleConfig;
  inactivityTimeout: number; // ms
}

// ==========================================
// APP 06 — Media Browser (was Media Explorer / TPL-02)
// ==========================================
export interface MediaExplorerConfig extends AppConfig {
  templateType: 'app06-media-browser';
  playlistId: string;
  categories?: string[];
  searchEnabled?: boolean;          // Enable search/filter functionality
  audioEnabled?: boolean;           // Enable audio playback
  pdfEnabled?: boolean;             // Enable PDF viewing
  videoEnabled?: boolean;           // Enable video playback
  audioOutput?: 'none' | 'monophone' | 'screen' | 'directional-speaker'; // where audio plays
  controllerId?: string;            // ESP32 controller ID (for monophone)
  idle: IdleConfig;
  inactivityTimeout: number; // ms
}

// ==========================================
// Proximity Trigger (TPL-09)
// ==========================================
export interface ProximityConfig extends AppConfig {
  templateType: 'proximity';
  controllerId: string;
  activationDistance: number; // cm
  deactivationDelay: number; // ms
  contentType: 'video' | 'slideshow' | 'image';
  videoUrl?: string;
  imageUrl?: string;
  playlistId?: string;
  fit: 'cover' | 'contain';
  backgroundColor: string;
  idle: IdleConfig;
  triggerMode?: 'hardware' | 'touch' | 'both'; // default 'hardware'
}

// ==========================================
// Multi-Screen Exhibit (TPL-10)
// ==========================================
export interface MultiScreenConfig extends AppConfig {
  templateType: 'multi-screen';
  exhibitId: string;
  screenIndex: number;
  totalScreens: number;
  contentType: 'video' | 'slideshow' | 'image';
  videoUrl?: string;
  imageUrl?: string;
  playlistId?: string;
  fit: 'cover' | 'contain';
  backgroundColor: string;
}

// ==========================================
// Shared Types
// ==========================================
export type TransitionType = 'fade' | 'slide-left' | 'slide-right' | 'dissolve' | 'none';

export interface IdleConfig {
  type: 'image' | 'video';
  url: string;
  transitionDuration: number; // ms, default 1000
}

export interface ScheduleConfig {
  activeFrom: string; // "09:00"
  activeTo: string;   // "18:00"
  timezone: string;   // "Asia/Kolkata"
}

export interface PlaylistItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  duration?: number; // seconds, override for images
  metadata?: Record<string, unknown>;
}

export interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[];
}

// ==========================================
// Content Types
// ==========================================
export interface ContentItem {
  id: string;
  type: 'image' | 'video' | 'audio' | 'pdf';
  url: string;
  name: string;
  mimeType: string;
  size: number;
  metadata?: Record<string, unknown>;
}

export interface ContentVersion {
  id: string;
  contentId: string;
  version: number;
  url: string;
  createdAt: string;
}

// ==========================================
// Device Types
// ==========================================
export interface DeviceInfo {
  id: string;
  name: string;
  apiKey: string;
  model?: string;
  platform?: 'tizen' | 'webos' | 'windows' | 'android' | 'linux' | 'unknown';
  chromiumVersion?: number;
  resolution?: { width: number; height: number };
  capabilities?: string[];
  orientation?: 'landscape' | 'portrait';
}

export interface DeviceConfig {
  device: DeviceInfo;
  assignedApp?: {
    appId?: string;
    templateType: string;
    instanceId: string;
    revision?: string;
    updatedAt?: string | null;
    url: string;
    config: AnyAppConfig;
  } | null;
}

// ==========================================
// CUSTOM 06 — Reception Program Screen (A-AV02)
// ==========================================
export interface ReceptionProgramConfig extends AppConfig {
  templateType: 'custom06-reception-program';
  screenIndex: number;                      // which screen this device is (0, 1, or 2)
  screens: ReceptionScreenContent[];        // all screens' content
  welcomeSlideDuration: number;             // seconds per welcome slide (default 8)
  infoSlideDuration: number;                // seconds per info slide (default 10)
  stateCycleDuration: number;               // seconds per state before switching (default 30)
  transition: TransitionType;
  transitionDuration: number;               // ms (default 800)
  backgroundColor: string;                  // default '#0f172a'
  accentColor: string;                      // default '#3b82f6'
  textColor: string;                        // default '#ffffff'
  logoUrl?: string;
  footerText?: string;
  hideHeader?: boolean;
  hideCenterLine?: boolean;
  disableOpacity?: boolean;
  showClock: boolean;
  showDate: boolean;
  dateFormat: string;                       // 'short' | 'long'
  idle?: IdleConfig;
  schedule?: ScheduleConfig;
}

export interface ReceptionScreenContent {
  screenIndex: number;
  screenLabel?: string;
  mode?: 'slides' | 'video';
  videoUrl?: string;
  guestNames?: string[];
  guestNameFontSizeRem?: number;
  welcomeSlides: ReceptionWelcomeSlide[];
  infoSlides: ReceptionInfoSlide[];
}

export interface ReceptionWelcomeSlide {
  id: string;
  greeting: string;
  subtitle?: string;
  logoUrl?: string;
  backgroundImageUrl?: string;
  backgroundColor?: string;
  textColor?: string;
}

export interface ReceptionInfoSlide {
  id: string;
  type: 'pre-info' | 'timeline';
  title?: string;
  body?: string;
  imageUrl?: string;
  timelineItems?: ReceptionTimelineItem[];
  backgroundColor?: string;
  textColor?: string;
}

export interface ReceptionTimelineItem {
  section: string;
  duration: string;
  description?: string;
  color?: string;
}

export type AnyAppConfig =
  | VideoLoopConfig
  | SlideshowConfig
  | MonophoneAudioConfig
  | ButtonAudioConfig
  | VideoSyncConfig
  | NavMapConfig
  | TouchScrollConfig
  | MediaExplorerConfig
  | ProximityConfig
  | MultiScreenConfig
  | ReceptionProgramConfig;

// ==========================================
// WebSocket Event Types
// ==========================================
export type WSEventType =
  | 'content:updated'
  | 'playlist:updated'
  | 'config:updated'
  | 'command:reload'
  | 'command:restart'
  | 'command:idle'
  | 'command:activate'
  | 'command:navigate';

export interface WSEvent<T = unknown> {
  type: WSEventType;
  payload: T;
  timestamp: number;
}

export interface WSContentUpdated {
  contentId: string;
  newUrl: string;
}

export interface WSPlaylistUpdated {
  playlistId: string;
}

export interface WSConfigUpdated {
  config: AnyAppConfig;
}

export interface WSNavigate {
  url: string;
}

// ==========================================
// MQTT Event Types (Hardware)
// ==========================================
export type MqttEventType =
  | 'monophone:pickup'
  | 'monophone:hangup'
  | 'button:press'
  | 'proximity:enter'
  | 'proximity:leave';

export interface MqttEvent {
  type: MqttEventType;
  controllerId: string;
  timestamp: number;
  buttonId?: number;   // for button:press
  distance?: number;   // for proximity:enter
}

// ==========================================
// Heartbeat
// ==========================================
export interface HeartbeatPayload {
  deviceId: string;
  status: 'playing' | 'idle' | 'error' | 'loading';
  currentContent?: string;
  templateType?: string;
  uptime: number; // seconds since page load
  memoryUsage?: number;
  timestamp: number;
}

// ==========================================
// Logging
// ==========================================
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

// ==========================================
// API Response Wrappers
// ==========================================
export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}
