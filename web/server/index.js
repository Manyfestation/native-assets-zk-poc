/**
 * Express API Server
 * Handles trusted setup, token management, ledger state, and proof verification
 */

import express from 'express';
import cors from 'cors';
import * as snarkjs from 'snarkjs';
import { readFileSync, existsSync, writeFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    getAllTokens,
    getToken,
    createToken,
    getTokenLedger,
    registerTokenWallet,
    resetTokenLedger,
    generateCovenant
} from './tokens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.join(__dirname, '..', 'public', 'circuits');
const PTAU_PATH = path.join(__dirname, '..', '..', 'circuits', 'pot15_final.ptau');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files
app.use('/circuits', express.static(BUILD_DIR));

// Serve frontend in production
const DIST_DIR = path.join(__dirname, '..', 'dist');
if (existsSync(DIST_DIR)) {
    app.use(express.static(DIST_DIR));

    // SPA fallback: any route not handled by API or static files returns index.html
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/circuits')) {
            return res.status(404).json({ error: 'Not found' });
        }
        res.sendFile(path.join(DIST_DIR, 'index.html'));
    });
}

// ===========================================
// TOKEN MANAGEMENT
// ===========================================

/**
 * GET /api/tokens
 * List all deployed tokens
 */
app.get('/api/tokens', (req, res) => {
    res.json(getAllTokens());
});

/**
 * POST /api/tokens/deploy
 * Deploy a new token with client-provided verification key
 * The trusted setup runs in the browser - server only stores the vkey
 */
