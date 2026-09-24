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
// Keep production verification separate from the user's running dev server.
export default phase => ({ ...nextConfig, distDir: process.env.USURP_E2E === '1' ? '.next-e2e' : phase === 'phase-development-server' ? '.next' : '.next-production' });
