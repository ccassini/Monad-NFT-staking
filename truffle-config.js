const HDWalletProvider = require('@truffle/hdwallet-provider');
require('dotenv').config();

// Özel anahtarınızı .env dosyasında saklayın
// PRIVATE_KEY=your_private_key
// MONAD_RPC_URL=https://rpc.testnet.monad.xyz/
const privateKey = process.env.PRIVATE_KEY || '';
const monadRpcUrl = process.env.MONAD_RPC_URL || 'https://rpc.testnet.monad.xyz/';

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*", // Match any network id
    },
    monad_testnet: {
      provider: () => new HDWalletProvider(privateKey, monadRpcUrl),
      network_id: 10143, // Monad testnet chain ID
      gas: 5500000,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    }
  },
  compilers: {
    solc: {
      version: "0.8.20",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },
  contracts_directory: './contracts',
  contracts_build_directory: './src/abis',
  migrations_directory: './migrations',
}; 