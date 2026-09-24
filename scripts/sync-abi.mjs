import { readFileSync, writeFileSync } from 'node:fs';
const source = JSON.parse(readFileSync(new URL('../packages/contracts/out/Usurp.sol/Usurp.json', import.meta.url)));
writeFileSync(new URL('../apps/web/lib/abi.ts', import.meta.url), `// Generated from Usurp.sol by pnpm contracts:abi.\nexport const usurpAbi = ${JSON.stringify(source.abi, null, 2)} as const;\n`);
console.log('synced Usurp ABI');
