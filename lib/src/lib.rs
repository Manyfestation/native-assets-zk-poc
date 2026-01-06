use serde::{Deserialize, Serialize};

pub type TxId = [u8; 32];

#[derive(Serialize, Deserialize, Hash, Eq, PartialEq)]
pub struct TokenOutput {
    pub script_pub_key: Vec<u8>,
    pub amount: u64,
}

#[derive(Serialize, Deserialize)]
pub struct PayloadState {
    pub outs: Vec<TokenOutput>,
}

#[derive(Serialize, Deserialize)]
pub struct PrevOut {
    pub idx: usize,
    pub txid: Option<TxId>, // Only the current input's prevout needs to have a txid.
    pub script_pub_key: Vec<u8>,
    pub state: PayloadState,
}

pub const MAX_INPUTS: usize = 6;

// We limit to MAX_INPUT because kaspa script can only make limited number of intropsection calls.
pub type PrevOutsType = [Option<PrevOut>; MAX_INPUTS];

#[derive(Serialize, Deserialize)]
pub struct Output {
    pub script_pub_key: Vec<u8>,
}

pub const MAX_OUTPUTS: usize = 6;

pub type OutputsType = [Option<Output>; MAX_OUTPUTS];
