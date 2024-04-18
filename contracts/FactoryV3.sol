// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./NfinityV2.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
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
        bytes32 randomBytes = getSalt(block.timestamp);
        impl = create(randomBytes,IMPLCODE);
        require(impl != address(0));
    }

    function create(
        bytes32 salt_,
        bytes memory byteCode
    ) internal returns (address addr) {
        assembly {
            addr := create2(0, add(byteCode, 0x20), mload(byteCode), salt_)
        }
    }

    function getSalt(uint256 number) internal view returns(bytes32 _salt) {
        //链上伪随机数
        _salt = keccak256(
            abi.encodePacked(
                number,
                block.number,
                address(this),
                msg.sender,
                blockhash(block.timestamp - 1)
            )
        );
    }

    function onlyInitialize(address _router) external {
        require(msg.sender == manager,"Only Deployer");
        require(!aParm);
        router = _router;
        aParm = true;
    }

    function getOwnerNft(address _owner) external view  OnlyRouter returns(address[] memory) {
        return erc721nfts[_owner];
    }

    // functionNftAddress(uint256 _salt,bytes memory bytecode) external returns(address target) {
    //     bytes32 salt = getSalt(_salt);
    //     bytes32 addrHash = keccak256(abi.encodePacked(
    //     bytes1(0xff),          
    //     address(this),        
    //     _salt, // 盐值
    //     keccak256(bytecode)
    //     ));
    //     // 将最后 20 个字节的哈希值转换为地址
    //     return address(uint160(uint(addrHash)));

    // }

    // function getByteCode(address _impl, address _proxyAdmin ,NftData memory _nftData ) internal view returns(bytes memory deployBytecode){
    //    bytes32 salt = getSalt(_salt);
    //    address _impl = impl.cloneDeterministic(salt);
    //    address _proxyAdmin = create(salt, PROXYADMINCODE);
    //    deployBytecode = abi.encodePacked(
    //         PROXYCODE,
    //         abi.encode(
    //             _impl,
    //             _proxyAdmin,
    //             abi.encodeWithSelector(0xec5de95a,_nftData)
    //         )
    //     );
    // }

    function preCreate(
        bool _blindBoxOpened,
        address _owner,
        bytes32 _newMerkle,  
        uint256[6] calldata _arr,
        string calldata _blindTokenURI,  
        string calldata _name,
        string calldata _symbol
    ) external OnlyRouter returns (address) {
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
        return createNft(_owner,_salt,nftData);
    }

    function createNft(
        address _owner,
        uint256 _salt,
        NftData memory _nftData
    ) internal nonReentrant returns (address _nft) {
        bytes32 salt = getSalt(_salt);
        address _impl = impl.cloneDeterministic(salt);
        address _proxyAdmin = create(salt, PROXYADMINCODE);
        bytes memory deployBytecode = abi.encodePacked(
            PROXYCODE,
            abi.encode(
                _impl,
                _proxyAdmin,
                abi.encodeWithSelector(0xec5de95a,_nftData)
            )
        );
        _nft = create(salt, deployBytecode);
        require(
            address(_proxyAdmin) != address(0) && address(_nft) != address(0),
            "ProxyAdmin and Proxy create failed"
        );
        (bool success, ) = address(NfinityV2(_nft)).call(
            abi.encodeWithSelector(0xf2fde38b, _owner)
        );
        (bool success2, ) = address(_proxyAdmin).call(
            abi.encodeWithSelector(0xf2fde38b, _owner)
        );
        require(success2 && success, "TransferOwnership failed");
        erc721nfts[_owner].push(_nft);
        emit NftCreated(_owner,_impl,_proxyAdmin,_nft);
    }
}

