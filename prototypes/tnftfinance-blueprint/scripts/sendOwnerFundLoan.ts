import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { NFTCollateralLoan } from '../build/NFTCollateralLoan/NFTCollateralLoan_NFTCollateralLoan';
import { envOrDefault, sendWithRetry } from './lib/sendRetry';

export async function run(provider: NetworkProvider) {
    const sender = provider.sender().address;
    if (!sender) {
        throw new Error('Sender wallet is required. Use --mnemonic or --tonconnect.');
    }

    const contractAddress = Address.parse(
        envOrDefault('MVP_CONTRACT_ADDRESS', 'EQCYJTv8NjBreuw9JaiCb-ZqTtjsJnEg-0uoVu8uW3qZCDWn'),
    );
    const txValue = toNano(envOrDefault('MVP_FUND_TX_TON', '0.25'));
    const contract = provider.open(NFTCollateralLoan.fromAddress(contractAddress));

    provider.ui().write(`Network: ${provider.network()}`);
    provider.ui().write(`Sender: ${sender.toString()}`);
    provider.ui().write(`Contract: ${contractAddress.toString()}`);
    provider.ui().write(`Tx value: ${txValue.toString()} nanotons`);

    await sendWithRetry(provider.ui(), 'FundLoan', async () => {
        await contract.send(provider.sender(), { value: txValue }, { $$type: 'FundLoan' });
    });
    provider.ui().write('FundLoan transaction sent.');
}
