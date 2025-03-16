# Monad NFT Project

This project contains smart contracts for an NFT collection and staking system deployed on the Monad Testnet.

## Contracts

- **MonadNFT.sol**: An ERC721 NFT contract with minting, whitelist, and metadata functionality.
- **NFTStaking.sol**: A staking contract that allows users to stake their NFTs and earn rewards.

## Setup

1. Install Foundry:
```
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

2. Clone the repository:
```
git clone <repository-url>
cd monad-nft-project
```

3. Install dependencies:
```
forge install
```

## Testing

Run the tests with:
```
forge test
```

## Deployment

1. Create a keystore file (recommended):
```
cast wallet import monad-deployer --private-key $(cast wallet new | grep 'Private key:' | awk '{print $3}')
```

2. Get the address of the keystore:
```
cast wallet address --account monad-deployer
```

3. Get testnet funds from the Monad faucet.

4. Deploy the contracts:
```
forge create src/MonadNFT.sol:MonadNFT --account monad-deployer --broadcast --constructor-args "MonadNFT" "MNFT" "https://monad-nft-metadata.example.com/token/"
```

5. Deploy the staking contract (replace `<nft-contract-address>` with the address of the deployed NFT contract):
```
forge create src/NFTStaking.sol:NFTStaking --account monad-deployer --broadcast --constructor-args <nft-contract-address>
```

## Verification

Verify the contracts on Monad Explorer:
```
forge verify-contract <contract_address> src/MonadNFT.sol:MonadNFT --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org --constructor-args <abi_encoded_constructor_arguments>
```

## License

This project is licensed under the MIT License. 