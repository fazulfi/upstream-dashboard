import React from 'react'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from './Sidebar'
import { ThemeProvider } from '../theme'

describe('Sidebar', () => {
  it('renders navigation and marks the current route active', () => {
    render(<ThemeProvider><MemoryRouter initialEntries={['/topups']}><Sidebar /></MemoryRouter></ThemeProvider>)
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Top-ups/ })).toHaveClass('active')
    expect(screen.getByRole('link', { name: /Reliability/ })).toBeInTheDocument()
  })

  it('toggles the theme control', () => {
    render(<ThemeProvider><MemoryRouter><Sidebar /></MemoryRouter></ThemeProvider>)
    const button = screen.getByRole('button', { name: /Switch to light mode/ })
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: /Switch to dark mode/ })).toBeInTheDocument()
  })
})
