import { Address, toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { NFTCollateralLoan } from '../build/NFTCollateralLoan/NFTCollateralLoan_NFTCollateralLoan';

function envNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw || raw.trim().length === 0) {
        return fallback;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be a positive number`);
    }

    return value;
}

function envAddress(name: string, fallback: Address): Address {
    const raw = process.env[name];
    if (!raw || raw.trim().length === 0) {
        return fallback;
    }

    return Address.parse(raw.trim());
}

export async function run(provider: NetworkProvider) {
    const ownerFromEnv = process.env.MVP_OWNER_ADDRESS?.trim();
    const ownerFromEnvAddress = ownerFromEnv ? Address.parse(ownerFromEnv) : null;
    const senderAddress = provider.sender().address ?? ownerFromEnvAddress;
    if (!senderAddress) {
        throw new Error('Sender address is required for deploy. Set MVP_OWNER_ADDRESS for deeplink flow.');
    }
    const allowOwnerMismatch = process.env.MVP_ALLOW_OWNER_MISMATCH === 'true';
    if (
        provider.sender().address &&
        ownerFromEnvAddress &&
        senderAddress.toRawString() !== ownerFromEnvAddress.toRawString() &&
        !allowOwnerMismatch
    ) {
        throw new Error(
            `Sender wallet ${senderAddress.toString()} does not match MVP_OWNER_ADDRESS ${ownerFromEnvAddress.toString()}. ` +
                'Refusing deploy to avoid accidental extra deployment. Set MVP_ALLOW_OWNER_MISMATCH=true to override.',
        );
    }

    const borrower = envAddress('MVP_BORROWER_ADDRESS', senderAddress);
    const collateralNft = envAddress('MVP_COLLATERAL_NFT_ADDRESS', senderAddress);

    const principal = toNano(process.env.MVP_PRINCIPAL_TON ?? '0.2');
    const repayAmount = toNano(process.env.MVP_REPAY_TON ?? '0.22');
    const termSeconds = envNumber('MVP_TERM_SECONDS', 86400);
    const maxLtvBps = envNumber('MVP_MAX_LTV_BPS', 5000);
    const oracleMaxAge = envNumber('MVP_ORACLE_MAX_AGE', 600);
    const riskTimelock = envNumber('MVP_RISK_TIMELOCK_SECONDS', 86400);

    if (repayAmount < principal) {
        throw new Error('MVP_REPAY_TON must be greater than or equal to MVP_PRINCIPAL_TON');
    }

    const nFTCollateralLoan = provider.open(
        await NFTCollateralLoan.fromInit(
            senderAddress,
            borrower,
            collateralNft,
            principal,
            repayAmount,
            BigInt(termSeconds),
            BigInt(maxLtvBps),
            BigInt(oracleMaxAge),
            BigInt(riskTimelock),
        ),
    );

    const contractAddress = nFTCollateralLoan.address.toString();

    provider.ui().write(`Network: ${provider.network()}`);
    provider.ui().write(`Target address: ${contractAddress}`);
    provider.ui().write(`Borrower: ${borrower.toString()}`);
    provider.ui().write(`Collateral placeholder: ${collateralNft.toString()}`);
    provider.ui().write(`Principal: ${principal.toString()} nanotons`);
    provider.ui().write(`Repay amount: ${repayAmount.toString()} nanotons`);

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
