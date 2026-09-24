/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { optimizePackageImports: ['wagmi', 'wagmi/connectors'] },
  webpack(config) {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    // Optional React Native / logging adapters are not used by browser wallets.
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  }
};
// Vercel expects .next; isolate local production checks from the running dev server.
export default phase => ({
  ...nextConfig,
  distDir: process.env.USURP_E2E === '1'
    ? '.next-e2e'
    : process.env.VERCEL === '1' || phase === 'phase-development-server'
      ? '.next'
      : '.next-production'
});
