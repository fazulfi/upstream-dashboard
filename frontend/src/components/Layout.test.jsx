import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Outlet, Routes, Route } from 'react-router-dom'
import Layout from './Layout'
import { ThemeProvider } from '../theme'

vi.mock('../hooks/useApi', async () => ({
  ...(await vi.importActual('../hooks/useApi')),
  useApi: () => ({ data: { balances: { publisher_earnings: 12.5 }, refreshed: 'now' } }),
}))

function renderLayout(route = '/') {
  return render(<ThemeProvider><MemoryRouter initialEntries={[route]}><Routes><Route element={<Layout />}><Route path="*" element={<Outlet />} /></Route></Routes></MemoryRouter></ThemeProvider>)
}

describe('Layout', () => {
  it('shows route title, links, and toggles mobile navigation', () => {
    renderLayout('/auto-pricing')
    expect(screen.getByRole('heading', { name: 'Auto Pricing' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Reliability/ })).toBeInTheDocument()
    const sidebar = document.querySelector('.sidebar')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(sidebar).toHaveClass('open')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(sidebar).not.toHaveClass('open')
  })

  it('renders ambient mesh cross-fade layers for light and dark modes', () => {
    renderLayout('/')
    const meshContainer = document.querySelector('.ambient-mesh-container')
    expect(meshContainer).toBeInTheDocument()
    expect(document.querySelector('.ambient-mesh-dark')).toBeInTheDocument()
    expect(document.querySelector('.ambient-mesh-light')).toBeInTheDocument()
  })

  it('toggles command palette with Ctrl+K and Cmd+K keyboard shortcut', () => {
    renderLayout('/')
    expect(screen.queryByPlaceholderText(/Type a command/i)).not.toBeInTheDocument()
    
    // Test Ctrl+K
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByPlaceholderText(/Type a command/i)).toBeInTheDocument()

    // Test Esc to close
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByPlaceholderText(/Type a command/i)).not.toBeInTheDocument()

    // Test Cmd+K (metaKey)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByPlaceholderText(/Type a command/i)).toBeInTheDocument()
  })

  it('opens search palette via topbar quick search button and closes it', () => {
    renderLayout('/')
    const quickSearchBtn = screen.getByRole('button', { name: /quick search/i })
    fireEvent.click(quickSearchBtn)
    expect(screen.getByPlaceholderText(/Type a command/i)).toBeInTheDocument()

    // Press Escape to dismiss
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByPlaceholderText(/Type a command/i)).not.toBeInTheDocument()
  })
})
