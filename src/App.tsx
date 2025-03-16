import { useState, useEffect, useCallback } from 'react';
import Web3 from 'web3';
import './App.css';

// Monad Testnet configuration
const MONAD_TESTNET_CONFIG = {
  chainId: '0x279f',
  chainName: 'Monad Testnet',
  nativeCurrency: {
    name: 'MON',
    symbol: 'MON',
    decimals: 18
  },
  rpcUrls: [
    'https://testnet-rpc.monad.xyz/',
    'https://testnet-rpc2.monad.xyz/fec071827db55fdd068886e7759360c51105aab0'
  ],
  blockExplorerUrls: ['https://explorer.testnet.monad.xyz/']
};

// NFT interface
interface NFT {
  id: number;
  name: string;
  description: string;
  image: string;
  possibleImages: string[];
  attributes: Array<{
    trait_type: string;
    value: string;
  }>;
  isStaked?: boolean;
  isLoading?: boolean;
}

// Helper function for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function for RPC call retries
const retryRpcCall = async (fn: () => Promise<any>, maxRetries = 5) => {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.warn(`RPC call failed (${i + 1}/${maxRetries}):`, error.message || error);
      
      // Longer wait time (exponential backoff)
      const waitTime = 2000 * Math.pow(2, i); // Increased from 1000 to 2000ms base
      console.log(`Waiting ${waitTime}ms before retrying...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  console.error(`Maximum retry attempts reached (${maxRetries}). Last error:`, lastError);
  throw lastError;
};

// Improved RPC call function with better error handling
const safeRpcCall = async (fn: () => Promise<any>, name: string, maxAttempts = 5) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        console.log(`${name} succeeded on attempt ${attempt + 1}`);
      }
      return result;
    } catch (err: any) {
      const isRateLimitError = err.message && (
        err.message.includes('429') || 
        err.message.includes('rate limit') || 
        err.message.includes('too many requests')
      );
      
      console.warn(
        `Attempt ${attempt + 1}/${maxAttempts} failed for ${name}: ${
          isRateLimitError ? 'Rate limit exceeded' : err.message
        }`
      );
      
      if (attempt === maxAttempts - 1) {
        console.error(`All ${maxAttempts} attempts failed for ${name}`);
        throw err;
      }
      
      // Exponential backoff with jitter
      const baseDelay = 1000 * Math.pow(1.5, attempt);
      const jitter = Math.random() * 500;
      const delay = baseDelay + jitter;
      
      console.log(`Waiting ${Math.round(delay)}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Failed after ${maxAttempts} attempts`);
};

// Simplified NFT loading function
const createNFTObject = (tokenId: number, isStaked: boolean = false): NFT => {
  try {
    const id = Number(tokenId);
    
    // Calculate the correct image number (NFT ID 0 should show image 1, ID 1 shows image 2, etc.)
    const imageNumber = id + 1;
    
    // Try different image formats - create an array of possible image paths
    const possibleImagePaths = [
      `/images/Anime Lady ${imageNumber}.jpeg`,
      `/images/Anime Lady ${imageNumber}.jpg`,
      `/images/AnimeNFT${imageNumber}.png`,
      `/images/nft${imageNumber}.png`,
      `/images/nft-${imageNumber}.png`,
      `/images/anime${imageNumber}.png`,
      `/images/anime-${imageNumber}.png`,
      `/images/anime_${imageNumber}.png`,
      `/images/nft_${imageNumber}.png`,
      `/images/NFT${imageNumber}.png`,
      `/images/NFT-${imageNumber}.png`,
      `/images/NFT_${imageNumber}.png`,
      `/images/${imageNumber}.png`,
      `/images/${imageNumber}.jpg`,
      `/images/${imageNumber}.jpeg`,
      `/images/animelady.jpg`, // Genel bir anime lady resmi
      `/images/placeholder.png` // Always use placeholder as last option
    ];
    
    return {
      id: id,
      name: `Anime Lady #${id}`,
      description: `Anime Lady NFT (ID: ${id})`,
      image: possibleImagePaths[0], // Start with first format, will try others on error
      possibleImages: possibleImagePaths, // Store all possible paths for fallback
      attributes: [
        {
          trait_type: "Token ID",
          value: id.toString()
        }
      ],
      isStaked,
      isLoading: false
    };
  } catch (error) {
    console.error('Error creating NFT object:', error);
    // Return a default NFT object in case of error
    return {
      id: Number(tokenId) || 0,
      name: `NFT #${tokenId || 0}`,
      description: 'NFT',
      image: '/images/placeholder.png',
      possibleImages: ['/images/placeholder.png'],
      attributes: [
        {
          trait_type: "Token ID",
          value: String(tokenId || 0)
        }
      ],
      isStaked,
      isLoading: false
    };
  }
};

// Helper function to check if an image exists
const imageExists = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (e) {
    return false;
  }
};

const abi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "NFTStaked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "NFTUnstaked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "user",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "RewardsClaimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "RewardsDeposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newCap",
        "type": "uint256"
      }
    ],
    "name": "RewardCapUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "unlockTime",
        "type": "uint256"
      }
    ],
    "name": "EmergencyWithdrawalRequested",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "EmergencyWithdrawalCompleted",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "depositRewards",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "claimRewards",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "initiateEmergencyWithdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "completeEmergencyWithdraw",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "stakeNFT",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "unstakeAndRemove",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "newCap",
        "type": "uint256"
      }
    ],
    "name": "updateDailyRewardCap",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "isStaker",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "dailyRewardCap",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTotalStakedNFTs",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "lastClaimedTime",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "lastRewardCalculation",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nftContract",
    "outputs": [
      {
        "internalType": "contract IERC721",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "rewards",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "rewardPool",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "stakedNFTs",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "stakeStartTime",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "withdrawalRequest",
    "outputs": [
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "unlockTime",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

// NFT Contract ABI
const nftAbi = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'ownerOf',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  },
  {
    name: 'tokenOfOwnerByIndex',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' }
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
  {
    name: 'getApproved',
    type: 'function',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  }
];

// Add this new component for corner NFT images
const CornerNFTs = () => {
  // List of available Anime Lady images in the public folder
  const animeImages = [
    '/images/Anime Lady 11.jpeg',
    '/images/Anime Lady 17.jpeg',
    '/images/Anime Lady 18.jpeg',
    '/images/Anime Lady 30.jpeg',
    '/images/Anime Lady 35.jpeg',
    '/images/Anime Lady 41.jpeg',
    '/images/Anime Lady 47.jpeg',
    '/images/Anime Lady 56.jpeg',
    '/images/Anime Lady 61.jpeg',
    '/images/Anime Lady 63.jpeg',
    '/images/Anime Lady 73.jpeg',
    '/images/Anime Lady 76.jpeg',
    '/images/Anime Lady 87.jpeg',
    '/images/Anime Lady 98.jpeg',
    '/images/Anime Lady 107.jpeg',
    '/images/Anime Lady 109.jpeg',
    '/images/Anime Lady 110.jpeg',
    '/images/Anime Lady 111.jpeg',
    '/images/Anime Lady 2.jpeg',
    '/images/Anime Lady 40.jpeg',
    '/images/Anime Lady 82.jpeg',
    '/images/Anime Lady 101.jpeg',
    '/images/Anime Lady 105.jpeg',
    '/images/Anime Lady 1.jpeg',
    '/images/Anime Lady 31.jpeg',
    '/images/Anime Lady 34.jpeg',
    '/images/Anime Lady 37.jpeg',
    '/images/Anime Lady 42.jpeg',
    '/images/Anime Lady 43.jpeg',
    '/images/Anime Lady 46.jpeg',
    '/images/Anime Lady 49.jpeg',
    '/images/Anime Lady 52.jpeg',
    '/images/Anime Lady 54.jpeg',
    '/images/Anime Lady 55.jpeg',
    '/images/Anime Lady 58.jpeg',
    '/images/Anime Lady 64.jpeg',
    '/images/Anime Lady 66.jpeg',
    '/images/Anime Lady 70.jpeg',
  ];

  // Get 18 random images from the available list
  const getRandomImages = () => {
    const shuffled = [...animeImages].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 18);
  };

  const cornerImages = getRandomImages();
  
  // Define positions for all 18 images (9 on left, 9 on right)
  const positions = [
    'top-1', 'top-2', 'top-3', 'top-4', 'top-5', 'top-6', 'top-7', 'top-8', 'top-9',
    'bottom-1', 'bottom-2', 'bottom-3', 'bottom-4', 'bottom-5', 'bottom-6', 'bottom-7', 'bottom-8', 'bottom-9'
  ];
  
  // Generate random IDs for the corners
  const cornerIds = Array.from({ length: 18 }, () => Math.floor(Math.random() * 1000));

  return (
    <>
      {cornerImages.map((image, index) => (
        <div key={`corner-nft-${cornerIds[index]}`} className={`corner-nft ${positions[index]}`}>
          <div className="corner-nft-inner">
            <img 
              src={image} 
              alt={`Anime Lady #${cornerIds[index]}`} 
              onError={(e) => {
                // If image fails to load, replace with placeholder
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  const placeholder = document.createElement('div');
                  placeholder.className = 'corner-nft-placeholder';
                  placeholder.textContent = `#${cornerIds[index]}`;
                  parent.appendChild(placeholder);
                }
              }}
            />
          </div>
        </div>
      ))}
    </>
  );
};

// Twitter link component
const TwitterLink = () => {
  return (
    <a href="https://x.com/Cassini0x" target="_blank" rel="noopener noreferrer" className="twitter-link">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <g>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
        </g>
      </svg>
      <span>Cassini</span>
    </a>
  );
};

