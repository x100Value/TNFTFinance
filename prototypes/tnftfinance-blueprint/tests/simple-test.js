const fs = require('fs');
const path = require('path');

const modules = [
  {
    name: 'NFTCollateralLoan',
    artifacts: [
      'NFTCollateralLoan_NFTCollateralLoan.abi',
      'NFTCollateralLoan_NFTCollateralLoan.code.boc',
      'NFTCollateralLoan_NFTCollateralLoan.fc',
      'NFTCollateralLoan_NFTCollateralLoan.ts',
    ],
  },
  {
    name: 'TNFTOracleQuorum',
    artifacts: [
      'TNFTOracleQuorum_TNFTOracleQuorum.abi',
      'TNFTOracleQuorum_TNFTOracleQuorum.code.boc',
      'TNFTOracleQuorum_TNFTOracleQuorum.fc',
      'TNFTOracleQuorum_TNFTOracleQuorum.ts',
    ],
  },
  {
    name: 'TNFTLiquidityPool',
    artifacts: [
      'TNFTLiquidityPool_TNFTLiquidityPool.abi',
      'TNFTLiquidityPool_TNFTLiquidityPool.code.boc',
      'TNFTLiquidityPool_TNFTLiquidityPool.fc',
      'TNFTLiquidityPool_TNFTLiquidityPool.ts',
    ],
  },
  {
    name: 'TNFTReserveBackstopVault',
    artifacts: [
      'TNFTReserveBackstopVault_TNFTReserveBackstopVault.abi',
      'TNFTReserveBackstopVault_TNFTReserveBackstopVault.code.boc',
      'TNFTReserveBackstopVault_TNFTReserveBackstopVault.fc',
      'TNFTReserveBackstopVault_TNFTReserveBackstopVault.ts',
    ],
  },
  {
    name: 'TNFTLiquidationAuction',
    artifacts: [
      'TNFTLiquidationAuction_TNFTLiquidationAuction.abi',
      'TNFTLiquidationAuction_TNFTLiquidationAuction.code.boc',
      'TNFTLiquidationAuction_TNFTLiquidationAuction.fc',
      'TNFTLiquidationAuction_TNFTLiquidationAuction.ts',
    ],
  },
  {
    name: 'TNFTCollateralEscrow',
    artifacts: [
      'TNFTCollateralEscrow_TNFTCollateralEscrow.abi',
      'TNFTCollateralEscrow_TNFTCollateralEscrow.code.boc',
      'TNFTCollateralEscrow_TNFTCollateralEscrow.fc',
      'TNFTCollateralEscrow_TNFTCollateralEscrow.ts',
    ],
  },
  {
    name: 'TNFTRiskMultisig',
    artifacts: [
      'TNFTRiskMultisig_TNFTRiskMultisig.abi',
      'TNFTRiskMultisig_TNFTRiskMultisig.code.boc',
      'TNFTRiskMultisig_TNFTRiskMultisig.fc',
      'TNFTRiskMultisig_TNFTRiskMultisig.ts',
    ],
  },
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

for (const module of modules) {
  const buildDir = path.join(__dirname, '..', 'build', module.name);
  if (!fs.existsSync(buildDir)) {
    fail(`Build directory is missing: ${buildDir}`);
  }

  for (const file of module.artifacts) {
    const fullPath = path.join(buildDir, file);
    if (!fs.existsSync(fullPath)) {
      fail(`Missing artifact for ${module.name}: ${file}`);
    }

    const stat = fs.statSync(fullPath);
    if (stat.size === 0) {
      fail(`Artifact is empty for ${module.name}: ${file}`);
    }
  }
}

console.log('PASS: MVP + prealpha modular 0.0.1.7 artifacts are present and non-empty.');
