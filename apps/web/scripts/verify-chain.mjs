// Local-only integration check. Keys are random, ephemeral, and never printed.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient, http, parseAbi, parseEther } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const rpc = 'http://127.0.0.1:18545';
const chain = { id: 10143, name: 'local Monad', nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 }, rpcUrls: { default: { http: [rpc] } } };
const key = generatePrivateKey(), owner = privateKeyToAccount(key), house = privateKeyToAccount(generatePrivateKey());
const publicClient = createPublicClient({ chain, transport: http(rpc), pollingInterval: 100 });
const wallet = createWalletClient({ chain, account: owner, transport: http(rpc) });
const manifestURL = new URL('../public/deployments/monad-testnet.json', import.meta.url);
const backup = readFileSync(manifestURL);
const server = spawn('anvil', ['--port', '18545', '--chain-id', '10143', '--network', 'monad', '--mnemonic-random', '12', '--silent'], { stdio: 'ignore', windowsHide: true });
let serverError;
server.on('error', error => { serverError = error; });
async function command(program, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', b => { log += b; }); child.stderr.on('data', b => { log += b; });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(log.replaceAll(key, '[redacted]'))));
  });
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (serverError) throw serverError;
    try { await publicClient.getChainId(); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!ready) throw new Error('local Anvil did not start');
  await publicClient.request({ method: 'anvil_setBalance', params: [owner.address, `0x${parseEther('100').toString(16)}`] });
  await command(process.execPath, ['scripts/deploy.mjs'], { ...process.env, PRIVATE_KEY: key, HOUSE_ADDRESS: house.address, MONAD_RPC_URL: rpc });
  const deployment = JSON.parse(readFileSync(manifestURL));
  assert.equal(deployment.chainId, 10143);
  assert.ok(BigInt(deployment.deploymentBlock) > 0n);
  assert.ok((await publicClient.getCode({ address: deployment.usurp })).length > 2);
  const abi = JSON.parse(readFileSync(new URL('../../../packages/contracts/out/Usurp.sol/Usurp.json', import.meta.url))).abi;
  const tokenAbi = parseAbi(['function mint(address,uint256)', 'function approve(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)']);
  const read = () => publicClient.readContract({ address: deployment.usurp, abi, functionName: 'getState' });
  async function send(address, abi, functionName, args = []) {
    const hash = await wallet.writeContract({ address, abi, functionName, args, gas: 2_000_000n });
    const receipt = await publicClient.waitForTransactionReceipt({ hash }); assert.equal(receipt.status, 'success');
  }
  await send(deployment.usdc, tokenAbi, 'mint', [owner.address, 1000_000000n]);
  await send(deployment.usdc, tokenAbi, 'approve', [deployment.usurp, 1000_000000n]);
  await send(deployment.usurp, abi, 'take', ['the deploy script works.']);
  let state = await read();
  assert.equal(state.currentPrice, 13_500000n);
  await publicClient.request({ method: 'evm_increaseTime', params: [300] });
  await publicClient.request({ method: 'anvil_mine', params: ['0x12c'] });
  // anyone can settle: it pays the holder and opens round two with the rollover as its pot, no owner step
  await send(deployment.usurp, abi, 'settle');
  state = await read(); assert.equal(state.status, 1); assert.equal(state.roundId, 2n); assert.equal(state.holder, '0x0000000000000000000000000000000000000000');
  const balance = await publicClient.readContract({ address: deployment.usdc, abi: tokenAbi, functionName: 'balanceOf', args: [deployment.usurp] });
  assert.equal(balance, state.potBalance);
  await send(deployment.usurp, abi, 'seedRound', [0n, 10_000000n]); // an optional owner top-up never resets the round
  const next = await read(); assert.equal(next.roundId, 2n); assert.equal(next.potBalance, balance);
  console.log('local Monad integration passed: deploy, mined address manifest, approve, take, 300-block settle into round two, and top-up.');
} finally {
  writeFileSync(manifestURL, backup);
  server.kill();
}
