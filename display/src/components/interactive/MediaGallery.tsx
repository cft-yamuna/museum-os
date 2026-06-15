import React, { useRef, useCallback } from 'react';
import type { PlaylistItem } from '@/lib/types';

// ==========================================
// Types
// ==========================================

interface MediaGalleryProps {
  items: PlaylistItem[];
  categories?: string[];
  selectedCategory: string | null;
  onItemSelect: (itemId: string) => void;
  onCategoryChange: (category: string | null) => void;
}

// ==========================================
// Component
// ==========================================

export function MediaGallery(props: MediaGalleryProps) {
  const items = props.items;
  const categories = props.categories;
  const selectedCategory = props.selectedCategory;
  const onItemSelect = props.onItemSelect;
  const onCategoryChange = props.onCategoryChange;

  const scrollRef = useRef<HTMLDivElement>(null);

  // ─── Detect media type from item ──────────────────────────────

  function getMediaType(item: PlaylistItem): 'image' | 'video' | 'pdf' {
    if (item.type === 'video') return 'video';
    if (item.type === 'image') {
      // Check if it's actually a PDF by URL or metadata
      const url = item.url.toLowerCase();
      if (url.endsWith('.pdf')) return 'pdf';
      if (item.metadata && item.metadata.type === 'pdf') return 'pdf';
      return 'image';
    }
    return 'image';
  }

  // ─── Category filter bar ──────────────────────────────────────

  const renderCategoryFilter = useCallback(() => {
    if (!categories || categories.length === 0) return null;

    const filterBarStyle: React.CSSProperties = {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '80px',
      backgroundColor: '#1a1a1a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '16px',
      padding: '0 32px',
      zIndex: 10,
      borderBottom: '1px solid #333',
    };

    const buttons = [
      React.createElement(
        'button',
        {
          key: 'all',
          style: getCategoryButtonStyle(selectedCategory === null),
          onTouchStart: (e: any) => {
            e.preventDefault();
            onCategoryChange(null);
          },
          onClick: () => {
            onCategoryChange(null);
          },
        },
        'All'
      )
    ];

    categories.forEach((cat) => {
      buttons.push(
        React.createElement(
          'button',
          {
            key: cat,
            style: getCategoryButtonStyle(selectedCategory === cat),
            onTouchStart: (e: any) => {
              e.preventDefault();
              onCategoryChange(cat);
            },
            onClick: () => {
              onCategoryChange(cat);
            },
          },
          cat
        )
      );
    });

    return React.createElement('div', { style: filterBarStyle }, buttons);
  }, [categories, selectedCategory, onCategoryChange]);

  function getCategoryButtonStyle(isActive: boolean): React.CSSProperties {
    return {
      minWidth: '120px',
      height: '48px',
      padding: '0 24px',
      fontSize: '16px',
      fontWeight: isActive ? '600' : '400',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: isActive ? '#000' : '#fff',
      backgroundColor: isActive ? '#fff' : '#333',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      userSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
      transform: 'translateZ(0)',
      transition: 'background-color 200ms ease',
    };
  }

  // ─── Grid items ───────────────────────────────────────────────

  const renderGridItems = useCallback(() => {
    if (items.length === 0) {
      const emptyStyle: React.CSSProperties = {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#666',
        fontSize: '18px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      };

      return React.createElement(
        'div',
        { style: emptyStyle },
        'No media available'
      );
    }

    return items.map((item) => {
      const mediaType = getMediaType(item);

      return React.createElement(
        'div',
        {
          key: item.id,
          style: getGridItemStyle(),
          onTouchStart: (e: any) => {
            e.preventDefault();
            onItemSelect(item.id);
          },
          onClick: () => {
            onItemSelect(item.id);
          },
        },
        React.createElement('div', {
          style: getThumbnailStyle(item.url, mediaType),
        }),
        mediaType === 'video' && React.createElement('div', {
          style: getOverlayIconStyle('play'),
        }),
        mediaType === 'pdf' && React.createElement('div', {
          style: getOverlayIconStyle('pdf'),
        })
      );
    });
  }, [items, onItemSelect]);

  function getGridItemStyle(): React.CSSProperties {
    return {
      position: 'relative',
      width: '100%',
      aspectRatio: '16 / 9',
      backgroundColor: '#1a1a1a',
      borderRadius: '8px',
      overflow: 'hidden',
      cursor: 'pointer',
      userSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
      transform: 'translateZ(0)',
      transition: 'transform 150ms ease',
    };
  }

  function getThumbnailStyle(url: string, _mediaType: 'image' | 'video' | 'pdf'): React.CSSProperties {
    return {
      width: '100%',
      height: '100%',
      backgroundImage: 'url(' + url + ')',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundColor: '#1a1a1a',
    };
  }

  function getOverlayIconStyle(iconType: 'play' | 'pdf'): React.CSSProperties {
    const baseStyle: React.CSSProperties = {
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '64px',
      height: '64px',
      marginTop: '-32px',
      marginLeft: '-32px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      fontSize: '32px',
      color: '#fff',
    };

    if (iconType === 'play') {
      return {
        ...baseStyle,
        // Use a triangle for play icon via border trick
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderWidth: '16px 0 16px 28px',
        borderColor: 'transparent transparent transparent rgba(255, 255, 255, 0.9)',
        marginTop: '-16px',
        marginLeft: '-14px',
      };
    }

    // PDF icon - just text
    return baseStyle;
  }

  // ─── Main render ──────────────────────────────────────────────

  const hasCategories = categories && categories.length > 0;
  const topOffset = hasCategories ? '80px' : '0';

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  };

  const gridContainerStyle: React.CSSProperties = {
    position: 'absolute',
    top: topOffset,
    left: 0,
    width: '100%',
    height: 'calc(100% - ' + topOffset + ')',
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    padding: '32px',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '24px',
    width: '100%',
  };

  return React.createElement(
    'div',
    { style: containerStyle },
    renderCategoryFilter(),
    React.createElement(
      'div',
      { ref: scrollRef, style: gridContainerStyle },
      React.createElement(
        'div',
        { style: gridStyle },
        renderGridItems()
      )
    )
  );
}
