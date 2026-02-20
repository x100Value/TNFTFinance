import assert from 'node:assert/strict';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, toNano } from '@ton/core';
import { NFTCollateralLoan } from '../build/NFTCollateralLoan/NFTCollateralLoan_NFTCollateralLoan';

const STATUS_OPEN = 0n;
const STATUS_FUNDED = 1n;
const STATUS_REPAID = 2n;
const STATUS_LIQUIDATED = 3n;
const STATUS_CANCELLED = 4n;

type TxResult = Awaited<ReturnType<SandboxContract<NFTCollateralLoan>['send']>>;

type DeployedLoan = {
    blockchain: Blockchain;
    owner: SandboxContract<TreasuryContract>;
    borrower: SandboxContract<TreasuryContract>;
    lender: SandboxContract<TreasuryContract>;
    outsider: SandboxContract<TreasuryContract>;
    contract: SandboxContract<NFTCollateralLoan>;
    principal: bigint;
    repayAmount: bigint;
    termSeconds: bigint;
    oracleMaxAge: bigint;
    riskTimelock: bigint;
};

function txToContract(result: TxResult, contractAddress: Address): any {
    const accountId = BigInt(`0x${contractAddress.hash.toString('hex')}`);
    const tx = result.transactions.find((item: any) => item.address === accountId);
    assert(tx, `missing contract transaction for ${contractAddress.toString()}`);
    return tx;
}

function assertContractTxSuccess(result: TxResult, contractAddress: Address, title: string) {
    const tx = txToContract(result, contractAddress);
    const aborted = tx.description?.aborted === true;
    const computeSuccess = tx.description?.computePhase?.success !== false;
    const actionSuccess = tx.description?.actionPhase?.success !== false;
    assert(!aborted && computeSuccess && actionSuccess, `${title} must succeed`);
}

function assertContractTxFailed(result: TxResult, contractAddress: Address, title: string) {
    const tx = txToContract(result, contractAddress);
    const failed =
        tx.description?.aborted === true ||
        tx.description?.computePhase?.success === false ||
        tx.description?.actionPhase?.success === false;
    assert(failed, `${title} must fail`);
}

async function deployLoan(overrides?: {
    principal?: bigint;
    repayAmount?: bigint;
    termSeconds?: bigint;
    maxLtvBps?: bigint;
    oracleMaxAge?: bigint;
    riskTimelock?: bigint;
}): Promise<DeployedLoan> {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_771_577_000;

    const owner = await blockchain.treasury('owner');
    const borrower = await blockchain.treasury('borrower');
    const lender = await blockchain.treasury('lender');
    const outsider = await blockchain.treasury('outsider');

    const principal = overrides?.principal ?? toNano('0.2');
    const repayAmount = overrides?.repayAmount ?? toNano('0.22');
    const termSeconds = overrides?.termSeconds ?? 86400n;
    const maxLtvBps = overrides?.maxLtvBps ?? 5000n;
    const oracleMaxAge = overrides?.oracleMaxAge ?? 600n;
    const riskTimelock = overrides?.riskTimelock ?? 86400n;

    const contract = blockchain.openContract(
        await NFTCollateralLoan.fromInit(
            owner.address,
            borrower.address,
            borrower.address,
            principal,
            repayAmount,
            termSeconds,
            maxLtvBps,
            oracleMaxAge,
            riskTimelock,
        ),
    );

    const deploy = await contract.send(owner.getSender(), { value: toNano('0.05') }, null);
    assertContractTxSuccess(deploy, contract.address, 'deploy');

    const state = await contract.getGetLoanState();
    assert.equal(state.status, STATUS_OPEN, 'initial status must be OPEN');

    return {
        blockchain,
        owner,
        borrower,
        lender,
        outsider,
        contract,
        principal,
        repayAmount,
        termSeconds,
        oracleMaxAge,
        riskTimelock,
    };
}

