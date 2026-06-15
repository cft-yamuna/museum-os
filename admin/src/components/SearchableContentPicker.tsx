import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, ChevronDown, Music, Film, Image, FileText } from 'lucide-react';
import { formatFileSize } from '../lib/utils';
import type { Content } from '../lib/types';

// ==========================================
// Single-select searchable content picker
// Replaces flat <select> dropdowns that become
// unusable with 100+ items.
// ==========================================

interface SearchableContentPickerProps {
  /** Currently selected URL value */
  value: string;
  /** Callback when selection changes */
  onChange: (url: string) => void;
  /** Content items to pick from */
  items: Content[];
  /** Placeholder when nothing selected */
  placeholder?: string;
  /** Label above the picker */
  label: string;
  /** Optional className for the wrapper */
  className?: string;
}

function ContentTypeIcon({ type }: { type: string }) {
  const cls = 'h-4 w-4 shrink-0';
  if (type === 'audio') return <Music className={`${cls} text-pink-500`} />;
  if (type === 'video') return <Film className={`${cls} text-blue-500`} />;
  if (type === 'image') return <Image className={`${cls} text-emerald-500`} />;
  return <FileText className={`${cls} text-surface-400`} />;
}

export function SearchableContentPicker({
  value,
  onChange,
  items,
  placeholder = 'Select content...',
  label,
  className = '',
}: SearchableContentPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Find selected item by URL
  const selectedItem = useMemo(
    () => items.find((c) => c.url === value),
    [items, value],
  );

  // Sort: most recently created first so new uploads appear at the top
  const sorted = useMemo(() => {
    return [...items].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [items]);

  // Filter by search + type
  const filtered = useMemo(() => {
    return sorted.filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q);
      }
      return true;
    });
  }, [sorted, search, typeFilter]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
        setTypeFilter('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-focus search when opening
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSelect = (url: string) => {
    onChange(url);
    setOpen(false);
    setSearch('');
    setTypeFilter('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  // Collect unique types for filter chips
  const availableTypes = useMemo(() => {
    const types = new Set(items.map((c) => c.type));
    return Array.from(types).sort();
  }, [items]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <label className="block text-sm font-semibold text-surface-600 mb-1.5">{label}</label>

      {/* Trigger button */}
      <div className="flex items-center gap-2 max-w-lg">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="h-10 w-full px-3.5 rounded-xl border border-surface-300 bg-surface-50 text-base text-left flex items-center gap-2.5 hover:border-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400 transition-all"
        >
          {selectedItem ? (
            <>
              <ContentTypeIcon type={selectedItem.type} />
              <span className="truncate flex-1 text-surface-800">{selectedItem.name}</span>
              <span className="text-sm text-surface-400 shrink-0">
                {formatFileSize(selectedItem.file_size)}
              </span>
              <ChevronDown className="h-4 w-4 text-surface-400 shrink-0" />
            </>
          ) : (
            <>
              <span className="truncate flex-1 text-surface-400">{placeholder}</span>
              <ChevronDown className="h-4 w-4 text-surface-400 shrink-0" />
            </>
          )}
        </button>
        {selectedItem && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear selection"
            className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl border border-surface-300 bg-surface-50 text-surface-400 hover:text-red-500 hover:border-red-500/20 hover:bg-red-500/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {items.length === 0 && !open && (
        <p className="text-sm text-surface-400 mt-1.5">No matching content uploaded yet.</p>
      )}

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full max-w-lg bryzos-card rounded-xl shadow-lg flex flex-col max-h-[400px]">
          {/* Search bar */}
          <div className="px-3 py-2.5 border-b border-surface-100 flex gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name..."
                className="h-9 w-full pl-9 pr-3 rounded-xl border border-surface-300 bg-surface-50 text-sm text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
            </div>
          </div>

          {/* Type filter chips */}
          {availableTypes.length > 1 && (
            <div className="px-3 py-2 border-b border-surface-100 flex gap-1.5 flex-wrap shrink-0">
              <button
                type="button"
                onClick={() => setTypeFilter('')}
                className={`px-2.5 py-1 rounded-full text-sm font-medium transition-colors ${
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
                  className={`px-2.5 py-1 rounded-full text-sm font-medium capitalize transition-colors ${
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

          {/* Results list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-surface-400">
                {items.length === 0 ? 'No content uploaded yet.' : 'No matches found.'}
              </div>
            )}
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.url)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-50 transition-colors border-b border-surface-100 last:border-b-0 ${
                  item.url === value ? 'bg-primary-50' : ''
                }`}
              >
                {/* Thumbnail preview */}
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-100 shrink-0 flex items-center justify-center">
                  {item.type === 'image' ? (
                    <img src={item.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : item.type === 'video' ? (
                    <Film className="h-4 w-4 text-blue-400" />
                  ) : (
                    <ContentTypeIcon type={item.type} />
                  )}
                </div>
                <span className="text-base text-surface-700 truncate flex-1">
                  {item.name}
                </span>
                <span className="text-sm text-surface-400 shrink-0">{item.type}</span>
                <span className="text-sm text-surface-400 shrink-0">
                  {formatFileSize(item.file_size)}
                </span>
              </button>
            ))}
          </div>

          {/* Footer count */}
          <div className="px-4 py-2 border-t border-surface-100 shrink-0">
            <span className="text-sm text-surface-400">
              {filtered.length} of {items.length} items
              {search && ` matching "${search}"`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// Multi-select searchable content picker
// Replaces the flat checkbox list that becomes
// hard to navigate with many items.
// ==========================================

interface SearchableContentMultiPickerProps {
  label: string;
  contentItems: Content[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function SearchableContentMultiPicker({
  label,
  contentItems,
  selectedIds,
  onChange,
}: SearchableContentMultiPickerProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const sorted = useMemo(() => {
    return [...contentItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [contentItems]);

  const filtered = useMemo(() => {
    return sorted.filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (search) {
        return c.name.toLowerCase().includes(search.toLowerCase());
      }
      return true;
    });
  }, [sorted, search, typeFilter]);

  const toggleItem = (contentId: string) => {
    const newIds = selectedIds.includes(contentId)
      ? selectedIds.filter((id) => id !== contentId)
      : [...selectedIds, contentId];
    onChange(newIds);
  };

  const availableTypes = useMemo(() => {
    const types = new Set(contentItems.map((c) => c.type));
    return Array.from(types).sort();
  }, [contentItems]);

  return (
    <div>
      <label className="block text-sm font-semibold text-surface-600 mb-1.5">{label}</label>

      <div className="max-w-lg border border-surface-200 rounded-xl">
        {/* Search + filter */}
        <div className="px-3 py-2.5 border-b border-surface-100 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search content..."
              className="h-9 w-full pl-9 pr-3 rounded-xl border border-surface-300 bg-white text-sm text-surface-700 placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            />
          </div>
        </div>

        {/* Type filter chips */}
        {availableTypes.length > 1 && (
          <div className="px-3 py-2 border-b border-surface-100 flex gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setTypeFilter('')}
              className={`px-2.5 py-1 rounded-full text-sm font-medium transition-colors ${
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
                className={`px-2.5 py-1 rounded-full text-sm font-medium capitalize transition-colors ${
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

        {/* Items list */}
        <div className="max-h-[280px] overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-surface-400">
              {contentItems.length === 0 ? 'No media uploaded yet.' : 'No matches found.'}
            </div>
          )}
          {filtered.map((item) => (
            <label
              key={item.id}
              className={`flex items-center gap-3 px-4 py-2.5 hover:bg-surface-50 cursor-pointer border-b border-surface-100 last:border-b-0 ${
                selectedIds.includes(item.id) ? 'bg-primary-50' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={() => toggleItem(item.id)}
                className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
              />
              <ContentTypeIcon type={item.type} />
              <span className="text-base text-surface-700 truncate flex-1">{item.name}</span>
              <span className="text-sm text-surface-400 shrink-0">{item.type}</span>
              <span className="text-sm text-surface-400 shrink-0">
                {formatFileSize(item.file_size)}
              </span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-surface-100 flex items-center justify-between">
          <span className="text-sm text-surface-400">
            {selectedIds.length} selected of {contentItems.length}
          </span>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-sm text-surface-400 hover:text-red-500 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
