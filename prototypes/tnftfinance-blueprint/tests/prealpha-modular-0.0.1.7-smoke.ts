import assert from 'node:assert/strict';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { TNFTOracleQuorum } from '../build/TNFTOracleQuorum/TNFTOracleQuorum_TNFTOracleQuorum';
import { TNFTLiquidityPool } from '../build/TNFTLiquidityPool/TNFTLiquidityPool_TNFTLiquidityPool';
import { TNFTReserveBackstopVault } from '../build/TNFTReserveBackstopVault/TNFTReserveBackstopVault_TNFTReserveBackstopVault';
import { TNFTLiquidationAuction } from '../build/TNFTLiquidationAuction/TNFTLiquidationAuction_TNFTLiquidationAuction';
import { TNFTCollateralEscrow } from '../build/TNFTCollateralEscrow/TNFTCollateralEscrow_TNFTCollateralEscrow';
import { TNFTRiskMultisig } from '../build/TNFTRiskMultisig/TNFTRiskMultisig_TNFTRiskMultisig';

type Wallet = SandboxContract<TreasuryContract>;

async function main() {
    const blockchain = await Blockchain.create();
    blockchain.now = 1_771_577_000;

    const owner = await blockchain.treasury('owner');
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

    await testOracleQuorum(blockchain, owner, source1, source2, source3);
    await testLiquidityPool(blockchain, owner, manager, borrower, lp);
    await testReserveVault(blockchain, owner, manager, lender);
    await testAuction(blockchain, owner, manager, borrower, lender, bidder1, bidder2);
    await testEscrow(blockchain, owner, manager, borrower, nft, bidder2);
    await testRiskMultisig(blockchain, owner, source2, source3);

    console.log('PASS: prealpha modular 0.0.1.7 smoke tests completed');
}

async function testOracleQuorum(
    blockchain: Blockchain,
    owner: Wallet,
    source1: Wallet,
    source2: Wallet,
    source3: Wallet,
) {
    const oracle = blockchain.openContract(
        await TNFTOracleQuorum.fromInit(owner.address, source1.address, source2.address, source3.address),
    );

    await oracle.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'SetManualFallbackEnabled', enabled: false });
    await oracle.send(source1.getSender(), { value: toNano('0.02') }, {
        $$type: 'SubmitOraclePrice',
        price: toNano('1'),
        updatedAt: BigInt(blockchain.now ?? 0),
    });
    await oracle.send(source2.getSender(), { value: toNano('0.02') }, {
        $$type: 'SubmitOraclePrice',
        price: toNano('1.01'),
        updatedAt: BigInt(blockchain.now ?? 0),
    });

    const effective = await oracle.getGetEffectivePrice();
    assert(effective > 0n, 'oracle effective price must be available with 2 valid sources');
    console.log('PASS: prealpha modular oracle quorum');
}

async function testLiquidityPool(
    blockchain: Blockchain,
    owner: Wallet,
    manager: Wallet,
    borrower: Wallet,
    lp: Wallet,
) {
    const pool = blockchain.openContract(
        await TNFTLiquidityPool.fromInit(owner.address, manager.address, toNano('5')),
    );

    await pool.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'SetPaused', paused: false });
    await pool.send(lp.getSender(), { value: toNano('1') }, { $$type: 'DepositLiquidity', tier: 0n });

    const beforeBorrow = await pool.getGetPoolState();
    assert.equal(beforeBorrow.totalLiquidity, toNano('1'), 'pool liquidity must increase after deposit');

    await pool.send(manager.getSender(), { value: toNano('0.03') }, {
        $$type: 'BorrowTo',
        to: borrower.address,
        amount: toNano('0.2'),
    });

    await pool.send(manager.getSender(), { value: toNano('0.25') }, {
        $$type: 'RepayFromLoan',
        principalRepaid: toNano('0.2'),
        interestPaid: toNano('0.04'),
        penaltyPaid: toNano('0.01'),
    });

    await pool.send(lp.getSender(), { value: toNano('0.02') }, { $$type: 'WithdrawLiquidity' });
    const lpState = await pool.getGetLpPosition(lp.address);
    assert.equal(lpState.principal, 0n, 'LP position must be cleared after withdraw');
    console.log('PASS: prealpha modular liquidity pool');
}

