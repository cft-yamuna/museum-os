import type { CategoryId } from '../../types';
import { categoryCardPositions } from '../../data/mapViewports';
import './CategoryInfoPanel.css';

interface GalleryLine {
  readonly num: number;
  readonly name: string;
  readonly color: string;
}

interface PanelData {
  readonly viewingTime: string;
  readonly galleries: readonly GalleryLine[];
}

const panelData: Record<CategoryId, PanelData> = {
  origin: {
    viewingTime: '20-25',
    galleries: [
      { num: 1, name: 'The Museum OS Ethos', color: '#C96E69' },
      { num: 2, name: 'A Very Small Company', color: '#7A4E31' },
      { num: 3, name: 'People Garden', color: '#3A280F' },
    ],
  },
  businesses: {
    viewingTime: '40-45',
    galleries: [
      { num: 4, name: 'A Factory Experience', color: '#053D32' },
      { num: 5, name: 'Museum OS Consumer Care & Lighting Group', color: '#C16E14' },
      { num: 6, name: 'Museum OS Infrastructure Engineering', color: '#8484C7' },
      { num: 7, name: 'Museum OS Ltd.', color: '#0C3C75' },
    ],
  },
  community: {
    viewingTime: '20-25',
    galleries: [
      { num: 8, name: 'Spirit of Museum OS', color: '#0C4728' },
      { num: 9, name: 'Azim Premji Foundation', color: '#094C4C' },
    ],
  },
};

interface CategoryInfoPanelProps {
  readonly visible: boolean;
  readonly categoryId: CategoryId | null;
}

export function CategoryInfoPanel({ visible, categoryId }: CategoryInfoPanelProps) {
  if (!visible || !categoryId) return null;

  const cardPos = categoryCardPositions[categoryId];
  const data = panelData[categoryId];
  if (!data) return null;

  const posStyle: Record<string, string> = { top: cardPos.top };
  if (cardPos.right) {
    posStyle.right = cardPos.right;
  } else if (cardPos.left) {
    posStyle.left = cardPos.left;
  }

  return (
    <div
      className={`category-info-panel${cardPos.right ? ' category-info-panel--right' : ''}`}
      style={posStyle}
    >
      {/* Viewing Time */}
      <div className="cip__viewing-time">
        <span className="cip__viewing-time-label">Viewing Time: </span>
        <span className="cip__viewing-time-value">{data.viewingTime}</span>
        <span className="cip__viewing-time-unit"> MIN</span>
      </div>

      {/* Gallery List */}
      <div className="cip__gallery-list">
        {data.galleries.map((g) => (
          <div key={g.num} className="cip__gallery-row">
            <span className="cip__gallery-label">GALLERY</span>
            <span className="cip__gallery-num"> {g.num}</span>
            <span className="cip__gallery-colon">: </span>
            <span
              className="cip__gallery-name"
              style={{ color: g.color }}
            >
              {g.name}
            </span>
          </div>
        ))}
      </div>

      {/* Gallery Highlights */}
      <div className="cip__highlights">
        <span className="cip__highlights-text">Gallery Highlights</span>
        <svg className="cip__highlights-icon" viewBox="0 0 32 32" width="24" height="24">
          <circle cx="16" cy="16" r="14" fill="none" stroke="#494949" strokeWidth="1" />
          <polygon fill="none" stroke="#494949" strokeWidth="1" points="16,5 19,13 27,13 21,18 23,26 16,22 9,26 11,18 5,13 13,13" />
        </svg>
      </div>
    </div>
  );
}
