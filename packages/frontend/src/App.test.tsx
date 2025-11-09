import { render, screen } from '@testing-library/react';
import App from './App.js';

describe('App', () => {
  it('renders the primary callouts', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /Architekt/i })).toBeInTheDocument();
    expect(
      screen.getByText(/TypeScript-powered Express API, shared domain models, and a React frontend/i)
    ).toBeInTheDocument();
  });
});
