// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import "../src/MonadNFT.sol";

contract MonadNFTTest is Test {
    MonadNFT public nft;
    address public owner;
    address public user1;
    address public user2;
    
    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        
        // Deploy NFT contract
        nft = new MonadNFT("MonadNFT", "MNFT", "https://example.com/token/");
        
        // Fund users with ETH
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
    }
    
    function testMint() public {
        // User1 mints an NFT
        vm.prank(user1);
        nft.mint{value: 0.01 ether}();
        
        // Check ownership
        assertEq(nft.ownerOf(1), user1);
        assertEq(nft.totalSupply(), 1);
    }
    
    function testMintMultiple() public {
        // User1 mints multiple NFTs
        vm.prank(user1);
        nft.mintMultiple{value: 0.03 ether}(3);
        
        // Check ownership
        assertEq(nft.ownerOf(1), user1);
        assertEq(nft.ownerOf(2), user1);
        assertEq(nft.ownerOf(3), user1);
        assertEq(nft.totalSupply(), 3);
    }
    
    function testWhitelistMint() public {
        // Add user2 to whitelist
        address[] memory addresses = new address[](1);
        addresses[0] = user2;
        nft.addToWhitelist(addresses);
        
        // User2 mints an NFT using whitelist
        vm.prank(user2);
        nft.whitelistMint();
        
        // Check ownership
        assertEq(nft.ownerOf(1), user2);
        assertEq(nft.totalSupply(), 1);
        
        // Check user2 is removed from whitelist
        vm.prank(user2);
        vm.expectRevert("Not whitelisted");
        nft.whitelistMint();
    }
    
    function testSetMintPrice() public {
        // Set new mint price
        nft.setMintPrice(0.02 ether);
        
        // Try to mint with old price
        vm.prank(user1);
        vm.expectRevert("Insufficient payment");
        nft.mint{value: 0.01 ether}();
        
        // Mint with new price
        vm.prank(user1);
        nft.mint{value: 0.02 ether}();
        
        // Check ownership
        assertEq(nft.ownerOf(1), user1);
    }
    
    function testWithdraw() public {
        // User1 mints an NFT
        vm.prank(user1);
        nft.mint{value: 0.01 ether}();
        
        // Check contract balance
        assertEq(address(nft).balance, 0.01 ether);
        
        // Withdraw funds
        uint256 ownerBalanceBefore = address(this).balance;
        nft.withdraw();
        uint256 ownerBalanceAfter = address(this).balance;
        
        // Check balances
        assertEq(address(nft).balance, 0);
        assertEq(ownerBalanceAfter - ownerBalanceBefore, 0.01 ether);
    }
    
    function testTokenURI() public {
        // User1 mints an NFT
        vm.prank(user1);
        nft.mint{value: 0.01 ether}();
        
        // Check token URI
        assertEq(nft.tokenURI(1), "https://example.com/token/1.json");
        
        // Set new base URI
        nft.setBaseURI("https://new-example.com/token/");
        
        // Check new token URI
        assertEq(nft.tokenURI(1), "https://new-example.com/token/1.json");
    }
    
    // Receive function to allow contract to receive ETH
    receive() external payable {}
} 