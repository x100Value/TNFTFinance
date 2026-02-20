import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

jest.mock('@twa-dev/sdk', () => ({
  __esModule: true,
  default: {
    initDataUnsafe: {},
    ready: jest.fn(),
    expand: jest.fn(),
    setHeaderColor: jest.fn(),
    setBackgroundColor: jest.fn(),
    MainButton: {
      hide: jest.fn(),
    },
  },
}));

type MockPayload = {
  ok: boolean;
  result?: any;
  code?: number;
};

function jsonResponse(payload: MockPayload): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

beforeEach(() => {
  global.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const parsed = JSON.parse(String(init?.body ?? '{}'));
    const method = parsed.method;

    if (method === 'getAddressInformation') {
      return jsonResponse({
        ok: true,
        result: {
          state: 'active',
          balance: '45966000',
          last_transaction_id: {
            hash: 'VGD1D9e9dWnsJW84kJzPvgsQLmf8//zlH8TuE70IKsg=',
            lt: '50195866000003',
          },
        },
      });
    }

    if (method === 'runGetMethod') {
      const getter = parsed.params?.method;

      if (getter === 'get_owner') {
        return jsonResponse({
          ok: true,
          result: {
            stack: [
              ['cell', { bytes: '' }],
              ['cell', { bytes: 'te6cckEBAQEAJAAAQ4ANyr7xC4fyPjTFk3h/p6fNnwQjp3m52Xuh9LjmG80pKHB//gR6' }],
            ],
            exit_code: 0,
            gas_used: 3600,
          },
        });
      }

      if (getter === 'get_loan_state') {
        return jsonResponse({
          ok: true,
          result: {
            stack: [
              ['num', '0x1'],
              ['cell', { bytes: 'te6cckEBAQEAJAAAQ4ANyr7xC4fyPjTFk3h/p6fNnwQjp3m52Xuh9LjmG80pKHB//gR6' }],
              ['num', '0x69f3d090'],
              ['num', '0x69f52210'],
              ['num', '0x3b9aca00'],
              ['num', '0x69f3d090'],
              ['num', '0x0'],
            ],
            exit_code: 0,
            gas_used: 3600,
          },
        });
      }

      if (getter === 'get_risk_state') {
        return jsonResponse({
          ok: true,
          result: {
            stack: [
              ['num', '0x1388'],
              ['num', '0x258'],
              ['num', '0x15180'],
              ['num', '0x0'],
              ['num', '0x0'],
              ['num', '0x0'],
              ['num', '0x1'],
            ],
            exit_code: 0,
            gas_used: 3600,
          },
        });
      }

      if (getter === 'get_oracle_is_fresh') {
        return jsonResponse({
          ok: true,
          result: {
            stack: [['num', '0x1']],
            exit_code: 0,
            gas_used: 3600,
          },
        });
      }
    }

    return jsonResponse({ ok: false, code: 500, result: 'unsupported method' });
  }) as jest.Mock;
});

afterEach(() => {
  jest.resetAllMocks();
});

test('renders TNFT control surface and loads state', async () => {
  render(<App />);

  expect(screen.getByText(/Eggshell Credit Console/i)).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getAllByText(/ACTIVE/i).length).toBeGreaterThan(0);
  });

  expect(screen.getByText(/FUNDED/i)).toBeInTheDocument();
});
