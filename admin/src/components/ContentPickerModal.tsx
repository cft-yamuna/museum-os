import { useState, useMemo, useEffect } from 'react';
import { Search, Music, Film, Image, FileText } from 'lucide-react';
import { formatFileSize } from '../lib/utils';
import type { Content } from '../lib/types';

interface ContentPickerModalProps {
  contentItems: Content[];
  onConfirm: (selectedIds: string[]) => void;
  onClose: () => void;
}

function TypeIcon({ type }: { type: string }) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  if (type === 'audio') return <Music className={`${cls} text-pink-500`} />;
  if (type === 'video') return <Film className={`${cls} text-blue-500`} />;
  if (type === 'image') return <Image className={`${cls} text-emerald-500`} />;
  return <FileText className={`${cls} text-surface-400`} />;
}

export function ContentPickerModal({ contentItems, onConfirm, onClose }: ContentPickerModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Sort by most recently created so new uploads appear first
  const sorted = useMemo(() => {
    return [...contentItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [contentItems]);

  const filtered = useMemo(() => {
    return sorted.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter && c.type !== typeFilter) return false;
      return true;
    });
  }, [sorted, search, typeFilter]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleConfirm = () => {
    if (selected.length > 0) {
      onConfirm(selected);
    }
  };

  // Collect unique types for filter chips
  const availableTypes = useMemo(() => {
    const types = new Set(contentItems.map((c) => c.type));
    return Array.from(types).sort();
  }, [contentItems]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bryzos-card rounded-3xl w-full max-w-2xl mx-4 flex flex-col max-h-[70vh]">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--glass-border)] flex items-center justify-between shrink-0">
          <h3 className="text-sm font-medium text-surface-900">Add Content</h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="h-8 w-8 flex items-center justify-center rounded-xl text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-surface-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-surface-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="h-8 w-full pl-8 pr-2.5 rounded-xl border border-surface-300 bg-surface-100 text-[13px] text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
              autoFocus
            />
          </div>
        </div>

        {/* Type filter chips */}
        {availableTypes.length > 1 && (
          <div className="px-4 py-1.5 border-b border-surface-100 flex gap-1 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => setTypeFilter('')}
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                !typeFilter
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
              }`}
            >
              All
            </button>
            {availableTypes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(typeFilter === t ? '' : t)}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize transition-colors ${
                  typeFilter === t
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-surface-100 text-surface-500 hover:bg-surface-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Content list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-surface-400">
              {contentItems.length === 0 ? 'No media uploaded yet.' : 'No matching content.'}
            </div>
          )}
          {filtered.map((item) => (
            <label
              key={item.id}
              className={`flex items-center gap-2.5 px-4 py-2 hover:bg-surface-50 cursor-pointer border-b border-surface-100 last:border-b-0 ${
                selected.includes(item.id) ? 'bg-primary-50' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(item.id)}
                onChange={() => toggle(item.id)}
                className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
              />
              {/* Thumbnail */}
              <div className="w-10 h-10 rounded overflow-hidden bg-surface-100 shrink-0 flex items-center justify-center">
                {item.type === 'image' ? (
                  <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : item.type === 'video' ? (
                  <Film className="h-4 w-4 text-blue-400" />
                ) : (
                  <TypeIcon type={item.type} />
                )}
              </div>
              <span className="text-[13px] text-surface-700 truncate flex-1">{item.name}</span>
              <span className="text-[11px] text-surface-400 shrink-0">{item.type}</span>
              <span className="text-[11px] text-surface-400 shrink-0">{formatFileSize(item.file_size)}</span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-[var(--glass-border)] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-surface-400">
            {selected.length > 0
              ? `${selected.length} selected`
              : `${filtered.length} of ${contentItems.length} items`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="h-7 px-3 rounded-xl border border-surface-300 text-[13px] text-surface-600 hover:bg-surface-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.length === 0}
              className="h-7 px-3 rounded-xl bg-primary-600 text-white text-[13px] font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add {selected.length > 0 ? `(${selected.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
