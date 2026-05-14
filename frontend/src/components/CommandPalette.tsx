import { useMemo, useState } from 'react';
import type { CommandItem } from '../hooks/accessibilityConfig';

type CommandPaletteProps = {
  isOpen: boolean;
  commands: CommandItem[];
  onRunCommand: (commandId: CommandItem['id']) => void;
  onClose: () => void;
};

export default function CommandPalette({
  isOpen,
  commands,
  onRunCommand,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((cmd) => {
      if (cmd.title.toLowerCase().includes(q)) return true;
      if (cmd.description.toLowerCase().includes(q)) return true;
      return (cmd.voiceExamples ?? []).some((v) => v.toLowerCase().includes(q));
    });
  }, [query, commands]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-start justify-center px-4 pt-20">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Komut paleti"
        className="w-full max-w-2xl rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl overflow-hidden"
      >
        <div className="p-3 border-b border-slate-100 dark:border-slate-700">
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
              }
              if (e.key === 'Enter' && filtered[0]) {
                e.preventDefault();
                onRunCommand(filtered[0].id);
                setQuery('');
                onClose();
              }
            }}
            placeholder="Komut ara (örn: portföy, mikrofon, yardım)"
            className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 font-semibold">
              Eşleşen komut bulunamadı.
            </p>
          ) : (
            filtered.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => {
                  onRunCommand(cmd.id);
                  setQuery('');
                  onClose();
                }}
                className="w-full text-left px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
              >
                <p className="text-sm font-black text-slate-900 dark:text-white">{cmd.title}</p>
                <p className="text-xs mt-1 text-slate-500 dark:text-slate-400">{cmd.description}</p>
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-700 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
