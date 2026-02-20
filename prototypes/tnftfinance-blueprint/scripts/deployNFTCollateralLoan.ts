import { toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { NFTCollateralLoan } from '../build/NFTCollateralLoan/NFTCollateralLoan_NFTCollateralLoan';

export async function run(provider: NetworkProvider) {
    const senderAddress = provider.sender().address;
    if (!senderAddress) {
        throw new Error('Sender address is required for deploy');
    }

    const nFTCollateralLoan = provider.open(await NFTCollateralLoan.fromInit(senderAddress));
    const contractAddress = nFTCollateralLoan.address.toString();

    provider.ui().write(`Network: ${provider.network()}`);
    provider.ui().write(`Target address: ${contractAddress}`);

    const alreadyDeployed = await provider.isContractDeployed(nFTCollateralLoan.address);
    if (alreadyDeployed) {
        provider.ui().write('Contract is already deployed, skipping deploy transaction.');
        return;
    }

    await nFTCollateralLoan.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    await provider.waitForDeploy(nFTCollateralLoan.address);
    provider.ui().write(`Deployed NFTCollateralLoan at: ${contractAddress}`);
}
