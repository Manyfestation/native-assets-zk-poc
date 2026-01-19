/**
 * Main Application Controller
 * 
 * Orchestrates the token dashboard by coordinating:
 * - ZK operations (zk-logic.js) - proof generation, witness building
 * - UI operations (ui.js) - DOM updates, logging, visual state
 * - API communication - server requests for tokens and verification
 */

import {
    generateWallet,
    buildWitness,
    generateProof,
    runTrustedSetup
} from './zk-logic.js';

import {
    log,
    logSummary,
    updateLedger,
    updateMetrics,
    resetMetrics,
    formatBytes,
    setStatusReady,
    setStatusError,
    setButtonsEnabled,
    setLoading,
    showWalletAddress,
    enableProofDownload,
    hideProofDownload,
    setCurrentTokenName,
    setServerAddress,
    renderTokenList,
    openDeployModal,
    closeDeployModal,
    getTokenNameInput,
    getTransferAmount,
    bindEvents,
    elements
} from './ui.js';

// === APPLICATION STATE ===
let userWallet = null;
let userId = null;
let currentToken = null;
let tokens = [];
let lastProof = null;
let lastPublicSignals = null;

// === API COMMUNICATION ===

async function fetchTokens() {
    const response = await fetch('/api/tokens');
    return response.json();
}

async function fetchToken(tokenId) {
    const response = await fetch(`/api/tokens/${tokenId}`);
    return response.json();
}

async function fetchLedger(tokenId) {
    const response = await fetch(`/api/tokens/${tokenId}/ledger`);
    return response.json();
}

async function registerUser(tokenId, userId) {
    return fetch(`/api/tokens/${tokenId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
    });
}

async function submitProof(tokenId, proof, publicSignals, from, to, amount) {
    const response = await fetch(`/api/tokens/${tokenId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proof, publicSignals, from, to, amount })
    });
    return response.json();
}

async function deployTokenToServer(tokenId, tokenName, vkey, setupMetrics) {
    const response = await fetch('/api/tokens/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenId, tokenName, vkey, setupMetrics })
    });
    return response.json();
}

async function resetLedgerOnServer(tokenId) {
    return fetch(`/api/tokens/${tokenId}/reset`, { method: 'POST' });
}

async function checkSetupStatus() {
    const response = await fetch('/api/setup-status');
    return response.json();
}

// === TOKEN MANAGEMENT ===

async function loadTokens() {
    try {
        tokens = await fetchTokens();
        renderTokenList(tokens, currentToken?.id, selectToken);

        if (tokens.length > 0 && !currentToken) {
            selectToken(tokens[0].id);
        }
    } catch (error) {
        log(`Error loading tokens: ${error.message}`, 'error');
    }
}

async function selectToken(tokenId) {
    try {
        currentToken = await fetchToken(tokenId);

        // Update UI
        setCurrentTokenName(currentToken.name);
        renderTokenList(tokens, currentToken.id, selectToken);
        setServerAddress(currentToken.covenant);

        // Update metrics from token setup
        if (currentToken.setupMetrics?.zkeySize) {
            updateMetrics({ zkeySize: currentToken.setupMetrics.zkeySize });
        }

        // Load token ledger
        const ledgerData = await fetchLedger(tokenId);
        updateLedger(ledgerData.ledger, userId);

        // Register user wallet with this token
        if (userId) {
            await registerUser(tokenId, userId);
        }

        log(`Switched to token: ${currentToken.name}`, 'info');

    } catch (error) {
        log(`Error selecting token: ${error.message}`, 'error');
    }
}

// === TOKEN DEPLOYMENT ===

async function deployToken() {
    const tokenName = getTokenNameInput();

    if (!tokenName) {
        log('Token name required', 'error');
        return;
    }

    // Generate ID from name - sanitize to alphanumeric + underscore
    const sanitizedName = tokenName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const tokenId = sanitizedName + '_' + Date.now();

    closeDeployModal();
    log(`Deploying token: ${tokenName}...`, 'info');

    try {
        // Run trusted setup in browser (generates zkey and vkey)
        const setupResult = await runTrustedSetup(log);

        log(`Trusted setup complete! Registering token...`, 'info');

        // Send vkey to server to register the token
        const result = await deployTokenToServer(tokenId, tokenName, setupResult.vkey, {
            time: setupResult.setupTime,
            zkeySize: setupResult.zkeySize,
            constraints: 570,
            ranInBrowser: true
        });

        if (result.error) {
            log(`Deploy error: ${result.error}`, 'error');
            return;
        }

        log(`Token deployed!`, 'success');

        await loadTokens();
        selectToken(result.token.id);

    } catch (error) {
        log(`Deploy failed: ${error.message}`, 'error');
    }
}

// === TRANSACTIONS ===

