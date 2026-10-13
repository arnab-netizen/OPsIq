/**
 * Owner-facing copy for an overdrawn account. A bank balance is stored as a non-negative figure; an overdraft is NOT
 * entered as a bank balance (and "0" would say "the account is empty", which is a different claim). One sentence, shared by
 * every surface that asks for the bank balance or refuses a negative one.
 */
export const OVERDRAFT_BANK_BALANCE_SENTENCE =
  "If your account is overdrawn, leave the bank balance blank and record the overdraft under money owed (debt).";
