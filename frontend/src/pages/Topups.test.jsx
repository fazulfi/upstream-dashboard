import { describe, it, expect } from 'vitest'

// salinan fungsi sanitasi SVG dari Topups.jsx utk diuji (pure function)
function sanitizeSvg(svg) {
  return String(svg || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

describe('SVG sanitize (Topups)', () => {
  it('strips script tags', () => {
    const bad = '<svg><script>alert(1)</script><rect/></svg>'
    const out = sanitizeSvg(bad)
    expect(out).not.toContain('<script')
    expect(out).toContain('<svg>')
  })

  it('strips on* handlers', () => {
    const bad = '<svg onload="alert(1)"><circle/></svg>'
    expect(sanitizeSvg(bad)).not.toContain('onload')
  })

  it('strips javascript: URIs', () => {
    const bad = '<svg><a href="javascript:alert(1)">x</a></svg>'
    expect(sanitizeSvg(bad)).not.toContain('javascript:')
  })

  it('strips html comments', () => {
    const bad = '<svg><!-- comment --><rect/></svg>'
    expect(sanitizeSvg(bad)).not.toContain('<!--')
  })

  it('leaves safe svg intact', () => {
    const safe = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10"/></svg>'
    expect(sanitizeSvg(safe)).toBe(safe)
  })
})