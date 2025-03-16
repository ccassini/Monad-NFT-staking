# NFT Staking Frontend for Monad Testnet

This is a frontend application for staking NFTs on the Monad Testnet. It allows users to connect their wallet, view their NFTs, stake and unstake NFTs, and manage rewards.

## Features

- Connect to MetaMask wallet
- View owned NFTs
- Stake and unstake NFTs
- Claim and deposit rewards
- Track staking statistics

## Setup Instructions

1. Make sure you have Node.js and npm installed.

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following content:
   ```
   VITE_NFT_CONTRACT_ADDRESS=0x4ed897f597890ac80f6da0f1ba3240c193bdc1f5
   VITE_STAKING_CONTRACT_ADDRESS=0x4da237e02b2ed022fe4e0ce40f1126820d55c75b
   ```

4. Add a placeholder image for NFTs:
   - Create a file named `placeholder.png` in the `public/images` directory
   - This will be used when NFT images fail to load

5. Start the development server:
   ```
   npm run dev
   ```

6. Open your browser and navigate to the URL shown in the terminal (usually http://localhost:5173).

## Connecting to Monad Testnet

1. Make sure you have MetaMask installed in your browser.
2. Add the Monad Testnet to your MetaMask:
   - Network Name: Monad Testnet
   - RPC URL: https://testnet-rpc.monad.xyz/
   - Chain ID: 10143 (0x279f in hex)
   - Currency Symbol: MON
   - Block Explorer URL: https://explorer.testnet.monad.xyz/

3. Get some MON tokens from the Monad Testnet faucet.

## Troubleshooting

- If you encounter issues with loading NFTs, check the browser console for error messages.
- Make sure your MetaMask is connected to the Monad Testnet.
- Verify that you have MON tokens for gas fees.
- Ensure that the contract addresses in the `.env` file are correct.

## Development

This project uses:
- React
- Vite
- Web3.js
- TypeScript

To build for production:
```
npm run build
```

## License

MIT
