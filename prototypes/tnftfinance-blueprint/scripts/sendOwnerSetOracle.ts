import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { NFTCollateralLoan } from '../build/NFTCollateralLoan/NFTCollateralLoan_NFTCollateralLoan';
import { envOrDefault, sendWithRetry } from './lib/sendRetry';

function envPositiveInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw || raw.trim().length === 0) {
        return fallback;
    }

    const value = Number(raw.trim());
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer`);
    }
    return Math.floor(value);
}

export async function run(provider: NetworkProvider) {
    const sender = provider.sender().address;
    if (!sender) {
        throw new Error('Sender wallet is required. Use --mnemonic or --tonconnect.');
    }

    const contractAddress = Address.parse(
        envOrDefault('MVP_CONTRACT_ADDRESS', 'EQCYJTv8NjBreuw9JaiCb-ZqTtjsJnEg-0uoVu8uW3qZCDWn'),
    );
    const oraclePrice = toNano(envOrDefault('MVP_ORACLE_PRICE_TON', '1'));
    const txValue = toNano(envOrDefault('MVP_ORACLE_TX_TON', '0.05'));
    const skewSeconds = envPositiveInt('MVP_ORACLE_UPDATED_AT_SKEW_SECONDS', 300);
    const updatedAt = BigInt(Math.floor(Date.now() / 1000) - skewSeconds);

    const contract = provider.open(NFTCollateralLoan.fromAddress(contractAddress));

    provider.ui().write(`Network: ${provider.network()}`);
    provider.ui().write(`Sender: ${sender.toString()}`);
    provider.ui().write(`Contract: ${contractAddress.toString()}`);
    provider.ui().write(`Oracle price: ${oraclePrice.toString()} nanotons`);
    provider.ui().write(`Oracle updatedAt: ${updatedAt.toString()} (skew ${skewSeconds}s)`);
    provider.ui().write(`Tx value: ${txValue.toString()} nanotons`);

    await sendWithRetry(provider.ui(), 'SetOraclePrice', async () => {
        await contract.send(
            provider.sender(),
            { value: txValue },
            { $$type: 'SetOraclePrice', price: oraclePrice, updatedAt },
        );
    });

    provider.ui().write('SetOraclePrice transaction sent.');
}
