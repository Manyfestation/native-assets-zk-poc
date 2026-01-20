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
        emptyOutDir: true
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
            }
        }
    }
});
