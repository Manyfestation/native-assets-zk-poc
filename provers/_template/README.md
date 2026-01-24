# Adding a New ZK SDK

Follow these steps to add support for a new ZK SDK:

## 1. Create Directory Structure

```bash
cp -r provers/_template provers/your-sdk
```

## 2. Implement the Circuit

Port the token transfer logic to your SDK's circuit language:
- Balance conservation: `sum(inputs) == sum(outputs)`
- Token data preservation: outputs keep same token params
- EdDSA signature verification

## 3. Create Scripts

- `scripts/compile.js` — Compile circuit to artifacts
- `scripts/setup.js` — Generate proving/verification keys

## 4. Add Web Integration

Create `web/src/provers/your-sdk.js` implementing the prover interface.

## 5. Update UI

Add your SDK to `web/src/benchmark.html` and `benchmark.js`.
