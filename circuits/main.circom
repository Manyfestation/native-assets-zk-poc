pragma circom 2.0.0;

// Native Asset ZK Circuit - Hello World
// This is a minimal starting template for building the native asset verification circuit.
// Reference: old_ref/main.rs contains the Rust/SP1 implementation to port.

template Main() {
    // Public inputs
    signal input a;
    signal input b;
    
    // Output
    signal output c;
    
    // Simple constraint: a * b = c
    c <== a * b;
}

component main = Main();
