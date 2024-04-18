// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RouterV3 {
    address internal immutable factoryV3;
    address internal manager;
    bool public isFun;
    uint256 public fee;
    mapping(address => bool) internal dePloyers;

    modifier OnlyManager() {
        require(msg.sender == manager,"Only Manager");
        _;
    }

    event ChangeManger(address indexed newManger, address oldManager);
    event ChangeFee(uint256 indexed newFee, uint256 indexed oldFee);
    event ChangeFun(bool indexed newFun, bool indexed oldFun);

    constructor(address _factoryV3) {
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
        emit ChangeManger(_manager, manager);
        manager = _manager;   
    }

    function withdraw() external OnlyManager {  
        (bool success, ) = manager.call{value: address(this).balance, gas: 2300}(new bytes(0));
        require(success);
    }

    function preCreate(
        bool _blindBoxOpened,  //盲盒是否开启
        bytes32 _newMerkle,   //默克尔哈希
        uint256[6] calldata arr,
        string calldata _blindTokenURI,  //开启盲盒的url
        string calldata _name,
        string calldata _symbol
    ) external payable returns (address _nft) {
        require(msg.sender == tx.origin, "Only EOA Caller");
        if (isFun) {
            if(fee > 0){
                if(!dePloyers[msg.sender]){
                    if(msg.value < fee) revert("Please pay the handling fee");
                    dePloyers[msg.sender] = true;
                } 
            }     
        }else {
            revert("Not yet open");
        }
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
        require(success && data.length == 32, "Creation failed");
        if (!success) {
            // Get the error message returned
            assembly {
                let ptr := mload(0x40)
                let size := returndatasize()
                returndatacopy(ptr, 0, size)
                revert(ptr, size)
            }
        }
        (_nft) = abi.decode(data, (address));
    }


    function getOwnerNft(address owner) external view returns(address[] memory nft) {
        (bool success, bytes memory data) = factoryV3.staticcall(abi.encodeWithSelector(0xe99367c2,owner));
        require(success && data.length > 0,"Get owned nft failed");
        nft = abi.decode(data,(address[]));
    }

}
