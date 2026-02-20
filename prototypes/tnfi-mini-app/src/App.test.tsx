import React from 'react';
import { render, screen } from '@testing-library/react';

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
