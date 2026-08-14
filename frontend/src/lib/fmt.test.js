import { describe, it, expect } from 'vitest';
import { fmtUsdMicro, fmtTs } from './fmt';

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

describe('fmtTs — format waktu relatif', () => {
  it('hari ini -> HH:mm:ss', () => {
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2, '0');
    expect(fmtTs(now.toISOString())).toMatch(new RegExp(`^${hh}:\\d{2}:\\d{2}$`));
  });
  it('tanggal tua -> dd MMM HH:mm', () => {
    expect(fmtTs('2026-08-01T14:05:00Z')).toBe('01 Aug 14:05');
  });
  it('kosong -> em dash', () => {
    expect(fmtTs(null)).toBe('—');
    expect(fmtTs('')).toBe('—');
  });
});
