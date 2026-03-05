# solana-reputation

Decentralized reputation protocol where wallets can endorse each other. Reputation scores are computed on-chain from endorsement graphs.

![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)
![Solana](https://img.shields.io/badge/Solana-9945FF?logo=solana&logoColor=white)
![Anchor](https://img.shields.io/badge/Anchor-blue)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Features

- Wallet-to-wallet endorsements
- On-chain reputation scoring
- Endorsement revocation
- Category-based reputation

## Program Instructions

`initialize` | `endorse` | `revoke`

## Build

```bash
anchor build
```

## Test

```bash
anchor test
```

## Deploy

```bash
# Devnet
anchor deploy --provider.cluster devnet

# Mainnet
anchor deploy --provider.cluster mainnet
```

## Project Structure

```
programs/
  solana-reputation/
    src/
      lib.rs          # Program entry point and instructions
    Cargo.toml
tests/
  solana-reputation.ts           # Integration tests
Anchor.toml             # Anchor configuration
```

## License

MIT — see [LICENSE](LICENSE) for details.

## Author

Built by [Purple Squirrel Media](https://purplesquirrelmedia.io)