app.post('/api/tokens/deploy', async (req, res) => {
    const { tokenId, tokenName, vkey, setupMetrics } = req.body;

    if (!tokenId || !tokenName) {
        return res.status(400).json({ error: 'tokenId and tokenName required' });
    }

    // Sanitize tokenId - keep only alphanumeric and underscores
    const sanitizedId = tokenId.replace(/[^a-z0-9_]/gi, '').toLowerCase();
    if (!sanitizedId) {
        return res.status(400).json({ error: 'Token ID must contain alphanumeric characters' });
    }

    // Check if token already exists
    if (getToken(sanitizedId)) {
        return res.status(400).json({ error: 'Token ID already exists' });
    }

    // vkey is required - trusted setup must run in browser
    if (!vkey) {
        return res.status(400).json({ error: 'Verification key (vkey) required. Run trusted setup in browser.' });
    }

    try {
        // Save vkey to file for verification
        const vkeyPath = path.join(BUILD_DIR, `${sanitizedId}_vkey.json`);
        writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));

        const token = createToken(sanitizedId, tokenName, setupMetrics || {
            time: null,
            constraints: 570,
            zkeySize: null,
            peakMemoryMB: null,
            ranInBrowser: true
        });

        res.json({
            token,
            message: 'Token deployed successfully'
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/tokens/:id
 * Get token details
 */
app.get('/api/tokens/:id', (req, res) => {
    const token = getToken(req.params.id);
    if (!token) {
        return res.status(404).json({ error: 'Token not found' });
    }
    res.json(token);
});

/**
 * GET /api/tokens/:id/ledger
 * Get token ledger
 */
app.get('/api/tokens/:id/ledger', (req, res) => {
    const ledger = getTokenLedger(req.params.id);
    if (!ledger) {
        return res.status(404).json({ error: 'Token not found' });
    }
    res.json({ ledger, covenant: getToken(req.params.id).covenant });
});

/**
 * POST /api/tokens/:id/register
 * Register wallet for a token
 */
app.post('/api/tokens/:id/register', (req, res) => {
    const { userId } = req.body;
    try {
        const balance = registerTokenWallet(req.params.id, userId);
        res.json({ success: true, balance });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/tokens/:id/verify
 * Verify proof and update token ledger
 * 
 * The server (acting as blockchain) does:
 * 1. Verify the ZK proof cryptographically
 * 2. Check that public inputs (inputAmounts) match the current ledger
 * 3. Apply the new balances from outputAmounts to the ledger
 * 
 * NO duplicate balance checking logic - the circuit already proved validity!
 */
app.post('/api/tokens/:id/verify', async (req, res) => {
    const { proof, publicSignals, from, to } = req.body;
    const tokenId = req.params.id;

    const token = getToken(tokenId);
    if (!token) {
        return res.status(404).json({ error: 'Token not found' });
    }

    // Use token-specific vkey if exists, otherwise default
    let vkeyPath = path.join(BUILD_DIR, `${tokenId}_vkey.json`);
    if (!existsSync(vkeyPath)) {
        vkeyPath = path.join(BUILD_DIR, 'verification_key.json');
    }

    if (!existsSync(vkeyPath)) {
        return res.status(500).json({ error: 'Verification key not found' });
    }

    try {
        const vkey = JSON.parse(readFileSync(vkeyPath, 'utf8'));

        // === STEP 1: Verify the ZK proof ===
        const start = Date.now();
        const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        const verifyTime = Date.now() - start;

        if (!isValid) {
            return res.json({ valid: false, verifyTime, error: 'ZK proof cryptographically invalid' });
        }

        // === STEP 2: Parse public signals ===
        // Circom order: outputs first, then public inputs
        // publicSignals[0] = outputCommitment (circuit output)
        // publicSignals[1] = inputAmount (public input)
        // publicSignals[2..11] = outputAmounts[0..9] (public input array)
        const MAX_OUTPUTS = 10;
        const outputCommitment = publicSignals[0]; // Just for reference
        const inputAmount = parseInt(publicSignals[1]);
        const outputAmounts = publicSignals.slice(2, 2 + MAX_OUTPUTS).map(s => parseInt(s));

        // In our UTXO model: 
        // - inputAmount = sender's old balance (single input)
        // - outputAmounts[0] = amount to receiver
        // - outputAmounts[1] = sender's change (new balance)
        const senderOldBalance = inputAmount;
        const receiverAmount = outputAmounts[0];
        const senderNewBalance = outputAmounts[1];

        // === STEP 3: Validate sender's claimed balance matches ledger ===
        const currentSenderBalance = token.ledger[from] || 0;

        if (currentSenderBalance !== senderOldBalance) {
            return res.json({
                valid: false,
                verifyTime,
                error: `State mismatch: proof claims sender has ${senderOldBalance} but ledger shows ${currentSenderBalance}`
            });
        }

        // === STEP 4: Apply new state from proof ===
        // The circuit proved: inputAmounts[0] == outputAmounts[0] + outputAmounts[1]
        // So we just apply the outputs!
        token.ledger[from] = senderNewBalance;
        token.ledger[to] = (token.ledger[to] || 0) + receiverAmount;

        res.json({
            valid: true,
            verifyTime,
            ledger: token.ledger,
            stateTransition: {
                from,
                to,
                amount: receiverAmount,
                senderOldBalance,
                senderNewBalance,
                receiverNewBalance: token.ledger[to]
            }
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/tokens/:id/reset
 * Reset token ledger
 */
app.post('/api/tokens/:id/reset', (req, res) => {
    try {
        const ledger = resetTokenLedger(req.params.id);
        res.json({ ledger });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ===========================================
// LEGACY ENDPOINTS (for backwards compatibility)
// ===========================================

/**
 * GET /api/ledger - Default token ledger
 */
app.get('/api/ledger', (req, res) => {
    const ledger = getTokenLedger('default');
    res.json({ balances: ledger, timestamp: Date.now() });
});

/**
 * GET /api/server-wallet
 */
app.get('/api/server-wallet', (req, res) => {
    const token = getToken('default');
    res.json({ scriptPubKey: token.covenant });
});

/**
 * POST /api/register
 */
app.post('/api/register', (req, res) => {
    const { userId } = req.body;
    try {
        const balance = registerTokenWallet('default', userId);
        res.json({ success: true, balance, ledger: { balances: getTokenLedger('default') } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

/**
 * POST /api/verify (Legacy - uses default token)
 */
app.post('/api/verify', async (req, res) => {
    const { proof, publicSignals, from, to } = req.body;

    const vkeyPath = path.join(BUILD_DIR, 'verification_key.json');
    if (!existsSync(vkeyPath)) {
        return res.status(500).json({ error: 'Verification key not found' });
    }

    const token = getToken('default');

    try {
        const vkey = JSON.parse(readFileSync(vkeyPath, 'utf8'));
        const start = Date.now();
        const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        const verifyTime = Date.now() - start;

        if (!isValid) {
            return res.json({ valid: false, verifyTime, error: 'ZK proof cryptographically invalid' });
        }

        // Parse UTXO public signals (Circom order: outputs first, then public inputs)
        // publicSignals[0] = outputCommitment, [1] = inputAmount, [2..11] = outputAmounts
        const MAX_OUTPUTS = 10;
        const inputAmount = parseInt(publicSignals[1]);
        const outputAmounts = publicSignals.slice(2, 2 + MAX_OUTPUTS).map(s => parseInt(s));

        const senderOldBalance = inputAmount;
        const receiverAmount = outputAmounts[0];
        const senderNewBalance = outputAmounts[1];

        // Validate sender's balance matches ledger
        const currentSenderBalance = token.ledger[from] || 0;

        if (currentSenderBalance !== senderOldBalance) {
            return res.json({
                valid: false,
                verifyTime,
                error: `State mismatch: proof claims sender has ${senderOldBalance} but ledger shows ${currentSenderBalance}`
            });
        }

        // Apply new state
        token.ledger[from] = senderNewBalance;
        token.ledger[to] = (token.ledger[to] || 0) + receiverAmount;

        res.json({ valid: true, verifyTime, ledger: { balances: token.ledger } });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/reset
 */
app.post('/api/reset', (req, res) => {
    const ledger = resetTokenLedger('default');
    res.json({ balances: ledger });
});

/**
 * GET /api/setup-status
 */
app.get('/api/setup-status', (req, res) => {
    const zkeyPath = path.join(BUILD_DIR, 'native_token.zkey');
    const vkeyPath = path.join(BUILD_DIR, 'verification_key.json');
    const wasmPath = path.join(BUILD_DIR, 'native_token_js', 'native_token.wasm');

    const setupTime = existsSync(zkeyPath) ? 360 : null;

    res.json({
        hasZkey: existsSync(zkeyPath),
        hasVkey: existsSync(vkeyPath),
        hasWasm: existsSync(wasmPath),
        ready: existsSync(zkeyPath) && existsSync(vkeyPath) && existsSync(wasmPath),
        setupTime
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`[SERVER] API running on http://localhost:${PORT}`);
    console.log(`[SERVER] Serving circuit artifacts from: ${BUILD_DIR}`);
});
