export type ShortcutActionId =
  | 'toggleAssistant'
  | 'startListening'
  | 'readPage'
  | 'openCommandPalette'
  | 'closeTopLayer';

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
};

export function normalizeShortcut(input: ShortcutSpec): ShortcutSpec {
  return {
    key: input.key.length === 1 ? input.key.toLowerCase() : input.key,
    alt: !!input.alt,
    shift: !!input.shift,
    ctrl: !!input.ctrl,
    meta: !!input.meta,
  };
}

export function formatShortcut(spec: ShortcutSpec): string {
  const parts: string[] = [];
  if (spec.ctrl) parts.push('Ctrl');
  if (spec.alt) parts.push('Alt');
  if (spec.shift) parts.push('Shift');
  if (spec.meta) parts.push('Meta');
  parts.push(spec.key.length === 1 ? spec.key.toUpperCase() : spec.key);
  return parts.join('+');
}

export function matchesShortcut(event: KeyboardEvent, spec: ShortcutSpec): boolean {
  const normalized = normalizeShortcut(spec);
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
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
    | 'shortcut-help';
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
];

export function getGlobalHint(shortcuts: ShortcutMap): string {
  return (
    `Kısayollar: ${formatShortcut(shortcuts.toggleAssistant)} asistan, ` +
    `${formatShortcut(shortcuts.startListening)} mikrofon, ` +
    `${formatShortcut(shortcuts.readPage)} sayfayı oku, ` +
    `${formatShortcut(shortcuts.openCommandPalette)} komut paleti, ` +
    `${formatShortcut(shortcuts.closeTopLayer)} kapat. ` +
    'Navigasyon için Shift+G sonra: H ana sayfa, P portföy, R profil.'
  );
}
