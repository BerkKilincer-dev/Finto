export type ShortcutActionId =
  | 'toggleAssistant'
  | 'startListening'
  | 'readPage'
  | 'openCommandPalette'
  | 'closeTopLayer'
  | 'toggleAccessibleMode';

export type ShortcutSpec = {
  key: string;
  alt?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
};

export type ShortcutMap = Record<ShortcutActionId, ShortcutSpec>;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  toggleAssistant: { alt: true, key: 'a' },
  startListening: { alt: true, key: 'm' },
  readPage: { alt: true, key: 'o' },
  openCommandPalette: { alt: true, key: 'k' },
  closeTopLayer: { key: 'Escape' },
  toggleAccessibleMode: { alt: true, key: 'e' },
};

function normalizeKeyName(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (key === 'esc') return 'escape';
  if (key === 'return') return 'enter';
  if (key === 'spacebar' || key === 'space') return ' ';
  return key;
}

export function normalizeShortcut(input: ShortcutSpec): ShortcutSpec {
  return {
    key: normalizeKeyName(input.key),
    alt: !!input.alt,
    shift: !!input.shift,
    ctrl: !!input.ctrl,
    meta: !!input.meta,
  };
}

export function formatShortcut(spec: ShortcutSpec): string {
  const normalized = normalizeShortcut(spec);
  const parts: string[] = [];
  if (normalized.ctrl) parts.push('Ctrl');
  if (normalized.alt) parts.push('Alt');
  if (normalized.shift) parts.push('Shift');
  if (normalized.meta) parts.push('Meta');
  const prettyKeyMap: Record<string, string> = {
    escape: 'Esc',
    enter: 'Enter',
    tab: 'Tab',
    backspace: 'Backspace',
    delete: 'Delete',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
    ' ': 'Space',
  };
  parts.push(
    prettyKeyMap[normalized.key] ??
      (normalized.key.length === 1 ? normalized.key.toUpperCase() : normalized.key),
  );
  return parts.join('+');
}

export function matchesShortcut(event: KeyboardEvent, spec: ShortcutSpec): boolean {
  const normalized = normalizeShortcut(spec);
  const key = normalizeKeyName(event.key);
  return (
    key === normalized.key &&
    event.altKey === normalized.alt &&
    event.shiftKey === normalized.shift &&
    event.ctrlKey === normalized.ctrl &&
    event.metaKey === normalized.meta
  );
}

export type CommandItem = {
  id:
    | 'toggle-assistant'
    | 'start-listening'
    | 'read-page'
    | 'go-home'
    | 'go-portfolio'
    | 'go-profile'
    | 'close-layer'
    | 'shortcut-help'
    | 'toggle-accessible-mode';
  title: string;
  description: string;
  shortcutActionId?: ShortcutActionId;
  voiceExamples?: string[];
};

export const COMMAND_ITEMS: CommandItem[] = [
  {
    id: 'toggle-assistant',
    title: 'Asistanı aç / kapat',
    description: 'Sesli asistan panelini açar veya kapatır.',
    shortcutActionId: 'toggleAssistant',
    voiceExamples: ['asistanı aç', 'asistanı kapat'],
  },
  {
    id: 'start-listening',
    title: 'Mikrofonu başlat',
    description: 'Asistanı dinleme moduna alır.',
    shortcutActionId: 'startListening',
    voiceExamples: ['beni dinle', 'mikrofon aç'],
  },
  {
    id: 'read-page',
    title: 'Sayfayı sesli oku',
    description: 'Aktif sayfanın özetini sesli okur.',
    shortcutActionId: 'readPage',
    voiceExamples: ['sayfayı oku', 'şu anki sayfayı oku'],
  },
  {
    id: 'go-home',
    title: 'Ana sayfaya git',
    description: 'Ana sayfayı açar.',
    voiceExamples: ['ana sayfaya git'],
  },
  {
    id: 'go-portfolio',
    title: 'Portföyü aç',
    description: 'Portföy sayfasını açar.',
    voiceExamples: ['portföye git', 'portföyümü aç'],
  },
  {
    id: 'go-profile',
    title: 'Profili aç',
    description: 'Profil sayfasını açar.',
    voiceExamples: ['profilime git'],
  },
  {
    id: 'close-layer',
    title: 'Üst katmanı kapat',
    description: 'Açık panel veya modalı kapatır.',
    shortcutActionId: 'closeTopLayer',
    voiceExamples: ['kapat', 'sus'],
  },
  {
    id: 'shortcut-help',
    title: 'Kısayol yardımını oku',
    description: 'Tüm global kısayolları anons eder.',
    voiceExamples: ['yardım', 'kısayollar'],
  },
  {
    id: 'toggle-accessible-mode',
    title: 'Erişilebilir modu aç / kapat',
    description: 'Sade, liste tabanlı erişilebilir arayüze geçer veya normale döner.',
    shortcutActionId: 'toggleAccessibleMode',
    voiceExamples: ['erişilebilir mod', 'sade görünüm', 'normal görünüm'],
  },
];

export function getGlobalHint(shortcuts: ShortcutMap): string {
  return (
    `Kısayollar: ${formatShortcut(shortcuts.toggleAssistant)} asistan, ` +
    `${formatShortcut(shortcuts.startListening)} mikrofon, ` +
    `${formatShortcut(shortcuts.readPage)} sayfayı oku, ` +
    `${formatShortcut(shortcuts.openCommandPalette)} komut paleti, ` +
    `${formatShortcut(shortcuts.toggleAccessibleMode)} erişilebilir mod, ` +
    `${formatShortcut(shortcuts.closeTopLayer)} kapat. ` +
    'Navigasyon için Shift+G sonra: H ana sayfa, P portföy, R profil.'
  );
}
