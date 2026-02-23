import assert from 'node:assert/strict';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Address, toNano } from '@ton/core';
import { NFTCollateralLoan } from '../build/NFTCollateralLoan/NFTCollateralLoan_NFTCollateralLoan';
import { TNFTOracleQuorum } from '../build/TNFTOracleQuorum/TNFTOracleQuorum_TNFTOracleQuorum';
import { TNFTLiquidityPool } from '../build/TNFTLiquidityPool/TNFTLiquidityPool_TNFTLiquidityPool';
import { TNFTReserveBackstopVault } from '../build/TNFTReserveBackstopVault/TNFTReserveBackstopVault_TNFTReserveBackstopVault';
import { TNFTLiquidationAuction } from '../build/TNFTLiquidationAuction/TNFTLiquidationAuction_TNFTLiquidationAuction';
import { TNFTCollateralEscrow } from '../build/TNFTCollateralEscrow/TNFTCollateralEscrow_TNFTCollateralEscrow';
import { TNFTRiskMultisig } from '../build/TNFTRiskMultisig/TNFTRiskMultisig_TNFTRiskMultisig';

const STATUS_FUNDED = 1n;
const STATUS_REPAID = 2n;
const STATUS_LIQUIDATED = 3n;

const ESCROW_STATUS_RELEASED = 2n;
const ESCROW_STATUS_LIQUIDATED = 3n;

type Wallet = SandboxContract<TreasuryContract>;
type TxResult = Awaited<ReturnType<SandboxContract<NFTCollateralLoan>['send']>>;

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

async function main() {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_771_577_000;

    const owner = await blockchain.treasury('owner');
    const signer2 = await blockchain.treasury('signer2');
    const signer3 = await blockchain.treasury('signer3');
    const source1 = await blockchain.treasury('source1');
    const source2 = await blockchain.treasury('source2');
    const source3 = await blockchain.treasury('source3');
    const manager = await blockchain.treasury('manager');
    const borrower = await blockchain.treasury('borrower');
    const lender = await blockchain.treasury('lender');
    const bidder1 = await blockchain.treasury('bidder1');
    const bidder2 = await blockchain.treasury('bidder2');
    const lp = await blockchain.treasury('lp');
    const nft = await blockchain.treasury('nft');
    const nft2 = await blockchain.treasury('nft2');

    const risk = blockchain.openContract(
        await TNFTRiskMultisig.fromInit(owner.address, signer2.address, signer3.address, 5000n, 600n, 86400n),
    );
    await risk.send(owner.getSender(), { value: toNano('0.03') }, {
        $$type: 'ProposeRiskUpdate',
        nextMaxLtvBps: 4500n,
        nextOracleMaxAge: 500n,
    });
    await risk.send(signer2.getSender(), { value: toNano('0.03') }, { $$type: 'ApproveRiskUpdate' });
    blockchain.now = (blockchain.now ?? 0) + 86401;
    await risk.send(owner.getSender(), { value: toNano('0.03') }, { $$type: 'ApplyRiskUpdate' });
    const riskState = await risk.getGetRiskMultisigState();
    assert.equal(riskState.maxLtvBps, 4500n, 'risk maxLtv should be updated');
    assert.equal(riskState.oracleMaxAge, 500n, 'risk oracleMaxAge should be updated');

    const oracle = blockchain.openContract(
        await TNFTOracleQuorum.fromInit(owner.address, source1.address, source2.address, source3.address),
    );
    const oracleTs = BigInt(blockchain.now ?? 0);
    await oracle.send(source1.getSender(), { value: toNano('0.02') }, {
        $$type: 'SubmitOraclePrice',
        price: toNano('1'),
        updatedAt: oracleTs,
    });
    await oracle.send(source2.getSender(), { value: toNano('0.02') }, {
        $$type: 'SubmitOraclePrice',
        price: toNano('1.01'),
        updatedAt: oracleTs,
    });
    const effectivePrice = await oracle.getGetEffectivePrice();
    assert(effectivePrice > 0n, 'oracle effective price must be available');

    const pool = blockchain.openContract(await TNFTLiquidityPool.fromInit(owner.address, manager.address, toNano('8')));
    await pool.send(lp.getSender(), { value: toNano('2') }, { $$type: 'DepositLiquidity', tier: 0n });
    await pool.send(manager.getSender(), { value: toNano('0.03') }, {
        $$type: 'BorrowTo',
        to: lender.address,
        amount: toNano('0.3'),
    });

    const reserve = blockchain.openContract(await TNFTReserveBackstopVault.fromInit(owner.address));
    await reserve.send(owner.getSender(), { value: toNano('0.03') }, {
        $$type: 'SetAuthorizedManager',
        manager: manager.address,
        enabled: true,
    });
    await reserve.send(owner.getSender(), { value: toNano('0.08') }, { $$type: 'TopUpReserve' });
    await reserve.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'TopUpBackstop' });

    await runRepaidBranch({
        blockchain,
        owner,
        borrower,
        lender,
        nft,
        oraclePrice: effectivePrice,
        maxLtvBps: riskState.maxLtvBps,
        oracleMaxAge: riskState.oracleMaxAge,
    });

    await pool.send(manager.getSender(), { value: toNano('0.245') }, {
        $$type: 'RepayFromLoan',
        principalRepaid: toNano('0.2'),
        interestPaid: toNano('0.035'),
        penaltyPaid: toNano('0.01'),
    });
    await pool.send(lp.getSender(), { value: toNano('0.02') }, { $$type: 'WithdrawLiquidity' });

    await runLiquidationBranch({
        blockchain,
        owner,
        manager,
        borrower,
        lender,
        bidder1,
        bidder2,
        nft: nft2,
        reserve,
        oraclePrice: effectivePrice,
        maxLtvBps: riskState.maxLtvBps,
        oracleMaxAge: riskState.oracleMaxAge,
    });

    await reserve.send(manager.getSender(), { value: toNano('0.02') }, {
        $$type: 'RequestCoverage',
        amount: toNano('0.03'),
        to: lender.address,
    });
    const reserveState = await reserve.getGetReserveState();
    assert(reserveState.reserveBalance >= 0n, 'reserve state must be readable after coverage flow');

    console.log('PASS: prealpha full 0.0.1.8 e2e flow');
}

