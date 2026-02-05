// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./NfinityV2.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract FactoryV3 is ReentrancyGuard {
    using Clones for address;
    
    bytes internal constant IMPLCODE = type(NfinityV2).creationCode;
    bytes internal constant PROXYADMINCODE = type(ProxyAdmin).creationCode;
    bytes internal constant PROXYCODE = type(TransparentUpgradeableProxy).creationCode;
    
    address internal immutable impl; 
    address internal router;  
    address internal manager;
    bool internal aParm; 
    uint256 private nonce; // 添加 nonce 以确保唯一性
    
    mapping(address => address[]) internal erc721nfts;
  
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

    modifier OnlyRouter() {
        require(msg.sender == router, "Only router");
        _;
    }

    event NftCreated(
        address _owner,
        address indexed _impl,
        address indexed _proxyAdmin,
        address indexed _proxy
    );

    constructor() { 
        manager = msg.sender;
        bytes32 randomBytes = getSalt(block.number);
        impl = create(randomBytes, IMPLCODE);
        require(impl != address(0), "Implementation creation failed");
    }

    function create(
        bytes32 salt_,
        bytes memory byteCode
    ) internal returns (address addr) {
        assembly {
            addr := create2(0, add(byteCode, 0x20), mload(byteCode), salt_)
        }
        require(addr != address(0), "Create2 failed");
    }

    // 修复：使用 block.number 而不是 block.timestamp 配合 blockhash
    function getSalt(uint256 number) internal returns(bytes32 _salt) {
        nonce++;
        _salt = keccak256(
            abi.encodePacked(
                number,
                block.number,
                block.timestamp,
                address(this),
                msg.sender,
                nonce,
                // 使用前一个区块的哈希（如果可用）
                block.number > 0 ? blockhash(block.number - 1) : bytes32(0)
            )
        );
    }

    function onlyInitialize(address _router) external {
        require(msg.sender == manager, "Only Deployer");
        require(!aParm, "Already initialized");
        require(_router != address(0), "Invalid router address");
        router = _router;
        aParm = true;
    }

    function getOwnerNft(address _owner) external view OnlyRouter returns(address[] memory) {
        return erc721nfts[_owner];
    }

    function preCreate(
        bool _blindBoxOpened,
        address _owner,
        bytes32 _newMerkle,  
        uint256[6] calldata _arr,
        string calldata _blindTokenURI,  
        string calldata _name,
        string calldata _symbol
    ) external OnlyRouter returns (address) {
        require(_owner != address(0), "Invalid owner address");
        require(_arr[3] > 0, "Max NFT must be greater than 0");
        require(_arr[4] > 0, "Max per tx must be greater than 0");
        require(_arr[5] <= _arr[3], "Airdrop exceeds max NFT");
        
        uint256 _salt = _arr[0];
        NftData memory nftData = NftData(
            _blindBoxOpened,
            _newMerkle,
            _arr[1],
            _arr[2],
            _arr[3],
            _arr[4],
            _arr[5],
            _blindTokenURI,
            _name,
            _symbol
        );
        return createNft(_owner, _salt, nftData);
    }

    function createNft(
        address _owner,
        uint256 _salt,
        NftData memory _nftData
    ) internal nonReentrant returns (address _nft) {
        bytes32 salt = getSalt(_salt);
        
        // 使用 cloneDeterministic 创建实现的克隆
        address _impl = impl.cloneDeterministic(salt);
        require(_impl != address(0), "Clone creation failed");
        
        // 创建 ProxyAdmin
        address _proxyAdmin = create(salt, PROXYADMINCODE);
        
        // 创建 TransparentUpgradeableProxy
        bytes memory deployBytecode = abi.encodePacked(
            PROXYCODE,
            abi.encode(
                _impl,
                _proxyAdmin,
                abi.encodeWithSelector(0xec5de95a, _nftData) // initialize selector
            )
        );
        _nft = create(salt, deployBytecode);
        
        // 转移所有权给用户
        (bool success, ) = address(_nft).call(
            abi.encodeWithSelector(0xf2fde38b, _owner) // transferOwnership selector
        );
        require(success, "NFT ownership transfer failed");
        
        (bool success2, ) = address(_proxyAdmin).call(
            abi.encodeWithSelector(0xf2fde38b, _owner)
        );
        require(success2, "ProxyAdmin ownership transfer failed");
        
        erc721nfts[_owner].push(_nft);
        emit NftCreated(_owner, _impl, _proxyAdmin, _nft);
    }
}
