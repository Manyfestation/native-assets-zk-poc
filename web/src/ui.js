/**
 * UI Module - DOM manipulation and visual updates
 * 
 * This module handles all DOM interactions, logging, and UI state.
 * It exposes a clean API for other modules to update the UI.
 */

// === DOM ELEMENTS ===
export const elements = {
    terminal: document.getElementById('terminal'),
    serverBalance: document.getElementById('server-balance'),
    serverAddress: document.getElementById('server-address'),
    userBalance: document.getElementById('user-balance'),
    userRow: document.getElementById('user-row'),
    walletAddress: document.getElementById('wallet-address'),
    amountInput: document.getElementById('amount'),
    btnReceive: document.getElementById('btn-receive'),
    btnSend: document.getElementById('btn-send'),
    btnReset: document.getElementById('btn-reset'),
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    metricProveTime: document.getElementById('metric-prove-time'),
    metricVerifyTime: document.getElementById('metric-verify-time'),
    metricProofSize: document.getElementById('metric-proof-size'),
    metricZkeySize: document.getElementById('metric-zkey-size'),
    downloadProof: document.getElementById('download-proof'),
    currentTokenName: document.getElementById('current-token-name'),
    tokenList: document.getElementById('token-list'),
    btnDeploy: document.getElementById('btn-deploy'),
    deployModal: document.getElementById('deploy-modal'),
    modalClose: document.getElementById('modal-close'),
    modalCancel: document.getElementById('modal-cancel'),
    modalDeploy: document.getElementById('modal-deploy'),
    tokenNameInput: document.getElementById('token-name')
};

// === TERMINAL LOGGING ===

/**
 * Log a message to the terminal
 */
export function log(message, type = '') {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    line.textContent = `[${timestamp}] ${message}`;
    elements.terminal.appendChild(line);
    elements.terminal.scrollTop = elements.terminal.scrollHeight;
}

/**
 * Log a summary of operation timings
 */
export function logSummary(timings) {
    const line = document.createElement('div');
    line.className = 'terminal-line summary';
    line.innerHTML = `
--- SUMMARY ---
Proof:       ${timings.proof || '--'}ms
Verify:      ${timings.verify || '--'}ms
Proof Size:  ${timings.proofSize || '--'} bytes`;
    elements.terminal.appendChild(line);
    elements.terminal.scrollTop = elements.terminal.scrollHeight;
}

// === UI UPDATES ===

/**
 * Update the ledger display with new balances
 */
export function updateLedger(ledger, userId) {
    elements.serverBalance.textContent = ledger.server || 0;

    if (userId && ledger[userId] !== undefined) {
        elements.userBalance.textContent = ledger[userId];
        elements.userRow.style.display = 'flex';
        elements.userRow.classList.add('updated');
        setTimeout(() => elements.userRow.classList.remove('updated'), 300);
    }
}

/**
 * Update the metrics panel
 */
export function updateMetrics(metrics) {
    if (metrics.proofTime !== undefined) {
        elements.metricProveTime.textContent = `${metrics.proofTime}ms`;
    }
    if (metrics.verifyTime !== undefined) {
        elements.metricVerifyTime.textContent = `${metrics.verifyTime}ms`;
    }
    if (metrics.proofSize !== undefined) {
        elements.metricProofSize.textContent = formatBytes(metrics.proofSize);
    }
    if (metrics.zkeySize !== undefined) {
        elements.metricZkeySize.textContent = formatBytes(metrics.zkeySize);
    }
}

/**
 * Reset the metrics panel to default state
 */
