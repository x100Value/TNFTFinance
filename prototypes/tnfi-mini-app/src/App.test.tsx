import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function clickMainButton(name: RegExp): void {
  fireEvent.click(screen.getAllByRole('button', { name })[0]);
}

function setInput(label: RegExp, value: string): void {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

function setToggle(label: RegExp, checked: boolean): void {
  const toggle = screen.getByLabelText(label) as HTMLInputElement;
  if (toggle.checked !== checked) {
    fireEvent.click(toggle);
  }
}

test('demo sandbox: success path fund then repay', async () => {
  render(<App />);

  expect(screen.getByText(/Eggshell Credit Console/i)).toBeInTheDocument();
  expect(screen.getAllByText(/DEMO SANDBOX/i).length).toBeGreaterThan(0);
  expect(global.fetch).not.toHaveBeenCalled();

  clickMainButton(/TRY FUND/i);
  await waitFor(() => {
    expect(screen.getAllByText(/FUNDED/i).length).toBeGreaterThan(0);
  });

  clickMainButton(/REPAY/i);
  await waitFor(() => {
    expect(screen.getAllByText(/REPAID/i).length).toBeGreaterThan(0);
  });
});

test('demo sandbox: blocks funding when oracle is stale', async () => {
  render(<App />);

  setToggle(/Oracle fresh/i, false);
  clickMainButton(/TRY FUND/i);

  await waitFor(() => {
    expect(screen.getByText(/Funding blocked: oracle data is stale\./i)).toBeInTheDocument();
  });
});

test('demo sandbox: blocks funding when paused', async () => {
  render(<App />);

  setToggle(/Pause funding/i, true);
  clickMainButton(/TRY FUND/i);

  await waitFor(() => {
    expect(screen.getByText(/Funding blocked: pause flag is active\./i)).toBeInTheDocument();
  });
});

test('demo sandbox: blocks funding on LTV breach', async () => {
  render(<App />);

  setInput(/Requested principal \(TON\)/i, '15');
  clickMainButton(/TRY FUND/i);

  await waitFor(() => {
    expect(screen.getByText(/Funding blocked: LTV breach/i)).toBeInTheDocument();
  });
});

test('demo sandbox: blocks funding on low treasury liquidity', async () => {
  render(<App />);

  setInput(/Treasury TON/i, '1');
  clickMainButton(/TRY FUND/i);

  await waitFor(() => {
    expect(screen.getByText(/Funding blocked: treasury liquidity is too low\./i)).toBeInTheDocument();
  });
});

test('demo sandbox: blocks repay when wallet is insufficient', async () => {
  render(<App />);

  setInput(/Wallet TON/i, '0');
  clickMainButton(/TRY FUND/i);

  await waitFor(() => {
    expect(screen.getAllByText(/FUNDED/i).length).toBeGreaterThan(0);
  });

  clickMainButton(/REPAY/i);

  await waitFor(() => {
    expect(screen.getByText(/Repay blocked: wallet/i)).toBeInTheDocument();
  });
});

test('demo sandbox: supports liquidation and reopening new round', async () => {
  render(<App />);

  clickMainButton(/TRY FUND/i);
  await waitFor(() => {
    expect(screen.getAllByText(/FUNDED/i).length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getByRole('button', { name: /FORCE LIQUIDATE/i }));
  await waitFor(() => {
    expect(screen.getAllByText(/LIQUIDATED/i).length).toBeGreaterThan(0);
  });

  fireEvent.click(screen.getByRole('button', { name: /NEW ROUND/i }));
  await waitFor(() => {
    expect(screen.getAllByText(/OPEN/i).length).toBeGreaterThan(0);
  });
});

test('switches to live mode and fetches on-chain state', async () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /LIVE RPC/i }));

  await waitFor(() => {
    expect(screen.getAllByText(/ACTIVE/i).length).toBeGreaterThan(0);
  });

  expect(global.fetch).toHaveBeenCalled();
});