async function runRepaidBranch(args: {
    blockchain: Blockchain;
    owner: Wallet;
    borrower: Wallet;
    lender: Wallet;
    nft: Wallet;
    oraclePrice: bigint;
    maxLtvBps: bigint;
    oracleMaxAge: bigint;
}) {
    const principal = toNano('0.2');
    const repayAmount = toNano('0.22');

    const loan = args.blockchain.openContract(
        await NFTCollateralLoan.fromInit(
            args.owner.address,
            args.borrower.address,
            args.nft.address,
            principal,
            repayAmount,
            600n,
            args.maxLtvBps,
            args.oracleMaxAge,
            86400n,
        ),
    );
    const escrow = args.blockchain.openContract(
        await TNFTCollateralEscrow.fromInit(args.owner.address, args.owner.address, args.borrower.address, args.nft.address),
    );

    await loan.send(args.owner.getSender(), { value: toNano('0.05') }, null);
    await escrow.send(args.nft.getSender(), { value: toNano('0.03') }, { $$type: 'ConfirmEscrowedByNft' });
    const escrowLocked = await escrow.getGetIsLocked();
    assert.equal(escrowLocked, true, 'escrow must be locked before funding');

    const lockConfirm = await loan.send(
        args.nft.getSender(),
        { value: toNano('0.02') },
        { $$type: 'ConfirmCollateralLocked' },
    );
    assertContractTxSuccess(lockConfirm, loan.address, 'confirm collateral lock');

    const nowTs = BigInt(args.blockchain.now ?? 0);
    await loan.send(args.owner.getSender(), { value: toNano('0.02') }, {
        $$type: 'SetOraclePrice',
        price: args.oraclePrice,
        updatedAt: nowTs,
    });

    const fund = await loan.send(args.lender.getSender(), { value: toNano('0.25') }, { $$type: 'FundLoan' });
    assertContractTxSuccess(fund, loan.address, 'fund repaid branch');

    const fundedState = await loan.getGetLoanState();
    assert.equal(fundedState.status, STATUS_FUNDED, 'loan should be FUNDED');

    const repay = await loan.send(args.borrower.getSender(), { value: toNano('0.23') }, { $$type: 'Repay' });
    assertContractTxSuccess(repay, loan.address, 'repay repaid branch');

    await escrow.send(args.owner.getSender(), { value: toNano('0.03') }, { $$type: 'ReleaseToBorrower' });

    const finalLoan = await loan.getGetLoanState();
    const finalEscrow = await escrow.getGetEscrowState();
    assert.equal(finalLoan.status, STATUS_REPAID, 'repaid branch final status should be REPAID');
    assert.equal(finalEscrow.status, ESCROW_STATUS_RELEASED, 'escrow should be released to borrower');
}

