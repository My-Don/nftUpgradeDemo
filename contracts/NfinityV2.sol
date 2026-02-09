//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "erc721a-upgradeable/contracts/ERC721AUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract NfinityV2 is
    Initializable
    ERC721AUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 private merkle;
    bool public publicMintSwitch;
    bool public whiteListSwitch;
    bool public airDropSwitch;
    bool public blindBoxOpened;
    uint256 public MAX_PER_TX;
    uint256 public WHITE_LIST_MINT_PRICE;
    uint256 public PUBLIC_MINT_PRICE;
    uint256 public AIR_DROP;
    uint256 public MAX_NFT;
    uint256 private airDropCount; 
    string private baseTokenURI;
    string private blindTokenURI;
    
    struct NftData {
        bool _blindBoxOpened;
        bytes32 _newMerkle;
        uint256 _whiteListMintPrice;
        uint256 _publicMintPrice;
        uint256 _maxNft;
        uint256 _maxPerTx;
        uint256 _airDrop;
        string _blindTokenURI;
        string _name;
        string _symbol;
    }
    
    mapping(address => uint256) public whiteListMinted;
    mapping(address => uint256) public publicMinted;
    
    event Cast(address indexed user, uint256 indexed amount);
    event WhiteListMint(address indexed user, uint256 quantity, uint256 totalPaid);
    event PublicMint(address indexed user, uint256 quantity, uint256 totalPaid);
    
    modifier isHuman() {
        require(_msgSender() == tx.origin, "The caller is another contract");
        _;
    }

    function initialize(NftData memory _nftData)
        public
        initializerERC721A
        initializer
    {
        __ERC721A_init(_nftData._name, _nftData._symbol);
        __Ownable_init();
        __ReentrancyGuard_init();
        
        require(_nftData._maxNft > 0, "Max NFT must be greater than 0");
        require(_nftData._maxPerTx > 0, "Max per tx must be greater than 0");
        require(_nftData._airDrop <= _nftData._maxNft, "Airdrop exceeds max NFT");
        
        MAX_NFT = _nftData._maxNft;
        MAX_PER_TX = _nftData._maxPerTx;
        WHITE_LIST_MINT_PRICE = _nftData._whiteListMintPrice;
        PUBLIC_MINT_PRICE = _nftData._publicMintPrice;
        blindBoxOpened = _nftData._blindBoxOpened;
        blindTokenURI = _nftData._blindTokenURI;
        merkle = _nftData._newMerkle;
        AIR_DROP = _nftData._airDrop;
    }

    function updatewhiteListStatus(bool _whiteListSwitch) external onlyOwner {
        whiteListSwitch = _whiteListSwitch;
    }

    function updatePublicMintStatus(bool _publicMintSwitch) external onlyOwner {
        publicMintSwitch = _publicMintSwitch;
    }

    function updateAirDropStatus(bool _airDropSwitch) external onlyOwner {
        airDropSwitch = _airDropSwitch;
    }

    function updateBlindBoxOpenedStatus(bool _blindBoxOpened)
        external
        onlyOwner
    {
        blindBoxOpened = _blindBoxOpened;
    }

    function updateBlindBoxOpenedUri(string memory _uri) external onlyOwner {
        blindTokenURI = _uri;
    }

    function updateMerkle(bytes32 _newMerkle) external onlyOwner {
        merkle = _newMerkle;
    }

    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        (bool success, ) = owner().call{value: balance}("");
        require(success, "Withdraw failed");
    }

    function burn(uint256 tokenId) external onlyOwner {
        require(_exists(tokenId), "ERC721: Burn query for nonexistent token");
        _burn(tokenId, false);
    }

    function whiteListMint(
        address to,
        uint256 quantity,
        bytes32[] memory _merkProof
    ) external payable isHuman nonReentrant {
        require(whiteListSwitch, "WhiteList is not active");
        require(quantity > 0 && quantity <= MAX_PER_TX, "Invalid quantity");
        require(
            whiteListMinted[to] + quantity <= MAX_PER_TX,
            "WhiteList: Max per address exceeded"
        );
        require(
            totalSupply() + quantity <= MAX_NFT - AIR_DROP,
            "WhiteList: Exceeds available supply"
        );
        require(
            msg.value == WHITE_LIST_MINT_PRICE * quantity,
            "WhiteList: Incorrect payment"
        );
        
        bytes32 leaf = keccak256(abi.encodePacked(to));
        require(
            MerkleProofUpgradeable.verify(_merkProof, merkle, leaf),
            "WhiteList: Invalid proof"
        );
        
        whiteListMinted[to] += quantity;
        _safeMint(to, quantity);
        
        emit WhiteListMint(to, quantity, msg.value);
    }

    function publicMint(address to, uint256 quantity)
        external
        payable
        isHuman
        nonReentrant
    {
        require(publicMintSwitch, "Public mint is not active");
        require(quantity > 0 && quantity <= MAX_PER_TX, "Invalid quantity");
        require(
            publicMinted[to] + quantity <= MAX_PER_TX,
            "PublicMint: Max per address exceeded"
        );
        require(
            totalSupply() + quantity <= MAX_NFT - AIR_DROP,
            "PublicMint: Exceeds available supply"
        );
        require(
            msg.value == PUBLIC_MINT_PRICE * quantity,
            "PublicMint: Incorrect payment"
        );
        
        publicMinted[to] += quantity;
        _safeMint(to, quantity);
        
        emit PublicMint(to, quantity, msg.value);
    }

    function airdrop(address[] calldata users, uint256[] calldata amounts) 
        external 
        onlyOwner 
        nonReentrant 
    {
        require(airDropSwitch, "AirDrop is not active");
        require(users.length > 0, "Empty users array");
        require(users.length == amounts.length, "Arrays length mismatch");
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(users[i] != address(0), "Invalid user address");
            require(amounts[i] > 0, "Invalid amount");
            totalAmount += amounts[i];
        }
        
        require(
            airDropCount + totalAmount <= AIR_DROP,
            "AirDrop: Exceeds airdrop allocation"
        );
        require(
            totalSupply() + totalAmount <= MAX_NFT,
            "AirDrop: Exceeds max supply"
        );
        
        for (uint256 j = 0; j < users.length; j++) {
            _safeMint(users[j], amounts[j]);
            emit Cast(users[j], amounts[j]);
        }
        
        airDropCount += totalAmount;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        // 修复：当盲盒未开启时使用 blindTokenURI，开启后使用 baseTokenURI
        return blindBoxOpened && bytes(baseTokenURI).length > 0 
            ? baseTokenURI 
            : blindTokenURI;
    }

    function setBaseURI(string memory _baseUri) external onlyOwner {
        baseTokenURI = _baseUri;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();
        string memory baseURI = _baseURI();
        return bytes(baseURI).length != 0 
            ? string(abi.encodePacked(baseURI, _toString(tokenId), ".json")) 
            : "";
    }
    
    // 添加辅助函数以查看铸造状态
    function getMintStatus(address user) 
        external 
        view 
        returns (
            uint256 whiteListMintedAmount,
            uint256 publicMintedAmount,
            uint256 remainingWhiteList,
            uint256 remainingPublic
        ) 
    {
        whiteListMintedAmount = whiteListMinted[user];
        publicMintedAmount = publicMinted[user];
        remainingWhiteList = MAX_PER_TX > whiteListMintedAmount 
            ? MAX_PER_TX - whiteListMintedAmount 
            : 0;
        remainingPublic = MAX_PER_TX > publicMintedAmount 
            ? MAX_PER_TX - publicMintedAmount 
            : 0;
    }
    
    function getContractStatus() 
        external 
        view 
        returns (
            uint256 currentSupply,
            uint256 maxSupply,
            uint256 remainingForSale,
            uint256 airDropUsed,
            uint256 airDropRemaining
        ) 
    {
        currentSupply = totalSupply();
        maxSupply = MAX_NFT;
        remainingForSale = MAX_NFT > AIR_DROP + currentSupply 
            ? MAX_NFT - AIR_DROP - currentSupply 
            : 0;
        airDropUsed = airDropCount;
        airDropRemaining = AIR_DROP > airDropCount ? AIR_DROP - airDropCount : 0;
    }
}
