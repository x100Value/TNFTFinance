import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { NFTCollateralLoan } from '../build/NFTCollateralLoan/NFTCollateralLoan_NFTCollateralLoan';
import '@ton/test-utils';

describe('NFTCollateralLoan', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let nFTCollateralLoan: SandboxContract<NFTCollateralLoan>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        nFTCollateralLoan = blockchain.openContract(await NFTCollateralLoan.fromInit());

        deployer = await blockchain.treasury('deployer');

        const deployResult = await nFTCollateralLoan.send(
            deployer.getSender(),
            {
                value: toNano('0.05'),
            },
            null,
        );

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nFTCollateralLoan.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and nFTCollateralLoan are ready to use
    });
});
