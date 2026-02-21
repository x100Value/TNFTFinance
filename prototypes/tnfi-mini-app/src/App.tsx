import React, { useCallback, useEffect, useMemo, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { TonConnectButton, useTonAddress, useTonWallet } from '@tonconnect/ui-react';
import './App.css';

const TONCENTER_JSON_RPC = 'https://testnet.toncenter.com/api/v2/jsonRPC';
const TONSCAN_ADDRESS_PREFIX = 'https://testnet.tonscan.org/address/';
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

const DEFAULT_CONTRACT_ADDRESS = 'EQDNj4-A8lILD6G3YXvEQWbMreziRuCGkbu2Tbb6xuPJjQUE';
const EXPECTED_OWNER_ADDRESS = 'UQCQ4dGD-gm1VS7UkPZtvPZwmXzAUzokZ1HS551IcwQ_KYXA';

type Mode = 'demo' | 'live';
type VisualTheme = 'graphite' | 'eggshell';

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

type DemoNft = {
  id: string;
  name: string;
  collection: string;
  estimatedTon: number;
  address: string;
};

type DemoLoan = {
  nftId: string;
  principalTon: number;
  repayDueTon: number;
  startedAt: number;
  dueAt: number;
  ltvBpsAtOpen: number;
};

type DemoState = {
  walletTon: number;
  treasuryTon: number;
  nfts: DemoNft[];
  selectedNftId: string;
  requestedPrincipalTon: number;
  requestedTermHours: number;
  requestedAprBps: number;
  oracleFresh: boolean;
  paused: boolean;
  oracleHaircutBps: number;
  maxLtvBps: number;
  status: number;
  loan: DemoLoan | null;
  riskVersion: number;
  actionLog: string[];
};

type SuggestionTone = 'secure' | 'warning' | 'active';

type OperatorSuggestion = {
  id: string;
  title: string;
  detail: string;
  tone: SuggestionTone;
};

type TabMode = 'borrower' | 'liquidity';

const STEP_CARDS = [
  {
    title: 'Открыл консоль',
    detail: 'Зашёл в приложение, проверил статус TVL, ожидаемые риски и поля контроля.',
  },
  {
    title: 'Подключил кошелёк',
    detail: 'Поставил свой TON-кошелёк, выбрал роль заемщика или поставщика ликвидности.',
  },
  {
    title: 'Получил деньги',
    detail: 'Решил финансировать или взять NFT-залог, получил и отследил сумму.',
  },
];

const BORROWER_CABINETS = [
  { title: 'Личный счёт заемщика', detail: 'Смотрю доступный LTV, срок, APR и решения по части repay.', status: 'Готов к funding' },
  { title: 'Коллекция NFT', detail: 'Выбран NFT + оценка, цена «сборов» и срок из oracle.', status: '12.8 TON залога' },
];

const LIQUIDITY_CABINETS = [
  { title: 'Резерв ликвидности', detail: 'Баланс протокола и блокированная сумма с TVL LP.', status: '52 TON обеспечено' },
  { title: 'Пульс поставщика', detail: 'Ставка вознаграждения, частота выплат, лимит новых займов.', status: 'APR 14% (сдержан)' },
];

const STATUS_LABEL: Record<string, string> = {
  '0': 'OPEN',
  '1': 'FUNDED',
  '2': 'REPAID',
  '3': 'LIQUIDATED',
  '4': 'CANCELLED',
};

const DEMO_NFTS: DemoNft[] = [
  {
    id: 'nft-01',
    name: 'Wall Street Card #01',
    collection: 'Executive Objects',
    estimatedTon: 9.6,
    address: 'EQDemoSandboxNft0001',
  },
  {
    id: 'nft-02',
    name: 'Wall Street Card #02',
    collection: 'Executive Objects',
    estimatedTon: 14.2,
    address: 'EQDemoSandboxNft0002',
  },
  {
    id: 'nft-03',
    name: 'Bone Folder #07',
    collection: 'Office Artefacts',
    estimatedTon: 22.9,
    address: 'EQDemoSandboxNft0003',
  },
  {
    id: 'nft-04',
    name: 'Black Tie #13',
    collection: 'Evening Uniform',
    estimatedTon: 6.8,
    address: 'EQDemoSandboxNft0004',
  },
];

const SECURITY_PRINCIPLES = [
  'Fail-closed oracle gate',
  'Timelocked risk updates',
  'Emergency pause switch',
  'No silent bypass path',
] as const;

function getInitialTheme(): VisualTheme {
  if (typeof window === 'undefined') {
    return 'eggshell';
  }

  const url = new URL(window.location.href);
  return url.searchParams.get('theme') === 'graphite' ? 'graphite' : 'eggshell';
}

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

function roundTon(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(value * 1000) / 1000;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function toNano(valueTon: number): number {
  return Math.round(clampNumber(valueTon, 0, 1_000_000) * 1_000_000_000);
}

function appendLog(entries: string[], message: string): string[] {
  const stamp = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  return [`${stamp} ${message}`, ...entries].slice(0, 12);
}

function createDemoState(): DemoState {
  return {
    walletTon: 18.5,
    treasuryTon: 220,
    nfts: DEMO_NFTS,
    selectedNftId: DEMO_NFTS[0]?.id ?? '',
    requestedPrincipalTon: 4.2,
    requestedTermHours: 24,
    requestedAprBps: 1400,
    oracleFresh: true,
    paused: false,
    oracleHaircutBps: 0,
    maxLtvBps: 5500,
    status: 0,
    loan: null,
    riskVersion: 1,
    actionLog: ['Sandbox booted with fan assets only.'],
  };
}

function buildDemoSnapshot(demo: DemoState): Snapshot {
  const now = Math.floor(Date.now() / 1000);
  const selectedNft = demo.nfts.find((item) => item.id === demo.selectedNftId) ?? null;
  const loanNft = demo.loan ? demo.nfts.find((item) => item.id === demo.loan?.nftId) ?? null : null;
  const priceSource = loanNft ?? selectedNft;
  const pricedTon = priceSource
    ? roundTon((priceSource.estimatedTon * (10_000 - demo.oracleHaircutBps)) / 10_000)
    : 0;
  const oracleUpdatedAt = now - (demo.oracleFresh ? 25 : 3600);

  return {
    accountState: 'active',
    balanceNano: toNano(demo.treasuryTon),
    lastTxHash: `demo-${demo.riskVersion}-${demo.status}`,
    lastTxLt: String(Date.now()),
    ownerCell: 'demo-owner-cell',
    loan: {
      status: demo.status,
      lenderCell: demo.loan ? `demo-lender-${demo.loan.nftId}` : '',
      startedAt: demo.loan?.startedAt ?? 0,
      dueAt: demo.loan?.dueAt ?? 0,
      oraclePrice: toNano(pricedTon),
      oracleUpdatedAt,
      paused: demo.paused,
      oracleFresh: demo.oracleFresh,
    },
    risk: {
      maxLtvBps: demo.maxLtvBps,
      oracleMaxAge: 900,
      riskTimelock: 43_200,
      pendingMaxLtvBps: 0,
      pendingOracleMaxAge: 0,
      pendingEta: 0,
      riskVersion: demo.riskVersion,
    },
    fetchedAt: Date.now(),
  };
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function App() {
  const [mode, setMode] = useState<Mode>('demo');
  const [theme, setTheme] = useState<VisualTheme>(() => getInitialTheme());
  const [activeTab, setActiveTab] = useState<TabMode>('borrower');
  const [userName, setUserName] = useState('Operator');
  const [contractAddress, setContractAddress] = useState(DEFAULT_CONTRACT_ADDRESS);
  const [toncenterApiKey, setToncenterApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [demo, setDemo] = useState<DemoState>(() => createDemoState());
  const connectedWallet = useTonWallet();
  const connectedAddress = useTonAddress();

  useEffect(() => {
    const user = WebApp.initDataUnsafe?.user?.first_name;
    if (user) {
      setUserName(user);
    }

    try {
      WebApp.ready();
      WebApp.expand();
      WebApp.MainButton.hide();
    } catch {
      // No-op outside Telegram WebApp context.
    }
  }, []);

  useEffect(() => {
    try {
      if (theme === 'eggshell') {
        WebApp.setHeaderColor('#221e18');
        WebApp.setBackgroundColor('#f2e9d8');
      } else {
        WebApp.setHeaderColor('#101315');
        WebApp.setBackgroundColor('#12171a');
      }
    } catch {
      // No-op outside Telegram WebApp context.
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('theme', theme);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [theme]);

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
    if (mode !== 'live') {
      return;
    }

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
  }, [callRpc, contractAddress, mode]);

  useEffect(() => {
    if (mode !== 'live') {
      return;
    }

    void refreshSnapshot();
    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, 45000);
    return () => window.clearInterval(timer);
  }, [mode, refreshSnapshot]);

  const selectedDemoNft = useMemo(
    () => demo.nfts.find((item) => item.id === demo.selectedNftId) ?? null,
    [demo.nfts, demo.selectedNftId],
  );

  const demoPricedCollateralTon = useMemo(() => {
    if (!selectedDemoNft) {
      return 0;
    }
    return roundTon((selectedDemoNft.estimatedTon * (10_000 - demo.oracleHaircutBps)) / 10_000);
  }, [demo.oracleHaircutBps, selectedDemoNft]);

  const demoMaxBorrowTon = useMemo(
    () => roundTon((demoPricedCollateralTon * demo.maxLtvBps) / 10_000),
    [demo.maxLtvBps, demoPricedCollateralTon],
  );

  const demoSnapshot = useMemo(() => buildDemoSnapshot(demo), [demo]);
  const activeSnapshot = mode === 'demo' ? demoSnapshot : snapshot;

  const demoStatusNote = useMemo(() => {
    if (mode !== 'demo') {
      return '';
    }

    if (demo.status !== 0) {
      return 'Current round is closed. Use NEW ROUND or RESET SANDBOX.';
    }

    if (demo.paused) {
      return 'Borrow will fail: protocol pause flag is ON.';
    }

    if (!demo.oracleFresh) {
      return 'Borrow will fail: oracle freshness check is OFF.';
    }

    if (demo.requestedPrincipalTon > demoMaxBorrowTon) {
      return `Borrow will fail: request exceeds max LTV cap (${demoMaxBorrowTon.toFixed(3)} TON).`;
    }

    if (demo.requestedPrincipalTon > demo.treasuryTon) {
      return 'Borrow will fail: treasury has insufficient balance.';
    }

    return 'Borrow should pass with current sandbox settings.';
  }, [
    demo.maxLtvBps,
    demo.oracleFresh,
    demo.paused,
    demo.requestedPrincipalTon,
    demo.status,
    demo.treasuryTon,
    demoMaxBorrowTon,
    mode,
  ]);

  const onDemoFund = useCallback(() => {
    setDemo((prev) => {
      if (prev.status !== 0) {
        return {
          ...prev,
          actionLog: appendLog(prev.actionLog, 'Funding blocked: round is not OPEN.'),
        };
      }

      if (prev.paused) {
        return {
          ...prev,
          actionLog: appendLog(prev.actionLog, 'Funding blocked: pause flag is active.'),
        };
      }

      if (!prev.oracleFresh) {
        return {
          ...prev,
          actionLog: appendLog(prev.actionLog, 'Funding blocked: oracle data is stale.'),
        };
      }

      const nft = prev.nfts.find((item) => item.id === prev.selectedNftId);
      if (!nft) {
        return {
          ...prev,
          actionLog: appendLog(prev.actionLog, 'Funding blocked: no collateral NFT selected.'),
        };
      }

      const principalTon = roundTon(clampNumber(prev.requestedPrincipalTon, 0, 999_999));
      const termHours = clampNumber(prev.requestedTermHours, 1, 720);
      const aprBps = clampNumber(prev.requestedAprBps, 100, 5000);
      const collateralTon = roundTon((nft.estimatedTon * (10_000 - prev.oracleHaircutBps)) / 10_000);
      const maxBorrowTon = roundTon((collateralTon * prev.maxLtvBps) / 10_000);

      if (principalTon <= 0) {
        return {
          ...prev,
          actionLog: appendLog(prev.actionLog, 'Funding blocked: principal must be positive.'),
        };
      }

      if (principalTon > maxBorrowTon) {
        return {
          ...prev,
          actionLog: appendLog(
            prev.actionLog,
            `Funding blocked: LTV breach (${principalTon.toFixed(3)} > ${maxBorrowTon.toFixed(3)} TON).`,
          ),
        };
      }

      if (principalTon > prev.treasuryTon) {
        return {
          ...prev,
          actionLog: appendLog(prev.actionLog, 'Funding blocked: treasury liquidity is too low.'),
        };
      }

      const now = Math.floor(Date.now() / 1000);
      const termSeconds = Math.floor(termHours * 3600);
      const interestTon = roundTon((principalTon * aprBps * termSeconds) / (10_000 * SECONDS_PER_YEAR));
      const repayDueTon = roundTon(principalTon + interestTon);
      const ltvBpsAtOpen = collateralTon > 0 ? Math.round((principalTon * 10_000) / collateralTon) : 0;

      return {
        ...prev,
        requestedTermHours: termHours,
        requestedAprBps: aprBps,
        walletTon: roundTon(prev.walletTon + principalTon),
        treasuryTon: roundTon(prev.treasuryTon - principalTon),
        status: 1,
        loan: {
          nftId: nft.id,
          principalTon,
          repayDueTon,
          startedAt: now,
          dueAt: now + termSeconds,
          ltvBpsAtOpen,
        },
        actionLog: appendLog(
          prev.actionLog,
          `Loan FUNDED +${principalTon.toFixed(3)} TON; repay ${repayDueTon.toFixed(3)} TON.`,
        ),
      };
    });
  }, []);

  const onDemoRepay = useCallback(() => {
    setDemo((prev) => {
      if (prev.status !== 1 || !prev.loan) {
        return {
          ...prev,
          actionLog: appendLog(prev.actionLog, 'Repay blocked: no active FUNDED loan.'),
        };
      }

      const dueTon = prev.loan.repayDueTon;
      if (prev.walletTon < dueTon) {
        return {
          ...prev,
          actionLog: appendLog(
            prev.actionLog,
            `Repay blocked: wallet ${prev.walletTon.toFixed(3)} < due ${dueTon.toFixed(3)} TON.`,
          ),
        };
      }

      return {
        ...prev,
        walletTon: roundTon(prev.walletTon - dueTon),
        treasuryTon: roundTon(prev.treasuryTon + dueTon),
        status: 2,
        actionLog: appendLog(prev.actionLog, `Loan REPAID ${dueTon.toFixed(3)} TON.`),
      };
    });
  }, []);

  const onDemoLiquidate = useCallback(() => {
    setDemo((prev) => {
      if (prev.status !== 1 || !prev.loan) {
        return {
          ...prev,
          actionLog: appendLog(prev.actionLog, 'Liquidation blocked: no active FUNDED loan.'),
        };
      }

      return {
        ...prev,
        status: 3,
        actionLog: appendLog(prev.actionLog, `Loan LIQUIDATED on NFT ${prev.loan.nftId}.`),
      };
    });
  }, []);

  const onDemoNewRound = useCallback(() => {
    setDemo((prev) => {
      if (prev.status === 1) {
        return {
          ...prev,
          actionLog: appendLog(prev.actionLog, 'Cannot open new round while loan is still FUNDED.'),
        };
      }

      return {
        ...prev,
        status: 0,
        loan: null,
        actionLog: appendLog(prev.actionLog, 'Round reset to OPEN with current balances.'),
      };
    });
  }, []);

  const onDemoReset = useCallback(() => {
    setDemo(createDemoState());
  }, []);

  const termProgress = useMemo(() => {
    if (!activeSnapshot || activeSnapshot.loan.status !== 1) {
      return 0;
    }

    const started = activeSnapshot.loan.startedAt;
    const due = activeSnapshot.loan.dueAt;
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

    return Math.floor((elapsed * 10_000) / duration) / 100;
  }, [activeSnapshot]);

  const securityPosture = useMemo(() => {
    if (!activeSnapshot) {
      return {
        tone: 'warning',
        label: 'NO FEED',
        message: 'Waiting for state feed before enforcing live posture checks.',
      };
    }

    if (activeSnapshot.loan.paused) {
      return {
        tone: 'warning',
        label: 'PAUSE ACTIVE',
        message: 'Funding surface is intentionally frozen by the protocol pause gate.',
      };
    }

    if (!activeSnapshot.loan.oracleFresh) {
      return {
        tone: 'warning',
        label: 'ORACLE LOCK',
        message: 'Fail-closed mode engaged: stale oracle data blocks new risk-taking actions.',
      };
    }

    if (activeSnapshot.loan.status === 1) {
      return {
        tone: 'active',
        label: 'GUARDED LIVE',
        message: 'Loan is active under runtime controls, due date checks and liquidation policy.',
      };
    }

    return {
      tone: 'secure',
      label: 'HARDENED',
      message: 'Core controls are online: collateral-first logic, timelock governance and pause fallback.',
    };
  }, [activeSnapshot]);

  const operatorSuggestions = useMemo<OperatorSuggestion[]>(() => {
    if (!activeSnapshot) {
      return [
        {
          id: 'feed',
          title: 'Load state feed first',
          detail: 'Run a refresh to validate pause, oracle and risk windows before any action.',
          tone: 'warning',
        },
      ];
    }

    const suggestions: OperatorSuggestion[] = [];

    if (activeSnapshot.loan.paused) {
      suggestions.push({
        id: 'paused',
        title: 'Pause is enabled',
        detail: 'Disable pause gate before starting a new funding round.',
        tone: 'warning',
      });
    }

    if (!activeSnapshot.loan.oracleFresh) {
      suggestions.push({
        id: 'oracle',
        title: 'Oracle is stale',
        detail: 'Update oracle data first. Funding should stay fail-closed until feed is fresh.',
        tone: 'warning',
      });
    }

    if (mode === 'demo' && demo.requestedPrincipalTon > demoMaxBorrowTon) {
      suggestions.push({
        id: 'ltv',
        title: 'LTV is above limit',
        detail: `Lower requested principal below ${demoMaxBorrowTon.toFixed(3)} TON.`,
        tone: 'warning',
      });
    }

    if (mode === 'demo' && demo.requestedPrincipalTon > demo.treasuryTon) {
      suggestions.push({
        id: 'liq',
        title: 'Treasury liquidity is low',
        detail: 'Increase treasury balance or lower requested principal before funding.',
        tone: 'warning',
      });
    }

    if (mode === 'live' && error) {
      suggestions.push({
        id: 'rpc',
        title: 'RPC warning detected',
        detail: 'Check contract address/API key and run manual refresh.',
        tone: 'warning',
      });
    }

    if (activeSnapshot.loan.status === 1 && activeSnapshot.loan.dueAt > 0) {
      const now = Math.floor(Date.now() / 1000);
      const secondsToDue = activeSnapshot.loan.dueAt - now;
      suggestions.push({
        id: 'due',
        title: 'Active loan monitoring',
        detail:
          secondsToDue > 0
            ? `Due in ${formatSeconds(secondsToDue)}. Keep repay or liquidation plan ready.`
            : 'Loan is overdue. Review liquidation path immediately.',
        tone: secondsToDue > 0 ? 'active' : 'warning',
      });
    }

    if (suggestions.length === 0) {
      suggestions.push({
        id: 'ready',
        title: 'System is ready',
        detail: 'No blockers detected. Run borrow -> repay -> new round smoke test.',
        tone: 'secure',
      });
    }

    return suggestions.slice(0, 3);
  }, [
    activeSnapshot,
    demo.requestedPrincipalTon,
    demo.treasuryTon,
    demoMaxBorrowTon,
    error,
    mode,
  ]);

  return (
    <div className={`app-shell theme-${theme}`}>
      <div className="orb orb-left" />
      <div className="orb orb-right" />

      <main className="surface">
        <section className="hero reveal">
          <p className="eyebrow">TNFT FINANCE / CREDIT CONTROL</p>
          <h1>TNFT Credit Console</h1>
          <p className="subtitle">
            {mode === 'demo'
              ? 'Offline sandbox with fan tokens: test collateral, balances and credit decisions without testnet.'
              : 'Strict read-only surface for testnet MVP lending flows.'}
          </p>
          <div className="security-command">
            <div className="security-command-head">
              <span className={`security-dot ${securityPosture.tone}`} />
              <strong>SECURITY FIRST</strong>
              <em>{securityPosture.label}</em>
            </div>
            <p>{securityPosture.message}</p>
            <div className="security-tags">
              {SECURITY_PRINCIPLES.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
          <div className="wallet-cta">
            <div className="wallet-cta-main">
              <TonConnectButton />
              <span className={`wallet-chip ${connectedWallet ? 'connected' : 'disconnected'}`}>
                {connectedWallet ? `Wallet: ${shortValue(connectedAddress, 8, 8)}` : 'Wallet: not connected'}
              </span>
            </div>
            <small>Connect wallet for live transaction flow (coming in next contract integration step).</small>
          </div>
          <div className="hero-meta">
            <span>Operator: {userName}</span>
            <span>Mode: {mode === 'demo' ? 'DEMO SANDBOX' : 'LIVE RPC'}</span>
            <span>Theme: {theme === 'graphite' ? 'GRAPHITE / EMERALD' : 'EGGSHELL / GRAPHITE'}</span>
            <span>Expected owner: {shortValue(EXPECTED_OWNER_ADDRESS, 12, 10)}</span>
          </div>
        </section>

        <section className="three-steps reveal delay-1">
          {STEP_CARDS.map((step) => (
            <article key={step.title} className="step-card">
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </article>
          ))}
        </section>

        <section className="mode-bar reveal delay-1">
          <div className="mode-switches">
            <div className="mode-pills">
              <button
                className={`mode-pill ${mode === 'demo' ? 'active' : ''}`}
                onClick={() => {
                  setMode('demo');
                  setError('');
                  setLoading(false);
                }}
              >
                DEMO SANDBOX
              </button>
              <button
                className={`mode-pill ${mode === 'live' ? 'active' : ''}`}
                onClick={() => setMode('live')}
              >
                LIVE RPC
              </button>
            </div>

            <div className="mode-pills theme-pills">
              <button
                className={`mode-pill ${theme === 'graphite' ? 'active' : ''}`}
                onClick={() => setTheme('graphite')}
              >
                GRAPHITE
              </button>
              <button
                className={`mode-pill ${theme === 'eggshell' ? 'active' : ''}`}
                onClick={() => setTheme('eggshell')}
              >
                EGGSHELL
              </button>
            </div>
          </div>
          <p className="mode-note">
            {mode === 'demo'
              ? 'All actions are local and non-custodial mock flows.'
              : 'Reads on-chain state from Toncenter (testnet).'}
          </p>
        </section>

        <section className="security-brief reveal delay-2">
          <article className={`security-card security-card-${securityPosture.tone}`}>
            <p>Security posture</p>
            <h3>{securityPosture.label}</h3>
            <small>{securityPosture.message}</small>
          </article>
          <article className="security-card">
            <p>Oracle gate</p>
            <h3>{activeSnapshot?.loan.oracleFresh ? 'FRESH' : 'LOCKED'}</h3>
            <small>
              Last oracle update:{' '}
              {activeSnapshot ? formatTimestamp(activeSnapshot.loan.oracleUpdatedAt) : '—'}
            </small>
          </article>
          <article className="security-card">
            <p>Protocol pause</p>
            <h3>{activeSnapshot?.loan.paused ? 'ENGAGED' : 'STANDBY'}</h3>
            <small>Emergency braking path is always available.</small>
          </article>
        </section>

        <section className="suggestions reveal delay-2">
          <div className="timeline-head">
            <h2>Operator Suggestions</h2>
            <span>{operatorSuggestions.length} items</span>
          </div>
          <div className="suggestion-list">
            {operatorSuggestions.map((item) => (
              <article key={item.id} className={`suggestion-card suggestion-${item.tone}`}>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="accounts-tabs reveal delay-2">
          <div className="tab-row">
            <button
              className={`tab-pill ${activeTab === 'borrower' ? 'active' : ''}`}
              onClick={() => setActiveTab('borrower')}
            >
              Заёмщик
            </button>
            <button
              className={`tab-pill ${activeTab === 'liquidity' ? 'active' : ''}`}
              onClick={() => setActiveTab('liquidity')}
            >
              Поставщик ликвидности
            </button>
          </div>

          <div className="tab-panels">
            <div className={`tab-panel ${activeTab === 'borrower' ? 'is-active' : ''}`}>
              <section className="controls">
                {mode === 'live' ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <label className="control-field">
                      <span>Test NFT</span>
                      <select
                        value={demo.selectedNftId}
                        onChange={(event) =>
                          setDemo((prev) => ({
                            ...prev,
                            selectedNftId: event.target.value,
                          }))
                        }
                      >
                        {demo.nfts.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.estimatedTon.toFixed(2)} TON)
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="control-field">
                      <span>Requested principal (TON)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={demo.requestedPrincipalTon}
                        onChange={(event) =>
                          setDemo((prev) => ({
                            ...prev,
                            requestedPrincipalTon: roundTon(clampNumber(Number.parseFloat(event.target.value), 0, 999_999)),
                          }))
                        }
                      />
                    </label>

                    <div className="control-actions">
                      <button className="btn btn-primary" onClick={onDemoFund}>
                        TRY FUND
                      </button>
                      <button className="btn btn-ghost" onClick={onDemoRepay}>
                        REPAY
                      </button>
                    </div>
                  </>
                )}
              </section>

              <div className="cabinet-grid">
                {BORROWER_CABINETS.map((cabinet) => (
                  <article key={cabinet.title} className="cabinet-card">
                    <h4>{cabinet.title}</h4>
                    <p>{cabinet.detail}</p>
                    <span>{cabinet.status}</span>
                  </article>
                ))}
              </div>
            </div>

            <div className={`tab-panel ${activeTab === 'liquidity' ? 'is-active' : ''}`}>
              <div className="cabinet-grid">
                {LIQUIDITY_CABINETS.map((cabinet) => (
                  <article key={cabinet.title} className="cabinet-card">
                    <h4>{cabinet.title}</h4>
                    <p>{cabinet.detail}</p>
                    <span>{cabinet.status}</span>
                  </article>
                ))}
              </div>
              <div className="liquidity-actions">
                <p>Поддерживаю протокол, управляю TVL и выпускаю кредиты заемщикам.</p>
                <button className="btn btn-primary" onClick={onDemoFund}>
                  Пополнить пул
                </button>
              </div>
            </div>
          </div>
        </section>

        {mode === 'live' && error && (
          <section className="alert reveal delay-2">
            <strong>RPC WARNING</strong>
            <span>{error}</span>
          </section>
        )}

        {mode === 'demo' && (
          <section className="sandbox-grid">
            <article className="panel reveal delay-2">
              <h2>Sandbox Assets</h2>
              <dl>
                <div>
                  <dt>Wallet balance</dt>
                  <dd>{demo.walletTon.toFixed(3)} TON</dd>
                </div>
                <div>
                  <dt>Treasury balance</dt>
                  <dd>{demo.treasuryTon.toFixed(3)} TON</dd>
                </div>
                <div>
                  <dt>Collateral value</dt>
                  <dd>{demoPricedCollateralTon.toFixed(3)} TON</dd>
                </div>
                <div>
                  <dt>Max borrow now</dt>
                  <dd>{demoMaxBorrowTon.toFixed(3)} TON</dd>
                </div>
              </dl>
              <div className="asset-table">
                {demo.nfts.map((item) => (
                  <div key={item.id} className={`asset-row ${item.id === demo.selectedNftId ? 'active' : ''}`}>
                    <strong>{item.name}</strong>
                    <span>{item.collection}</span>
                    <span>{item.estimatedTon.toFixed(2)} TON</span>
                    <span>{shortValue(item.address, 10, 6)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel reveal delay-3">
              <h2>Scenario Controls</h2>
              <div className="sandbox-form">
                <label className="control-field">
                  <span>Term (hours)</span>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    step={1}
                    value={demo.requestedTermHours}
                    onChange={(event) =>
                      setDemo((prev) => ({
                        ...prev,
                        requestedTermHours: clampNumber(Number.parseFloat(event.target.value), 1, 720),
                      }))
                    }
                  />
                </label>

                <label className="control-field">
                  <span>APR (bps)</span>
                  <input
                    type="number"
                    min={100}
                    max={5000}
                    step={25}
                    value={demo.requestedAprBps}
                    onChange={(event) =>
                      setDemo((prev) => ({
                        ...prev,
                        requestedAprBps: clampNumber(Number.parseFloat(event.target.value), 100, 5000),
                      }))
                    }
                  />
                </label>

                <label className="control-field">
                  <span>Max LTV (bps)</span>
                  <input
                    type="number"
                    min={1500}
                    max={9000}
                    step={25}
                    value={demo.maxLtvBps}
                    onChange={(event) =>
                      setDemo((prev) => {
                        const nextLtv = clampNumber(Number.parseFloat(event.target.value), 1500, 9000);
                        return {
                          ...prev,
                          maxLtvBps: nextLtv,
                          riskVersion: prev.riskVersion + (nextLtv === prev.maxLtvBps ? 0 : 1),
                        };
                      })
                    }
                  />
                </label>

                <label className="control-field">
                  <span>Oracle haircut (bps)</span>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    step={25}
                    value={demo.oracleHaircutBps}
                    onChange={(event) =>
                      setDemo((prev) => ({
                        ...prev,
                        oracleHaircutBps: clampNumber(Number.parseFloat(event.target.value), 0, 5000),
                      }))
                    }
                  />
                </label>

                <label className="control-field">
                  <span>Wallet TON</span>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    step={0.1}
                    value={demo.walletTon}
                    onChange={(event) =>
                      setDemo((prev) => ({
                        ...prev,
                        walletTon: roundTon(clampNumber(Number.parseFloat(event.target.value), 0, 1_000_000)),
                      }))
                    }
                  />
                </label>

                <label className="control-field">
                  <span>Treasury TON</span>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    step={0.1}
                    value={demo.treasuryTon}
                    onChange={(event) =>
                      setDemo((prev) => ({
                        ...prev,
                        treasuryTon: roundTon(clampNumber(Number.parseFloat(event.target.value), 0, 1_000_000)),
                      }))
                    }
                  />
                </label>

                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={demo.oracleFresh}
                    onChange={(event) =>
                      setDemo((prev) => ({
                        ...prev,
                        oracleFresh: event.target.checked,
                      }))
                    }
                  />
                  <span>Oracle fresh</span>
                </label>

                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={demo.paused}
                    onChange={(event) =>
                      setDemo((prev) => ({
                        ...prev,
                        paused: event.target.checked,
                      }))
                    }
                  />
                  <span>Pause funding</span>
                </label>
              </div>

              <div className="control-actions sandbox-actions">
                <button className="btn btn-primary" onClick={onDemoFund}>
                  TRY FUND
                </button>
                <button className="btn btn-ghost" onClick={onDemoRepay}>
                  REPAY
                </button>
                <button className="btn btn-ghost" onClick={onDemoLiquidate}>
                  FORCE LIQUIDATE
                </button>
                <button className="btn btn-ghost" onClick={onDemoNewRound}>
                  NEW ROUND
                </button>
                <button className="btn btn-ghost" onClick={onDemoReset}>
                  RESET SANDBOX
                </button>
              </div>
            </article>

            <article className="panel reveal delay-4 panel-log">
              <h2>Decision Log</h2>
              <p className="sandbox-note">{demoStatusNote}</p>
              <ul>
                {demo.actionLog.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </article>
          </section>
        )}

        <section className="metric-grid">
          <article className="metric-card reveal delay-2">
            <p>Account state</p>
            <h3>{activeSnapshot?.accountState?.toUpperCase() ?? '—'}</h3>
            <small>
              Last refresh:{' '}
              {activeSnapshot
                ? new Date(activeSnapshot.fetchedAt).toLocaleTimeString('ru-RU', { hour12: false })
                : '—'}
            </small>
          </article>

          <article className="metric-card reveal delay-3">
            <p>Loan status</p>
            <h3>{activeSnapshot ? getStatusLabel(activeSnapshot.loan.status) : '—'}</h3>
            <small>Health: {getHealthLabel(activeSnapshot)}</small>
          </article>

          <article className="metric-card reveal delay-4">
            <p>{mode === 'demo' ? 'Vault balance' : 'TVM balance'}</p>
            <h3>{activeSnapshot ? `${formatTonFromNano(activeSnapshot.balanceNano)} TON` : '—'}</h3>
            <small>
              {mode === 'demo' ? `Wallet: ${demo.walletTon.toFixed(3)} TON` : `LT: ${activeSnapshot?.lastTxLt ?? '—'}`}
            </small>
          </article>

          <article className="metric-card reveal delay-5">
            <p>Risk version</p>
            <h3>{activeSnapshot ? activeSnapshot.risk.riskVersion.toString() : '—'}</h3>
            <small>{getRiskWindow(activeSnapshot)}</small>
          </article>
        </section>

        <section className="panel-grid">
          <article className="panel reveal delay-3">
            <h2>Loan Sheet</h2>
            <dl>
              <div>
                <dt>Paused</dt>
                <dd>{activeSnapshot?.loan.paused ? 'YES' : 'NO'}</dd>
              </div>
              <div>
                <dt>Oracle fresh</dt>
                <dd>{activeSnapshot?.loan.oracleFresh ? 'YES' : 'NO'}</dd>
              </div>
              <div>
                <dt>Oracle price</dt>
                <dd>{activeSnapshot ? `${formatTonFromNano(activeSnapshot.loan.oraclePrice)} TON` : '—'}</dd>
              </div>
              <div>
                <dt>Oracle updated</dt>
                <dd>{activeSnapshot ? formatTimestamp(activeSnapshot.loan.oracleUpdatedAt) : '—'}</dd>
              </div>
              <div>
                <dt>Started at</dt>
                <dd>{activeSnapshot ? formatTimestamp(activeSnapshot.loan.startedAt) : '—'}</dd>
              </div>
              <div>
                <dt>Due at</dt>
                <dd>{activeSnapshot ? formatTimestamp(activeSnapshot.loan.dueAt) : '—'}</dd>
              </div>
              <div>
                <dt>Lender cell</dt>
                <dd>{activeSnapshot ? shortValue(activeSnapshot.loan.lenderCell, 14, 10) : '—'}</dd>
              </div>
              <div>
                <dt>Owner cell</dt>
                <dd>{activeSnapshot ? shortValue(activeSnapshot.ownerCell, 14, 10) : '—'}</dd>
              </div>
              {mode === 'demo' && demo.loan && (
                <>
                  <div>
                    <dt>Principal</dt>
                    <dd>{demo.loan.principalTon.toFixed(3)} TON</dd>
                  </div>
                  <div>
                    <dt>Repay due</dt>
                    <dd>{demo.loan.repayDueTon.toFixed(3)} TON</dd>
                  </div>
                  <div>
                    <dt>LTV at open</dt>
                    <dd>{(demo.loan.ltvBpsAtOpen / 100).toFixed(2)}%</dd>
                  </div>
                </>
              )}
            </dl>
          </article>

          <article className="panel reveal delay-4">
            <h2>Risk Envelope</h2>
            <dl>
              <div>
                <dt>Max LTV</dt>
                <dd>{activeSnapshot ? `${(Number(activeSnapshot.risk.maxLtvBps) / 100).toFixed(2)}%` : '—'}</dd>
              </div>
              <div>
                <dt>Oracle max age</dt>
                <dd>{activeSnapshot ? formatSeconds(activeSnapshot.risk.oracleMaxAge) : '—'}</dd>
              </div>
              <div>
                <dt>Risk timelock</dt>
                <dd>{activeSnapshot ? formatSeconds(activeSnapshot.risk.riskTimelock) : '—'}</dd>
              </div>
              <div>
                <dt>Pending max LTV</dt>
                <dd>{activeSnapshot ? `${(Number(activeSnapshot.risk.pendingMaxLtvBps) / 100).toFixed(2)}%` : '—'}</dd>
              </div>
              <div>
                <dt>Pending oracle age</dt>
                <dd>{activeSnapshot ? formatSeconds(activeSnapshot.risk.pendingOracleMaxAge) : '—'}</dd>
              </div>
              <div>
                <dt>Pending ETA</dt>
                <dd>{activeSnapshot ? formatTimestamp(activeSnapshot.risk.pendingEta) : '—'}</dd>
              </div>
              <div>
                <dt>Last tx hash</dt>
                <dd>{activeSnapshot ? shortValue(activeSnapshot.lastTxHash, 12, 10) : '—'}</dd>
              </div>
              <div>
                <dt>Explorer</dt>
                <dd>
                  {mode === 'live' ? (
                    <a href={`${TONSCAN_ADDRESS_PREFIX}${contractAddress.trim()}`} target="_blank" rel="noreferrer">
                      open contract
                    </a>
                  ) : (
                    'offline sandbox'
                  )}
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
            {mode === 'demo'
              ? 'Use this offline harness to validate credit gates: stale oracle, pause, LTV and liquidity checks.'
              : 'Status follows strict lifecycle gates. Funding is blocked if oracle is stale; risk updates are timelocked by design.'}
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
