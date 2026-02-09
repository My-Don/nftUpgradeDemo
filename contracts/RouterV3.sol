// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title RouterV3
 * @notice NFT 创建路由合约
 */
contract RouterV3 is ReentrancyGuard, Pausable {
    using Address for address payable;

    // ============ 状态变量 ============
    
    address public immutable factoryV3;
    address public manager;
    bool public isFun;
    uint256 public fee;

    uint256 public constant MAX_FEE = 1 ether;

    // 统计数据
    uint256 public totalNftsCreated;
    uint256 public totalFeesCollected;

    // ============ 自定义错误 ============
    
    error OnlyManager();
    error InvalidAddress();
    error NotYetOpen();
    error InsufficientFee();
    error NoBalance();
    error TransferFailed();
    error OnlyEOA();
    error CreationFailed();
    error InvalidReturnData();
    error FeeTooHigh();

    // ============ 事件 ============
    
    event ChangeManger(address indexed newManger, address indexed oldManager);
    event ChangeFee(uint256 indexed newFee, uint256 indexed oldFee);
    event ChangeFun(bool indexed newFun, bool indexed oldFun);
    event NftCreated(
        address indexed creator, 
        address indexed nft, 
        uint256 feePaid,
        uint256 timestamp
    );
    event FeeWithdrawn(address indexed to, uint256 amount);

    // ============ 修饰符 ============
    
    modifier onlyManager() {
        if (msg.sender != manager) revert OnlyManager();
        _;
    }

    // ============ 构造函数 ============
    
    constructor(address _factoryV3) {
        if (_factoryV3 == address(0)) revert InvalidAddress();
        
        // 验证 factory 是否为合约
        if (_factoryV3.code.length == 0) revert InvalidAddress();
        
        factoryV3 = _factoryV3;
        manager = msg.sender;
        isFun = true;
        
        emit ChangeManger(manager, address(0));
        emit ChangeFun(isFun, false);
    }

    // ============ 管理员函数 ============
    
    /**
     * @notice 设置创建费用
     * @param _fee 新费用
     */
    function setFee(uint256 _fee) external onlyManager {
        if (_fee > MAX_FEE) revert FeeTooHigh();
        
        uint256 oldFee = fee;
        fee = _fee;
        
        emit ChangeFee(_fee, oldFee);
    }

    /**
     * @notice 设置功能开关
     * @param _isFun 是否开启
     */
    function setFun(bool _isFun) external onlyManager {
        bool oldFun = isFun;
        isFun = _isFun;
        
        emit ChangeFun(_isFun, oldFun);
    }

    /**
     * @notice 转移管理员权限
     * @param _manager 新管理员地址
     */
    function setManager(address _manager) external onlyManager {
        if (_manager == address(0)) revert InvalidAddress();
        
        address oldManager = manager;
        manager = _manager;
        
        emit ChangeManger(_manager, oldManager);
    }

    /**
     * @notice 提取费用
     */
    function withdraw() external onlyManager nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalance();
        
        // 使用 OpenZeppelin 的安全转账方法
        payable(manager).sendValue(balance);
        
        emit FeeWithdrawn(manager, balance);
    }

    // 紧急暂停功能
    function pause() external onlyManager {
        _pause();
    }

    function unpause() external onlyManager {
        _unpause();
    }

    // ============ 核心功能 ============
    
    /**
     * @notice 创建新的 NFT 合约
     * @param _blindBoxOpened 盲盒是否开启
     * @param _newMerkle Merkle 根
     * @param arr 配置参数 [salt, whiteListPrice, publicPrice, maxNft, maxPerTx, airDrop]
     * @param _blindTokenURI 盲盒 URI
     * @param _name NFT 名称
     * @param _symbol NFT 符号
     * @return _nft 新创建的 NFT 合约地址
     */
    function preCreate(
        bool _blindBoxOpened,
        bytes32 _newMerkle,
        uint256[6] calldata arr,
        string calldata _blindTokenURI,
        string calldata _name,
        string calldata _symbol
    ) external payable nonReentrant whenNotPaused returns (address _nft) {
        // 验证调用者是 EOA
        if (msg.sender != tx.origin) revert OnlyEOA();
        
        // 验证功能已开启
        if (!isFun) revert NotYetOpen();
        
        // 验证费用
        if (msg.value < fee) revert InsufficientFee();

        // 先更新状态
        totalNftsCreated++;
        totalFeesCollected += fee;

        (bool success, bytes memory data) = factoryV3.call(
            abi.encodeWithSelector(
                0x8ee2d3f9,
                _blindBoxOpened,
                msg.sender,
                _newMerkle,
                arr,
                _blindTokenURI,
                _name,
                _symbol
            )
        );

        // 改进的错误处理
        if (!success) {
            // 如果失败，回滚状态
            totalNftsCreated--;
            totalFeesCollected -= fee;
            
            // 返回详细错误信息
            if (data.length > 0) {
                assembly {
                    let returndata_size := mload(data)
                    revert(add(32, data), returndata_size)
                }
            } else {
                revert CreationFailed();
            }
        }

        // 验证返回数据
        if (data.length != 32) revert InvalidReturnData();
        
        // 解码返回的 NFT 地址
        (_nft) = abi.decode(data, (address));
        
        // 验证返回地址有效
        if (_nft == address(0)) revert InvalidReturnData();

        // 退还多余的 ETH
        if (msg.value > fee) {
            uint256 refund = msg.value - fee;
            payable(msg.sender).sendValue(refund);
        }

        emit NftCreated(msg.sender, _nft, fee, block.timestamp);
    }

    // ============ 查询函数 ============
    
    /**
     * @notice 获取用户创建的所有 NFT 合约
     * @param owner 用户地址
     * @return nft NFT 合约地址数组
     */
    function getOwnerNft(address owner) external view returns (address[] memory nft) {
        (bool success, bytes memory data) = factoryV3.staticcall(
            abi.encodeWithSelector(0xe99367c2, owner)
        );
        
        require(success && data.length > 0, "Get owned nft failed");
        nft = abi.decode(data, (address[]));
    }

    /**
     * @notice 获取合约统计信息
     * @return _totalNftsCreated 总创建数量
     * @return _totalFeesCollected 总收集费用
     * @return _currentFee 当前费用
     * @return _isActive 是否激活
     */
    function getStats() 
        external 
        view 
        returns (
            uint256 _totalNftsCreated,
            uint256 _totalFeesCollected,
            uint256 _currentFee,
            bool _isActive
        ) 
    {
        return (totalNftsCreated, totalFeesCollected, fee, isFun && !paused());
    }

    // ============ 接收 ETH ============
    
    receive() external payable {}
}
