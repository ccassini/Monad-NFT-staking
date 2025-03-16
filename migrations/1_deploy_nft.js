const MonadNFT = artifacts.require("MonadNFT");

module.exports = function (deployer) {
  // NFT kontratını deploy et
  // Parametreler: name, symbol, baseURI
  deployer.deploy(MonadNFT, "Monad NFT Collection", "MNFT", "https://api.example.com/nft/");
}; 