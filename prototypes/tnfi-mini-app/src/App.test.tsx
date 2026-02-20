import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    BrowserRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Routes: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Route: ({ element }: { element: React.ReactElement }) => element,
    Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  };
}, { virtual: true });

jest.mock('@twa-dev/sdk', () => ({
  __esModule: true,
  default: {
    initDataUnsafe: {},
    themeParams: {},
    setHeaderColor: jest.fn(),
    setBackgroundColor: jest.fn(),
    MainButton: {
      setText: jest.fn(),
      show: jest.fn(),
      onClick: jest.fn(),
      offClick: jest.fn(),
    },
    showAlert: jest.fn(),
  },
}));

import App from './App';

test('renders TNFi welcome screen', () => {
  render(<App />);
  expect(screen.getByText(/добро пожаловать/i)).toBeInTheDocument();
});
