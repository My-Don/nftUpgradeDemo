//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "erc721a-upgradeable/contracts/ERC721AUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/MerkleProofUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract NfinityV2 is
    ERC721AUpgradeable,
    OwnableUpgradeable
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
    uint256 private count;
    uint256 private currentIndex;
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
    mapping(address => mapping(uint256 => bool)) public mintLimited;
    event Cast(address indexed index, uint256 indexed account);
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
        //__ReentrancyGuard_init();
        MAX_NFT = _nftData._maxNft;
        MAX_PER_TX = _nftData._maxPerTx;
        WHITE_LIST_MINT_PRICE = _nftData._whiteListMintPrice * 10**15;
        PUBLIC_MINT_PRICE = _nftData._publicMintPrice * 10**15;
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
        payable(owner()).transfer(address(this).balance);
    }

     function burn(uint256 tokenId) external onlyOwner {
        require(_exists(tokenId), "ERC721: Burn query for nonexistent token");
        _burn(tokenId, false);
    }

    function whiteListMint(
        address to,
        uint256 quantity,
        bytes32[] memory _merkProof
    ) external payable  isHuman {
        require(whiteListSwitch, "WhiteList is not active");
        require(
            quantity <= MAX_PER_TX && !mintLimited[to][MAX_PER_TX],
            "WhiteList: Max per tx amount exceeded"
        );
        require(
            currentIndex + quantity <= MAX_NFT - AIR_DROP,
            "WhiteList: The number cannot exceed the WhiteList limit"
        );
        require(
            msg.value == WHITE_LIST_MINT_PRICE * quantity,
            "WhiteList: Not enough mint fees"
        );
        bytes32 leaf = keccak256(abi.encodePacked(to));
        require(
            MerkleProofUpgradeable.verify(_merkProof, merkle, leaf),
            "WhiteList: Invalid proof"
        );
        currentIndex += quantity;
        mintLimited[to][currentIndex] = currentIndex == MAX_PER_TX
            ? true
            : false;
        _safeMint(to, quantity);
    }

     function publicMint(address to, uint256 quantity)
        external
        payable
        isHuman
    {
        require(publicMintSwitch, "Public mint is not active");
        require(
            quantity <= MAX_PER_TX && !mintLimited[to][MAX_PER_TX],
            "PublicMint: Max per tx amount exceeded"
        );
        require(
            currentIndex + quantity <= MAX_NFT - AIR_DROP,
            "PublicMint: The number cannot exceed the publicMint limit"
        );
        require(
            msg.value == PUBLIC_MINT_PRICE * quantity,
            "PublicMint: Not enough mint fees"
        );
        currentIndex += quantity;
        mintLimited[to][currentIndex] = currentIndex == MAX_PER_TX
            ? true
            : false;
        _safeMint(to, quantity);
    }

    function airdrop(address[] calldata users,uint256[] calldata amounts) external onlyOwner {
        require(airDropSwitch, "AirDrop is not active");
        require(
             AIR_DROP > 0 && AIR_DROP + totalSupply() <= MAX_NFT && users.length <= AIR_DROP && users.length == amounts.length && count < AIR_DROP,
            "AirDrop: The number of people exceeds the limit"
        );
        uint256 len = users.length;
        uint256 _count = count;
        uint256 j; 
        while(j < len){
            _safeMint(users[j], amounts[j]);
            _count += amounts[j];
            emit Cast(users[j],amounts[j]);
            unchecked {
                j++;
            }
        }
        count = _count;
    }

    function _baseURI() internal view virtual override returns (string memory) {
        return bytes(blindTokenURI).length > 0 && blindBoxOpened ? blindTokenURI :  baseTokenURI;
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
        return bytes(baseURI).length != 0 ? string(abi.encodePacked(baseURI, _toString(tokenId),".json")) : "";
    }


}
