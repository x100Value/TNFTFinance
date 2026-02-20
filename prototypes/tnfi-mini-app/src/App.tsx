import React, { useCallback, useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import './App.css';

const TONCENTER_JSON_RPC = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const TONSCAN_ADDRESS_PREFIX = 'https://testnet.tonscan.org/address/';

const DEFAULT_CONTRACT_ADDRESS = 'EQBVuxKDAts-fESLPfc1geFEu-C7aj5rawG_HvUxmtZljqTO';
const EXPECTED_OWNER_ADDRESS = 'EQBuVfeIXD-R8aYsm8P9PT5s-CEdO83Oy90Ppccw3mlJQ3TB';

type AddressInfoResult = {
  state?: string;
  balance?: string;
  last_transaction_id?: {
    hash?: string;
    lt?: string;
  };
};

type RunGetMethodResult = {
  stack?: unknown[];
  exit_code?: number;
  gas_used?: number;
};

type LoanView = {
  status: number;
  lenderCell: string;
  startedAt: number;
  dueAt: number;
  oraclePrice: number;
  oracleUpdatedAt: number;
  paused: boolean;
  oracleFresh: boolean;
};

type RiskView = {
  maxLtvBps: number;
  oracleMaxAge: number;
  riskTimelock: number;
  pendingMaxLtvBps: number;
  pendingOracleMaxAge: number;
  pendingEta: number;
  riskVersion: number;
};

type Snapshot = {
  accountState: string;
  balanceNano: number;
  lastTxHash: string;
  lastTxLt: string;
  ownerCell: string;
  loan: LoanView;
  risk: RiskView;
  fetchedAt: number;
};

const STATUS_LABEL: Record<string, string> = {
  '0': 'OPEN',
  '1': 'FUNDED',
  '2': 'REPAID',
  '3': 'LIQUIDATED',
  '4': 'CANCELLED',
};

function parseStackNum(stack: unknown[] | undefined, index: number): number {
  const item = stack?.[index];
  if (!Array.isArray(item) || item.length < 2 || item[0] !== 'num') {
    return 0;
  }

  const value = item[1];
  if (typeof value !== 'string') {
    return 0;
  }

  try {
    if (value.startsWith('-0x')) {
      return -Number.parseInt(value.slice(3), 16);
    }

    if (value.startsWith('0x')) {
      return Number.parseInt(value.slice(2), 16);
    }

    return Number(value);
  } catch {
    return 0;
  }
}

function parseStackCellBytes(stack: unknown[] | undefined, index: number): string {
  const item = stack?.[index];
  if (!Array.isArray(item) || item.length < 2 || item[0] !== 'cell') {
    return '';
  }

  const payload = item[1] as { bytes?: string } | undefined;
  return typeof payload?.bytes === 'string' ? payload.bytes : '';
}

function shortValue(value: string, head = 8, tail = 7): string {
  if (!value) {
    return '—';
  }

  if (value.length <= head + tail + 1) {
    return value;
  }

  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatTonFromNano(value: number): string {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 0;
  const sign = normalized < 0 ? '-' : '';
  const abs = Math.abs(normalized);
  const whole = Math.floor(abs / 1_000_000_000);
  const fraction = String(abs % 1_000_000_000).padStart(9, '0').slice(0, 3);
  return `${sign}${whole}.${fraction}`;
}

function formatTimestamp(timestamp: number): string {
  if (timestamp <= 0) {
    return '—';
  }

  const epoch = timestamp * 1000;
  if (!Number.isFinite(epoch) || epoch <= 0) {
    return '—';
  }

  return new Date(epoch).toLocaleString('ru-RU', { hour12: false });
}

function formatSeconds(value: number): string {
  if (value <= 0) {
    return '0s';
  }

  const seconds = value;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }

  return `${mins}m`;
}

function getStatusLabel(code: number): string {
  const label = STATUS_LABEL[String(code)];
  return label ?? `UNKNOWN(${String(code)})`;
}

function getHealthLabel(snapshot: Snapshot | null): string {
  if (!snapshot) {
    return 'NO DATA';
  }

  const status = snapshot.loan.status;
  if (status === 0 && !snapshot.loan.oracleFresh) {
    return 'ORACLE LOCK';
  }
  if (status === 1 && snapshot.loan.paused) {
    return 'PAUSED / FUNDED';
  }
  if (status === 1) {
    const now = Math.floor(Date.now() / 1000);
    if (snapshot.loan.dueAt > 0 && now > snapshot.loan.dueAt) {
      return 'OVERDUE';
    }
    return 'ACTIVE';
  }
  if (status === 2) {
    return 'CLOSED REPAID';
  }
  if (status === 3) {
    return 'CLOSED LIQUIDATED';
  }
  if (status === 4) {
    return 'CLOSED CANCELLED';
  }
  return 'OPEN';
}

function getRiskWindow(snapshot: Snapshot | null): string {
  if (!snapshot) {
    return '—';
  }

  if (snapshot.risk.pendingEta <= 0) {
    return 'No pending update';
  }

  const now = Math.floor(Date.now() / 1000);
  if (snapshot.risk.pendingEta <= now) {
    return 'Pending update can be applied now';
  }

  return `Applies in ${formatSeconds(snapshot.risk.pendingEta - now)}`;
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function App() {
  const [userName, setUserName] = useState('Operator');
  const [contractAddress, setContractAddress] = useState(DEFAULT_CONTRACT_ADDRESS);
  const [toncenterApiKey, setToncenterApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    const user = WebApp.initDataUnsafe?.user?.first_name;
    if (user) {
      setUserName(user);
    }

    try {
      WebApp.ready();
      WebApp.expand();
      WebApp.setHeaderColor('#15120f');
      WebApp.setBackgroundColor('#f4f1e8');
      WebApp.MainButton.hide();
    } catch {
      // No-op outside Telegram WebApp context.
    }
  }, []);

  const callRpc = useCallback(
    async <T,>(method: string, params: Record<string, unknown>): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (toncenterApiKey.trim().length > 0) {
        headers['X-API-Key'] = toncenterApiKey.trim();
      }

      const response = await fetch(TONCENTER_JSON_RPC, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: '1',
          jsonrpc: '2.0',
          method,
          params,
        }),
      });

      const payload = await readJson(response);
      if (!response.ok || payload?.ok !== true) {
        const code = payload?.code ?? response.status;
        const message = payload?.result ?? payload?.error ?? 'Unknown RPC error';
        throw new Error(`Toncenter RPC ${method} failed (${code}): ${message}`);
      }

      return payload.result as T;
    },
    [toncenterApiKey],
  );

  const refreshSnapshot = useCallback(async () => {
    const address = contractAddress.trim();
    if (address.length === 0) {
      setError('Contract address is empty.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [addressInfo, ownerResult, loanResult, riskResult, freshnessResult] = await Promise.all([
        callRpc<AddressInfoResult>('getAddressInformation', { address }),
        callRpc<RunGetMethodResult>('runGetMethod', { address, method: 'get_owner', stack: [] }),
        callRpc<RunGetMethodResult>('runGetMethod', { address, method: 'get_loan_state', stack: [] }),
        callRpc<RunGetMethodResult>('runGetMethod', { address, method: 'get_risk_state', stack: [] }),
        callRpc<RunGetMethodResult>('runGetMethod', { address, method: 'get_oracle_is_fresh', stack: [] }),
      ]);

      const loanStack = loanResult.stack ?? [];
      const riskStack = riskResult.stack ?? [];
      const freshnessStack = freshnessResult.stack ?? [];

      const parsed: Snapshot = {
        accountState: addressInfo.state ?? 'unknown',
        balanceNano: Number(addressInfo.balance ?? '0'),
        lastTxHash: addressInfo.last_transaction_id?.hash ?? '',
        lastTxLt: addressInfo.last_transaction_id?.lt ?? '',
        ownerCell: parseStackCellBytes(ownerResult.stack, 1),
        loan: {
          status: parseStackNum(loanStack, 0),
          lenderCell: parseStackCellBytes(loanStack, 1),
          startedAt: parseStackNum(loanStack, 2),
          dueAt: parseStackNum(loanStack, 3),
          oraclePrice: parseStackNum(loanStack, 4),
          oracleUpdatedAt: parseStackNum(loanStack, 5),
          paused: parseStackNum(loanStack, 6) !== 0,
          oracleFresh: parseStackNum(freshnessStack, 0) !== 0,
        },
        risk: {
          maxLtvBps: parseStackNum(riskStack, 0),
          oracleMaxAge: parseStackNum(riskStack, 1),
          riskTimelock: parseStackNum(riskStack, 2),
          pendingMaxLtvBps: parseStackNum(riskStack, 3),
          pendingOracleMaxAge: parseStackNum(riskStack, 4),
          pendingEta: parseStackNum(riskStack, 5),
          riskVersion: parseStackNum(riskStack, 6),
        },
        fetchedAt: Date.now(),
      };

      setSnapshot(parsed);
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : 'Failed to refresh contract state.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [callRpc, contractAddress]);

  useEffect(() => {
    void refreshSnapshot();
    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, 45000);
    return () => window.clearInterval(timer);
  }, [refreshSnapshot]);

  const termProgress = useMemo(() => {
    if (!snapshot || snapshot.loan.status !== 1) {
      return 0;
    }

    const started = snapshot.loan.startedAt;
    const due = snapshot.loan.dueAt;
    if (started <= 0 || due <= started) {
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - started;
    const duration = due - started;
    if (elapsed <= 0) {
      return 0;
    }
    if (elapsed >= duration) {
      return 100;
    }

    return Math.floor((elapsed * 10000) / duration) / 100;
  }, [snapshot]);

  return (
    <div className="app-shell">
      <div className="orb orb-left" />
      <div className="orb orb-right" />

      <main className="surface">
        <section className="hero reveal">
          <p className="eyebrow">TNFT FINANCE / TESTNET CONTROL</p>
          <h1>Eggshell Credit Console</h1>
          <p className="subtitle">
            Strict operating surface for MVP lending flows. Bone palette, sharp typography, zero
            noise.
          </p>
          <div className="hero-meta">
            <span>Operator: {userName}</span>
            <span>Expected owner: {shortValue(EXPECTED_OWNER_ADDRESS, 12, 10)}</span>
          </div>
        </section>

        <section className="controls reveal delay-1">
          <label className="control-field">
            <span>Contract</span>
            <input
              value={contractAddress}
              onChange={(event) => setContractAddress(event.target.value)}
              placeholder="EQ..."
              autoComplete="off"
            />
          </label>

          <label className="control-field">
            <span>Toncenter API key (optional)</span>
            <input
              value={toncenterApiKey}
              onChange={(event) => setToncenterApiKey(event.target.value)}
              placeholder="for higher rate limits"
              autoComplete="off"
            />
          </label>

          <div className="control-actions">
            <button className="btn btn-primary" onClick={() => void refreshSnapshot()} disabled={loading}>
              {loading ? 'SYNCING...' : 'REFRESH'}
            </button>
            <a
              className="btn btn-ghost"
              href={`${TONSCAN_ADDRESS_PREFIX}${contractAddress.trim()}`}
              target="_blank"
              rel="noreferrer"
            >
              TONSCAN
            </a>
          </div>
        </section>

        {error && (
          <section className="alert reveal delay-2">
            <strong>RPC WARNING</strong>
            <span>{error}</span>
          </section>
        )}

        <section className="metric-grid">
          <article className="metric-card reveal delay-2">
            <p>Account state</p>
            <h3>{snapshot?.accountState?.toUpperCase() ?? '—'}</h3>
            <small>Last refresh: {snapshot ? new Date(snapshot.fetchedAt).toLocaleTimeString() : '—'}</small>
          </article>

          <article className="metric-card reveal delay-3">
            <p>Loan status</p>
            <h3>{snapshot ? getStatusLabel(snapshot.loan.status) : '—'}</h3>
            <small>Health: {getHealthLabel(snapshot)}</small>
          </article>

          <article className="metric-card reveal delay-4">
            <p>TVM balance</p>
            <h3>{snapshot ? `${formatTonFromNano(snapshot.balanceNano)} TON` : '—'}</h3>
            <small>LT: {snapshot?.lastTxLt ?? '—'}</small>
          </article>

          <article className="metric-card reveal delay-5">
            <p>Risk version</p>
            <h3>{snapshot ? snapshot.risk.riskVersion.toString() : '—'}</h3>
            <small>{getRiskWindow(snapshot)}</small>
          </article>
        </section>

        <section className="panel-grid">
          <article className="panel reveal delay-3">
            <h2>Loan Sheet</h2>
            <dl>
              <div>
                <dt>Paused</dt>
                <dd>{snapshot?.loan.paused ? 'YES' : 'NO'}</dd>
              </div>
              <div>
                <dt>Oracle fresh</dt>
                <dd>{snapshot?.loan.oracleFresh ? 'YES' : 'NO'}</dd>
              </div>
              <div>
                <dt>Oracle price</dt>
                <dd>{snapshot ? `${formatTonFromNano(snapshot.loan.oraclePrice)} TON` : '—'}</dd>
              </div>
              <div>
                <dt>Oracle updated</dt>
                <dd>{snapshot ? formatTimestamp(snapshot.loan.oracleUpdatedAt) : '—'}</dd>
              </div>
              <div>
                <dt>Started at</dt>
                <dd>{snapshot ? formatTimestamp(snapshot.loan.startedAt) : '—'}</dd>
              </div>
              <div>
                <dt>Due at</dt>
                <dd>{snapshot ? formatTimestamp(snapshot.loan.dueAt) : '—'}</dd>
              </div>
              <div>
                <dt>Lender cell</dt>
                <dd>{snapshot ? shortValue(snapshot.loan.lenderCell, 14, 10) : '—'}</dd>
              </div>
              <div>
                <dt>Owner cell</dt>
                <dd>{snapshot ? shortValue(snapshot.ownerCell, 14, 10) : '—'}</dd>
              </div>
            </dl>
          </article>

          <article className="panel reveal delay-4">
            <h2>Risk Envelope</h2>
            <dl>
              <div>
                <dt>Max LTV</dt>
                <dd>{snapshot ? `${(Number(snapshot.risk.maxLtvBps) / 100).toFixed(2)}%` : '—'}</dd>
              </div>
              <div>
                <dt>Oracle max age</dt>
                <dd>{snapshot ? formatSeconds(snapshot.risk.oracleMaxAge) : '—'}</dd>
              </div>
              <div>
                <dt>Risk timelock</dt>
                <dd>{snapshot ? formatSeconds(snapshot.risk.riskTimelock) : '—'}</dd>
              </div>
              <div>
                <dt>Pending max LTV</dt>
                <dd>{snapshot ? `${(Number(snapshot.risk.pendingMaxLtvBps) / 100).toFixed(2)}%` : '—'}</dd>
              </div>
              <div>
                <dt>Pending oracle age</dt>
                <dd>{snapshot ? formatSeconds(snapshot.risk.pendingOracleMaxAge) : '—'}</dd>
              </div>
              <div>
                <dt>Pending ETA</dt>
                <dd>{snapshot ? formatTimestamp(snapshot.risk.pendingEta) : '—'}</dd>
              </div>
              <div>
                <dt>Last tx hash</dt>
                <dd>{snapshot ? shortValue(snapshot.lastTxHash, 12, 10) : '—'}</dd>
              </div>
              <div>
                <dt>Explorer</dt>
                <dd>
                  <a href={`${TONSCAN_ADDRESS_PREFIX}${contractAddress.trim()}`} target="_blank" rel="noreferrer">
                    open contract
                  </a>
                </dd>
              </div>
            </dl>
          </article>
        </section>

        <section className="timeline reveal delay-5">
          <div className="timeline-head">
            <h2>Loan Term Progress</h2>
            <span>{termProgress.toFixed(2)}%</span>
          </div>
          <div className="track">
            <div className="fill" style={{ width: `${termProgress}%` }} />
          </div>
          <p>
            Status follows strict lifecycle gates. Funding is blocked if oracle is stale; risk
            updates are timelocked by design.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