export function resetMetrics() {
    elements.metricProveTime.textContent = '--';
    elements.metricVerifyTime.textContent = '--';
    elements.metricProofSize.textContent = '--';
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// === STATUS INDICATOR ===

/**
 * Set the status indicator to ready state
 */
export function setStatusReady() {
    elements.statusIndicator.classList.add('ready');
    elements.statusText.textContent = 'Ready';
}

/**
 * Set the status indicator to error state
 */
export function setStatusError(message = 'Error') {
    elements.statusIndicator.classList.add('error');
    elements.statusText.textContent = message;
}

// === BUTTON STATES ===

/**
 * Enable or disable transaction buttons
 */
export function setButtonsEnabled(enabled, userHasWallet = false) {
    elements.btnReceive.disabled = !enabled;
    const userBalance = parseInt(elements.userBalance.textContent) || 0;
    elements.btnSend.disabled = !enabled || !userHasWallet || userBalance <= 0;
}

/**
 * Set loading state on a button
 */
export function setLoading(btn, loading) {
    if (loading) {
        btn.disabled = true;
        btn.classList.add('loading');
    } else {
        btn.classList.remove('loading');
    }
}

// === WALLET DISPLAY ===

/**
 * Display the user's wallet address
 */
export function showWalletAddress(address) {
    elements.walletAddress.textContent = address;
    elements.userRow.style.display = 'flex';
}

// === PROOF DOWNLOAD ===

/**
 * Enable downloading of the proof file
 */
export function enableProofDownload(proof) {
    const proofBlob = new Blob([JSON.stringify(proof, null, 2)], { type: 'application/json' });
    elements.downloadProof.href = URL.createObjectURL(proofBlob);
    elements.downloadProof.download = 'proof.json';
    elements.downloadProof.style.display = 'inline';
}

/**
 * Hide the proof download link
 */
export function hideProofDownload() {
    elements.downloadProof.style.display = 'none';
}

// === TOKEN DISPLAY ===

/**
 * Update the current token name in the header
 */
export function setCurrentTokenName(name) {
    elements.currentTokenName.textContent = name;
}

/**
 * Set the server address (covenant display)
 */
export function setServerAddress(covenant) {
    // Covenant is already a hex string (e.g., "0x0102030405060708")
    elements.serverAddress.textContent = covenant;
}

/**
 * Render the token list in the drawer
 */
export function renderTokenList(tokens, currentTokenId, onTokenSelect) {
    elements.tokenList.innerHTML = tokens.map(token => `
        <div class="token-item ${token.id === currentTokenId ? 'active' : ''}" 
             data-token-id="${token.id}">
            <span class="token-item-name">${token.name}</span>
            <span class="token-item-id">${token.id}</span>
        </div>
    `).join('');

    // Add click handlers
    elements.tokenList.querySelectorAll('.token-item').forEach(item => {
        item.addEventListener('click', () => onTokenSelect(item.dataset.tokenId));
    });
}

// === DEPLOY MODAL ===

/**
 * Open the deploy token modal
 */
export function openDeployModal() {
    elements.deployModal.style.display = 'flex';
    elements.tokenNameInput.value = '';
}

/**
 * Close the deploy token modal
 */
export function closeDeployModal() {
    elements.deployModal.style.display = 'none';
}

/**
 * Get the token name from the deploy modal input
 */
export function getTokenNameInput() {
    return elements.tokenNameInput.value.trim();
}

/**
 * Get the transfer amount from the input
 */
export function getTransferAmount() {
    return parseInt(elements.amountInput.value) || 0;
}

// === EVENT BINDING ===

/**
 * Bind event listeners to UI elements
 */
export function bindEvents(handlers) {
    elements.btnReceive.addEventListener('click', handlers.onReceive);
    elements.btnSend.addEventListener('click', handlers.onSend);
    elements.btnReset.addEventListener('click', handlers.onReset);
    elements.btnDeploy.addEventListener('click', handlers.onOpenDeploy);
    elements.modalClose.addEventListener('click', closeDeployModal);
    elements.modalCancel.addEventListener('click', closeDeployModal);
    elements.modalDeploy.addEventListener('click', handlers.onDeploy);

    // Close modal on overlay click
    elements.deployModal.addEventListener('click', (e) => {
        if (e.target === elements.deployModal) closeDeployModal();
    });
}
