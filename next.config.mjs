import createNextIntlPlugin from 'next-intl/plugin'

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Next.js 16 blocks /_next/* cross-origin in dev unless listed here.
  // Required for Cloudflare Tunnel / reverse-proxy Host headers.
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '*.trycloudflare.com',
    '*.trycloudflare.dev',
  ],
  devIndicators: false,
  turbopack: {},
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
      allowedOrigins: [
        'localhost:3000',
        'localhost:80',
        'localhost:8080',
        'localhost',
        '*.trycloudflare.com',
        '*.trycloudflare.dev'
      ],
    },
  },
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Disable WebSocket HMR; use polling instead so the dev server works
      // behind reverse proxies / tunnels (e.g. Cloudflare) that don't support
      // the WebSocket handshake reliably.
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      }
      config.plugins = config.plugins.filter(
        (plugin) => plugin.constructor.name !== 'HotModuleReplacementPlugin'
      )
      if (config.devServer) {
        config.devServer.hot = false
        config.devServer.client = { webSocketTransport: false }
      }
    }
    return config
  },
}

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

export default withNextIntl(nextConfig)
