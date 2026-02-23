import { Address, beginCell, toNano } from '@ton/core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
    storeConfirmCollateralLocked,
    storeFundLoan,
    storeRepay,
    storeSetOraclePrice,
} from '../build/NFTCollateralLoan/NFTCollateralLoan_NFTCollateralLoan';

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
};

type LoanSnapshot = {
    status: number;
    oraclePriceNano: bigint;
    oracleUpdatedAt: number;
    collateralLocked: boolean;
    collateralLockedAt: number;
    lastTxHash: string;
    lastTxLt: string;
    fetchedAt: string;
};

type ActionLog = {
    action: 'SetOraclePrice' | 'ConfirmCollateralLocked' | 'FundLoan' | 'Repay';
    tonLink: string;
    amountNano: string;
    before: LoanSnapshot;
    after: LoanSnapshot;
    waitMs: number;
};

function envOrDefault(name: string, fallback: string): string {
    const raw = process.env[name];
    return raw && raw.trim().length > 0 ? raw.trim() : fallback;
}

function envNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw || raw.trim().length === 0) {
        return fallback;
    }

    const parsed = Number(raw.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`${name} must be a positive number`);
    }
    return parsed;
}

function envBoolean(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (!raw || raw.trim().length === 0) {
        return fallback;
    }
    const normalized = raw.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusLabel(status: number): string {
    if (status === 0) {
        return 'OPEN';
    }
    if (status === 1) {
        return 'FUNDED';
    }
    if (status === 2) {
        return 'REPAID';
    }
    if (status === 3) {
        return 'LIQUIDATED';
    }
    if (status === 4) {
        return 'CANCELLED';
    }
    return `UNKNOWN(${status})`;
}

function shortHash(value: string): string {
    if (!value) {
        return '—';
    }
    if (value.length < 16) {
        return value;
    }
    return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function parseStackBigInt(stack: unknown[] | undefined, index: number): bigint {
    const item = stack?.[index];
    if (!Array.isArray(item) || item.length < 2 || item[0] !== 'num') {
        return BigInt(0);
    }

    const value = item[1];
    if (typeof value === 'number') {
        return BigInt(value);
    }
    if (typeof value !== 'string') {
        return BigInt(0);
    }

    if (value.startsWith('-0x')) {
        return -BigInt(`0x${value.slice(3)}`);
    }
    if (value.startsWith('0x')) {
        return BigInt(value);
    }
    if (/^-?\d+$/.test(value)) {
        return BigInt(value);
    }
    return BigInt(0);
}

async function readJsonSafe(response: Response): Promise<any> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

async function callToncenterRpc<T>(
    rpcUrl: string,
    apiKey: string,
    method: string,
    params: Record<string, unknown>,
): Promise<T> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (apiKey.trim().length > 0) {
        headers['X-API-Key'] = apiKey.trim();
    }

    const response = await fetch(rpcUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            id: 'smoke',
            jsonrpc: '2.0',
            method,
            params,
        }),
    });

    const payload = await readJsonSafe(response);
    if (!response.ok || payload?.ok !== true) {
        const code = payload?.code ?? response.status;
        const message = payload?.result ?? payload?.error ?? 'Unknown RPC error';
        throw new Error(`Toncenter RPC ${method} failed (${code}): ${message}`);
    }

    return payload.result as T;
}

async function fetchLoanSnapshot(rpcUrl: string, apiKey: string, contractAddress: string): Promise<LoanSnapshot> {
    const [addressInfo, loanState] = await Promise.all([
        callToncenterRpc<AddressInfoResult>(rpcUrl, apiKey, 'getAddressInformation', { address: contractAddress }),
        callToncenterRpc<RunGetMethodResult>(rpcUrl, apiKey, 'runGetMethod', {
            address: contractAddress,
            method: 'get_loan_state',
            stack: [],
        }),
    ]);

    return {
        status: Number(parseStackBigInt(loanState.stack, 0)),
        oraclePriceNano: parseStackBigInt(loanState.stack, 4),
        oracleUpdatedAt: Number(parseStackBigInt(loanState.stack, 5)),
        collateralLocked: parseStackBigInt(loanState.stack, 7) > 0n,
        collateralLockedAt: Number(parseStackBigInt(loanState.stack, 8)),
        lastTxHash: addressInfo.last_transaction_id?.hash ?? '',
        lastTxLt: addressInfo.last_transaction_id?.lt ?? '',
        fetchedAt: new Date().toISOString(),
    };
}

