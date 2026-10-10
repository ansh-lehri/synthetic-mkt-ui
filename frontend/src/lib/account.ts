// Which account the app acts as. There is NO auth/identity contract yet (the broker is
// no-auth: account_id is passed explicitly and trusted), so this is deliberately isolated
// here: set VITE_ACCOUNT_ID, or fall back to a demo id. Replace this one module when real
// sign-in lands — nothing else should read the env var.
export function getAccountId(): string {
  return import.meta.env.VITE_ACCOUNT_ID || 'demo-account'
}
