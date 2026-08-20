import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import FinanceStatus from './FinanceStatus'

describe('FinanceStatus', () => {
  it('renders verified badge per metric', () => {
    render(<FinanceStatus metrics={[{ key: 'net_income', label: 'Net Income', value: '$100.00', verified: true }, { key: 'kurs', label: 'Kurs', value: '17,781', verified: false }]} />)
    expect(screen.getByText('Net Income')).toBeInTheDocument()
    expect(screen.getByText('$100.00')).toBeInTheDocument()
    expect(screen.getByText('✓ verified')).toBeInTheDocument()
    expect(screen.getByText('pending')).toBeInTheDocument()
  })

  it('renders variance summary line', () => {
    render(<FinanceStatus metrics={[]} variance="2 aset retired tanpa impairment (variance report)" />)
    expect(screen.getByText(/variance report/i)).toBeInTheDocument()
  })
})
