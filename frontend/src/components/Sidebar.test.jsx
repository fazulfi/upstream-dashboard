import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar, { isSidebarSwipeClose } from './Sidebar'
import { ThemeProvider } from '../theme'

describe('Sidebar', () => {
  it('renders navigation and marks the current route active', () => {
    render(<ThemeProvider><MemoryRouter initialEntries={['/auto-pricing']}><Sidebar /></MemoryRouter></ThemeProvider>)
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Auto Pricing/ })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'Pricing' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Reliability/ })).toBeInTheDocument()
  })

  it('toggles the theme control', () => {
    render(<ThemeProvider><MemoryRouter><Sidebar /></MemoryRouter></ThemeProvider>)
    const button = screen.getByRole('button', { name: /Switch to light mode/ })
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: /Switch to dark mode/ })).toBeInTheDocument()
  })

  it('triggers onClose when close button or backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <ThemeProvider>
        <MemoryRouter>
          <Sidebar isOpen={true} onClose={onClose} />
        </MemoryRouter>
      </ThemeProvider>
    )
    const closeBtn = screen.getByRole('button', { name: 'Close menu' })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = document.querySelector('.bg-black\\/70')
    if (backdrop) {
      fireEvent.click(backdrop)
      expect(onClose).toHaveBeenCalledTimes(2)
    }
  })

  it('closes when Escape key is pressed while open', () => {
    const onClose = vi.fn()
    render(
      <ThemeProvider>
        <MemoryRouter>
          <Sidebar isOpen={true} onClose={onClose} />
        </MemoryRouter>
      </ThemeProvider>
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('includes touch-pan-y styling for smooth mobile scrolling', () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <Sidebar isOpen={true} />
        </MemoryRouter>
      </ThemeProvider>
    )
    const sidebar = document.querySelector('.sidebar')
    expect(sidebar).toHaveClass('touch-pan-y')
    expect(sidebar).toHaveClass('open')
  })

  it('triggers onClose when a navigation item is clicked', () => {
    const onClose = vi.fn()
    render(
      <ThemeProvider>
        <MemoryRouter>
          <Sidebar isOpen={true} onClose={onClose} />
        </MemoryRouter>
      </ThemeProvider>
    )
    const link = screen.getByRole('link', { name: /Reliability/ })
    fireEvent.click(link)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders with drag constraints and spring animations enabled when open', () => {
    const { container } = render(
      <ThemeProvider>
        <MemoryRouter>
          <Sidebar isOpen={true} />
        </MemoryRouter>
      </ThemeProvider>
    )
    const aside = container.querySelector('aside')
    expect(aside).toBeInTheDocument()
    expect(aside).toHaveClass('ios-sidebar')
    expect(aside).toHaveClass('open')
  })

  describe('isSidebarSwipeClose swipe gesture thresholds', () => {
    it('evaluates distance threshold (< -80)', () => {
      expect(isSidebarSwipeClose({ offset: { x: -81 }, velocity: { x: 0 } })).toBe(true)
      expect(isSidebarSwipeClose({ offset: { x: -80 }, velocity: { x: 0 } })).toBe(false)
      expect(isSidebarSwipeClose({ offset: { x: -50 }, velocity: { x: 0 } })).toBe(false)
      expect(isSidebarSwipeClose({ offset: { x: 50 }, velocity: { x: 0 } })).toBe(false)
    })

    it('evaluates flick velocity threshold (< -300)', () => {
      expect(isSidebarSwipeClose({ offset: { x: 0 }, velocity: { x: -301 } })).toBe(true)
      expect(isSidebarSwipeClose({ offset: { x: 0 }, velocity: { x: -300 } })).toBe(false)
      expect(isSidebarSwipeClose({ offset: { x: 0 }, velocity: { x: -100 } })).toBe(false)
      expect(isSidebarSwipeClose({ offset: { x: 0 }, velocity: { x: 200 } })).toBe(false)
    })

    it('handles undefined or partial info safely without throwing', () => {
      expect(isSidebarSwipeClose(undefined)).toBe(false)
      expect(isSidebarSwipeClose(null)).toBe(false)
      expect(isSidebarSwipeClose({})).toBe(false)
      expect(isSidebarSwipeClose({ offset: {} })).toBe(false)
      expect(isSidebarSwipeClose({ velocity: {} })).toBe(false)
    })
  })
})
