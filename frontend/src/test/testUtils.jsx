import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../theme'

export function renderWithRouter(ui, { route = '/', ...options } = {}) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </ThemeProvider>,
    options,
  )
}
