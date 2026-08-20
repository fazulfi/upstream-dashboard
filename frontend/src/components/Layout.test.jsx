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
    renderLayout('/topups')
    expect(screen.getByRole('heading', { name: 'Top-ups' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Reliability/ })).toBeInTheDocument()
    const sidebar = document.querySelector('.sidebar')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(sidebar).toHaveClass('open')
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(sidebar).not.toHaveClass('open')
  })
})
