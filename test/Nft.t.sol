// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/RouterV3.sol";
import "../contracts/FactoryV3.sol";
import "../contracts/NfinityV2.sol";

contract RouterV3AndFactoryV3Test is Test {

    RouterV3 public routerV3;
    FactoryV3 public factoryV3;

    event ChangeManger(address indexed newManger, address oldManager);
    event ChangeFee(uint256 indexed newFee, uint256 indexed oldFee);
    event ChangeFun(bool indexed newFun, bool indexed oldFun);


    // setUp：可选函数,在每个函数运行之前被调用,等同于hardhat链下测试的beforeEach函数
    function setUp() public {
        factoryV3 = new FactoryV3();
        console2.log("test contract: ",address(this));
        console2.log("factoryV3:",address(factoryV3));
        routerV3 = new RouterV3(address(factoryV3));
        console2.log("routerV3:",address(routerV3));
        factoryV3.onlyInitialize(address(routerV3));
    }

    // 以 test 为前缀的函数作为测试用例运行
    // function testSetManager() public {
    //     // 创建一个地址
    //     address alice = makeAddr("alice");
    //     console.log("alice:", alice);
    //     routerV3.setManager(alice);
    // }
    
    // 以 test 为前缀的函数作为测试用例运行
    function testSetupSetFun(bool _isFun) public {
        routerV3.setFun(_isFun);
        assertEq(routerV3.isFun(), _isFun);

    }

    function testSetupSetFee(uint256 _fee) public {
        routerV3.setFee(_fee);
        assertEq(routerV3.fee(), _fee);

    }

    function testSetManager() public {

        // 创建一个地址
        address bob = makeAddr("bob");
        // 更改调用者地址msg.sender
        vm.prank(bob);
        // 
        vm.expectRevert("Only Manager");
        routerV3.setManager(bob);

    }

    function testSetFun() public {

        // 创建一个地址
        address jack = makeAddr("jack");
        // 更改调用者地址msg.sender
        vm.prank(jack);
        vm.expectRevert("Only Manager");
        routerV3.setFun(true);

    }

     function testSetFee() public {

        // 创建一个地址
        address hanmeimei = makeAddr("hanmeimei");
        // 更改调用者地址msg.sender
        vm.prank(hanmeimei);
        vm.expectRevert("Only Manager");
        routerV3.setFee(10**15);

    }

    function testEventSetManager() public {
        vm.expectEmit(true, true, false, true);
        // 创建一个地址
        address alice = makeAddr("alice");
        emit ChangeManger(alice, address(this));
        routerV3.setManager(alice);     
    }

    function testEventSetFun(bool _isFun) public {
        vm.expectEmit(true, true, false, true);
        emit ChangeFun(_isFun, routerV3.isFun());
        routerV3.setFun(_isFun);       
    }

    function testEVentSetFee(uint256 _fee) public {
        vm.expectEmit(true, true, false, true);
        emit ChangeFee(_fee, routerV3.fee());
        routerV3.setFee(_fee);
    }


    function testPreCreate(
        bool _blindBoxOpened,  
        bytes32 _newMerkle,   
        uint256[6] calldata arr,
        string calldata _blindTokenURI,  
        string calldata _name,
        string calldata _symbol
    ) public {


    }






}


// eth 

// zksync

// starknet 

// sol