async function receiveFromServer() {
    const amount = getTransferAmount();
    if (!currentToken) {
        log('No token selected', 'error');
        return;
    }

    setLoading(elements.btnReceive, true);
    const timings = {};

    try {
        const ledgerData = await fetchLedger(currentToken.id);
        const serverBalance = ledgerData.ledger.server || 0;

        log(`Transfer: ${amount} tokens from Server to You`);

        // Build witness (UTXO model - only sender balance needed)
        log('Building witness...', 'info');
        const witness = buildWitness(currentToken.covenant, amount, serverBalance);

        // Generate proof
        const result = await generateProof(witness, log);
        lastProof = result.proof;
        lastPublicSignals = result.publicSignals;
        timings.proof = result.proofTime;
        timings.proofSize = result.proofSize;

        // Enable proof download
        enableProofDownload(result.proof);

        // Submit to server for verification
        const verifyResult = await submitProof(
            currentToken.id,
            result.proof,
            result.publicSignals,
            'server',
            userId,
            amount
        );

        timings.verify = verifyResult.verifyTime;

        if (verifyResult.error) {
            log(`Verification failed: ${verifyResult.error}`, 'error');
        } else if (verifyResult.valid) {
            log('Ledger updated', 'success');
            updateLedger(verifyResult.ledger, userId);
        } else {
            log('Proof verification failed - invalid proof', 'error');
        }

        updateMetrics({ proofTime: timings.proof, verifyTime: timings.verify, proofSize: timings.proofSize });
        logSummary(timings);

    } catch (error) {
        log(`Error: ${error.message}`, 'error');
    } finally {
        setLoading(elements.btnReceive, false);
        setButtonsEnabled(true, !!userWallet);
    }
}

async function sendToServer() {
    const amount = getTransferAmount();
    if (!currentToken) {
        log('No token selected', 'error');
        return;
    }

    setLoading(elements.btnSend, true);
    const timings = {};

    try {
        const ledgerData = await fetchLedger(currentToken.id);
        const userBalance = ledgerData.ledger[userId] || 0;

        log(`Transfer: ${amount} tokens from You to Server`);

        // Build witness (UTXO model - only sender balance needed)
        const witness = buildWitness(currentToken.covenant, amount, userBalance);
        const result = await generateProof(witness, log);
        lastProof = result.proof;
        lastPublicSignals = result.publicSignals;
        timings.proof = result.proofTime;
        timings.proofSize = result.proofSize;

        enableProofDownload(result.proof);

        // Submit to server for verification
        const verifyResult = await submitProof(
            currentToken.id,
            result.proof,
            result.publicSignals,
            userId,
            'server',
            amount
        );

        timings.verify = verifyResult.verifyTime;

        if (verifyResult.error) {
            log(`Verification failed: ${verifyResult.error}`, 'error');
        } else if (verifyResult.valid) {
            log('Ledger updated', 'success');
            updateLedger(verifyResult.ledger, userId);
        } else {
            log('Proof verification failed - invalid proof', 'error');
        }

        updateMetrics({ proofTime: timings.proof, verifyTime: timings.verify, proofSize: timings.proofSize });
        logSummary(timings);

    } catch (error) {
        log(`Error: ${error.message}`, 'error');
    } finally {
        setLoading(elements.btnSend, false);
        setButtonsEnabled(true, !!userWallet);
    }
}

async function resetLedger() {
    if (!currentToken) return;

    try {
        log('Resetting ledger...');
        await resetLedgerOnServer(currentToken.id);
        await selectToken(currentToken.id);

        resetMetrics();
        lastProof = null;
        lastPublicSignals = null;
        hideProofDownload();

        log('Ledger reset', 'success');
    } catch (error) {
        log(`Error: ${error.message}`, 'error');
    }
}

// === INITIALIZATION ===

async function init() {
    log('Initializing dashboard...');

    // Bind UI event handlers
    bindEvents({
        onReceive: receiveFromServer,
        onSend: sendToServer,
        onReset: resetLedger,
        onOpenDeploy: openDeployModal,
        onDeploy: deployToken
    });

    try {
        const status = await checkSetupStatus();

        if (status.ready) {
            setStatusReady();
            log('Circuit artifacts loaded', 'success');

            // Load tokens
            await loadTokens();

            // Generate user wallet
            userWallet = generateWallet();
            userId = 'user_' + Date.now();
            showWalletAddress(userWallet.address);
            log(`Generated wallet: ${userWallet.address}`, 'success');

            // Register with current token
            if (currentToken) {
                await registerUser(currentToken.id, userId);
            }

            setButtonsEnabled(true, true);
            log('Ready for transactions', 'success');

        } else {
            setStatusError('Setup needed');
            log('Circuit not compiled. Run: npm run compile:circuit && npm run setup', 'error');
        }
    } catch (error) {
        setStatusError('Offline');
        log(`Error: ${error.message}`, 'error');
    }
}

// === START APPLICATION ===
init();
