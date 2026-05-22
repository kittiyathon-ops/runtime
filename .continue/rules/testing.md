# Testing Rules

Passing tests are necessary but not sufficient.

After code changes, always run:
- pnpm typecheck
- pnpm test

Prefer adding:
- regression tests
- replay tests
- invariant tests
- sequence ordering tests
- deterministic execution tests

Never weaken or delete tests to make the suite pass.