function toTonLink(address: Address, amount: bigint, bodyBocBase64Url: string): string {
    const recipient = address.toString({ bounceable: true, urlSafe: true, testOnly: false });
    return `ton://transfer/${recipient}?amount=${amount.toString()}&bin=${bodyBocBase64Url}`;
}

async function waitForCondition(
    title: string,
    rpcUrl: string,
    apiKey: string,
    contractAddress: string,
    intervalMs: number,
    timeoutMs: number,
    predicate: (snapshot: LoanSnapshot) => boolean,
): Promise<{ snapshot: LoanSnapshot; waitMs: number }> {
    const startedAt = Date.now();
    let attempt = 0;

    while (Date.now() - startedAt <= timeoutMs) {
        attempt += 1;
        try {
            const snapshot = await fetchLoanSnapshot(rpcUrl, apiKey, contractAddress);
            if (predicate(snapshot)) {
                return { snapshot, waitMs: Date.now() - startedAt };
            }

            console.log(
                `[poll ${attempt}] ${title}: status=${statusLabel(snapshot.status)} tx=${shortHash(snapshot.lastTxHash)} oracleUpdatedAt=${snapshot.oracleUpdatedAt} collateralLocked=${snapshot.collateralLocked}`,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown polling error';
            console.log(`[poll ${attempt}] ${title}: transient error: ${message}`);
        }

        await sleep(intervalMs);
    }

    throw new Error(`Timeout while waiting for ${title}`);
}

async function main() {
    const contractAddress = envOrDefault('MVP_CONTRACT_ADDRESS', 'EQDNj4-A8lILD6G3YXvEQWbMreziRuCGkbu2Tbb6xuPJjQUE');
    const rpcUrl = envOrDefault('TONCENTER_RPC_URL', 'https://testnet.toncenter.com/api/v2/jsonRPC');
    const apiKey = envOrDefault('TONCENTER_API_KEY', '');
    const pollIntervalMs = envNumber('SMOKE_POLL_INTERVAL_MS', 8_000);
    const timeoutMs = envNumber('SMOKE_TIMEOUT_SECONDS', 300) * 1_000;
    const autoContinue = envBoolean('SMOKE_AUTO_CONTINUE', false);
    const dryRun = envBoolean('SMOKE_DRY_RUN', false);
    const requireCollateralLock = envBoolean('SMOKE_REQUIRE_COLLATERAL_LOCK', false);

    const oraclePriceTon = envOrDefault('MVP_ORACLE_PRICE_TON', '1');
    const oracleMsgTon = envOrDefault('MVP_ORACLE_TX_TON', '0.05');
    const collateralLockMsgTon = envOrDefault('MVP_COLLATERAL_LOCK_TX_TON', '0.02');
    const fundMsgTon = envOrDefault('MVP_FUND_TX_TON', '0.25');
    const repayMsgTon = envOrDefault('MVP_REPAY_TX_TON', '0.23');

    const oraclePriceNano = toNano(oraclePriceTon);
    const oracleMsgNano = toNano(oracleMsgTon);
    const collateralLockMsgNano = toNano(collateralLockMsgTon);
    const fundMsgNano = toNano(fundMsgTon);
    const repayMsgNano = toNano(repayMsgTon);
    const oracleUpdatedAt = BigInt(Math.floor(Date.now() / 1000));
    const contract = Address.parse(contractAddress);

    const setOracleBody = beginCell()
        .store(storeSetOraclePrice({ $$type: 'SetOraclePrice', price: oraclePriceNano, updatedAt: oracleUpdatedAt }))
        .endCell()
        .toBoc({ idx: false })
        .toString('base64url');
    const collateralLockBody = beginCell()
        .store(storeConfirmCollateralLocked({ $$type: 'ConfirmCollateralLocked' }))
        .endCell()
        .toBoc({ idx: false })
        .toString('base64url');
    const fundBody = beginCell().store(storeFundLoan({ $$type: 'FundLoan' })).endCell().toBoc({ idx: false }).toString('base64url');
    const repayBody = beginCell().store(storeRepay({ $$type: 'Repay' })).endCell().toBoc({ idx: false }).toString('base64url');

    const setOracleLink = toTonLink(contract, oracleMsgNano, setOracleBody);
    const collateralLockLink = toTonLink(contract, collateralLockMsgNano, collateralLockBody);
    const fundLink = toTonLink(contract, fundMsgNano, fundBody);
    const repayLink = toTonLink(contract, repayMsgNano, repayBody);

    console.log(`Contract: ${contractAddress}`);
    console.log(`RPC: ${rpcUrl}`);
    console.log(`Oracle price: ${oraclePriceNano.toString()} nanotons`);
    console.log('');
    console.log(`SET_ORACLE_PRICE_LINK=${setOracleLink}`);
    console.log(`COLLATERAL_LOCK_LINK=${collateralLockLink}`);
    console.log(`FUND_LOAN_LINK=${fundLink}`);
    console.log(`REPAY_LINK=${repayLink}`);
    console.log('');

    if (dryRun) {
        console.log('SMOKE_DRY_RUN=true -> links generated, on-chain checks skipped.');
        return;
    }

    const rl = createInterface({ input, output });
    const actionsLog: ActionLog[] = [];

    try {
        let snapshot = await fetchLoanSnapshot(rpcUrl, apiKey, contractAddress);
        console.log(
            `Initial on-chain status: ${statusLabel(snapshot.status)}; tx=${shortHash(snapshot.lastTxHash)}; oracleUpdatedAt=${snapshot.oracleUpdatedAt}; collateralLocked=${snapshot.collateralLocked}`,
        );
        if (snapshot.status !== 0) {
            throw new Error(
                `Smoke flow requires OPEN (0), got ${statusLabel(snapshot.status)}. Deploy/use a fresh OPEN contract and rerun.`,
            );
        }

        const askStep = async (title: string, link: string): Promise<void> => {
            console.log('');
            console.log(`[${title}] Open link and sign transaction:`);
            console.log(link);
            console.log(`Tonscan: https://testnet.tonscan.org/address/${contractAddress}`);

            if (autoContinue) {
                console.log(`[${title}] SMOKE_AUTO_CONTINUE=true, skipping prompt.`);
                return;
            }

            await rl.question(`[${title}] Press ENTER after wallet confirms transaction... `);
        };

        const beforeOracle = snapshot;
        await askStep('STEP 1 / SetOraclePrice', setOracleLink);
        const oracleResult = await waitForCondition(
            'SetOraclePrice confirmation',
            rpcUrl,
            apiKey,
            contractAddress,
            pollIntervalMs,
            timeoutMs,
            (current) =>
                current.status === 0 &&
                current.oraclePriceNano === oraclePriceNano &&
                current.oracleUpdatedAt >= Number(oracleUpdatedAt) &&
                (current.lastTxLt !== beforeOracle.lastTxLt || current.oracleUpdatedAt > beforeOracle.oracleUpdatedAt),
        );
        snapshot = oracleResult.snapshot;
        actionsLog.push({
            action: 'SetOraclePrice',
            tonLink: setOracleLink,
            amountNano: oracleMsgNano.toString(),
            before: beforeOracle,
            after: snapshot,
            waitMs: oracleResult.waitMs,
        });
        console.log(`SetOraclePrice confirmed in ${oracleResult.waitMs} ms; tx=${shortHash(snapshot.lastTxHash)}`);

        if (requireCollateralLock && !snapshot.collateralLocked) {
            const beforeCollateral = snapshot;
            await askStep('STEP 2 / ConfirmCollateralLocked', collateralLockLink);
            const collateralResult = await waitForCondition(
                'ConfirmCollateralLocked confirmation',
                rpcUrl,
                apiKey,
                contractAddress,
                pollIntervalMs,
                timeoutMs,
                (current) => current.status === 0 && current.collateralLocked && current.lastTxLt !== beforeCollateral.lastTxLt,
            );
            snapshot = collateralResult.snapshot;
            actionsLog.push({
                action: 'ConfirmCollateralLocked',
                tonLink: collateralLockLink,
                amountNano: collateralLockMsgNano.toString(),
                before: beforeCollateral,
                after: snapshot,
                waitMs: collateralResult.waitMs,
            });
            console.log(`ConfirmCollateralLocked confirmed in ${collateralResult.waitMs} ms; tx=${shortHash(snapshot.lastTxHash)}`);
        }

        const beforeFund = snapshot;
        await askStep('STEP 3 / FundLoan', fundLink);
        const fundResult = await waitForCondition(
            'FundLoan confirmation',
            rpcUrl,
            apiKey,
            contractAddress,
            pollIntervalMs,
            timeoutMs,
            (current) => current.status === 1 && current.lastTxLt !== beforeFund.lastTxLt,
        );
        snapshot = fundResult.snapshot;
        actionsLog.push({
            action: 'FundLoan',
            tonLink: fundLink,
            amountNano: fundMsgNano.toString(),
            before: beforeFund,
            after: snapshot,
            waitMs: fundResult.waitMs,
        });
        console.log(`FundLoan confirmed in ${fundResult.waitMs} ms; tx=${shortHash(snapshot.lastTxHash)}`);

        const beforeRepay = snapshot;
        await askStep('STEP 4 / Repay', repayLink);
        const repayResult = await waitForCondition(
            'Repay confirmation',
            rpcUrl,
            apiKey,
            contractAddress,
            pollIntervalMs,
            timeoutMs,
            (current) => current.status === 2 && current.lastTxLt !== beforeRepay.lastTxLt,
        );
        snapshot = repayResult.snapshot;
        actionsLog.push({
            action: 'Repay',
            tonLink: repayLink,
            amountNano: repayMsgNano.toString(),
            before: beforeRepay,
            after: snapshot,
            waitMs: repayResult.waitMs,
        });
        console.log(`Repay confirmed in ${repayResult.waitMs} ms; tx=${shortHash(snapshot.lastTxHash)}`);

        const outputDir = path.resolve(__dirname, '../../../docs/deployments/smoke');
        await fs.mkdir(outputDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputPath = path.join(outputDir, `open-funded-repaid-${stamp}.json`);
        const outputPayload = {
            generatedAt: new Date().toISOString(),
            contractAddress,
            rpcUrl,
            oracleUpdatedAt: oracleUpdatedAt.toString(),
            oraclePriceNano: oraclePriceNano.toString(),
            amountsNano: {
                setOraclePrice: oracleMsgNano.toString(),
                collateralLock: collateralLockMsgNano.toString(),
                fundLoan: fundMsgNano.toString(),
                repay: repayMsgNano.toString(),
            },
            actions: actionsLog,
            finalStatus: {
                status: snapshot.status,
                statusLabel: statusLabel(snapshot.status),
                lastTxHash: snapshot.lastTxHash,
                lastTxLt: snapshot.lastTxLt,
            },
        };
        await fs.writeFile(outputPath, JSON.stringify(outputPayload, null, 2), 'utf8');

        console.log('');
        console.log(`SMOKE PASS: ${statusLabel(snapshot.status)} reached.`);
        console.log(`Log saved to: ${outputPath}`);
    } finally {
        rl.close();
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`SMOKE FAIL: ${message}`);
    process.exitCode = 1;
});
