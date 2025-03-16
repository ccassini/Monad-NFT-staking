// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import "../src/MonadNFT.sol";
import "../src/NFTStaking.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy NFT contract
        MonadNFT nft = new MonadNFT(
            "MonadNFT",
            "MNFT",
            "https://monad-nft-metadata.example.com/token/"
        );
        
        // Deploy Staking contract
        NFTStaking staking = new NFTStaking(address(nft));
        
        vm.stopBroadcast();
        
        // Log the addresses
        console.log("MonadNFT deployed at:", address(nft));
        console.log("NFTStaking deployed at:", address(staking));
    }
} 