async function testOracleFailClosedAndLtv() {
    const ctx = await deployLoan();

    const fundWithoutOracle = await ctx.contract.send(
        ctx.lender.getSender(),
        { value: ctx.principal },
        { $$type: 'FundLoan' },
    );
    assertContractTxFailed(fundWithoutOracle, ctx.contract.address, 'fund without oracle');

    const staleTs = BigInt((ctx.blockchain.now ?? 0) - Number(ctx.oracleMaxAge) - 1);
    const setStaleOracle = await ctx.contract.send(
        ctx.owner.getSender(),
        { value: toNano('0.02') },
        { $$type: 'SetOraclePrice', price: toNano('1'), updatedAt: staleTs },
    );
    assertContractTxSuccess(setStaleOracle, ctx.contract.address, 'set stale oracle');

    const fundWithStaleOracle = await ctx.contract.send(
        ctx.lender.getSender(),
        { value: ctx.principal },
        { $$type: 'FundLoan' },
    );
    assertContractTxFailed(fundWithStaleOracle, ctx.contract.address, 'fund with stale oracle');

    const freshTs = BigInt(ctx.blockchain.now ?? 0);
    const setLowPrice = await ctx.contract.send(
        ctx.owner.getSender(),
        { value: toNano('0.02') },
        { $$type: 'SetOraclePrice', price: toNano('0.1'), updatedAt: freshTs },
    );
    assertContractTxSuccess(setLowPrice, ctx.contract.address, 'set low oracle price');

    const fundAboveLtv = await ctx.contract.send(
        ctx.lender.getSender(),
        { value: ctx.principal },
        { $$type: 'FundLoan' },
    );
    assertContractTxFailed(fundAboveLtv, ctx.contract.address, 'fund above LTV');

    const setGoodPrice = await ctx.contract.send(
        ctx.owner.getSender(),
        { value: toNano('0.02') },
        { $$type: 'SetOraclePrice', price: toNano('1'), updatedAt: freshTs },
    );
    assertContractTxSuccess(setGoodPrice, ctx.contract.address, 'set valid oracle price');

    const fundSuccess = await ctx.contract.send(
        ctx.lender.getSender(),
        { value: ctx.principal },
        { $$type: 'FundLoan' },
    );
    assertContractTxSuccess(fundSuccess, ctx.contract.address, 'fund with valid oracle');

    const state = await ctx.contract.getGetLoanState();
    assert.equal(state.status, STATUS_FUNDED, 'status must be FUNDED');
    assert.equal(state.lender.toString(), ctx.lender.address.toString(), 'lender must be saved');
}

async function testRepayAllowedDuringPause() {
    const ctx = await deployLoan();
    const nowTs = BigInt(ctx.blockchain.now ?? 0);

    await ctx.contract.send(
        ctx.owner.getSender(),
        { value: toNano('0.02') },
        { $$type: 'SetOraclePrice', price: toNano('1'), updatedAt: nowTs },
    );

    const funded = await ctx.contract.send(
        ctx.lender.getSender(),
        { value: ctx.principal },
        { $$type: 'FundLoan' },
    );
    assertContractTxSuccess(funded, ctx.contract.address, 'fund before pause');

    const setPause = await ctx.contract.send(
        ctx.owner.getSender(),
        { value: toNano('0.02') },
        { $$type: 'SetPaused', paused: true },
    );
    assertContractTxSuccess(setPause, ctx.contract.address, 'pause contract');

    const repay = await ctx.contract.send(
        ctx.borrower.getSender(),
        { value: ctx.repayAmount },
        { $$type: 'Repay' },
    );
    assertContractTxSuccess(repay, ctx.contract.address, 'repay while paused');

    const state = await ctx.contract.getGetLoanState();
    assert.equal(state.status, STATUS_REPAID, 'status must be REPAID');
}

