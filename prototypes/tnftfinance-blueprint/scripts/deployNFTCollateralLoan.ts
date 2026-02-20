import { toNano } from '@ton/core';
import { NFTCollateralLoan } from '../build/NFTCollateralLoan/NFTCollateralLoan_NFTCollateralLoan';
import { NetworkProvider } from '@ton/blueprint';

export async function run(provider: NetworkProvider) {
    const nFTCollateralLoan = provider.open(await NFTCollateralLoan.fromInit());

    await nFTCollateralLoan.send(
        provider.sender(),
        {
            value: toNano('0.05'),
        },
        null,
    );

    await provider.waitForDeploy(nFTCollateralLoan.address);

    // run methods on `nFTCollateralLoan`
}
