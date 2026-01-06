use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Hash, Eq, PartialEq)]
pub struct PubKey(pub [u8; 32]);

#[derive(Serialize, Deserialize, Hash, Eq, PartialEq)]
pub struct TokenOutput {
    pub pub_key: PubKey,
    pub amount: u64,
}

#[derive(Serialize, Deserialize)]
pub struct PayloadState {
    pub outs: Vec<TokenOutput>,
}