const App = () => {
  const [account, setAccount] = useState('');
  const [web3, setWeb3] = useState<Web3 | null>(null);
  const [contract, setContract] = useState<any>(null);
  const [nftContract, setNftContract] = useState<any>(null);
  const [tokenId, setTokenId] = useState('');
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState('');
  const [rewardBalance, setRewardBalance] = useState('0');
  const [ownedNFTs, setOwnedNFTs] = useState<NFT[]>([]);
  const [stakedNFTs, setStakedNFTs] = useState<NFT[]>([]);
  const [totalStaked, setTotalStaked] = useState('0');
  const [earnedRewards, setEarnedRewards] = useState('0');
  const [dailyRewardCap, setDailyRewardCap] = useState('0');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [activeTab, setActiveTab] = useState<'your' | 'staked'>('your');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualNftId, setManualNftId] = useState('');
  const [checkingNft, setCheckingNft] = useState(false);
  const [nftCheckMessage, setNftCheckMessage] = useState<string | null>(null);
  const [nftIdInput, setNftIdInput] = useState('');
  const [checkingBatch, setCheckingBatch] = useState(false);
  const [batchResults, setBatchResults] = useState<{id: string, status: string, owned: boolean}[]>([]);
  const [checkedNftIds, setCheckedNftIds] = useState<Set<string>>(new Set());
  const [networkStatus, setNetworkStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [eventListenersSet, setEventListenersSet] = useState(false);

  const nftContractAddress = import.meta.env.VITE_NFT_CONTRACT_ADDRESS || '0x4ed897f597890ac80f6da0f1ba3240c193bdc1f5';
  const stakingContractAddress = import.meta.env.VITE_STAKING_CONTRACT_ADDRESS || '0x4da237e02b2ed022fe4e0ce40f1126820d55c75b';

  const connectWallet = async () => {
    try {
      // Reset state first
      setWeb3(null);
      setContract(null);
      setNftContract(null);
      setOwnedNFTs([]);
      setStakedNFTs([]);
      setIsLoading(true);
      setErrorMessage(null);
      setTransactionMessage('');

      // Check if MetaMask is installed
      if (typeof window.ethereum === 'undefined') {
        alert('Please install MetaMask!');
        setIsLoading(false);
        return;
      }

      try {
        // Request account access
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });

        // Wait for provider to be ready
        await delay(1000); // Increased delay for better stability

        // Create Web3 instance with fallback RPC URLs
        let web3Instance = new Web3(window.ethereum);
        
        // More reliable connection settings
        if (web3Instance.currentProvider && typeof web3Instance.currentProvider === 'object') {
          // @ts-ignore - Update provider settings
          if (web3Instance.currentProvider.timeout) {
            // @ts-ignore
            web3Instance.currentProvider.timeout = 60000; // Increase timeout to 60 seconds
          }
        }

        // Update account state first
        setAccount(accounts[0]);
        setWeb3(web3Instance);

        // Switch to Monad Testnet
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: MONAD_TESTNET_CONFIG.chainId }],
        });
      } catch (switchError: any) {
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [MONAD_TESTNET_CONFIG],
            });
              
              await delay(1000); // Increased delay
              
              await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: MONAD_TESTNET_CONFIG.chainId }],
            });
          } catch (addError) {
              console.error('Failed to add Monad network:', addError);
              setErrorMessage('Monad network could not be added. Please manually add it.');
              setIsLoading(false);
              return;
            }
          } else {
            console.error('Network switch error:', switchError);
            setErrorMessage('Network could not be switched. Please manually switch to Monad Testnet.');
            setIsLoading(false);
            return;
          }
        }

        // Wait for network switch
        await delay(1000); // Increased delay

        // Initialize contracts with higher gas limit and retry logic
        console.log('Initializing staking contract at address:', stakingContractAddress);
        
        // Try primary RPC first
        let contractInstance: any;
        let nftContractInstance: any;
        let useFallbackRPC = false;
        
        try {
          // Initialize staking contract
          contractInstance = new web3Instance.eth.Contract(abi, stakingContractAddress);
          
          // Test the connection with a simple call
          await safeRpcCall(
            () => contractInstance.methods.getTotalStakedNFTs().call(),
            'Test staking contract connection',
            3
          );
          
          // Initialize NFT contract
          console.log('Initializing NFT contract at address:', nftContractAddress);
          nftContractInstance = new web3Instance.eth.Contract(nftAbi, nftContractAddress);
          
          // Test the connection
          await safeRpcCall(
            () => nftContractInstance.methods.balanceOf(accounts[0]).call(),
            'Test NFT contract connection',
            3
          );
        } catch (error) {
          console.warn('Failed with primary RPC, trying fallback:', error);
          useFallbackRPC = true;
        }
        
        // If primary RPC failed, try fallback
        if (useFallbackRPC) {
          try {
            console.log('Switching to fallback RPC URL:', MONAD_TESTNET_CONFIG.rpcUrls[1]);
            
            // Create a new Web3 instance with the fallback RPC
            const fallbackProvider = new Web3.providers.HttpProvider(
              MONAD_TESTNET_CONFIG.rpcUrls[1],
              { timeout: 60000 } as any
            );
            
            const fallbackWeb3 = new Web3(fallbackProvider);
            web3Instance = fallbackWeb3;
            setWeb3(fallbackWeb3);
            
            // Recreate contracts with fallback
            contractInstance = new fallbackWeb3.eth.Contract(abi, stakingContractAddress);
            nftContractInstance = new fallbackWeb3.eth.Contract(nftAbi, nftContractAddress);
            
            console.log('Successfully connected using fallback RPC');
          } catch (fallbackError) {
            console.error('Failed to initialize with fallback RPC:', fallbackError);
            setErrorMessage('Failed to connect to Monad network. Please try again later.');
            setIsLoading(false);
            return;
          }
        }
        
        // Update contract states
      setContract(contractInstance);
        setNftContract(nftContractInstance);

        // Wait a bit to ensure contracts are properly initialized
        await delay(2000); // Increased delay for better stability
        
        // Use the new accurate NFT data loading function
        await loadAccurateNFTData();

      } catch (error) {
        console.error('MetaMask connection error:', error);
        setErrorMessage('MetaMask could not be connected. Please try again.');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Connection error:', error);
      setErrorMessage('An unexpected error occurred. Please refresh the page and try again.');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Check if already connected
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          setAccount('');
          setWeb3(null);
          setContract(null);
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });

      // Handle disconnect
      window.ethereum.on('disconnect', (error: any) => {
        console.log('MetaMask disconnected:', error);
        setAccount('');
        setWeb3(null);
        setContract(null);
      });

      // Handle connection errors
      window.ethereum.on('error', (error: any) => {
        console.error('MetaMask error:', error);
        setErrorMessage(`MetaMask error: ${error.message || 'Unknown error'}`);
      });
    }

    // Handle window errors
    window.addEventListener('error', (event) => {
      console.error('Window error:', event.error);
      // Only set error message for non-script errors to avoid flooding the UI
      if (!event.filename?.includes('.js')) {
        setErrorMessage(`Application error: ${event.message}`);
      }
    });

    return () => {
      // Clean up event listeners
      window.removeEventListener('error', () => {});
      if (window.ethereum) {
        window.ethereum.removeAllListeners?.();
      }
    };
  }, []);

  useEffect(() => {
    // Refresh reward data periodically if connected
    if (account && web3 && contract) {
      // Initial refresh
      refreshRewardData(account);
      
      // Set up interval for periodic refresh
      const intervalId = setInterval(() => {
        refreshRewardData(account);
      }, 60000); // Refresh every 60 seconds instead of 30 seconds for better performance
      
      // Clean up interval on unmount or when dependencies change
      return () => clearInterval(intervalId);
    }
  }, [account, web3, contract]);

  // Effect to manually add known staked NFTs when the component mounts
  useEffect(() => {
    if (account && web3 && nftContract && contract) {
      console.log('Attempting to automatically detect all staked NFTs');
      
      // Scan all possible NFT IDs (0-110) to find staked NFTs
      const scanForStakedNFTs = async () => {
        try {
          setIsLoading(true);
          
          // Check if user is a staker
          let isStaker = false;
          try {
            isStaker = await contract.methods.isStaker(account).call();
            console.log('Is user a staker:', isStaker);
          } catch (err) {
            console.error('Error checking if user is staker:', err);
          }
          
          if (isStaker || Number(totalStaked) > 0) {
            console.log('User is a staker or contract has staked NFTs, loading staked NFTs');
            
            // Use loadAccurateNFTData to load all NFTs properly
            await loadAccurateNFTData();
          }
    } catch (error) {
          console.error('Error scanning for staked NFTs:', error);
    } finally {
      setIsLoading(false);
    }
  };

      // Run the scan if we don't have any staked NFTs yet
      if (stakedNFTs.length === 0) {
        scanForStakedNFTs();
      }
    }
  }, [account, web3, nftContract, contract, stakedNFTs.length, totalStaked, stakingContractAddress]);

  const executeTransaction = async (
    transaction: () => Promise<void>,
    loadingMessage: string,
    successMessage: string
  ) => {
    if (!web3 || !contract || !account) {
      alert('Please connect your wallet first');
      return;
    }

    setIsLoading(true);
    setTransactionMessage(loadingMessage);
    
    try {
      await transaction();
      setTransactionMessage(successMessage);
      
      // Refresh all reward data after transaction
      refreshRewardData(account);
    } catch (error: any) {
      console.error('Transaction error:', error);
      setTransactionMessage(`Transaction failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const stakeNFT = async (tokenIdToStake: string) => {
    if (!web3 || !contract || !nftContract || !account) {
      setErrorMessage('Please connect your wallet first');
      return;
    }

    if (!tokenIdToStake) {
      setErrorMessage('Please select an NFT to stake');
      return;
    }

    setIsLoading(true);
    setTransactionMessage('NFT staking in progress...');
    
    try {
      // Update UI immediately to show loading state
      setOwnedNFTs(prev => 
        prev.map(nft => 
          nft.id.toString() === tokenIdToStake 
            ? {...nft, isLoading: true} 
            : nft
        )
      );

      console.log(`Approving NFT ${tokenIdToStake} for staking...`);
      // First approve the NFT transfer
      await nftContract.methods.approve(stakingContractAddress, tokenIdToStake).send({
        from: account,
        gas: 3000000
      });
      
      console.log(`Staking NFT ${tokenIdToStake}...`);
      // Then stake it
      await contract.methods.stakeNFT(tokenIdToStake).send({
        from: account,
        gas: 3000000
      });
      
      // Update UI
      const stakedNFT = ownedNFTs.find(nft => nft.id.toString() === tokenIdToStake);
      if (stakedNFT) {
        // Add to staked NFTs
        setStakedNFTs(prev => [...prev, {...stakedNFT, isStaked: true, isLoading: false}]);
        
        // Remove from owned NFTs
        setOwnedNFTs(prev => prev.filter(nft => nft.id.toString() !== tokenIdToStake));
        
        // Update total staked count
        setTotalStaked(prev => (Number(prev) + 1).toString());
      }

      setTransactionMessage('NFT staked successfully!');
      
      // Wait a bit to ensure blockchain state is updated
      await delay(2000);
      
      // Force refresh NFT data to ensure UI is up to date
      try {
        console.log('Refreshing NFT data after staking...');
        
        // Use the accurate NFT data loading function
        await loadAccurateNFTData();
      } catch (refreshErr) {
        console.error('Error during post-stake refresh:', refreshErr);
      }
      
      // Refresh reward data after transaction
      if (account) {
        refreshRewardData(account);
      }
      
      // Switch to staked tab to show the newly staked NFT
      setActiveTab('staked');
    } catch (error: any) {
      console.error('Staking error:', error);
      setTransactionMessage(`Staking failed: ${error.message}`);
      setErrorMessage(`Staking failed: ${error.message}`);
      
      // Reset loading state on error
      setOwnedNFTs(prev => 
        prev.map(nft => 
          nft.id.toString() === tokenIdToStake 
            ? {...nft, isLoading: false} 
            : nft
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const unstakeNFT = async (tokenIdToUnstake: string) => {
    if (!web3 || !contract || !account) {
      setErrorMessage('Please connect your wallet first');
      return;
    }

    if (!tokenIdToUnstake) {
      setErrorMessage('Please select an NFT to unstake');
      return;
    }

    setIsLoading(true);
    setTransactionMessage('NFT unstaking in progress...');
    
    try {
      // Update UI immediately to show loading state
      setStakedNFTs(prev => 
        prev.map(nft => 
          nft.id.toString() === tokenIdToUnstake 
            ? {...nft, isLoading: true} 
            : nft
        )
      );

      console.log(`Unstaking NFT ${tokenIdToUnstake}...`);
      // Call the unstakeAndRemove function
      await contract.methods.unstakeAndRemove(tokenIdToUnstake).send({
        from: account,
        gas: 3000000
      });
      
      // Update UI
      const unstakeNFT = stakedNFTs.find(nft => nft.id.toString() === tokenIdToUnstake);
      if (unstakeNFT) {
        // Add to owned NFTs
        setOwnedNFTs(prev => [...prev, {...unstakeNFT, isStaked: false, isLoading: false}]);
        
        // Remove from staked NFTs
        setStakedNFTs(prev => prev.filter(nft => nft.id.toString() !== tokenIdToUnstake));
        
        // Update total staked count
        setTotalStaked(prev => (Number(prev) - 1).toString());
      }

      setTransactionMessage('NFT unstaked successfully!');
      
      // Wait a bit to ensure blockchain state is updated
      await delay(2000);
      
      // Force refresh NFT data to ensure UI is up to date
      try {
        console.log('Refreshing NFT data after unstaking...');
        
        // Use the accurate NFT data loading function
        await loadAccurateNFTData();
      } catch (refreshErr) {
        console.error('Error during post-unstake refresh:', refreshErr);
      }
      
      // Refresh reward data after transaction
      if (account) {
        refreshRewardData(account);
      }
      
      // Switch to owned tab to show the newly unstaked NFT
      setActiveTab('your');
    } catch (error: any) {
      console.error('Unstaking error:', error);
      setTransactionMessage(`Unstaking failed: ${error.message}`);
      setErrorMessage(`Unstaking failed: ${error.message}`);
      
      // Reset loading state on error
      setStakedNFTs(prev => 
        prev.map(nft => 
          nft.id.toString() === tokenIdToUnstake 
            ? {...nft, isLoading: false} 
            : nft
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const claimRewards = () => {
    return executeTransaction(
      async () => {
          await contract.methods.claimRewards().send({
          from: account,
          gas: 3000000
        });
      },
      'Claiming rewards...',
      'Rewards claimed successfully!'
    );
  };

  const depositRewards = () => {
    if (!amount) {
      alert('Please enter an amount');
      return;
    }

    return executeTransaction(
      async () => {
        const weiAmount = web3!.utils.toWei(amount, 'ether');
          await contract.methods.depositRewards(weiAmount).send({
            from: account,
          value: weiAmount,
          gas: 3000000
        });
      },
      'Depositing rewards...',
      'Rewards deposited successfully!'
    );
  };

  const updateDailyRewardCap = () => {
    if (!amount) {
      alert('Please enter an amount');
      return;
    }

    return executeTransaction(
      async () => {
        const weiAmount = web3!.utils.toWei(amount, 'ether');
          await contract.methods.updateDailyRewardCap(weiAmount).send({
          from: account,
          gas: 3000000
        });
      },
      'Updating daily reward cap...',
      'Daily reward cap updated successfully!'
    );
  };

  const initiateEmergencyWithdraw = () => {
    if (!recipient || !amount) {
      alert('Please enter a recipient address and amount');
      return;
    }

    return executeTransaction(
      async () => {
          const weiAmount = web3!.utils.toWei(amount, 'ether');
          await contract.methods.initiateEmergencyWithdraw(recipient, weiAmount).send({
          from: account,
          gas: 3000000
        });
      },
      'Initiating emergency withdrawal...',
      'Emergency withdrawal initiated successfully!'
    );
  };

  const completeEmergencyWithdraw = () => {
    return executeTransaction(
      async () => {
          await contract.methods.completeEmergencyWithdraw().send({
          from: account,
          gas: 3000000
        });
      },
      'Completing emergency withdrawal...',
      'Emergency withdrawal completed successfully!'
    );
  };

  // Add this debug function to help troubleshoot
  const debugLog = (message: string, data?: any) => {
    console.log(`[DEBUG] ${message}`, data || '');
  };

  // Enhanced loadNFTsFromBlockchain function with better error handling
  const loadNFTsFromBlockchain = async (userAddress: string, nftContract: any, web3Instance: Web3) => {
    try {
      debugLog('Starting NFT loading process for address:', userAddress);
      setIsLoading(true);
      
      // Verify the wallet connection
      if (!userAddress || !web3Instance || !nftContract) {
        throw new Error('Missing required connection parameters');
      }
      
      // Ensure address is checksummed
      const checksumAddress = web3Instance.utils.toChecksumAddress(userAddress);
      debugLog('Using checksummed address:', checksumAddress);
      
      // Get balance of NFTs for this address
      const balance = await safeRpcCall(
        () => nftContract.methods.balanceOf(checksumAddress).call(),
        'Get NFT balance',
        3
      );
      
      debugLog('NFT balance for address:', balance);
      
      if (Number(balance) === 0) {
        debugLog('No NFTs found for this address');
        setOwnedNFTs([]);
        setIsLoading(false);
        return;
      }
      
      // Get all token IDs owned by this address
      const ownedTokenIds = [];
      for (let i = 0; i < Number(balance); i++) {
        try {
          const tokenId = await safeRpcCall(
            () => nftContract.methods.tokenOfOwnerByIndex(checksumAddress, i).call(),
            `Get token ID at index ${i}`,
            3
          );
          debugLog(`Found token ID ${tokenId} at index ${i}`);
          ownedTokenIds.push(tokenId);
        } catch (error) {
          console.error(`Error getting token at index ${i}:`, error);
        }
      }
      
      debugLog('All owned token IDs:', ownedTokenIds);
      
      // Create NFT objects for each token ID
      const nftPromises = ownedTokenIds.map(async (tokenId) => {
        try {
          // Try to get token URI
          const tokenURI = await safeRpcCall(
            () => nftContract.methods.tokenURI(tokenId).call(),
            `Get token URI for ID ${tokenId}`,
            3
          );
          
          debugLog(`Token URI for ID ${tokenId}:`, tokenURI);
          
          // Create a basic NFT object
          const nft = createNFTObject(Number(tokenId));
          
          // If we have a token URI, try to fetch metadata
          if (tokenURI) {
            try {
              // Handle both IPFS and HTTP URIs
              let metadataUrl = tokenURI;
              if (tokenURI.startsWith('ipfs://')) {
                metadataUrl = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/');
              }
              
              const response = await fetch(metadataUrl);
              if (response.ok) {
                const metadata = await response.json();
                debugLog(`Metadata for token ID ${tokenId}:`, metadata);
                
                // Update NFT object with metadata
                nft.name = metadata.name || `NFT #${tokenId}`;
                nft.description = metadata.description || '';
                
                // Handle image URL
                if (metadata.image) {
                  let imageUrl = metadata.image;
                  if (imageUrl.startsWith('ipfs://')) {
                    imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
                  }
                  nft.image = imageUrl;
                  nft.possibleImages = [imageUrl];
                }
                
                // Handle attributes
                if (metadata.attributes) {
                  nft.attributes = metadata.attributes;
                }
              }
            } catch (metadataError) {
              console.error(`Error fetching metadata for token ID ${tokenId}:`, metadataError);
            }
          }
          
          return nft;
        } catch (error) {
          console.error(`Error processing token ID ${tokenId}:`, error);
          // Return a basic NFT object even if there was an error
          return createNFTObject(Number(tokenId));
        }
      });
      
      const nfts = await Promise.all(nftPromises);
      debugLog('Processed NFTs:', nfts);
      
      setOwnedNFTs(nfts);
    } catch (error: unknown) {
      console.error('Error loading NFTs from blockchain:', error);
      setErrorMessage(`Failed to load NFTs: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setOwnedNFTs([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Enhanced function to load staked NFTs with better error handling and fallback mechanisms
  const loadStakedNFTs = async (userAddress: string) => {
    try {
      debugLog('Loading staked NFTs for address:', userAddress);
      if (!contract || !web3 || !nftContract) {
        throw new Error('Contracts not initialized');
      }
      
      const checksumAddress = web3.utils.toChecksumAddress(userAddress);
      
      // Try different methods to get staked NFTs from the contract
      let stakedTokenIds: string[] = [];
      let methodUsed = '';
      
      // First attempt: Try getStakedTokens function (primary method)
      try {
        debugLog('Attempting to call getStakedTokens...');
        const result = await safeRpcCall(
          () => contract.methods.getStakedTokens(checksumAddress).call(),
          'Get staked tokens using getStakedTokens',
          3
        );
        
        if (Array.isArray(result) && result.length > 0) {
          debugLog('Successfully retrieved staked token IDs from getStakedTokens:', result);
          stakedTokenIds = result.map(id => id.toString());
          methodUsed = 'getStakedTokens';
        } else if (result && !Array.isArray(result)) {
          // Handle case where result is not an array but a single value
          debugLog('getStakedTokens returned a single value:', result);
          stakedTokenIds = [result.toString()];
          methodUsed = 'getStakedTokens (single)';
    } else {
          debugLog('getStakedTokens returned empty result');
        }
      } catch (error) {
        console.error('Error calling getStakedTokens:', error);
        debugLog('Could not get staked NFTs from getStakedTokens, trying alternative methods...');
        
        // Second attempt: Try stakedNFTs mapping if it's a public array/mapping
        try {
          debugLog('Attempting to call stakedNFTs mapping...');
          const stakedTokenId = await safeRpcCall(
            () => contract.methods.stakedNFTs(checksumAddress).call(),
            'Get staked NFT ID from stakedNFTs mapping',
            3
          );
          
          if (stakedTokenId && Number(stakedTokenId) > 0) {
            debugLog('Found staked token ID from stakedNFTs mapping:', stakedTokenId);
            stakedTokenIds.push(stakedTokenId.toString());
            methodUsed = 'stakedNFTs mapping';
          }
        } catch (error) {
          debugLog('Could not get staked NFTs from stakedNFTs mapping:', error);
          
          // Third attempt: Try getStaked function if it exists
          try {
            debugLog('Attempting to call getStaked...');
            const result = await safeRpcCall(
              () => contract.methods.getStaked(checksumAddress).call(),
              'Get staked NFTs using getStaked',
              3
            );
            
            if (Array.isArray(result) && result.length > 0) {
              debugLog('Found staked token IDs from getStaked:', result);
              stakedTokenIds = result.map(id => id.toString());
              methodUsed = 'getStaked';
            } else if (result && Number(result) > 0) {
              // If it returns a single value
              debugLog('Found single staked token ID from getStaked:', result);
              stakedTokenIds.push(result.toString());
              methodUsed = 'getStaked (single)';
            }
          } catch (error) {
            debugLog('Could not get staked NFTs from getStaked:', error);
            
            // Fourth attempt: Try stakedTokens function if it exists
            try {
              debugLog('Attempting to call stakedTokens...');
              const result = await safeRpcCall(
                () => contract.methods.stakedTokens(checksumAddress).call(),
                'Get staked NFTs using stakedTokens',
                3
              );
              
              if (Array.isArray(result) && result.length > 0) {
                debugLog('Found staked token IDs from stakedTokens:', result);
                stakedTokenIds = result.map(id => id.toString());
                methodUsed = 'stakedTokens';
              } else if (result && Number(result) > 0) {
                debugLog('Found single staked token ID from stakedTokens:', result);
                stakedTokenIds.push(result.toString());
                methodUsed = 'stakedTokens (single)';
              }
            } catch (error) {
              debugLog('Could not get staked NFTs from stakedTokens:', error);
              
              // Last attempt: Check if the contract has a function to get all staked tokens
              try {
                // This is a common pattern in staking contracts
                debugLog('Attempting to check if user is a staker...');
                const isStaker = await safeRpcCall(
                  () => contract.methods.isStaker(checksumAddress).call(),
                  'Check if address is a staker',
                  3
                );
                
                if (isStaker) {
                  debugLog('Address is a staker, checking for staked token ID');
                  // If the user is a staker, try to get their staked token ID
                  // This is for contracts where users can only stake one NFT at a time
                  const tokenId = await safeRpcCall(
                    () => contract.methods.stakerToTokenId(checksumAddress).call(),
                    'Get staked token ID from stakerToTokenId',
                    3
                  );
                  
                  if (tokenId && Number(tokenId) > 0) {
                    debugLog('Found staked token ID from stakerToTokenId:', tokenId);
                    stakedTokenIds.push(tokenId.toString());
                    methodUsed = 'stakerToTokenId';
                  }
                }
              } catch (error) {
                debugLog('Could not determine staked NFTs from contract:', error);
              }
            }
          }
        }
      }
      
      // If we still couldn't get staked NFTs from the contract, try to verify ownership of NFTs
      // that are owned by the staking contract
      if (stakedTokenIds.length === 0) {
        debugLog('No staked NFTs found through contract methods, trying to verify ownership...');
        
        try {
          // Get all NFTs owned by the staking contract
          const nftBalance = await safeRpcCall(
            () => nftContract.methods.balanceOf(stakingContractAddress).call(),
            'Get NFT balance of staking contract',
            3
          );
          
          debugLog(`Staking contract owns ${nftBalance} NFTs`);
          
          if (Number(nftBalance) > 0) {
            // For each NFT owned by the staking contract, check if it's staked by this user
            for (let i = 0; i < Number(nftBalance); i++) {
              try {
                const tokenId = await safeRpcCall(
                  () => nftContract.methods.tokenOfOwnerByIndex(stakingContractAddress, i).call(),
                  `Get token ID at index ${i} for staking contract`,
                  3
                );
                
                debugLog(`Checking if NFT #${tokenId} is staked by user ${checksumAddress}`);
                
                // Try to check if this token is staked by the user
                try {
                  // Try different methods to check ownership
                  let isStakedByUser = false;
                  
                  // Method 1: Check if there's a tokenIdToStaker mapping
                  try {
                    const stakerAddress = await safeRpcCall(
                      () => contract.methods.tokenIdToStaker(tokenId).call(),
                      `Check staker of NFT ${tokenId}`,
                      3
                    );
                    
                    if (stakerAddress.toLowerCase() === checksumAddress.toLowerCase()) {
                      isStakedByUser = true;
                      debugLog(`NFT #${tokenId} is staked by user (verified via tokenIdToStaker)`);
                    }
                  } catch (error) {
                    debugLog(`No tokenIdToStaker mapping for NFT #${tokenId}`);
                  }
                  
                  // Method 2: Check if there's an isStaked function
                  if (!isStakedByUser) {
                    try {
                      const isStaked = await safeRpcCall(
                        () => contract.methods.isStaked(tokenId).call(),
                        `Check if NFT ${tokenId} is staked`,
                        3
                      );
                      
                      if (isStaked) {
                        // If it's staked, check if it's staked by this user
                        try {
                          const stakerAddress = await safeRpcCall(
                            () => contract.methods.stakerOf(tokenId).call(),
                            `Check staker of NFT ${tokenId}`,
                            3
                          );
                          
                          if (stakerAddress.toLowerCase() === checksumAddress.toLowerCase()) {
                            isStakedByUser = true;
                            debugLog(`NFT #${tokenId} is staked by user (verified via isStaked and stakerOf)`);
                          }
                        } catch (error) {
                          debugLog(`Could not verify staker of NFT #${tokenId}`);
                        }
                      }
                    } catch (error) {
                      debugLog(`No isStaked function for NFT #${tokenId}`);
                    }
                  }
                  
                  if (isStakedByUser) {
                    stakedTokenIds.push(tokenId.toString());
                  }
                } catch (error) {
                  debugLog(`Error checking if NFT #${tokenId} is staked by user:`, error);
                }
              } catch (error) {
                debugLog(`Error getting token ID at index ${i} for staking contract:`, error);
              }
            }
            
            if (stakedTokenIds.length > 0) {
              methodUsed = 'ownership verification';
              debugLog(`Found ${stakedTokenIds.length} staked NFTs through ownership verification`);
            }
          }
        } catch (error) {
          debugLog('Error checking NFTs owned by staking contract:', error);
        }
      }
      
      // Fallback: If we still couldn't get staked NFTs, use the cached staked NFTs
      if (stakedTokenIds.length === 0) {
        debugLog('Using cached staked NFTs as fallback');
        // Convert existing stakedNFTs to token IDs
        stakedTokenIds = stakedNFTs.map(nft => nft.id.toString());
        methodUsed = 'cached state';
      }
      
      debugLog(`Final staked token IDs (via ${methodUsed}):`, stakedTokenIds);
      
      if (!stakedTokenIds || stakedTokenIds.length === 0) {
        debugLog('No staked NFTs found');
        setStakedNFTs([]);
        return;
      }
      
      // Create NFT objects for each staked token
      const stakedNftPromises = stakedTokenIds.map(async (tokenId: string | number) => {
        try {
          // Try to get token URI
          const tokenURI = await safeRpcCall(
            () => nftContract.methods.tokenURI(tokenId).call(),
            `Get token URI for staked ID ${tokenId}`,
            3
          );
          
          debugLog(`Token URI for staked ID ${tokenId}:`, tokenURI);
          
          // Create a basic NFT object with isStaked flag
          const nft = createNFTObject(Number(tokenId), true);
          
          // If we have a token URI, try to fetch metadata
          if (tokenURI) {
            try {
              // Handle both IPFS and HTTP URIs
              let metadataUrl = tokenURI;
              if (tokenURI.startsWith('ipfs://')) {
                metadataUrl = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/');
              }
              
              const response = await fetch(metadataUrl);
              if (response.ok) {
                const metadata = await response.json();
                debugLog(`Metadata for staked token ID ${tokenId}:`, metadata);
                
                // Update NFT object with metadata
                nft.name = metadata.name || `NFT #${tokenId}`;
                nft.description = metadata.description || '';
                
                // Handle image URL
                if (metadata.image) {
                  let imageUrl = metadata.image;
                  if (imageUrl.startsWith('ipfs://')) {
                    imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
                  }
                  nft.image = imageUrl;
                  nft.possibleImages = [imageUrl];
                }
                
                // Handle attributes
                if (metadata.attributes) {
                  nft.attributes = metadata.attributes;
                }
              }
            } catch (metadataError) {
              console.error(`Error fetching metadata for staked token ID ${tokenId}:`, metadataError);
            }
          }
          
          return nft;
        } catch (error) {
          console.error(`Error processing staked token ID ${tokenId}:`, error);
          // Return a basic NFT object even if there was an error
          return createNFTObject(Number(tokenId), true);
        }
      });
      
      const stakedNfts = await Promise.all(stakedNftPromises);
      debugLog('Processed staked NFTs:', stakedNfts);
      
      // After fetching staked NFTs, ensure no duplicates by using a Set
      const uniqueTokenIds = new Set();
      const uniqueStakedNFTs: NFT[] = [];
      
      for (const tokenId of stakedTokenIds) {
        // Only add if this tokenId hasn't been seen before
        if (!uniqueTokenIds.has(tokenId)) {
          uniqueTokenIds.add(tokenId);
          
          // Create NFT object and add to uniqueStakedNFTs
          const nft = createNFTObject(Number(tokenId), true);
          uniqueStakedNFTs.push(nft);
        } else {
          console.log(`Prevented duplicate NFT #${tokenId} from being added to staked list`);
        }
      }
      
      // Update state with unique NFTs
      setStakedNFTs(uniqueStakedNFTs);
      
    } catch (error: unknown) {
      console.error('Error loading staked NFTs:', error);
      setErrorMessage(`Failed to load staked NFTs: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setStakedNFTs([]);
    }
  };

  // Enhanced function to refresh all NFT data
  const refreshAllNFTData = async () => {
    if (!account || !web3 || !nftContract || !contract) {
      debugLog('Cannot refresh NFT data - missing required connections');
      return;
    }
    
    debugLog('Starting full NFT data refresh');
    setIsLoading(true);
    
    try {
      // Load owned NFTs
      await loadNFTsFromBlockchain(account, nftContract, web3);
      
      // Load staked NFTs
      await loadStakedNFTs(account);
      
      // Refresh reward data
      await refreshRewardData(account);
      
      debugLog('NFT data refresh completed successfully');
    } catch (error: unknown) {
      console.error('Error during NFT data refresh:', error);
      setErrorMessage(`Failed to refresh NFT data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Add this effect to refresh NFT data when wallet connects
  useEffect(() => {
    if (account && web3 && nftContract && contract) {
      debugLog('Wallet connected, refreshing NFT data');
      refreshAllNFTData();
    }
  }, [account, web3, nftContract, contract]);

  // Function to refresh reward data without reloading NFTs
  const refreshRewardData = async (userAddress: string) => {
    if (!web3 || !contract) return;
    
    try {
      console.log('Refreshing reward data...');
      const checksumAddress = web3.utils.toChecksumAddress(userAddress);
      
      // Get rewards
      try {
        const rewards = await safeRpcCall(
          () => contract.methods.rewards(checksumAddress).call(),
          'Get rewards in refresh',
          5
        );
        setEarnedRewards(web3.utils.fromWei(rewards, 'ether'));
        setRewardBalance(web3.utils.fromWei(rewards, 'ether'));
      } catch (err) {
        console.error('Error refreshing rewards:', err);
      }
      
      // Get reward cap
      try {
        const rewardCap = await safeRpcCall(
          () => contract.methods.dailyRewardCap().call(),
          'Get reward cap in refresh',
          5
        );
        setDailyRewardCap(web3.utils.fromWei(rewardCap, 'ether'));
      } catch (err) {
        console.error('Error refreshing reward cap:', err);
      }
      
      // Get total staked - this is important
      try {
        const totalStakedCount = await safeRpcCall(
          () => contract.methods.getTotalStakedNFTs().call(),
          'Get total staked in refresh',
          5
        );
        console.log('Total staked NFTs from refresh:', totalStakedCount);
        setTotalStaked(totalStakedCount);
      } catch (err) {
        console.error('Error refreshing total staked:', err);
      }
      
      // Schedule next refresh with longer interval
      setTimeout(() => {
        if (account) {
          refreshRewardData(account);
        }
      }, 60000); // 60 seconds instead of 30 seconds
      
    } catch (error) {
      console.error('Error refreshing reward data:', error);
      
      // Still schedule next refresh even if this one failed, but with a longer delay
      setTimeout(() => {
        if (account) {
          refreshRewardData(account);
        }
      }, 90000); // 90 seconds if there was an error
    }
  };

  // Function to accurately get NFT data with improved error handling
  const loadAccurateNFTData = async () => {
    if (!account || !web3 || !nftContract || !contract) {
      console.log("Cannot load NFT data - missing required connections");
      return;
    }

    setIsLoading(true);
    setTransactionMessage("Loading NFT data...");
    
    try {
      console.log("Starting NFT data loading process");
      
      // Get total staked count first
      const totalStakedCount = await safeRpcCall(
            () => contract.methods.getTotalStakedNFTs().call(),
        'Get total staked',
        3
      );
      console.log("Total staked NFTs:", totalStakedCount);
        setTotalStaked(totalStakedCount);
      
      // Load owned NFTs
      await loadNFTsFromBlockchain(account, nftContract, web3);
      
      // Load staked NFTs
      await loadStakedNFTs(account);
      
      // Get rewards data
      await refreshRewardData(account);
      
      console.log("NFT data loading completed");
    } catch (error: any) {
      console.error("Error loading NFT data:", error);
      setErrorMessage(`Failed to load NFT data: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      setTransactionMessage("");
    }
  };

  // Function to check a single NFT ID
  const checkSingleNftId = async (id: string): Promise<{id: string, status: string, owned: boolean}> => {
    if (!web3 || !nftContract || !account) {
      return { id, status: 'Wallet not connected', owned: false };
    }

    try {
      const nftIdNumber = Number(id.trim());
      
      if (isNaN(nftIdNumber) || nftIdNumber < 0) {
        return { id, status: 'Invalid NFT ID', owned: false };
      }

      // Check if we already have this NFT in our list
      if (ownedNFTs.some(nft => nft.id === nftIdNumber)) {
        return { id, status: 'Already in your collection', owned: true };
      }

      if (stakedNFTs.some(nft => nft.id === nftIdNumber)) {
        return { id, status: 'Already in your staked NFTs', owned: true };
      }

      // Check ownership using the NFT contract
      const checksumAddress = web3.utils.toChecksumAddress(account);
      
      try {
        const owner = await safeRpcCall(
          () => nftContract.methods.ownerOf(nftIdNumber).call(),
          `Check owner of NFT ${nftIdNumber}`,
          3
        );
        
        if (owner.toLowerCase() === checksumAddress.toLowerCase()) {
          // Add to owned NFTs if not already there
          if (!ownedNFTs.some(nft => nft.id === nftIdNumber)) {
            const newNft = createNFTObject(nftIdNumber);
            setOwnedNFTs(prev => [...prev, newNft]);
          }
          return { id, status: 'Belongs to your wallet', owned: true };
        } 
        
        // Check if owned by staking contract
        if (owner.toLowerCase() === stakingContractAddress.toLowerCase()) {
          // Try to check if this NFT is staked by the user
          try {
          const stakedTokenId = await safeRpcCall(
            () => contract.methods.stakedNFTs(checksumAddress).call(),
            'Get staked NFT ID',
              3
            );
            
            if (Number(stakedTokenId) === nftIdNumber) {
              // Add to staked NFTs if not already there
              if (!stakedNFTs.some(nft => nft.id === nftIdNumber)) {
                const newNft = createNFTObject(nftIdNumber, true);
                setStakedNFTs(prev => [...prev, newNft]);
              }
              return { id, status: 'Staked by you', owned: true };
        }
      } catch (error) {
            console.error('Error checking staked NFT:', error);
          }
          
          return { id, status: 'Owned by staking contract', owned: false };
        }
        
        return { id, status: 'Owned by another wallet', owned: false };
      } catch (error) {
        console.error(`Error checking NFT ${id}:`, error);
        return { id, status: 'NFT not found', owned: false };
      }
    } catch (error: unknown) {
      console.error('Error in checkSingleNftId:', error);
      return { id, status: 'Check failed', owned: false };
    }
  };

  // Function to check multiple NFT IDs (batch check)
  const checkBatchNftIds = async () => {
    if (!nftIdInput.trim()) {
      setErrorMessage('Please enter at least one NFT ID');
      return;
    }

    setCheckingBatch(true);
    setBatchResults([]);
    setErrorMessage(null);
    
    try {
      // Parse input - support comma-separated values and ranges with dash
      const inputParts = nftIdInput.split(',').map(part => part.trim());
      const idsToCheck: string[] = [];
      
      // Process each part (could be a single ID or a range)
      inputParts.forEach(part => {
        if (part.includes('-')) {
          // Handle range (e.g., "5-10")
          const [start, end] = part.split('-').map(num => parseInt(num.trim()));
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            for (let i = start; i <= end; i++) {
              idsToCheck.push(i.toString());
            }
          } else {
            // Invalid range format
            idsToCheck.push(part);
          }
        } else {
          // Single ID
          idsToCheck.push(part);
        }
      });
      
      // Check each ID sequentially
      const results = [];
      for (const id of idsToCheck) {
        const result = await checkSingleNftId(id);
        results.push(result);
        
        // Update batch results as we go
        setBatchResults(prev => [...prev, result]);
        
        // Add to checked IDs set
        if (result.owned) {
          setCheckedNftIds(prev => new Set(prev).add(id));
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Update the final batch results
      setBatchResults(results);
      
      // Clear input after successful check
      setNftIdInput('');
    } catch (error: unknown) {
      console.error('Error in batch check:', error);
      setErrorMessage('Failed to check NFT IDs. Please try again.');
    } finally {
      setCheckingBatch(false);
    }
  };

  // Function to add a detected NFT to the collection
  const addDetectedNft = (id: string, isStaked: boolean = false) => {
    const tokenId = Number(id);
    
    if (isStaked) {
      // Check if this NFT is already in the stakedNFTs list
      const alreadyExists = stakedNFTs.some(nft => nft.id === tokenId);
      
      if (!alreadyExists) {
        const newNft = createNFTObject(tokenId, true);
        setStakedNFTs(prev => [...prev, newNft]);
      } else {
        console.log(`Prevented duplicate NFT #${tokenId} from being added to staked list`);
        setTransactionMessage(`Duplicate NFT #${tokenId} prevented`);
        setTimeout(() => setTransactionMessage(''), 3000);
      }
    } else {
      // Similar check for ownedNFTs
      const alreadyExists = ownedNFTs.some(nft => nft.id === tokenId);
      
      if (!alreadyExists) {
        const newNft = createNFTObject(tokenId);
        setOwnedNFTs(prev => [...prev, newNft]);
      } else {
        console.log(`Prevented duplicate NFT #${tokenId} from being added to owned list`);
      }
    }
  };

  // Function to stake NFT directly from the Quick NFT Access section
  const quickStakeNFT = async () => {
    if (!nftIdInput.trim() || !web3 || !nftContract || !contract || !account) {
      setErrorMessage('Please enter a valid NFT ID and connect your wallet');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setTransactionMessage(`Staking NFT #${nftIdInput}...`);
    
    try {
      const nftId = Number(nftIdInput.trim());
      
      if (isNaN(nftId) || nftId < 0) {
        throw new Error('Invalid NFT ID');
      }
      
      // Check if the user owns this NFT
        const owner = await safeRpcCall(
          () => nftContract.methods.ownerOf(nftId).call(),
          `Check owner of NFT ${nftId}`,
          3
        );
        
      const checksumAddress = web3.utils.toChecksumAddress(account);
      
      if (owner.toLowerCase() !== checksumAddress.toLowerCase()) {
        throw new Error(`You don't own NFT #${nftId}`);
      }
      
      // Check if the NFT is approved for the staking contract
      const approved = await safeRpcCall(
        () => nftContract.methods.getApproved(nftId).call(),
        `Check approval for NFT ${nftId}`,
        3
      );
      
      if (approved.toLowerCase() !== stakingContractAddress.toLowerCase()) {
        // Approve the NFT for staking
        setTransactionMessage(`Approving NFT #${nftId} for staking...`);
        await safeRpcCall(
          () => nftContract.methods.approve(stakingContractAddress, nftId).send({ from: account }),
          `Approve NFT ${nftId} for staking`,
          3
        );
      }
      
      // Stake the NFT
      setTransactionMessage(`Staking NFT #${nftId}...`);
      await safeRpcCall(
        () => contract.methods.stake(nftId).send({ from: account }),
        `Stake NFT ${nftId}`,
        3
      );
      
      // Add the NFT to the staked NFTs list
      const newNft = createNFTObject(nftId, true);
      setStakedNFTs(prev => [...prev.filter(nft => nft.id !== nftId), newNft]);
      
      // Remove from owned NFTs if it exists there
      setOwnedNFTs(prev => prev.filter(nft => nft.id !== nftId));
      
      // Show success message
      setTransactionMessage(`Successfully staked NFT #${nftId}`);
          
          // Clear the input
      setNftIdInput('');
      
      // Refresh NFT data
      setTimeout(() => {
        refreshAllNFTData();
      }, 2000);
      
    } catch (error: unknown) {
      console.error('Error staking NFT:', error);
      setErrorMessage(`Failed to stake NFT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      // Clear transaction message after a delay
      setTimeout(() => {
        setTransactionMessage('');
      }, 5000);
    }
  };
  
  // Function to unstake NFT directly from the Quick NFT Access section
  const quickUnstakeNFT = async () => {
    if (!nftIdInput.trim() || !web3 || !nftContract || !contract || !account) {
      setErrorMessage('Please enter a valid NFT ID and connect your wallet');
          return;
        }
        
    setIsLoading(true);
    setErrorMessage(null);
    setTransactionMessage(`Unstaking NFT #${nftIdInput}...`);
    
    try {
      const nftId = Number(nftIdInput.trim());
      
      if (isNaN(nftId) || nftId < 0) {
        throw new Error('Invalid NFT ID');
      }
      
      // Check if the NFT is staked by the user
      const isStaked = stakedNFTs.some(nft => nft.id === nftId);
      
      if (!isStaked) {
        // Try to verify with the contract if possible
        let contractVerified = false;
        
        try {
          // This is a common pattern in staking contracts
          const owner = await safeRpcCall(
            () => nftContract.methods.ownerOf(nftId).call(),
            `Check owner of NFT ${nftId}`,
            3
          );
          
        if (owner.toLowerCase() === stakingContractAddress.toLowerCase()) {
            // The NFT is owned by the staking contract, but we need to verify if this user staked it
            // This depends on the contract implementation, so we'll try a few common patterns
            
            try {
              const stakerAddress = await safeRpcCall(
                () => contract.methods.tokenIdToStaker(nftId).call(),
                `Check staker of NFT ${nftId}`,
                3
              );
              
              if (stakerAddress.toLowerCase() === account.toLowerCase()) {
                contractVerified = true;
              }
            } catch (error) {
              console.error('Could not verify staker from tokenIdToStaker:', error);
              
              // Try another common pattern
            try {
              const stakedTokenId = await safeRpcCall(
                  () => contract.methods.stakedNFTs(account).call(),
                  'Get staked NFT ID from mapping',
                3
              );
              
              if (Number(stakedTokenId) === nftId) {
                  contractVerified = true;
                }
              } catch (error) {
                console.error('Could not verify staker from stakedNFTs mapping:', error);
              }
            }
          }
        } catch (error) {
          console.error('Error verifying NFT ownership for unstaking:', error);
        }
        
        if (!contractVerified) {
          throw new Error(`NFT #${nftId} is not staked by you or could not be verified`);
        }
      }
      
      // Unstake the NFT
      await safeRpcCall(
        () => contract.methods.unstake(nftId).send({ from: account }),
        `Unstake NFT ${nftId}`,
        3
      );
      
      // Add the NFT to the owned NFTs list
      const newNft = createNFTObject(nftId, false);
      setOwnedNFTs(prev => [...prev.filter(nft => nft.id !== nftId), newNft]);
      
      // Remove from staked NFTs
      setStakedNFTs(prev => prev.filter(nft => nft.id !== nftId));
      
      // Show success message
      setTransactionMessage(`Successfully unstaked NFT #${nftId}`);
                
                // Clear the input
      setNftIdInput('');
      
      // Refresh NFT data
      setTimeout(() => {
        refreshAllNFTData();
      }, 2000);
      
    } catch (error: unknown) {
      console.error('Error unstaking NFT:', error);
      setErrorMessage(`Failed to unstake NFT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      // Clear transaction message after a delay
      setTimeout(() => {
        setTransactionMessage('');
      }, 5000);
    }
  };

  // Function to set up event listeners for staking events
  const setupEventListeners = useCallback(() => {
    if (!contract || !web3 || !account || eventListenersSet) return;
    
    debugLog('Setting up event listeners for staking events');
    
    try {
      // Listen for Staked events
      contract.events.Staked({ filter: { staker: account } })
        .on('data', async (event: any) => {
          const { tokenId, staker } = event.returnValues;
          debugLog(`Staked event detected: Token ID ${tokenId} staked by ${staker}`);
          
          if (staker.toLowerCase() === account.toLowerCase()) {
            // Add the NFT to the staked NFTs list if not already there
            if (!stakedNFTs.some(nft => nft.id === Number(tokenId))) {
              const newNft = createNFTObject(Number(tokenId), true);
              setStakedNFTs(prev => [...prev, newNft]);
              
              // Remove from owned NFTs if it exists there
              setOwnedNFTs(prev => prev.filter(nft => nft.id !== Number(tokenId)));
              
              // Show success message
              setTransactionMessage(`NFT #${tokenId} staked successfully`);
              setTimeout(() => setTransactionMessage(''), 5000);
            }
            
            // Refresh reward data
            refreshRewardData(account);
          }
        })
        .on('error', (error: any) => {
          console.error('Error in Staked event listener:', error);
        });
      
      // Listen for Unstaked events
      contract.events.Unstaked({ filter: { staker: account } })
        .on('data', async (event: any) => {
          const { tokenId, staker } = event.returnValues;
          debugLog(`Unstaked event detected: Token ID ${tokenId} unstaked by ${staker}`);
          
          if (staker.toLowerCase() === account.toLowerCase()) {
            // Add the NFT to the owned NFTs list if not already there
            if (!ownedNFTs.some(nft => nft.id === Number(tokenId))) {
              const newNft = createNFTObject(Number(tokenId), false);
              setOwnedNFTs(prev => [...prev, newNft]);
              
              // Remove from staked NFTs
              setStakedNFTs(prev => prev.filter(nft => nft.id !== Number(tokenId)));
              
              // Show success message
              setTransactionMessage(`NFT #${tokenId} unstaked successfully`);
              setTimeout(() => setTransactionMessage(''), 5000);
            }
            
            // Refresh reward data
            refreshRewardData(account);
          }
        })
        .on('error', (error: any) => {
          console.error('Error in Unstaked event listener:', error);
        });
      
      // Listen for RewardsClaimed events
      contract.events.RewardsClaimed({ filter: { staker: account } })
        .on('data', async (event: any) => {
          const { staker, amount } = event.returnValues;
          debugLog(`RewardsClaimed event detected: ${amount} rewards claimed by ${staker}`);
          
          if (staker.toLowerCase() === account.toLowerCase()) {
            // Refresh reward data
            refreshRewardData(account);
            
            // Show success message
            const formattedAmount = web3.utils.fromWei(amount, 'ether');
            setTransactionMessage(`${formattedAmount} MON rewards claimed successfully`);
            setTimeout(() => setTransactionMessage(''), 5000);
          }
        })
        .on('error', (error: any) => {
          console.error('Error in RewardsClaimed event listener:', error);
        });
      
      setEventListenersSet(true);
      debugLog('Event listeners set up successfully');
    } catch (error) {
      console.error('Error setting up event listeners:', error);
    }
  }, [contract, web3, account, stakedNFTs, ownedNFTs, eventListenersSet]);

  // Set up event listeners when contract and account are available
  useEffect(() => {
    if (contract && web3 && account && !eventListenersSet) {
      setupEventListeners();
    }
  }, [contract, web3, account, eventListenersSet, setupEventListeners]);

  // Monitor network connection status
  useEffect(() => {
    const checkNetworkStatus = () => {
      if (!web3) {
        setNetworkStatus('disconnected');
        return;
      }
      
      web3.eth.net.isListening()
        .then(() => {
          setNetworkStatus('connected');
        })
        .catch(() => {
          setNetworkStatus('disconnected');
        });
    };
    
    // Check initial status
    if (web3) {
      setNetworkStatus('connecting');
      checkNetworkStatus();
    }
    
    // Set up interval to check status periodically
    const intervalId = setInterval(checkNetworkStatus, 30000); // Check every 30 seconds
    
    // Listen for network changes
    if (window.ethereum) {
      window.ethereum.on('networkChanged', () => {
        setNetworkStatus('connecting');
        setTimeout(checkNetworkStatus, 1000);
      });
      
      window.ethereum.on('disconnect', () => {
        setNetworkStatus('disconnected');
      });
      
      window.ethereum.on('connect', () => {
        setNetworkStatus('connecting');
        setTimeout(checkNetworkStatus, 1000);
      });
    }
    
    return () => {
      clearInterval(intervalId);
      if (window.ethereum) {
        window.ethereum.removeListener('networkChanged', checkNetworkStatus);
        window.ethereum.removeListener('disconnect', checkNetworkStatus);
        window.ethereum.removeListener('connect', checkNetworkStatus);
      }
    };
  }, [web3]);

  // Function to check if an NFT is staked and add it to the staked NFTs list if it is
  const checkAndAddStakedNFT = async () => {
    if (!nftIdInput.trim() || !web3 || !nftContract || !contract || !account) {
      setErrorMessage('Please enter a valid NFT ID and connect your wallet');
      return;
    }
    
    setIsLoading(true);
    setErrorMessage(null);
    setTransactionMessage(`Checking NFT #${nftIdInput}...`);
    
    try {
      const nftId = Number(nftIdInput.trim());
      
      if (isNaN(nftId) || nftId < 0) {
        throw new Error('Invalid NFT ID');
      }
      
      // Check if the NFT exists
      try {
        await safeRpcCall(
          () => nftContract.methods.ownerOf(nftId).call(),
          `Check if NFT ${nftId} exists`,
          3
        );
      } catch (error) {
        throw new Error(`NFT #${nftId} does not exist`);
      }
      
      // Check if the NFT is staked using isStaked function
      let isNftStaked = false;
      try {
        isNftStaked = await safeRpcCall(
          () => contract.methods.isStaked(nftId).call(),
          `Check if NFT ${nftId} is staked`,
          3
        );
        debugLog(`NFT #${nftId} staked status:`, isNftStaked);
      } catch (error) {
        debugLog('Error checking if NFT is staked, trying alternative methods:', error);
        
        // Alternative: Check if the NFT is owned by the staking contract
        try {
          const owner = await safeRpcCall(
            () => nftContract.methods.ownerOf(nftId).call(),
            `Check owner of NFT ${nftId}`,
            3
          );
          
          if (owner.toLowerCase() === stakingContractAddress.toLowerCase()) {
            isNftStaked = true;
            debugLog(`NFT #${nftId} is owned by the staking contract`);
          }
        } catch (error) {
          debugLog('Error checking NFT owner:', error);
        }
      }
      
      if (isNftStaked) {
        // Add the NFT to the staked NFTs list if not already there
        if (!stakedNFTs.some(nft => nft.id === nftId)) {
          const newNft = createNFTObject(nftId, true);
          setStakedNFTs(prev => [...prev, newNft]);
          setTransactionMessage(`NFT #${nftId} is staked and added to your staked NFTs list`);
          setActiveTab('staked');
        } else {
          setTransactionMessage(`NFT #${nftId} is already in your staked NFTs list`);
        }
      } else {
        // Check if the user owns this NFT
        try {
          const owner = await safeRpcCall(
            () => nftContract.methods.ownerOf(nftId).call(),
            `Check owner of NFT ${nftId}`,
            3
          );
          
          const checksumAddress = web3.utils.toChecksumAddress(account);
          
          if (owner.toLowerCase() === checksumAddress.toLowerCase()) {
            // Add the NFT to the owned NFTs list if not already there
            if (!ownedNFTs.some(nft => nft.id === nftId)) {
              const newNft = createNFTObject(nftId, false);
              setOwnedNFTs(prev => [...prev, newNft]);
              setTransactionMessage(`NFT #${nftId} is in your wallet and added to your NFTs list`);
              setActiveTab('your');
            } else {
              setTransactionMessage(`NFT #${nftId} is already in your NFTs list`);
            }
          } else {
            setTransactionMessage(`NFT #${nftId} is not staked and not owned by you`);
          }
        } catch (error) {
          debugLog('Error checking NFT owner:', error);
          setTransactionMessage(`Could not determine ownership of NFT #${nftId}`);
        }
      }
      
      // Clear the input
      setNftIdInput('');
      
    } catch (error: unknown) {
      console.error('Error checking NFT:', error);
      setErrorMessage(`Failed to check NFT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      // Clear transaction message after a delay
      setTimeout(() => {
        if (!transactionMessage.includes('added to your')) {
          setTransactionMessage('');
        }
      }, 5000);
    }
  };
  
  // Function to unstake NFT directly without ownership check
  const directUnstakeNFT = async () => {
    if (!nftIdInput.trim() || !web3 || !contract || !account) {
      setErrorMessage('Please enter a valid NFT ID and connect your wallet');
      return;
    }
    
    setIsLoading(true);
    setErrorMessage(null);
    setTransactionMessage(`Unstaking NFT #${nftIdInput}...`);
    
    try {
      const nftId = Number(nftIdInput.trim());
      
      if (isNaN(nftId) || nftId < 0) {
        throw new Error('Invalid NFT ID');
      }
      
      // Directly call unstake without checking ownership
      // The contract will enforce ownership with require(stakedTokens[tokenId].owner == msg.sender)
      await safeRpcCall(
        () => contract.methods.unstake(nftId).send({ from: account }),
        `Unstake NFT ${nftId}`,
        3
      );
      
      // Add the NFT to the owned NFTs list
      const newNft = createNFTObject(nftId, false);
      setOwnedNFTs(prev => [...prev.filter(nft => nft.id !== nftId), newNft]);
      
      // Remove from staked NFTs
      setStakedNFTs(prev => prev.filter(nft => nft.id !== nftId));
      
      // Show success message
      setTransactionMessage(`Successfully unstaked NFT #${nftId}`);
      
      // Clear the input
      setNftIdInput('');
      
      // Refresh NFT data
      setTimeout(() => {
        refreshAllNFTData();
      }, 2000);
      
    } catch (error: unknown) {
      console.error('Error unstaking NFT:', error);
      setErrorMessage(`Failed to unstake NFT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
      // Clear transaction message after a delay
      setTimeout(() => {
        setTransactionMessage('');
      }, 5000);
    }
  };

  // Add this function to handle wallet disconnection
  const disconnectWallet = async () => {
    try {
      setIsLoading(true);
      
      // Reset all states related to wallet connection
      setAccount('');
      setWeb3(null);
      // Remove setStakingContract since it doesn't exist
      setOwnedNFTs([]);
      setStakedNFTs([]);
      setRewardBalance('0');
      setTotalStaked('0'); // Changed from number to string to match state type
      setDailyRewardCap('0'); // This should be a string since it's initialized as a string
      setEarnedRewards('0');
      
      // Show toast notification
      setTransactionMessage('Wallet disconnected successfully');
      setTimeout(() => setTransactionMessage(''), 3000);
      
      // Clear local storage if you're storing connection info
      localStorage.removeItem('walletConnected');
      
      console.log('Wallet disconnected');
    } catch (error) {
      console.error('Error disconnecting wallet:', error);
      setErrorMessage('Failed to disconnect wallet');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Add CornerNFTs component at the top level */}
      <CornerNFTs />
      
      {/* Add Twitter Link */}
      <TwitterLink />
      
      <div className="app-header">
        {account && (
          <div className="account-connected" onClick={disconnectWallet} title="Click to disconnect wallet">
            <span className="connected-label">Connected:</span>
            <span className="account-address">{`${account.substring(0, 6)}...${account.substring(account.length - 4)}`}</span>
          </div>
        )}
        
        <div className="logo-container">
          <img src="/logo.svg" alt="Anime Lady NFT" width="220" 
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        </div>
        <h1>NFT Staking on Monad Testnet</h1>
        
        {!account ? (
          <button 
            className="connect-button" 
            onClick={connectWallet} 
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="button-content">
                <div className="loading-spinner"></div>
                <span>Connecting...</span>
              </div>
            ) : (
              "Connect Wallet"
            )}
          </button>
        ) : (
          <div className="stats-dashboard">
            <div className="stats-row">
              <div className="stats-group">
                <div className="stat-item">
                  <div className="stat-label">Total Staked</div>
                  <div className="stat-value">{totalStaked} NFTs</div>
                </div>
                
                <div className="stat-item earned-container">
                  <div className="stat-label">Earned</div>
                  <div className="stat-value">{rewardBalance} MON</div>
                  <button 
                    className="claim-button" 
                    onClick={claimRewards} 
                    disabled={isLoading || Number(earnedRewards) <= 0}
                  >
                    {isLoading && transactionMessage === 'Claiming rewards...' ? (
                      <div className="button-content">
                        <div className="loading-spinner"></div>
                        <span>Claiming...</span>
                      </div>
                    ) : (
                      "Claim"
                    )}
                  </button>
                </div>
                
                <div className="stat-item">
                  <div className="stat-label">Daily Cap</div>
                  <div className="stat-value">{dailyRewardCap} MON</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {account && (
        <div className="content">
          {/* Quick NFT Access Section */}
          <div className="nft-checker anime-themed">
            <h3 className="anime-title">Quick NFT Access</h3>
            <p className="anime-description">Enter your NFT ID to quickly view, stake, or unstake NFTs in your wallet or staking contract.</p>
            
            <div className="nft-checker-input">
              <input
                type="text"
                className="anime-input"
                placeholder="Enter NFT ID"
                value={nftIdInput}
                onChange={(e) => setNftIdInput(e.target.value)}
              />
              
              <div className="nft-checker-buttons">
                <button
                  className="nft-checker-button check-button"
                  onClick={checkAndAddStakedNFT}
                  disabled={isLoading || !nftIdInput || isNaN(Number(nftIdInput))}
                >
                  {isLoading && transactionMessage.includes('Checking') ? (
                    <div className="button-content">
                      <div className="loading-spinner"></div>
                      <span>Checking...</span>
                    </div>
                  ) : (
                    <div className="button-content">
                      <span className="button-icon">🔍</span>
                      <span>Check NFT</span>
                    </div>
                  )}
                </button>
                
                <button
                  className="nft-checker-button stake-button"
                  onClick={quickStakeNFT}
                  disabled={isLoading || !nftIdInput || isNaN(Number(nftIdInput))}
                >
                  {isLoading && transactionMessage.includes('Staking') ? (
                    <div className="button-content">
                      <div className="loading-spinner"></div>
                      <span>Staking...</span>
                    </div>
                  ) : (
                    <div className="button-content">
                      <span className="button-icon">⭐</span>
                      <span>Stake NFT</span>
                    </div>
                  )}
                </button>
                
                <button
                  className="nft-checker-button unstake-button"
                  onClick={directUnstakeNFT}
                  disabled={isLoading || !nftIdInput || isNaN(Number(nftIdInput))}
                >
                  {isLoading && transactionMessage.includes('Unstaking') ? (
                    <div className="button-content">
                      <div className="loading-spinner"></div>
                      <span>Unstaking...</span>
                    </div>
                  ) : (
                    <div className="button-content">
                      <span className="button-icon">🔓</span>
                      <span>Unstake NFT</span>
                    </div>
                  )}
                </button>
              </div>
            </div>
            
            {errorMessage && (
              <div className="error-message">{errorMessage}</div>
            )}
            
            {transactionMessage && (
              <div className={`transaction-message ${transactionMessage.includes('Successfully') ? 'success' : ''}`}>
                {transactionMessage}
              </div>
            )}
          </div>

          {/* NFT Collection Section */}
          <div className="nft-collection-container">
            <h2 className="nft-collection-title">
              <span className="nft-collection-title-text">Your NFT Collection</span>
            </h2>
            
            <div className="nft-tabs">
              <button
                className={`nft-tab-button ${activeTab === 'your' ? 'active' : ''}`}
                onClick={() => setActiveTab('your')}
              >
                Your NFTs {ownedNFTs.length > 0 && `(${ownedNFTs.length})`}
              </button>
              <button
                className={`nft-tab-button ${activeTab === 'staked' ? 'active' : ''}`}
                onClick={() => setActiveTab('staked')}
              >
                Staked NFTs {stakedNFTs.length > 0 && `(${stakedNFTs.length})`}
              </button>
            </div>
            
            {isLoading && !transactionMessage.includes('Checking') && !transactionMessage.includes('Staking') && !transactionMessage.includes('Unstaking') ? (
              <div className="nft-loading">
                <div className="nft-loading-spinner"></div>
                <p className="nft-message">Loading NFTs...</p>
              </div>
            ) : (
              <>
                {activeTab === 'your' && ownedNFTs.length === 0 && (
                  <div className="nft-empty-state">
                    <p className="nft-message">You don't have any NFTs in your wallet.</p>
                    <p className="nft-submessage">Use the Quick NFT Access above to check for your NFTs by ID.</p>
                  </div>
                )}
                
                {activeTab === 'staked' && stakedNFTs.length === 0 && (
                  <div className="nft-empty-state">
                    <p className="nft-message">You don't have any staked NFTs.</p>
                    <p className="nft-submessage">Stake your NFTs to earn MON rewards.</p>
                  </div>
                )}
                
                <div className="nft-grid">
                  {activeTab === 'your' && ownedNFTs.map((nft) => (
                    <div key={nft.id} className="nft-card">
                      <div className="nft-card-image">
                        {nft.image ? (
                          <img 
                            src={nft.image} 
                            alt={`NFT #${nft.id}`} 
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.onerror = null;
                              target.src = 'https://via.placeholder.com/200?text=NFT+Image';
                            }}
                          />
                        ) : (
                          <div className="nft-placeholder">
                            NFT #{nft.id}
                          </div>
                        )}
                      </div>
                      <div className="nft-card-content">
                        <h3 className="nft-card-title">NFT #{nft.id}</h3>
                        <button 
                          onClick={() => stakeNFT(nft.id.toString())}
                          disabled={isLoading}
                          className="nft-card-button"
                        >
                          {isLoading && transactionMessage === `Staking NFT #${nft.id}...` ? (
                            <div className="button-content">
                              <div className="loading-spinner"></div>
                              <span>Staking...</span>
                            </div>
                          ) : (
                            'Stake NFT'
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {activeTab === 'staked' && stakedNFTs.map((nft) => (
                    <div key={nft.id} className="nft-card">
                      <div className="nft-card-image">
                        {nft.image ? (
                          <img 
                            src={nft.image} 
                            alt={`NFT #${nft.id}`} 
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.onerror = null;
                              target.src = 'https://via.placeholder.com/200?text=NFT+Image';
                            }}
                          />
                        ) : (
                          <div className="nft-placeholder">
                            NFT #{nft.id}
                          </div>
                        )}
                      </div>
                      <div className="nft-card-content">
                        <h3 className="nft-card-title">NFT #{nft.id}</h3>
                        <button 
                          onClick={() => unstakeNFT(nft.id.toString())}
                          disabled={isLoading}
                          className="nft-card-button"
                        >
                          {isLoading && transactionMessage === `Unstaking NFT #${nft.id}...` ? (
                            <div className="button-content">
                              <div className="loading-spinner"></div>
                              <span>Unstaking...</span>
                            </div>
                          ) : (
                            'Unstake NFT'
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default App; 