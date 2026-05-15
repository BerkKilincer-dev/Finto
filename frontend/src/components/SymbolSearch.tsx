import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { BIST_WATCHLIST } from '../data/bistWatchlist';

type SearchItem = { symbol: string; name: string };

const ALL_ITEMS: SearchItem[] = BIST_WATCHLIST.map((s) => ({ symbol: s.symbol, name: s.name }));

/**
 * Türkçe karakterleri normalize et: "Garanti" ile "garanti", "Aselsan" ile "aselsan"
 * arasında fark olmasın; "İ" ve "ı" da match olsun.
 */
function normalize(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/[İi̇]/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

/**
 * Basit fuzzy skor: tam sembol > sembol prefix > ad prefix > ad içeren > harf sırası.
 * Skor düşükse görmezden gel. Karmaşık fuzzy lib gerek yok — 70 sembol için fazlasıyla yeterli.
 */
function scoreItem(item: SearchItem, q: string): number {
  const sym = normalize(item.symbol);
  const name = normalize(item.name);
  if (sym === q) return 1000;
  if (sym.startsWith(q)) return 900 - (sym.length - q.length);
  if (name.startsWith(q)) return 800 - (name.length - q.length);
  if (sym.includes(q)) return 600;
  if (name.includes(q)) return 500 - name.indexOf(q);
  // Sıralı harf eşleşmesi: "asln" → "aselsan"
  let i = 0;
  for (const ch of name) {
    if (ch === q[i]) i++;
    if (i === q.length) return 200;
  }
  return 0;
}

type Props = {
  /** Mobilde dar header için kısaltma. */
  compact?: boolean;
};

export default function SymbolSearch({ compact = false }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listboxId = 'symbol-search-listbox';

  const matches = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return [];
    return ALL_ITEMS
      .map((item) => ({ item, score: scoreItem(item, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.item);
  }, [query]);

  // Dışarı tıklayınca kapat
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Query değişince highlight'ı sıfırla
  useEffect(() => {
    setHighlight(0);
  }, [query]);

  function selectItem(item: SearchItem) {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(`/stock/${item.symbol.toLowerCase()}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(matches.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      const picked = matches[highlight];
      if (picked) {
        e.preventDefault();
        selectItem(picked);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${compact ? 'w-36' : 'w-48 md:w-64'}`}>
      <label htmlFor="global-symbol-search" className="sr-only">
        Hisse ara ve detay sayfasına git
      </label>
      <Search
        size={14}
        aria-hidden="true"
        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        id="global-symbol-search"
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && matches[highlight] ? `${listboxId}-opt-${highlight}` : undefined
        }
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Hisse ara (Aselsan, GARAN...)"
        className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg"
        >
          {matches.map((item, idx) => {
            const isActive = idx === highlight;
            return (
              <li
                key={item.symbol}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectItem(item);
                }}
                className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-800 dark:text-blue-100'
                    : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                <span className="font-black text-sm">{item.symbol}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {item.name}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