async function runLiquidationBranch(args: {
    blockchain: Blockchain;
    owner: Wallet;
    manager: Wallet;
    borrower: Wallet;
    lender: Wallet;
    bidder1: Wallet;
    bidder2: Wallet;
    nft: Wallet;
    reserve: SandboxContract<TNFTReserveBackstopVault>;
    oraclePrice: bigint;
    maxLtvBps: bigint;
    oracleMaxAge: bigint;
}) {
    const principal = toNano('0.2');
    const repayAmount = toNano('0.22');

    const loan = args.blockchain.openContract(
        await NFTCollateralLoan.fromInit(
            args.owner.address,
            args.borrower.address,
            args.nft.address,
            principal,
            repayAmount,
            120n,
            args.maxLtvBps,
            args.oracleMaxAge,
            86400n,
        ),
    );
    const escrow = args.blockchain.openContract(
        await TNFTCollateralEscrow.fromInit(args.owner.address, args.owner.address, args.borrower.address, args.nft.address),
    );

    await loan.send(args.owner.getSender(), { value: toNano('0.05') }, null);
    await escrow.send(args.nft.getSender(), { value: toNano('0.03') }, { $$type: 'ConfirmEscrowedByNft' });
    await loan.send(args.nft.getSender(), { value: toNano('0.02') }, { $$type: 'ConfirmCollateralLocked' });

    const nowTs = BigInt(args.blockchain.now ?? 0);
    await loan.send(args.owner.getSender(), { value: toNano('0.02') }, {
        $$type: 'SetOraclePrice',
        price: args.oraclePrice,
        updatedAt: nowTs,
    });
    await loan.send(args.lender.getSender(), { value: toNano('0.25') }, { $$type: 'FundLoan' });

    args.blockchain.now = (args.blockchain.now ?? 0) + 121;
    const liquidate = await loan.send(args.owner.getSender(), { value: toNano('0.02') }, { $$type: 'Liquidate' });
    assertContractTxSuccess(liquidate, loan.address, 'liquidate overdue branch');

    const auction = args.blockchain.openContract(
        await TNFTLiquidationAuction.fromInit(
            args.owner.address,
            args.manager.address,
            args.reserve.address,
            args.borrower.address,
            args.lender.address,
            repayAmount,
        ),
    );
    await auction.send(args.manager.getSender(), { value: toNano('0.04') }, {
        $$type: 'StartAuction',
        minBid: toNano('0.21'),
        durationSeconds: 60n,
    });
    await auction.send(args.bidder1.getSender(), { value: toNano('0.22') }, { $$type: 'PlaceBid' });
    await auction.send(args.bidder2.getSender(), { value: toNano('0.25') }, { $$type: 'PlaceBid' });

    args.blockchain.now = (args.blockchain.now ?? 0) + 61;
    await auction.send(args.manager.getSender(), { value: toNano('0.03') }, { $$type: 'FinalizeAuction' });
    await escrow.send(args.owner.getSender(), { value: toNano('0.03') }, {
        $$type: 'ReleaseToAuctionWinner',
        winner: args.bidder2.address,
    });

    const loanState = await loan.getGetLoanState();
    const auctionState = await auction.getGetAuctionState();
    const escrowState = await escrow.getGetEscrowState();

    assert.equal(loanState.status, STATUS_LIQUIDATED, 'liquidation branch final status should be LIQUIDATED');
    assert.equal(auctionState.status, 2n, 'auction should be settled');
    assert.equal(escrowState.status, ESCROW_STATUS_LIQUIDATED, 'escrow should be released to auction winner');
}

main().catch((error) => {
    console.error('FAIL: prealpha full 0.0.1.8 e2e flow');
    console.error(error);
    process.exit(1);
});
