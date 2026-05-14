import type {NextConfig} from 'next';
const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['pdfjs-dist', 'pdf-parse'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.postimg.cc',
        port: '',
        pathname: '/**',
      }
    ],
  },
  transpilePackages: ['@langchain/core', '@langchain/google-genai'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.extensionAlias = {
        '.js': ['.js', '.ts', '.tsx'],
        '.jsx': ['.jsx', '.tsx'],
      };
    }

    // Fix missing OpenTelemetry peer dependencies
    config.resolve.alias = {
      ...config.resolve.alias,
      '@opentelemetry/winston-transport': false,
      '@opentelemetry/exporter-jaeger': false,
    };

    return config;
  },
};
export default nextConfig;
