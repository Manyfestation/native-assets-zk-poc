/**
 * Server-side ledger state
 * Tracks token balances for server and connected users
 */

// Server wallet identity (hardcoded script pubkey)
export const SERVER_WALLET = [1, 2, 3, 4, 5, 6, 7, 8];

// Initial ledger state
let ledger = {
    balances: {
        server: 1000  // Server starts with 1000 tokens
    },
    // Track wallet addresses for users
    wallets: {
        server: SERVER_WALLET
    },
    // Transaction history
    history: []
};

/**
 * Get current ledger state
 */
export function getLedger() {
    return {
        ...ledger,
        timestamp: Date.now()
    };
}

/**
 * Register a new user wallet
 */
export function registerWallet(userId, scriptPubKey) {
    if (!ledger.balances[userId]) {
        ledger.balances[userId] = 0;
        ledger.wallets[userId] = scriptPubKey;
    }
    return ledger.balances[userId];
}

/**
 * Update ledger after verified transaction
 */
export function updateLedger(from, to, amount, proofHash) {
    if (ledger.balances[from] < amount) {
        throw new Error(`Insufficient balance: ${from} has ${ledger.balances[from]}, needs ${amount}`);
    }

    ledger.balances[from] -= amount;
    ledger.balances[to] = (ledger.balances[to] || 0) + amount;

    ledger.history.push({
        from,
        to,
        amount,
        proofHash,
        timestamp: Date.now()
    });

    return getLedger();
}

/**
 * Reset ledger to initial state (for demo purposes)
 */
export function resetLedger() {
    ledger = {
        balances: { server: 1000 },
        wallets: { server: SERVER_WALLET },
        history: []
    };
    return getLedger();
}

/**
 * Get wallet script pubkey
 */
export function getWallet(userId) {
    return ledger.wallets[userId] || null;
}