async function testReserveVault(
    blockchain: Blockchain,
    owner: Wallet,
    manager: Wallet,
    lender: Wallet,
) {
    const reserve = blockchain.openContract(await TNFTReserveBackstopVault.fromInit(owner.address));

    await reserve.send(owner.getSender(), { value: toNano('0.05') }, {
        $$type: 'SetAuthorizedManager',
        manager: manager.address,
        enabled: true,
    });
    await reserve.send(owner.getSender(), { value: toNano('0.1') }, { $$type: 'TopUpReserve' });
    await reserve.send(owner.getSender(), { value: toNano('0.05') }, { $$type: 'TopUpBackstop' });

    await reserve.send(manager.getSender(), { value: toNano('0.02') }, {
        $$type: 'RequestCoverage',
        amount: toNano('0.2'),
        to: lender.address,
    });

    const state = await reserve.getGetReserveState();
    assert(state.badDebtTotal > 0n, 'bad debt must increase when coverage exceeds buffers');
    console.log('PASS: prealpha modular reserve/backstop');
}

async function testAuction(
    blockchain: Blockchain,
    owner: Wallet,
    manager: Wallet,
    borrower: Wallet,
    lender: Wallet,
    bidder1: Wallet,
    bidder2: Wallet,
) {
    const auction = blockchain.openContract(
        await TNFTLiquidationAuction.fromInit(
            owner.address,
            manager.address,
            owner.address,
            borrower.address,
            lender.address,
            toNano('0.2'),
        ),
    );

    await auction.send(manager.getSender(), { value: toNano('0.04') }, {
        $$type: 'StartAuction',
        minBid: toNano('0.21'),
        durationSeconds: 60n,
    });
    await auction.send(bidder1.getSender(), { value: toNano('0.22') }, { $$type: 'PlaceBid' });
    await auction.send(bidder2.getSender(), { value: toNano('0.25') }, { $$type: 'PlaceBid' });

    blockchain.now = (blockchain.now ?? 0) + 61;
    await auction.send(manager.getSender(), { value: toNano('0.03') }, { $$type: 'FinalizeAuction' });

    const state = await auction.getGetAuctionState();
    assert.equal(state.status, 2n, 'auction must be settled');
    assert.equal(state.bestBid, toNano('0.25'), 'best bid must be final highest bid');
    console.log('PASS: prealpha modular liquidation auction');
}

async function testEscrow(
    blockchain: Blockchain,
    owner: Wallet,
    manager: Wallet,
    borrower: Wallet,
    nft: Wallet,
    winner: Wallet,
) {
    const escrow = blockchain.openContract(
        await TNFTCollateralEscrow.fromInit(owner.address, manager.address, borrower.address, nft.address),
    );

    await escrow.send(nft.getSender(), { value: toNano('0.03') }, { $$type: 'ConfirmEscrowedByNft' });
    const locked = await escrow.getGetIsLocked();
    assert.equal(locked, true, 'escrow should be locked after NFT confirmation');

    await escrow.send(manager.getSender(), { value: toNano('0.03') }, {
        $$type: 'ReleaseToAuctionWinner',
        winner: winner.address,
    });
    const state = await escrow.getGetEscrowState();
    assert.equal(state.status, 3n, 'escrow should become LIQUIDATED after winner release');
    console.log('PASS: prealpha modular escrow');
}

async function testRiskMultisig(
    blockchain: Blockchain,
    signer1: Wallet,
    signer2: Wallet,
    signer3: Wallet,
) {
    const risk = blockchain.openContract(
        await TNFTRiskMultisig.fromInit(signer1.address, signer2.address, signer3.address, 5000n, 600n, 86400n),
    );

    await risk.send(signer1.getSender(), { value: toNano('0.03') }, {
        $$type: 'ProposeRiskUpdate',
        nextMaxLtvBps: 4500n,
        nextOracleMaxAge: 500n,
    });
    await risk.send(signer2.getSender(), { value: toNano('0.03') }, { $$type: 'ApproveRiskUpdate' });
    blockchain.now = (blockchain.now ?? 0) + 86401;
    await risk.send(signer1.getSender(), { value: toNano('0.03') }, { $$type: 'ApplyRiskUpdate' });

    const state = await risk.getGetRiskMultisigState();
    assert.equal(state.maxLtvBps, 4500n, 'risk update should be applied after 2/3 approvals and timelock');
    assert.equal(state.riskVersion, 2n, 'risk version should increment');
    console.log('PASS: prealpha modular risk multisig');
}

main().catch((error) => {
    console.error('FAIL: prealpha modular 0.0.1.7 smoke tests');
    console.error(error);
    process.exit(1);
});