async function testLiquidationAfterDeadline() {
    const ctx = await deployLoan({ termSeconds: 120n });
    const nowTs = BigInt(ctx.blockchain.now ?? 0);

    await ctx.contract.send(
        ctx.owner.getSender(),
        { value: toNano('0.02') },
        { $$type: 'SetOraclePrice', price: toNano('1'), updatedAt: nowTs },
    );

    const funded = await ctx.contract.send(
        ctx.lender.getSender(),
        { value: ctx.principal },
        { $$type: 'FundLoan' },
    );
    assertContractTxSuccess(funded, ctx.contract.address, 'fund before liquidation');

    ctx.blockchain.now = (ctx.blockchain.now ?? 0) + Number(ctx.termSeconds) + 1;

    const liquidate = await ctx.contract.send(
        ctx.lender.getSender(),
        { value: toNano('0.02') },
        { $$type: 'Liquidate' },
    );
    assertContractTxSuccess(liquidate, ctx.contract.address, 'liquidate overdue loan');

    const state = await ctx.contract.getGetLoanState();
    assert.equal(state.status, STATUS_LIQUIDATED, 'status must be LIQUIDATED');

    const repayAfterLiquidation = await ctx.contract.send(
        ctx.borrower.getSender(),
        { value: ctx.repayAmount },
        { $$type: 'Repay' },
    );
    assertContractTxFailed(repayAfterLiquidation, ctx.contract.address, 'repay after liquidation');
}

async function testRiskTimelock() {
    const ctx = await deployLoan();

    const proposeByOutsider = await ctx.contract.send(
        ctx.outsider.getSender(),
        { value: toNano('0.02') },
        { $$type: 'ProposeRiskParams', nextMaxLtvBps: 4500n, nextOracleMaxAge: 300n },
    );
    assertContractTxFailed(proposeByOutsider, ctx.contract.address, 'outsider propose risk');

    const propose = await ctx.contract.send(
        ctx.owner.getSender(),
        { value: toNano('0.02') },
        { $$type: 'ProposeRiskParams', nextMaxLtvBps: 4500n, nextOracleMaxAge: 300n },
    );
    assertContractTxSuccess(propose, ctx.contract.address, 'owner propose risk');

    const earlyApply = await ctx.contract.send(
        ctx.owner.getSender(),
        { value: toNano('0.02') },
        { $$type: 'ApplyRiskParams' },
    );
    assertContractTxFailed(earlyApply, ctx.contract.address, 'early apply risk');

    ctx.blockchain.now = (ctx.blockchain.now ?? 0) + Number(ctx.riskTimelock) + 1;

    const apply = await ctx.contract.send(
        ctx.owner.getSender(),
        { value: toNano('0.02') },
        { $$type: 'ApplyRiskParams' },
    );
    assertContractTxSuccess(apply, ctx.contract.address, 'apply risk after timelock');

    const risk = await ctx.contract.getGetRiskState();
    assert.equal(risk.maxLtvBps, 4500n, 'risk maxLtv update');
    assert.equal(risk.oracleMaxAge, 300n, 'risk oracle max age update');
    assert.equal(risk.riskVersion, 2n, 'risk version increment');
}

async function testCancelOpenLoan() {
    const ctx = await deployLoan();

    const cancelByOutsider = await ctx.contract.send(
        ctx.outsider.getSender(),
        { value: toNano('0.02') },
        { $$type: 'CancelLoan' },
    );
    assertContractTxFailed(cancelByOutsider, ctx.contract.address, 'outsider cancel');

    const cancelByBorrower = await ctx.contract.send(
        ctx.borrower.getSender(),
        { value: toNano('0.02') },
        { $$type: 'CancelLoan' },
    );
    assertContractTxSuccess(cancelByBorrower, ctx.contract.address, 'borrower cancel');

    const state = await ctx.contract.getGetLoanState();
    assert.equal(state.status, STATUS_CANCELLED, 'status must be CANCELLED');
}

async function main() {
    await testOracleFailClosedAndLtv();
    console.log('PASS: oracle fail-closed and LTV guard');

    await testRepayAllowedDuringPause();
    console.log('PASS: repay allowed during pause');

    await testLiquidationAfterDeadline();
    console.log('PASS: liquidation after deadline');

    await testRiskTimelock();
    console.log('PASS: risk timelock governance');

    await testCancelOpenLoan();
    console.log('PASS: cancel flow access control');

    console.log('PASS: MVP safety checks completed');
}

main().catch((error) => {
    console.error('FAIL: MVP safety checks');
    console.error(error);
    process.exit(1);
});
