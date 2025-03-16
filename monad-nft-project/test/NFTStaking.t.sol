// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import "../src/MonadNFT.sol";
import "../src/NFTStaking.sol";

contract NFTStakingTest is Test {
    MonadNFT public nft;
    NFTStaking public staking;
    address public owner;
    address public user1;
    address public user2;
    
    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        
        // Fund users with ETH
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
        
        // Deploy NFT contract
        nft = new MonadNFT("MonadNFT", "MNFT", "https://example.com/token/");
        
        // Deploy Staking contract
        staking = new NFTStaking(address(nft));
        
        // Mint NFTs for testing
        vm.prank(user1);
        nft.mint{value: 0.01 ether}();
        
        vm.prank(user1);
        nft.mint{value: 0.01 ether}();
        
        vm.prank(user2);
        nft.mint{value: 0.01 ether}();
    }
    
    function testStake() public {
        // Approve staking contract to transfer NFT
        vm.prank(user1);
        nft.approve(address(staking), 1);
        
        // Stake NFT
        vm.prank(user1);
        staking.stake(1);
        
        // Check ownership
        assertEq(nft.ownerOf(1), address(staking));
        
        // Check staking info
        (address owner, , bool isStaked) = staking.stakedTokens(1);
        assertEq(owner, user1);
        assertTrue(isStaked);
        
        // Check total staked
        assertEq(staking.totalStaked(), 1);
    }
    
    function testUnstake() public {
        // Stake NFT
        vm.prank(user1);
        nft.approve(address(staking), 1);
        
        vm.prank(user1);
        staking.stake(1);
        
        // Warp time to meet minimum staking period
        vm.warp(block.timestamp + 1 days);
        
        // Unstake NFT
        vm.prank(user1);
        staking.unstake(1);
        
        // Check ownership
        assertEq(nft.ownerOf(1), user1);
        
        // Check staking info
        (, , bool isStaked) = staking.stakedTokens(1);
        assertFalse(isStaked);
        
        // Check total staked
        assertEq(staking.totalStaked(), 0);
    }
    
    function testFailUnstakeBeforeMinimumPeriod() public {
        // Stake NFT
        vm.prank(user1);
        nft.approve(address(staking), 1);
        
        vm.prank(user1);
        staking.stake(1);
        
        // Try to unstake before minimum period
        vm.prank(user1);
        staking.unstake(1); // This should fail
    }
    
    function testFailUnstakeNotOwner() public {
        // Stake NFT
        vm.prank(user1);
        nft.approve(address(staking), 1);
        
        vm.prank(user1);
        staking.stake(1);
        
        // Warp time to meet minimum staking period
        vm.warp(block.timestamp + 1 days);
        
        // Try to unstake as non-owner
        vm.prank(user2);
        staking.unstake(1); // This should fail
    }
    
    function testRewards() public {
        // Stake NFT
        vm.prank(user1);
        nft.approve(address(staking), 1);
        
        vm.prank(user1);
        staking.stake(1);
        
        // Warp time
        vm.warp(block.timestamp + 2 days);
        
        // Check rewards
        uint256 reward = staking.calculateReward(1);
        assertEq(reward, 20 ether); // 10 ether per day * 2 days
        
        uint256 totalReward = staking.getRewardAmount(user1);
        assertEq(totalReward, 20 ether);
        
        // Unstake and check accumulated rewards
        vm.prank(user1);
        staking.unstake(1);
        
        uint256 accumulatedRewards = staking.accumulatedRewards(user1);
        assertEq(accumulatedRewards, 20 ether);
    }
    
    function testClaimRewards() public {
        // Stake NFT
        vm.prank(user1);
        nft.approve(address(staking), 1);
        
        vm.prank(user1);
        staking.stake(1);
        
        // Warp time
        vm.warp(block.timestamp + 2 days);
        
        // Unstake to accumulate rewards
        vm.prank(user1);
        staking.unstake(1);
        
        // Claim rewards
        vm.prank(user1);
        staking.claimRewards();
        
        // Check accumulated rewards after claim
        uint256 accumulatedRewards = staking.accumulatedRewards(user1);
        assertEq(accumulatedRewards, 0);
        
        // Check last claim time
        uint256 lastClaimTime = staking.lastClaimTime(user1);
        assertEq(lastClaimTime, block.timestamp);
    }
    
    function testGetStakedTokens() public {
        // Stake multiple NFTs
        vm.prank(user1);
        nft.approve(address(staking), 1);
        
        vm.prank(user1);
        staking.stake(1);
        
        vm.prank(user1);
        nft.approve(address(staking), 2);
        
        vm.prank(user1);
        staking.stake(2);
        
        // Get staked tokens
        uint256[] memory stakedTokens = staking.getStakedTokens(user1);
        
        // Check staked tokens
        assertEq(stakedTokens.length, 2);
        assertEq(stakedTokens[0], 1);
        assertEq(stakedTokens[1], 2);
    }
    
    function testSetRewardRate() public {
        // Set new reward rate
        staking.setRewardRate(20 ether);
        
        // Stake NFT
        vm.prank(user1);
        nft.approve(address(staking), 1);
        
        vm.prank(user1);
        staking.stake(1);
        
        // Warp time
        vm.warp(block.timestamp + 1 days);
        
        // Check rewards with new rate
        uint256 reward = staking.calculateReward(1);
        assertEq(reward, 20 ether); // 20 ether per day * 1 day
    }
    
    // Receive function to allow contract to receive ETH
    receive() external payable {}
} 