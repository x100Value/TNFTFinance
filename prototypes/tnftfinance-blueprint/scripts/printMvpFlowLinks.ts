import { Address, beginCell, toNano } from '@ton/core';
import {
    storeFundLoan,
    storeRepay,
    storeSetOraclePrice,
} from '../build/NFTCollateralLoan/NFTCollateralLoan_NFTCollateralLoan';

type ActionConfig = {
    name: string;
    amount: bigint;
    body: ReturnType<typeof beginCell>;
};

function envOrDefault(name: string, fallback: string): string {
    const raw = process.env[name];
    return raw && raw.trim().length > 0 ? raw.trim() : fallback;
}

function toTonLink(address: Address, amount: bigint, bodyBocBase64Url: string): string {
    const recipient = address.toString({ bounceable: true, urlSafe: true, testOnly: false });
    return `ton://transfer/${recipient}?amount=${amount.toString()}&bin=${bodyBocBase64Url}`;
}

function main() {
    const contractAddress = Address.parse(
        envOrDefault('MVP_CONTRACT_ADDRESS', 'EQDNj4-A8lILD6G3YXvEQWbMreziRuCGkbu2Tbb6xuPJjQUE'),
    );

    const now = BigInt(Math.floor(Date.now() / 1000));
    const oraclePrice = toNano(envOrDefault('MVP_ORACLE_PRICE_TON', '1'));
    const oracleMsgValue = toNano(envOrDefault('MVP_ORACLE_TX_TON', '0.05'));
    const fundMsgValue = toNano(envOrDefault('MVP_FUND_TX_TON', '0.25'));
    const repayMsgValue = toNano(envOrDefault('MVP_REPAY_TX_TON', '0.23'));

    const actions: ActionConfig[] = [
        {
            name: 'SET_ORACLE_PRICE',
            amount: oracleMsgValue,
            body: beginCell().store(storeSetOraclePrice({ $$type: 'SetOraclePrice', price: oraclePrice, updatedAt: now })),
        },
        {
            name: 'FUND_LOAN',
            amount: fundMsgValue,
            body: beginCell().store(storeFundLoan({ $$type: 'FundLoan' })),
        },
        {
            name: 'REPAY_LOAN',
            amount: repayMsgValue,
            body: beginCell().store(storeRepay({ $$type: 'Repay' })),
        },
    ];

    console.log(`CONTRACT=${contractAddress.toString({ bounceable: true, urlSafe: true, testOnly: false })}`);
    console.log(`ORACLE_UPDATED_AT=${now.toString()}`);
    console.log(`ORACLE_PRICE_NANOTON=${oraclePrice.toString()}`);
    console.log('');

    for (const action of actions) {
        const bodyCell = action.body.endCell();
        const bodyBoc = bodyCell.toBoc({ idx: false }).toString('base64url');
        console.log(`${action.name}_AMOUNT_NANOTON=${action.amount.toString()}`);
        console.log(`${action.name}_LINK=${toTonLink(contractAddress, action.amount, bodyBoc)}`);
        console.log('');
    }
}

main();
