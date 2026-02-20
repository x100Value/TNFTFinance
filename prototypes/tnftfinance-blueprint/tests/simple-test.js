const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build', 'NFTCollateralLoan');
const requiredArtifacts = [
  'NFTCollateralLoan_NFTCollateralLoan.abi',
  'NFTCollateralLoan_NFTCollateralLoan.code.boc',
  'NFTCollateralLoan_NFTCollateralLoan.fc',
  'NFTCollateralLoan_NFTCollateralLoan.ts',
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(buildDir)) {
  fail(`Build directory is missing: ${buildDir}`);
}

for (const file of requiredArtifacts) {
  const fullPath = path.join(buildDir, file);
  if (!fs.existsSync(fullPath)) {
    fail(`Missing artifact: ${file}`);
  }

  const stat = fs.statSync(fullPath);
  if (stat.size === 0) {
    fail(`Artifact is empty: ${file}`);
  }
}

console.log('PASS: Blueprint compile artifacts are present and non-empty.');
