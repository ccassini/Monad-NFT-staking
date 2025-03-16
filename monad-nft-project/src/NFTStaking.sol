// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract NFTStaking is ERC721Holder, Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    
    // NFT contract
    IERC721 public nftContract;
    
    // Reward rate (tokens per day)
    uint256 public rewardRate = 10 ether; // 10 tokens per day
    
    // Minimum staking period (in seconds)
    uint256 public minimumStakingPeriod = 1 days;
    
    // Staking information
    struct StakingInfo {
        address owner;
        uint256 stakedAt;
        bool isStaked;
    }
    
    // Mapping from token ID to staking info
    mapping(uint256 => StakingInfo) public stakedTokens;
    
    // Mapping from owner to their staked token IDs
    mapping(address => uint256[]) private _stakedTokensByOwner;
    
    // Mapping to track the index of each token in the _stakedTokensByOwner array
    mapping(uint256 => uint256) private _stakedTokensIndex;
    
    // Mapping from owner to their accumulated rewards
    mapping(address => uint256) public accumulatedRewards;
    
    // Mapping from owner to their last claim time
    mapping(address => uint256) public lastClaimTime;
    
    // Total staked NFTs
    uint256 public totalStaked;
    
    // Events
    event Staked(address indexed owner, uint256 tokenId, uint256 timestamp);
    event Unstaked(address indexed owner, uint256 tokenId, uint256 timestamp);
    event RewardClaimed(address indexed owner, uint256 amount);
    
    constructor(address nftContractAddress) Ownable(msg.sender) {
        nftContract = IERC721(nftContractAddress);
    }
    
    // Function to stake an NFT
    function stake(uint256 tokenId) external nonReentrant {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not the owner of the token");
        require(!stakedTokens[tokenId].isStaked, "Token already staked");
        
        // Update staking info
        stakedTokens[tokenId] = StakingInfo({
            owner: msg.sender,
            stakedAt: block.timestamp,
            isStaked: true
        });
        
        // Add token to owner's staked tokens
        _stakedTokensByOwner[msg.sender].push(tokenId);
        _stakedTokensIndex[tokenId] = _stakedTokensByOwner[msg.sender].length - 1;
        
        // Update total staked
        totalStaked = totalStaked.add(1);
        
        // Transfer NFT to this contract
        nftContract.safeTransferFrom(msg.sender, address(this), tokenId);
        
        emit Staked(msg.sender, tokenId, block.timestamp);
    }
    
    // Function to unstake an NFT
    function unstake(uint256 tokenId) external nonReentrant {
        require(stakedTokens[tokenId].owner == msg.sender, "Not the owner of the staked token");
        require(stakedTokens[tokenId].isStaked, "Token not staked");
        require(block.timestamp >= stakedTokens[tokenId].stakedAt + minimumStakingPeriod, "Minimum staking period not met");
        
        // Calculate rewards
        uint256 reward = calculateReward(tokenId);
        
        // Add rewards to accumulated rewards
        accumulatedRewards[msg.sender] = accumulatedRewards[msg.sender].add(reward);
        
        // Remove token from owner's staked tokens
        uint256 lastTokenIndex = _stakedTokensByOwner[msg.sender].length - 1;
        uint256 tokenIndex = _stakedTokensIndex[tokenId];
        
        if (tokenIndex != lastTokenIndex) {
            uint256 lastTokenId = _stakedTokensByOwner[msg.sender][lastTokenIndex];
            _stakedTokensByOwner[msg.sender][tokenIndex] = lastTokenId;
            _stakedTokensIndex[lastTokenId] = tokenIndex;
        }
        
        _stakedTokensByOwner[msg.sender].pop();
        delete _stakedTokensIndex[tokenId];
        
        // Update staking info
        delete stakedTokens[tokenId];
        
        // Update total staked
        totalStaked = totalStaked.sub(1);
        
        // Transfer NFT back to owner
        nftContract.safeTransferFrom(address(this), msg.sender, tokenId);
        
        emit Unstaked(msg.sender, tokenId, block.timestamp);
    }
    
    // Function to claim rewards
    function claimRewards() external nonReentrant {
        uint256 rewards = getRewardAmount(msg.sender);
        require(rewards > 0, "No rewards to claim");
        
        // Reset accumulated rewards
        accumulatedRewards[msg.sender] = 0;
        
        // Update last claim time
        lastClaimTime[msg.sender] = block.timestamp;
        
        // Transfer rewards to user (this would typically be a token transfer)
        // For this example, we'll just emit an event
        emit RewardClaimed(msg.sender, rewards);
        
        // In a real implementation, you would transfer tokens here
        // rewardToken.transfer(msg.sender, rewards);
    }
    
    // Function to calculate reward for a single token
    function calculateReward(uint256 tokenId) public view returns (uint256) {
        if (!stakedTokens[tokenId].isStaked) {
            return 0;
        }
        
        uint256 stakingDuration = block.timestamp - stakedTokens[tokenId].stakedAt;
        return stakingDuration * rewardRate / 1 days;
    }
    
    // Function to get total reward amount for an address
    function getRewardAmount(address owner) public view returns (uint256) {
        uint256 pendingRewards = 0;
        
        // Calculate pending rewards for all staked tokens
        for (uint256 i = 0; i < _stakedTokensByOwner[owner].length; i++) {
            uint256 tokenId = _stakedTokensByOwner[owner][i];
            pendingRewards = pendingRewards.add(calculateReward(tokenId));
        }
        
        // Add accumulated rewards
        return accumulatedRewards[owner].add(pendingRewards);
    }
    
    // Function to get staked tokens by owner
    function getStakedTokens(address owner) external view returns (uint256[] memory) {
        return _stakedTokensByOwner[owner];
    }
    
    // Function to set reward rate (only owner)
    function setRewardRate(uint256 newRate) external onlyOwner {
        rewardRate = newRate;
    }
    
    // Function to set minimum staking period (only owner)
    function setMinimumStakingPeriod(uint256 newPeriod) external onlyOwner {
        minimumStakingPeriod = newPeriod;
    }
    
    // Function to check if a token is staked
    function isStaked(uint256 tokenId) external view returns (bool) {
        return stakedTokens[tokenId].isStaked;
    }
} 