import { describe, it, expect } from 'vitest';
import { parseVoiceCommand } from '../frontend/src/hooks/voiceCommands';

const SYMBOLS = ['ASELS', 'GARAN', 'AKBNK', 'THYAO'];

describe('parseVoiceCommand', () => {
  it('"satın al" SAT değil BUY olarak parse olmalı (regression)', () => {
    const r = parseVoiceCommand('Aselsan beş lot satın al', SYMBOLS);
    expect(r).toEqual({ type: 'buy', symbol: 'ASELS', quantity: 5 });
  });

  it('düz "sat" SAT olarak parse olmalı', () => {
    const r = parseVoiceCommand('Garanti üç lot sat', SYMBOLS);
    expect(r).toEqual({ type: 'sell', symbol: 'GARAN', quantity: 3 });
  });

  it('düz "al" BUY olarak parse olmalı', () => {
    const r = parseVoiceCommand('Akbank 10 lot al', SYMBOLS);
    expect(r).toEqual({ type: 'buy', symbol: 'AKBNK', quantity: 10 });
  });

  it('"asistanı aç" open-assistant intent\'i döndürmeli', () => {
    const r = parseVoiceCommand('asistanı aç', SYMBOLS);
    expect(r).toEqual({ type: 'open-assistant' });
  });

  it('doğal varyasyon: "kaç param var" → read:cash', () => {
    const r = parseVoiceCommand('kaç param var', SYMBOLS);
    expect(r).toEqual({ type: 'read', what: 'cash' });
  });

  it('doğal varyasyon: "bana özet geç" → read:portfolio', () => {
    const r = parseVoiceCommand('bana özet geç', SYMBOLS);
    expect(r).toEqual({ type: 'read', what: 'portfolio' });
  });

  it('"ne yapabilirsin" → help', () => {
    const r = parseVoiceCommand('ne yapabilirsin', SYMBOLS);
    expect(r).toEqual({ type: 'help' });
  });

  it('alakasız metin → null', () => {
    const r = parseVoiceCommand('bugün hava nasıl', SYMBOLS);
    expect(r).toBeNull();
  });

  it('"THYAO fiyatı" → stock-price intent', () => {
    const r = parseVoiceCommand('THYAO fiyatı ne', SYMBOLS);
    expect(r).toEqual({ type: 'stock-price', symbol: 'THYAO' });
  });
});
