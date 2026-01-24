/**
 * ZoKrates Trusted Setup Info
 * 
 * ZoKrates setup happens in the browser using zokrates-js WASM.
 * The benchmark UI generates keys on first run and caches them.
 * 
 * For CLI setup (if you have ZoKrates installed):
 *   zokrates setup
 *   zokrates export-verifier
 * 
 * Run: node scripts/setup.js
 */

console.log('[ZOKRATES] ZoKrates Setup Info');
console.log('==============================');
console.log('');
console.log('ZoKrates key generation happens in the browser using zokrates-js WASM.');
console.log('The benchmark UI generates keys on first run and caches them for subsequent runs.');
console.log('');
console.log('For CLI setup (if you have ZoKrates installed):');
console.log('');
console.log('  cd provers/zokrates');
console.log('  zokrates compile -i circuits/token_transfer.zok');
console.log('  zokrates setup');
console.log('  zokrates export-verifier');
console.log('');
console.log('This will generate:');
console.log('  - proving.key');
console.log('  - verification.key');
console.log('  - verifier.sol (Solidity verifier contract)');
