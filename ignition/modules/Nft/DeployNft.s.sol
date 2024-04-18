// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20; 

import "forge-std/Script.sol";
import "forge-std/Test.sol"; 
import "../../../contracts/RouterV3.sol";
import "../../../contracts/FactoryV3.sol";
import "../../../contracts/NfinityV2.sol";

// 部署脚本继承了Script合约
contract DeployNftScript is Script {

    FactoryV3 public factoryV3;
    RouterV3 public routerV3;

    // 可选函数，在每个函数运行之前被调用
    function setUp() public {}

    // 部署合约时会调用run()函数,此函数相当于是个入口
    function run() external {

        // 从 .env 文件中加载助记词或私钥，并推导出部署账号
        // string memory mnemonic = vm.envString("MNEMONIC");
        // (address deployer, ) = deriveRememberKey(mnemonic, 0);
        // console.log("deployer:", deployer);


        // 开始记录脚本中合约的调用和创建
        // 这是一个作弊码，表示使用该密钥来签署交易并广播
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey); 
        // 创建合约
        factoryV3 = new FactoryV3();
        routerV3 = new RouterV3(address(factoryV3));
        factoryV3.onlyInitialize(address(routerV3));
        routerV3.setFun(true);
        routerV3.setFee(10**15);
        // 结束记录
        vm.stopBroadcast(); 
    }
}