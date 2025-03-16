// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract MonadNFT is ERC721Enumerable, Ownable {
    using Strings for uint256;
    
    // Base URI for metadata
    string private _baseTokenURI;
    
    // Maximum supply of NFTs
    uint256 public maxSupply = 10000;
    
    // Price to mint an NFT
    uint256 public mintPrice = 0.01 ether;
    
    // Mapping to track if an address is whitelisted
    mapping(address => bool) public whitelisted;
    
    // Event emitted when an NFT is minted
    event NFTMinted(address indexed minter, uint256 tokenId);
    
    constructor(string memory name, string memory symbol, string memory baseURI) 
        ERC721(name, symbol)
        Ownable(msg.sender)
    {
        _baseTokenURI = baseURI;
    }
    
    // Function to mint a new NFT
    function mint() external payable {
        require(totalSupply() < maxSupply, "Max supply reached");
        require(msg.value >= mintPrice, "Insufficient payment");
        
        uint256 tokenId = totalSupply() + 1;
        _safeMint(msg.sender, tokenId);
        
        emit NFTMinted(msg.sender, tokenId);
    }
    
    // Function to mint multiple NFTs at once
    function mintMultiple(uint256 count) external payable {
        require(totalSupply() + count <= maxSupply, "Exceeds max supply");
        require(msg.value >= mintPrice * count, "Insufficient payment");
        
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = totalSupply() + 1;
            _safeMint(msg.sender, tokenId);
            emit NFTMinted(msg.sender, tokenId);
        }
    }
    
    // Function to mint NFTs for whitelisted addresses (free)
    function whitelistMint() external {
        require(whitelisted[msg.sender], "Not whitelisted");
        require(totalSupply() < maxSupply, "Max supply reached");
        
        uint256 tokenId = totalSupply() + 1;
        _safeMint(msg.sender, tokenId);
        
        // Remove from whitelist after minting
        whitelisted[msg.sender] = false;
        
        emit NFTMinted(msg.sender, tokenId);
    }
    
    // Function to add addresses to whitelist
    function addToWhitelist(address[] calldata addresses) external onlyOwner {
        for (uint256 i = 0; i < addresses.length; i++) {
            whitelisted[addresses[i]] = true;
        }
    }
    
    // Function to set mint price
    function setMintPrice(uint256 newPrice) external onlyOwner {
        mintPrice = newPrice;
    }
    
    // Function to set max supply
    function setMaxSupply(uint256 newMaxSupply) external onlyOwner {
        require(newMaxSupply >= totalSupply(), "New max supply too low");
        maxSupply = newMaxSupply;
    }
    
    // Function to set base URI
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
    }
    
    // Function to withdraw funds
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Withdrawal failed");
    }
    
    // Override base URI function
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
    
    // Function to get token URI
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "Token does not exist");
        
        string memory baseURI = _baseURI();
        return bytes(baseURI).length > 0 ? string(abi.encodePacked(baseURI, tokenId.toString(), ".json")) : "";
    }
} 