/**
 * CUSTOM 06 — Reception Program Screen (A-AV02 / A-AV02a)
 *
 * 3-screen CMS-driven signage for the museum reception area.
 * Each screen runs independently but is controlled from a single admin panel (A-AV02a).
 *
 * Three display states cycle automatically:
 *   State 1 — Branding & Welcome (idle loop): greeting, visitor name, logo
 *   State 2 — Visitor Information: pre-journey details + audience journey timelines
 *   State 3 — Content refreshes instantly when reception staff update via admin
 *
 * Admin panel (A-AV02a) allows per-screen content changes using PPT-like template input.
 */

// ==========================================
// Per-Screen Content
// ==========================================

/** Content block for a single screen */
export interface ScreenContent {
  screenIndex: number;                    // 0, 1, or 2
  screenLabel?: string;                   // friendly name e.g. "Left Screen"
  mode?: 'slides' | 'video';              // slides workflow or full-screen video-only mode
  videoUrl?: string;                      // used when mode='video'
  guestNames?: string[];                  // optional right-screen guest list, capped at 8 names
  guestNameFontSizeRem?: number;          // right-screen guest-name font size
  welcomeSlides: WelcomeSlide[];          // State 1: Branding & Welcome View slides
  infoSlides: InfoSlide[];                // State 2: Visitor Information View slides
}

/** State 1 — Branding & Welcome View */
export interface WelcomeSlide {
  id: string;
  greeting: string;                       // e.g. "Welcome" or "Welcome, Mr. Premji"
  subtitle?: string;                      // e.g. "We are glad to have you"
  logoUrl?: string;                       // company logo (can be customized per guest)
  backgroundImageUrl?: string;            // optional background image
  backgroundColor?: string;              // fallback bg color
  textColor?: string;
}

/** State 2 — Visitor Information View */
export interface InfoSlide {
  id: string;
  type: 'pre-info' | 'timeline';          // pre-journey details OR audience journey timelines
  title?: string;
  body?: string;                          // pre-info text content
  imageUrl?: string;
  timelineItems?: TimelineItem[];          // for type='timeline' — synced with A-AV01 navigation map
  backgroundColor?: string;
  textColor?: string;
}

/** Timeline entry (syncs with A-AV01 Navigation Map durations) */
export interface TimelineItem {
  section: string;                         // e.g. "Origin", "Business", "Culture", "Philanthropy"
  duration: string;                        // e.g. "15 min"
  description?: string;
  color?: string;                          // section accent color
  icon?: string;                           // optional icon identifier
}
