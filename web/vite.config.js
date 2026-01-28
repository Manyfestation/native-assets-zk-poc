import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    root: 'src',
    publicDir: '../public',
    plugins: [
        nodePolyfills({
            // Enable polyfills needed by circomlibjs
            include: ['buffer', 'util', 'events', 'stream', 'crypto']
        })
    ],
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: 'src/index.html',
                legacy: 'src/legacy_dashboard.html'
            }
        }
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true
            },
            '/circuits': {
                target: 'http://localhost:3001',
                changeOrigin: true
            },
            // Only proxy artifact requests, not the JS prover implementations
            '/provers/gnark/artifacts': {
                target: 'http://localhost:3001',
                changeOrigin: true
            }
        }
    }
});
