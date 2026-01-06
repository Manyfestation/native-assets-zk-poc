//! A simple program that takes a number `n` as input, and writes the `n-1`th and `n`th fibonacci
//! number as an output.

// These two lines are necessary for the program to properly compile.
//
// Under the hood, we wrap your main function with some extra code so that it behaves properly
// inside the zkVM.
#![no_main]
sp1_zkvm::entrypoint!(main);

use fibonacci_lib::{PayloadState, PrevOut, PrevOutsType, PubKey, TxId};

struct SignatureMessage {
    _prev_out_idx: usize,
    _prev_out_tx_id: TxId,
}

fn check_sig(_sig: Vec<u8>, _pub_key: &PubKey, _msg: SignatureMessage) -> bool {
    true
}

pub fn main() {
    let prev_outs = sp1_zkvm::io::read::<PrevOutsType>();
    let current_input_idx = sp1_zkvm::io::read::<usize>();
    let current_input_sig = sp1_zkvm::io::read::<Vec<u8>>();
    let next_state = sp1_zkvm::io::read::<PayloadState>();

    let prev_outs = prev_outs.into_iter().flatten().collect::<Vec<PrevOut>>();

    let total_in = prev_outs
        .iter()
        .map(|prev| prev.state.outs[prev.idx].amount)
        .sum::<u64>();
    let total_out = next_state
        .outs
        .iter()
        .map(|output| output.amount)
        .sum::<u64>();

    assert_eq!(total_in, total_out, "Input and output totals must match");

    let current_prev_out = &prev_outs[current_input_idx];
    let current_pub_key = &current_prev_out.state.outs[current_prev_out.idx].pub_key;

    let prev_out_tx_id = current_prev_out.txid.unwrap();

    // We only validate the signature of the current input, since we assume the other inputs will make the same check.
    assert!(
        check_sig(
            current_input_sig,
            current_pub_key,
            SignatureMessage {
                _prev_out_idx: current_prev_out.idx,
                _prev_out_tx_id: prev_out_tx_id,
            }
        ),
        "Invalid signature"
    );
}
