const NFTStaking = artifacts.require("NFTStaking");
const MonadNFT = artifacts.require("MonadNFT");

module.exports = function (deployer, network, accounts) {
  // NFT kontratının adresini al
  deployer.then(async () => {
    const nftInstance = await MonadNFT.deployed();
    
    // Staking kontratını NFT kontratının adresiyle deploy et
    await deployer.deploy(NFTStaking, nftInstance.address);
    
    console.log("NFT Contract deployed at:", nftInstance.address);
    console.log("Staking Contract deployed at:", (await NFTStaking.deployed()).address);
  });
}; 