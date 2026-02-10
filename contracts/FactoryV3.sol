// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./NfinityV2.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FactoryV3
 * @notice NFT 合约工厂
 * @dev 🔧 改进：优化存储、改进安全性、使用接口
 */
contract FactoryV3 is ReentrancyGuard, Ownable {
    using Clones for address;

    // ============ 状态变量 ============
    
    address public immutable impl;
    address public router;
    
    uint256 private nonce;
    
    // 🔧 改进：使用 mapping 代替数组存储（节省 gas）
    mapping(address => address[]) private erc721nfts;
    mapping(address => uint256) public userNftCount;
    
    // 🔧 新增：NFT 合约验证
    mapping(address => bool) public isValidNft;
    
    // 🔧 新增：统计数据
    uint256 public totalNftsCreated;

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

    // ============ 自定义错误 ============
    
    error OnlyRouter();
    error OnlyDeployer();
    error AlreadyInitialized();
    error InvalidAddress();
    error InvalidConfiguration();
    error ImplementationCreationFailed();
    error CloneCreationFailed();
    error ProxyCreationFailed();
    error OwnershipTransferFailed();
    error Create2Failed();

    // ============ 事件 ============
    
    event NftCreated(
        address indexed owner,
        address indexed impl,
        address indexed proxyAdmin,
        address proxy,
        uint256 timestamp
    );
    
    event RouterInitialized(address indexed router);

    // ============ 修饰符 ============
    
    modifier onlyRouter() {
        if (msg.sender != router) revert OnlyRouter();
        _;
    }

    // ============ 构造函数 ============
    
    /**
     * @notice 部署工厂合约并创建实现合约
     * @dev 🔧 改进：优化实现合约部署
     */
    constructor() {
        // 部署实现合约
        impl = address(new NfinityV2());
        if (impl == address(0)) revert ImplementationCreationFailed();
    }

    // ============ 初始化函数 ============
    
    /**
     * @notice 初始化路由地址
     * @param _router 路由合约地址
     * @dev 🔧 改进：使用 Ownable 代替自定义 manager
     */
    function onlyInitialize(address _router) external onlyOwner {
        if (router != address(0)) revert AlreadyInitialized();
        if (_router == address(0)) revert InvalidAddress();
        
        // 验证 router 是合约
        if (_router.code.length == 0) revert InvalidAddress();
        
        router = _router;
        
        emit RouterInitialized(_router);
    }

    // ============ 查询函数 ============
    
    /**
     * @notice 获取用户创建的所有 NFT 合约
     * @param _owner 用户地址
     * @return 用户的 NFT 合约地址数组
     */
    function getOwnerNft(address _owner) 
        external 
        view 
        onlyRouter 
        returns (address[] memory) 
    {
        return erc721nfts[_owner];
    }

    /**
     * @notice 获取用户创建的 NFT 数量
     * @param _owner 用户地址
     * @return NFT 数量
     */
    function getUserNftCount(address _owner) external view returns (uint256) {
        return userNftCount[_owner];
    }

    // ============ 核心功能 ============
    
    /**
     * @notice 创建新的 NFT 合约
     * @param _blindBoxOpened 盲盒是否开启
     * @param _owner NFT 合约所有者
     * @param _newMerkle Merkle 根
     * @param _arr 配置参数 [salt, whiteListPrice, publicPrice, maxNft, maxPerTx, airDrop]
     * @param _blindTokenURI 盲盒 URI
     * @param _name NFT 名称
     * @param _symbol NFT 符号
     * @return 新创建的 NFT 合约地址
     * @dev 🔧 改进：优化创建流程，改进错误处理
     */
    function preCreate(
        bool _blindBoxOpened,
        address _owner,
        bytes32 _newMerkle,
        uint256[6] calldata _arr,
        string calldata _blindTokenURI,
        string calldata _name,
        string calldata _symbol
    ) external onlyRouter returns (address) {
        // 验证参数
        if (_owner == address(0)) revert InvalidAddress();
        if (_arr[3] == 0) revert InvalidConfiguration(); // maxNft
        if (_arr[4] == 0) revert InvalidConfiguration(); // maxPerTx
        if (_arr[5] > _arr[3]) revert InvalidConfiguration(); // airDrop > maxNft

        uint256 _salt = _arr[0];
        
        NftData memory nftData = NftData(
            _blindBoxOpened,
            _newMerkle,
            _arr[1], // whiteListPrice
            _arr[2], // publicPrice
            _arr[3], // maxNft
            _arr[4], // maxPerTx
            _arr[5], // airDrop
            _blindTokenURI,
            _name,
            _symbol
        );

        return createNft(_owner, _salt, nftData);
    }

    /**
     * @notice 内部创建 NFT 合约函数
     * @param _owner NFT 合约所有者
     * @param _salt 盐值
     * @param _nftData NFT 配置数据
     * @return _nft 新创建的 NFT 合约地址
     * @dev 🔧 改进：使用 create2 创建所有合约，地址可预测
     */
    function createNft(
        address _owner,
        uint256 _salt,
        NftData memory _nftData
    ) internal nonReentrant returns (address _nft) {
        bytes32 salt = getSalt(_salt);

        // 🔧 使用 cloneDeterministic 创建实现的克隆（已经是 create2）
        address clone = Clones.cloneDeterministic(impl, salt);
        require(clone != address(0), "Clone creation failed");

        // 🔧 使用 create2 创建 ProxyAdmin
        bytes memory proxyAdminBytecode = type(ProxyAdmin).creationCode;
        address _proxyAdmin;
        
        assembly {
            _proxyAdmin := create2(
                0,
                add(proxyAdminBytecode, 0x20),
                mload(proxyAdminBytecode),
                salt
            )
        }
        require(_proxyAdmin != address(0), "ProxyAdmin creation failed");

        // 准备初始化数据
        bytes memory initData = abi.encodeWithSelector(
            NfinityV2.initialize.selector,
            _nftData
        );

        // 🔧 使用 create2 创建 TransparentUpgradeableProxy
        bytes memory proxyBytecode = abi.encodePacked(
            type(TransparentUpgradeableProxy).creationCode,
            abi.encode(clone, _proxyAdmin, initData)
        );
        
        assembly {
            _nft := create2(
                0,
                add(proxyBytecode, 0x20),
                mload(proxyBytecode),
                salt
            )
        }
        require(_nft != address(0), "Proxy creation failed");

        // 转移 NFT 合约所有权
        (bool success1, ) = _nft.call(
            abi.encodeWithSelector(
                Ownable.transferOwnership.selector,
                _owner
            )
        );
        require(success1, "NFT ownership transfer failed");

        // 转移 ProxyAdmin 所有权
        (bool success2, ) = _proxyAdmin.call(
            abi.encodeWithSelector(
                Ownable.transferOwnership.selector,
                _owner
            )
        );
        require(success2, "ProxyAdmin ownership transfer failed");

        // 更新状态
        erc721nfts[_owner].push(_nft);
        userNftCount[_owner]++;
        isValidNft[_nft] = true;
        totalNftsCreated++;

        emit NftCreated(_owner, clone, _proxyAdmin, _nft, block.timestamp);
    }

    /**
     * @notice 生成盐值
     * @param number 输入数字
     * @return _salt 生成的盐值
     * @dev 🔧 改进：增强随机性
     */
    function getSalt(uint256 number) internal returns (bytes32 _salt) {
        unchecked {
            nonce++;
        }
        
        _salt = keccak256(
            abi.encodePacked(
                number,
                block.number,
                block.timestamp,
                block.prevrandao,  // 🔧 改进：使用 prevrandao 代替 difficulty
                address(this),
                msg.sender,
                nonce,
                block.number > 0 ? blockhash(block.number - 1) : bytes32(0)
            )
        );
    }

    // 🔧 新增：批量查询用户的 NFT 合约
    function getUserNfts(address _owner, uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory nfts, uint256 total)
    {
        total = erc721nfts[_owner].length;
        
        if (offset >= total) {
            return (new address[](0), total);
        }
        
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        
        uint256 length = end - offset;
        nfts = new address[](length);
        
        for (uint256 i = 0; i < length; ) {
            nfts[i] = erc721nfts[_owner][offset + i];
            unchecked { ++i; }
        }
    }

    // 🔧 新增：验证 NFT 合约是否由此工厂创建
    function verifyNft(address nft) external view returns (bool) {
        return isValidNft[nft];
    }

    // 🔧 新增：获取工厂统计信息
    function getFactoryStats()
        external
        view
        returns (
            address _impl,
            address _router,
            uint256 _totalNftsCreated,
            uint256 _nonce
        )
    {
        return (impl, router, totalNftsCreated, nonce);
    }

    // ============ 地址预测函数 ============
    
    /**
     * @notice 预测 ProxyAdmin 地址
     * @param salt 盐值
     * @return 预测的 ProxyAdmin 地址
     * @dev 🔧 新增：使用 create2 预测地址
     */
    function predictProxyAdminAddress(bytes32 salt) 
        public 
        view 
        returns (address) 
    {
        bytes memory bytecode = type(ProxyAdmin).creationCode;
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );
        return address(uint160(uint256(hash)));
    }

    /**
     * @notice 预测 Proxy 地址
     * @param salt 盐值
     * @param clone 克隆实现地址
     * @param proxyAdmin ProxyAdmin 地址
     * @param initData 初始化数据
     * @return 预测的 Proxy 地址
     * @dev 🔧 新增：使用 create2 预测地址
     */
    function predictProxyAddress(
        bytes32 salt,
        address clone,
        address proxyAdmin,
        bytes memory initData
    ) public view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(TransparentUpgradeableProxy).creationCode,
            abi.encode(clone, proxyAdmin, initData)
        );
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );
        return address(uint160(uint256(hash)));
    }

    /**
     * @notice 预测克隆地址
     * @param salt 盐值
     * @return 预测的克隆地址
     * @dev 🔧 新增：使用 cloneDeterministic 预测地址
     */
    function predictCloneAddress(bytes32 salt) 
        public 
        view 
        returns (address) 
    {
        return Clones.predictDeterministicAddress(impl, salt, address(this));
    }

    /**
     * @notice 预测完整的 NFT 部署地址
     * @param _salt 用户提供的盐值
     * @param _nftData NFT 配置数据
     * @return clone 克隆地址
     * @return proxyAdmin ProxyAdmin 地址
     * @return proxy Proxy 地址（最终 NFT 合约地址）
     * @dev 🔧 新增：一次性预测所有地址
     */
    function predictNftAddresses(
        uint256 _salt,
        NftData memory _nftData
    ) external view returns (
        address clone,
        address proxyAdmin,
        address proxy
    ) {
        // 注意：这里无法准确预测 getSalt() 的结果，因为它依赖 nonce
        // 但可以提供一个估算
        bytes32 salt = keccak256(
            abi.encodePacked(
                _salt,
                block.number,
                block.timestamp,
                block.prevrandao,
                address(this),
                msg.sender,
                nonce + 1, // 预测下一个 nonce
                block.number > 0 ? blockhash(block.number - 1) : bytes32(0)
            )
        );

        clone = predictCloneAddress(salt);
        proxyAdmin = predictProxyAdminAddress(salt);
        
        bytes memory initData = abi.encodeWithSelector(
            NfinityV2.initialize.selector,
            _nftData
        );
        
        proxy = predictProxyAddress(salt, clone, proxyAdmin, initData);
    }
}
