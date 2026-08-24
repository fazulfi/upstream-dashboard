import React from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider, useTheme } from './theme'

function ThemeConsumer() {
  const { theme, toggle } = useTheme()
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button onClick={toggle}>Toggle Theme</button>
    </div>
  )
}

describe('Theme System', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.body.style.backgroundColor = ''
  })

  it('defaults to dark theme when no saved preference exists', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    )
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('theme-dark')
    expect(document.documentElement).not.toHaveClass('theme-light')
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('#07090e')
    expect(document.documentElement.style.getPropertyValue('--mesh-opacity')).toBe('0.32')
  })

  it('toggles smoothly between dark and light themes', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    )
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('theme-dark')

    const button = screen.getByRole('button', { name: 'Toggle Theme' })
    fireEvent.click(button)

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
    expect(document.documentElement).toHaveClass('theme-light')
    expect(document.documentElement).not.toHaveClass('theme-dark')
    expect(localStorage.getItem('upstream-theme')).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('#f2f2f7')
    expect(document.documentElement.style.getPropertyValue('--mesh-opacity')).toBe('0.18')

    fireEvent.click(button)
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('theme-dark')
    expect(document.documentElement).not.toHaveClass('theme-light')
    expect(localStorage.getItem('upstream-theme')).toBe('dark')
    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('#07090e')
    expect(document.documentElement.style.getPropertyValue('--mesh-opacity')).toBe('0.32')
  })

  it('handles rapid sequential theme toggles correctly', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    )
    const button = screen.getByRole('button', { name: 'Toggle Theme' })
    
    // Rapidly toggle 5 times
    fireEvent.click(button) // light
    fireEvent.click(button) // dark
    fireEvent.click(button) // light
    fireEvent.click(button) // dark
    fireEvent.click(button) // light

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
    expect(document.documentElement).toHaveClass('theme-light')
    expect(localStorage.getItem('upstream-theme')).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#0071e3')
  })

  it('restores theme from localStorage', () => {
    localStorage.setItem('upstream-theme', 'light')
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    )
    expect(screen.getByTestId('current-theme')).toHaveTextContent('light')
    expect(document.documentElement).toHaveClass('theme-light')
  })

  it('falls back safely when useTheme is called outside provider', () => {
    render(<ThemeConsumer />)
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
  })

  it('falls back safely to dark when localStorage contains invalid or corrupted theme value', () => {
    localStorage.setItem('upstream-theme', 'neon-purple-custom')
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    )
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('theme-dark')
    expect(document.documentElement).not.toHaveClass('theme-light')
  })

  it('verifies index.css contains smooth global transitions, ambient mesh 0.7s cross-fade, and respects reduced motion', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const cssContent = fs.readFileSync(path.resolve(__dirname, 'index.css'), 'utf-8')
    
    // Find all universal selector blocks
    const matches = Array.from(cssContent.matchAll(/(?:\*,\s*\*::before,\s*\*::after|\*,\s*\n\s*\*::before,\s*\n\s*\*::after)\s*\{([^}]+)\}/g))
    expect(matches.length).toBeGreaterThanOrEqual(2)
    
    // The reduced-motion accessibility block
    const reducedMotionBlock = matches.find(m => m[1].includes('0.01ms'))
    expect(reducedMotionBlock).toBeDefined()
    expect(reducedMotionBlock[1]).toContain('transition-duration: 0.01ms !important')
    
    // The global theme transition block
    const themeTransitionBlock = matches.find(m => m[1].includes('background-color 0.5s'))
    expect(themeTransitionBlock).toBeDefined()
    const globalBlock = themeTransitionBlock[1]
    expect(globalBlock).toContain('background-color 0.5s cubic-bezier(0.4, 0, 0.2, 1)')
    expect(globalBlock).toContain('border-color 0.5s cubic-bezier(0.4, 0, 0.2, 1)')
    expect(globalBlock).toContain('color 0.4s cubic-bezier(0.4, 0, 0.2, 1)')
    expect(globalBlock).toContain('box-shadow 0.5s cubic-bezier(0.4, 0, 0.2, 1)')
    expect(globalBlock).toContain('opacity 0.4s ease')
    expect(globalBlock).not.toContain('transform')
    
    // Ambient mesh transitions
    expect(cssContent).toMatch(/\.ambient-mesh-container\s*\{[^}]*transition:\s*opacity 0\.7s ease/)
    expect(cssContent).toMatch(/\.ambient-mesh\s*\{[^}]*transition:\s*opacity 0\.7s ease/)
  })

  it('verifies index.css defines .ios-glass-card and .ios-btn-glass with 3D spring physics and liquid lens filter', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const cssContent = fs.readFileSync(path.resolve(__dirname, 'index.css'), 'utf-8')

    // .ios-glass-card spring transition & transform scaling
    expect(cssContent).toMatch(/\.ios-glass-card\s*\{[^}]*cubic-bezier\(0\.34,\s*1\.56,\s*0\.64,\s*1\)/)
    expect(cssContent).toMatch(/\.ios-glass-card:hover\s*\{[^}]*scale\(1\.015\)/)
    expect(cssContent).toMatch(/\.ios-glass-card:active\s*\{[^}]*scale\(0\.97\)/)

    // .ios-btn-glass specular highlight and liquid lens filter
    expect(cssContent).toMatch(/\.ios-btn-glass\s*\{[^}]*position:\s*relative/)
    expect(cssContent).toMatch(/\.ios-btn-glass\s*\{[^}]*overflow:\s*hidden/)
    expect(cssContent).toMatch(/\.ios-btn-glass::before\s*\{[^}]*linear-gradient\(180deg/)
    expect(cssContent).toMatch(/\.ios-btn-glass:active:not\(:disabled\)\s*\{[^}]*filter:\s*url\(#liquid-lens\)/)
    expect(cssContent).toMatch(/\.ios-btn-glass:active:not\(:disabled\)\s*\{[^}]*scale\(0\.96\)/)
  })

  it('verifies index.html contains liquid-lens SVG filter definition', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const htmlContent = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8')

    expect(htmlContent).toContain('filter id="liquid-lens"')
    expect(htmlContent).toContain('feTurbulence')
    expect(htmlContent).toContain('feDisplacementMap')
    expect(htmlContent).toContain('feSpecularLighting')
  })
})


