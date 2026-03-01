#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{token, vec, Env, IntoVal, Symbol};

#[test]
fn test_execute_proxy_token_transfer() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let relayer = Address::generate(&env);
    let recipient = Address::generate(&env);

    let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_addr = token_contract.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_addr);

    token_admin.mint(&user, &1_000);

    let contract_id = env.register(FeeForwarder, ());
    let client = FeeForwarderClient::new(&env, &contract_id);

    let transfer_args: Vec<Val> = vec![
        &env,
        user.into_val(&env),
        recipient.into_val(&env),
        800_i128.into_val(&env),
    ];

    client.execute_proxy(
        &token_addr,
        &user,
        &relayer,
        &100,
        &token_addr,
        &Symbol::new(&env, "transfer"),
        &transfer_args,
    );

    let token_client = token::Client::new(&env, &token_addr);
    assert_eq!(token_client.balance(&user), 100); // 1000 - 100 fee - 800 transfer
    assert_eq!(token_client.balance(&relayer), 100);
    assert_eq!(token_client.balance(&recipient), 800);
}

#[test]
fn test_forward_transfer_convenience() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let relayer = Address::generate(&env);
    let recipient = Address::generate(&env);

    let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_addr = token_contract.address();
    let token_admin = token::StellarAssetClient::new(&env, &token_addr);

    token_admin.mint(&user, &1_000);

    let contract_id = env.register(FeeForwarder, ());
    let client = FeeForwarderClient::new(&env, &contract_id);

    client.forward_transfer(&token_addr, &user, &relayer, &recipient, &800, &100);

    let token_client = token::Client::new(&env, &token_addr);
    assert_eq!(token_client.balance(&user), 100);
    assert_eq!(token_client.balance(&relayer), 100);
    assert_eq!(token_client.balance(&recipient), 800);
}
