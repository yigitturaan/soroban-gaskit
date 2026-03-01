#![no_std]
use soroban_sdk::{contract, contractimpl, token, Address, Env, IntoVal, Symbol, Val, Vec};

#[contract]
pub struct FeeForwarder;

#[contractimpl]
impl FeeForwarder {
    /// Collects `fee_amount` of `fee_token` from `user` → `relayer`, then
    /// forwards an arbitrary call to `target_contract.function_name(args)`.
    /// Both the fee transfer and the forwarded call are atomic — if either
    /// fails the entire invocation reverts.
    pub fn execute_proxy(
        env: Env,
        fee_token: Address,
        user: Address,
        relayer: Address,
        fee_amount: i128,
        target_contract: Address,
        function_name: Symbol,
        args: Vec<Val>,
    ) -> Val {
        user.require_auth();

        let client = token::Client::new(&env, &fee_token);
        client.transfer(&user, &relayer, &fee_amount);

        env.invoke_contract(&target_contract, &function_name, args)
    }

    /// Convenience wrapper: collects fee then does a simple token transfer.
    /// Equivalent to calling `execute_proxy` with target = token.transfer.
    pub fn forward_transfer(
        env: Env,
        token: Address,
        user: Address,
        relayer: Address,
        recipient: Address,
        amount: i128,
        fee_amount: i128,
    ) {
        let fn_name = Symbol::new(&env, "transfer");
        let args: Vec<Val> = Vec::from_array(
            &env,
            [
                user.into_val(&env),
                recipient.into_val(&env),
                amount.into_val(&env),
            ],
        );

        Self::execute_proxy(env, token.clone(), user, relayer, fee_amount, token, fn_name, args);
    }
}

mod test;
