import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const env = process.env;
if (!/^0x[\da-f]{64}$/i.test(env.PRIVATE_KEY || '')) throw new Error('Set PRIVATE_KEY in root .env.');
if (!/^0x[\da-f]{40}$/i.test(env.HOUSE_ADDRESS || '') || /^0x0{40}$/i.test(env.HOUSE_ADDRESS)) throw new Error('Set a nonzero HOUSE_ADDRESS in root .env.');
function units(value) {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error('USDC amounts must have at most 6 decimal places.');
  const [a, b = ''] = value.split('.');
  return (BigInt(a) * 1000000n + BigInt(b.padEnd(6, '0'))).toString();
}
const rpc = env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const chain = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) }).then(r => r.json());
if (Number(chain.result) !== 10143) throw new Error('RPC must point to Monad testnet (10143).');
const manifest = new URL('../apps/web/public/deployments/monad-testnet.json', import.meta.url);
const previous = readFileSync(manifest);
const result = spawnSync('forge', ['script', 'script/Deploy.s.sol:Deploy', '--rpc-url', rpc, '--broadcast', '--slow'], {
  cwd: new URL('../packages/contracts', import.meta.url), stdio: 'inherit', shell: false,
  env: { ...env, SEED_AMOUNT: units(env.SEED_USDC || '1000'), START_PRICE: units(env.START_PRICE_USDC || '10') }
});
if (result.error || result.status !== 0) {
  writeFileSync(manifest, previous);
  throw new Error('Deployment failed; prior manifest restored. Inspect Foundry broadcast receipts before retrying.');
}
const receipt = JSON.parse(readFileSync(new URL('../packages/contracts/broadcast/Deploy.s.sol/10143/run-latest.json', import.meta.url)));
const address = JSON.parse(readFileSync(manifest)).usurp.toLowerCase();
const created = receipt.receipts.find(r => r.contractAddress?.toLowerCase() === address);
if (!created) { writeFileSync(manifest, previous); throw new Error('Missing mined Usurp receipt; manifest restored.'); }
const deployment = JSON.parse(readFileSync(manifest));
deployment.deploymentBlock = BigInt(created.blockNumber).toString();
writeFileSync(manifest, JSON.stringify(deployment, null, 2) + '\n');
console.log('Monad testnet deployment confirmed. Frontend manifest updated.');
