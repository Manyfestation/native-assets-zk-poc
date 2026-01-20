/**
 * Token Store - Server-side token management
 * Each token has its own covenant, setup metrics, and ledger
 */

import crypto from 'crypto';

// In-memory token storage (simulates on-chain state)
const tokens = new Map();

// Default token (created on startup)
const DEFAULT_TOKEN = {
    id: 'default',
    name: 'Default Token',
    covenant: '0x0102030405060708',  // Single BigInt-compatible value
    createdAt: Date.now(),
    setupMetrics: {
        time: 360,
        constraints: 570,
        zkeySize: 15000,
        peakMemoryMB: null
    },
    ledger: {
        server: 1000
    }
};

tokens.set('default', DEFAULT_TOKEN);

/**
 * Generate covenant from token ID
 * Creates a unique script hash as a BigInt-compatible hex string
 */
export function generateCovenant(tokenId) {
    const hash = crypto.createHash('sha256').update(tokenId).digest();
    // Return as hex string (BigInt-compatible) instead of array
    return '0x' + hash.slice(0, 8).toString('hex');
}

/**
 * Create a new token
 */
export function createToken(id, name, setupMetrics) {
    const covenant = generateCovenant(id);
    const token = {
        id,
        name,
        covenant,
        createdAt: Date.now(),
        setupMetrics,
        ledger: {
            server: 1000 // Initial supply
        }
    };
    tokens.set(id, token);
    return token;
}

/**
 * Get all tokens
 */
export function getAllTokens() {
    return Array.from(tokens.values());
}

/**
 * Get token by ID
 */
export function getToken(id) {
    return tokens.get(id);
}

/**
 * Get token ledger
 */
export function getTokenLedger(tokenId) {
    const token = tokens.get(tokenId);
    return token ? token.ledger : null;
}

/**
 * Update token ledger
 */
export function updateTokenLedger(tokenId, from, to, amount) {
    const token = tokens.get(tokenId);
    if (!token) throw new Error('Token not found');

    const currentBalance = token.ledger[from] || 0;
    if (currentBalance < amount) {
        throw new Error(`Ledger update failed: ${from} has ${currentBalance} tokens but tried to send ${amount}. Hint: The ZK proof was valid, but the state transition is invalid.`);
    }

    token.ledger[from] -= amount;
    token.ledger[to] = (token.ledger[to] || 0) + amount;

    return token.ledger;
}

/**
 * Register wallet for token
 */
export function registerTokenWallet(tokenId, userId) {
    const token = tokens.get(tokenId);
    if (!token) throw new Error('Token not found');

    if (!token.ledger[userId]) {
        token.ledger[userId] = 0;
    }
    return token.ledger[userId];
}

/**
 * Reset token ledger
 */
export function resetTokenLedger(tokenId) {
    const token = tokens.get(tokenId);
    if (!token) throw new Error('Token not found');

    token.ledger = { server: 1000 };
    return token.ledger;
}
