import { describe, it, expect } from 'vitest';
import { fmtUsdMicro, fmtTs, fmtCompetitorPrice } from './fmt';

describe('fmtUsdMicro — presisi mikro per-request (RC1 fix)', () => {
  it('nilai >= $1 -> 2 desimal', () => {
    expect(fmtUsdMicro(1.23456)).toBe('$1.23');
    expect(fmtUsdMicro(1234.5)).toBe('$1,234.50');
  });
  it('nilai >= $0.01 -> 4 desimal', () => {
    expect(fmtUsdMicro(0.123456)).toBe('$0.1235');
    expect(fmtUsdMicro(0.01)).toBe('$0.0100');
  });
  it('nilai mikro < $0.01 -> 6 desimal (BUKAN 0.0000)', () => {
    expect(fmtUsdMicro(0.000014)).toBe('$0.000014');
    expect(fmtUsdMicro(0.000049)).toBe('$0.000049');
    expect(fmtUsdMicro(0.00005)).toBe('$0.000050');
  });
  it('null/undefined/NaN -> $0', () => {
    expect(fmtUsdMicro(null)).toBe('$0');
    expect(fmtUsdMicro(undefined)).toBe('$0');
    expect(fmtUsdMicro(NaN)).toBe('$0');
  });
});

describe('fmtTs — format waktu relatif (zona LOKAL user)', () => {
  it('hari ini -> HH:mm:ss (jam LOKAL, bukan UTC)', () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    expect(fmtTs(now.toISOString())).toMatch(new RegExp(`^${hh}:\\d{2}:\\d{2}$`));
  });
  it('tanggal tua -> dd MMM HH:mm (Lokal)', () => {
    // 2026-08-01T14:05:00Z = 21:05 WIB (UTC+7) — test pakai konstruksi Date lokal deterministik.
    const d = new Date('2026-08-01T14:05:00Z');
    const pad = n => String(n).padStart(2, '0');
    const expectHh = pad(d.getHours());
    const expectMm = pad(d.getMinutes());
    expect(fmtTs('2026-08-01T14:05:00Z')).toBe(`01 Aug ${expectHh}:${expectMm}`);
  });
  it('kosong -> em dash', () => {
    expect(fmtTs(null)).toBe('—');
    expect(fmtTs('')).toBe('—');
  });
});

describe('fmtCompetitorPrice — kolom Kompetitor (genuine orderbook price)', () => {
  // Kontrak display: kompetitor sejati TERENDAH dari orderbook (competitor_price),
  // BUKAN anchor /market (comp) — live state codebuddy/glm-5.2: comp=0.322,
  // competitor_price=0.07 (z-ai @ $0.07). Kalau helper diberi comp, hasilnya
  // $0.3220 ≠ $0.0700 → test ini BUKTIKAN field lama tidak memenuhi kontrak.
  it('live state: competitor_price 0.07 tampil $0.0700 (bukan comp 0.322)', () => {
    const live = { comp: 0.322, competitor_price: 0.07 };
    expect(fmtCompetitorPrice(live.competitor_price)).toBe('$0.0700');
    expect(fmtCompetitorPrice(live.competitor_price)).not.toBe(
      fmtCompetitorPrice(live.comp)
    );
  });
  it('harga kompetitor valid -> 4 desimal', () => {
    expect(fmtCompetitorPrice(0.322)).toBe('$0.3220');
    expect(fmtCompetitorPrice(0.01358)).toBe('$0.0136');
    expect(fmtCompetitorPrice(1.4)).toBe('$1.4000');
  });
  it('null / <= 0 / invalid -> em dash', () => {
    expect(fmtCompetitorPrice(null)).toBe('—');
    expect(fmtCompetitorPrice(undefined)).toBe('—');
    expect(fmtCompetitorPrice(0)).toBe('—');
    expect(fmtCompetitorPrice(-0.001)).toBe('—');
    expect(fmtCompetitorPrice(NaN)).toBe('—');
  });
});
