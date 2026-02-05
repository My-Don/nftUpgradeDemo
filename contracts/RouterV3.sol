// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract RouterV3 is ReentrancyGuard {
    address internal immutable factoryV3;
    address internal manager;
    bool public isFun;
    uint256 public fee;
    
    modifier OnlyManager() {
        require(msg.sender == manager, "Only Manager");
        _;
    }
    
    event ChangeManger(address indexed newManger, address oldManager);
    event ChangeFee(uint256 indexed newFee, uint256 indexed oldFee);
    event ChangeFun(bool indexed newFun, bool indexed oldFun);
    event NftCreated(address indexed creator, address indexed nft, uint256 feePaid);
    
    constructor(address _factoryV3) {
        require(_factoryV3 != address(0), "Invalid factory address");
        factoryV3 = _factoryV3;
        manager = msg.sender;
        isFun = true;
        emit ChangeManger(manager, address(0));
        emit ChangeFun(isFun, false);
    }
    
    function setFee(uint256 _fee) external OnlyManager {
        emit ChangeFee(_fee, fee);
        fee = _fee;
    }
    
    function setFun(bool _isFun) external OnlyManager {
        emit ChangeFun(_isFun, isFun);
        isFun = _isFun;     
    }
    
    function setManager(address _manager) external OnlyManager {
        require(_manager != address(0), "Invalid manager address");
        emit ChangeManger(_manager, manager);
        manager = _manager;   
    }
    
    // 修复：移除 gas 限制，使用 Address.sendValue 或直接 transfer
    function withdraw() external OnlyManager {  
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance to withdraw");
        (bool success, ) = manager.call{value: balance}("");
        require(success, "Withdraw failed");
    }
    
    // 修复：每次创建都需要支付费用，并退还多余的 ETH
    function preCreate(
        bool _blindBoxOpened,
        bytes32 _newMerkle,
        uint256[6] calldata arr,
        string calldata _blindTokenURI,
        string calldata _name,
        string calldata _symbol
    ) external payable nonReentrant returns (address _nft) {
        require(msg.sender == tx.origin, "Only EOA Caller");
        require(isFun, "Not yet open");
        
        // 修复：每次创建都需要支付费用
        if (fee > 0) {
            require(msg.value >= fee, "Insufficient fee");
        }
        
        // 调用 factory 创建 NFT
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
        
        if (!success) {
            // 如果失败，返回错误信息
            if (data.length > 0) {
                assembly {
                    let ptr := mload(0x40)
                    let size := returndatasize()
                    returndatacopy(ptr, 0, size)
                    revert(ptr, size)
                }
            } else {
                revert("Creation failed");
            }
        }
        
        require(data.length == 32, "Invalid return data");
        (_nft) = abi.decode(data, (address));
        
        // 修复：退还多余的 ETH
        if (msg.value > fee) {
            uint256 refund = msg.value - fee;
            (bool refundSuccess, ) = msg.sender.call{value: refund}("");
            require(refundSuccess, "Refund failed");
        }
        
        emit NftCreated(msg.sender, _nft, fee);
    }
    
    function getOwnerNft(address owner) external view returns(address[] memory nft) {
        (bool success, bytes memory data) = factoryV3.staticcall(
            abi.encodeWithSelector(0xe99367c2, owner)
        );
        require(success && data.length > 0, "Get owned nft failed");
        nft = abi.decode(data, (address[]));
    }
}
