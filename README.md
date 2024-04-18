# 可升级NFT合约

项目是一个可升级NFT合约的示例,项目包含部署ignition合约,测试,覆盖率测试等操作.

#### 1)创建项目目录

```
mkdir upgradeNftDemo
cd upgradeNftDemo
```

#### 2)初始化项目

```
npm init
```

#### 3)安装hardhat

```
npm install --save-dev hardhat
```

#### 4)创建工程

```
npx hardhat init
```

ps：

- `contracts`：智能合约目录
- `ignition` ：部署合约脚本目录
- `test`：智能合约测试目录
- `hardhat.config.js`：配置文件,配置hardhat连接的网络及编译选项

#### 5)安装项目依赖

```
npm install @openzeppelin/contracts@4.7.3 --save-dev
npm install @openzeppelin/contracts-upgradeable@4.7.3 --save-dev
npm install erc721a@4.2.3 --save-dev
npm install erc721a-upgradeable@4.2.2 --save-dev
npm install dotenv --save-dev
npm install @nomicfoundation/hardhat-foundry --save-dev
```

#### 6)配置`.env`

```
MAINNET_PRIVATE_KEY=
MNEMONIC=
ETHERSCAN_API_KEY=<你的api-key>
LOCAL_URL=http://127.0.0.1:8545
SEPOLIA_URL=https://eth-sepolia.g.alchemy.com/v2/<你的api-key>
MAINNET_URL=https://eth-mainnet.g.alchemy.com/v2/<你的api-key>
GAS_PRICE_API=https://api.etherscan.io/api?module=proxy&action=eth_gasPrice
COINMARKETCAP_API_KEY=
REPORT_GAS=false
```

ps:rpc节点建议用alchemy提供的

#### 7)配置`hardhat.config.js`

```
require("@nomicfoundation/hardhat-toolbox");
//require("@nomicfoundation/hardhat-foundry");
require("hardhat-gas-reporter");

const fs = require("fs");
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  // 指定solidity编译版本(可指定多版本)
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        }
      },
      {
        version: "0.4.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        }
      }
  ]
  },
  // 设置部署的网络
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_URL,
      accounts: {
        // 助记词
        mnemonic: process.env.MNEMONIC,
        // 指定路径
        path: "m/44'/60'/0'/0",
        // 指定示从哪个索引开始派生子账户,默认设置为2
        initialIndex: 2,
        // 指定派生的子账户数量,默认s设置为10
        count: 10,
        passphrase: "",
      },
      chainId: 11155111
    },
    mainnet: {
      url: process.env.MAINNET_URL,
      accounts:[process.env.MAINNET_PRIVATE_KEY],
      chainId: 1
    },
    hardhat: {
      // 
      hardfork: "merge",
      // fork的内容
      forking: {
        // rpc节点
        url: process.env.MAINNET_URL || "",
         // 如果不指定区块，则默认 fork 当前最新区块
        blockNumber: 19666666,
        enabled: false,
      },
      chainId: 1
    },
  },
  // gas fee预测
   gasReporter: {
    // 是否开启插件
    enabled: process.env.REPORT_GAS,
    // 以markdown输出文本
    reportFormat: "markdown",
    // 输出gas报告
    outputFile: "gas-reporter.md",
    forceTerminalOutput: true,
    forceTerminalOutputFormat: "terminal",
    // 输出报告不带有颜色标注
    noColors: true,
    // 默认EUR, 可选USD, CNY, HKD
    currency: "USD",
    // 设置1层以太坊网络
    L1: "ethereum",
    // 默认获取eth价格,可设置其它token 
    token: "ETH",
    // coinmarkercap获取价格
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    // 实时获取网络的gasPrice
    gasPriceApi: process.env.GAS_PRICE_API,
    // gasPrice: 12
  },
  // 验证合约
  etherscan: {
    // 此api-key适用于minnet
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY
    },
  },
  // 开启etherscan sourcify验证
  sourcify: {
    enabled: true
  }
};

```

#### 8)打印地址

ps:在·hardhat.config.js·添加如下code,并执行`npx hardhat accounts`

```
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});
```

#### 9)编译合约

ps:执行 `npx hardhat compile`,终端打印数据如Compiled 27 Solidity files successfully (evm target: paris).

编译成功后,会在 `artifacts/contracts/` 目录下生成`Lock.json` 和 build-info, `Lock.json`包含了智能合约的 ABI 、字节码（Bytecode）等

#### 10)测试

描述:执行`npx hardhat test`,终端打印如下:

```
  Lock
    Deployment
      ✔ Should set the right unlockTime (671ms)
      ✔ Should set the right owner
      ✔ Should receive and store the funds to lock
      ✔ Should fail if the unlockTime is not in the future
    Withdrawals
      Validations
        ✔ Should revert with the right error if called too soon
        ✔ Should revert with the right error if called from another account
        ✔ Shouldn't fail if the unlockTime has arrived and the owner calls it
      Events
        ✔ Should emit an event on withdrawals
      Transfers
        ✔ Should transfer the funds to the owner (49ms)


  9 passing (821ms)
```

ps:执行 `npx hardhat test` 运行单元测试时测试内容运行的链不是本地 `node`,而是沙盒模式。因此如果想要在单元测试的沙盒模式中使用 fork 的数据，需要在配置文件中显式配置 forking 内容

#### 11)部署合约

ps：命令`npx hardhat ignition deploy ./ignition/modules/Lock.js --network <your-network>`，<your-network>可填写localhost,sepolia,mainnet等,也可以不写,不写要去掉--network,默认部署到内置的hardhat网络

执行`npx hardhat ignition deploy ./ignition/modules/Lock.js --network sepolia `

终端打印如下:

```
√ Confirm deploy to network sepolia (11155111)? ... yes
Hardhat Ignition 🚀

Deploying [ LockModule ]

Batch #1
  Executed LockModule#Lock

[ LockModule ] successfully deployed 🚀

Deployed Addresses

LockModule#Lock - 0x3A9EE6447fDdac2a995a879c17FC640a00a21F87
```

#### 12)验证源码

ps:执行`npx hardhat verify 0x3A9EE6447fDdac2a995a879c17FC640a00a21F87 1000000000 --network sepolia`如验证成功,就会在sepolia网络看到合约的源码了

#### 13)部署NFT合约到sepolia网络

ps:执行命令`npx hardhat run ./ignition/modules/Nft/DeployNft.js --network sepolia`

终端打印如下:

```
Deploying contracts with the account: 0x91d2FA384b6c98b137316Ce0388B8C0114a5859d
FactoryV3 Contract deployed to 0x296C10fd5DaF62b6470996C6cb25C62777ACd973 on sepolia
RouterV3 Contract deployed to 0xfaaEa2A0a9FF100c970A56A0A99E660985795636 on sepolia
Verifying contract on Etherscan...
```

#### 14)覆盖率测试

```
npx hardhat coverage
```

ps：此命令会在目录生成一个coverage目录,此目录用于生成一个可视化的覆盖率测试ui,还会生成coverage.json,此文件的作用未知.

覆盖率测试也我们尽量要做到测试达到100%.

可参考解析[增强以太坊合约安全性：SolCover 代码覆盖工具 (colony.io)](https://blog.colony.io/code-coverage-for-solidity-eecfa88668c2/)

终端打印如下:

```
Version
=======
> solidity-coverage: v0.8.12

Instrumenting for coverage...
=============================

> FactoryV3.sol
> Lock.sol
> NfinityV2.sol
> RouterV3.sol

Compilation:
============

Compiled 28 Solidity files successfully (evm target: paris).

Network Info
============
> HardhatEVM: v2.22.2
> network:    hardhat

  Lock
    Deployment
      ✔ Should set the right unlockTime (56ms)
      ✔ Should set the right owner
      ✔ Should receive and store the funds to lock
      ✔ Should fail if the unlockTime is not in the future
    Withdrawals
      Validations
        ✔ Should revert with the right error if called too soon
        ✔ Should revert with the right error if called from another account
        ✔ Shouldn't fail if the unlockTime has arrived and the owner calls it
      Events
        ✔ Should emit an event on withdrawals
      Transfers
        ✔ Should transfer the funds to the owner

  RouterV3 FactotyV3
    Deployment
      ✔ It can only be called by the administrator, otherwise an error will be returned (69ms)
    RouterV3 SetManager
      Validations
        ✔ It can only be called by the manager, otherwise an error will be returned
      RouterV3 Events
        ✔ Should emit an event on setManger
    RouterV3 SetFee
      Validations
        ✔ It can only be called by the manager, otherwise an error will be returned
      RouterV3 Events
        ✔ Should emit an event on setFee
    RouterV3 SetFun
      Validations
        ✔ It can only be called by the manager, otherwise an error will be returned
      RouterV3 Events
        ✔ Should emit an event on setFun
    RouterV3 Withdraw
      ✔ It can only be called by the administrator, otherwise an error will be returned.
    RouterV3 PreCreate
      ✔ Should fail if the switch is not true
      ✔ Create nft (236ms)


  19 passing (582ms)

----------------|----------|----------|----------|----------|----------------|
File            |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
----------------|----------|----------|----------|----------|----------------|
 contracts/     |    60.81 |     31.9 |    55.88 |    61.86 |                |
  FactoryV3.sol |      100 |       50 |      100 |      100 |                |
  Lock.sol      |      100 |      100 |      100 |      100 |                |
  NfinityV2.sol |     6.67 |     3.13 |     6.25 |    18.52 |... 189,190,191 |
  RouterV3.sol  |       95 |    71.43 |      100 |    96.67 |             82 |
----------------|----------|----------|----------|----------|----------------|
All files       |    60.81 |     31.9 |    55.88 |    61.86 |                |
----------------|----------|----------|----------|----------|----------------|

> Istanbul reports written to ./coverage/ and ./coverage.json
```



#### 15)生成gas-report报告

编辑`.env`改成REPORT_GAS=true

执行`npx hardhat test`

终端打印如下

```
Compiled 28 Solidity files successfully (evm target: paris).

  Lock
    Deployment
      ✔ Should set the right unlockTime
      ✔ Should set the right owner
      ✔ Should receive and store the funds to lock
      ✔ Should fail if the unlockTime is not in the future
    Withdrawals
      Validations
        ✔ Should revert with the right error if called too soon
        ✔ Should revert with the right error if called from another account
        ✔ Shouldn't fail if the unlockTime has arrived and the owner calls it
      Events
        ✔ Should emit an event on withdrawals
      Transfers
        ✔ Should transfer the funds to the owner

  RouterV3 FactotyV3
    Deployment
      ✔ It can only be called by the administrator, otherwise an error will be returned
    RouterV3 SetManager
      Validations
        ✔ It can only be called by the manager, otherwise an error will be returned
      RouterV3 Events
        ✔ Should emit an event on setManger
    RouterV3 SetFee
      Validations
        ✔ It can only be called by the manager, otherwise an error will be returned
      RouterV3 Events
        ✔ Should emit an event on setFee
    RouterV3 SetFun
      Validations
        ✔ It can only be called by the manager, otherwise an error will be returned
      RouterV3 Events
        ✔ Should emit an event on setFun
    RouterV3 Withdraw
      ✔ It can only be called by the administrator, otherwise an error will be returned.
    RouterV3 PreCreate
      ✔ Should fail if the switch is not true
      ✔ Create nft


  19 passing (11s)
```

并在目录下生成一个gas-reporter.md的文档.



#### 16)windows下安装rust

ps:安装rust.exe文件,网址`https://win.rustup.rs/x86_64`

然后在 Windows 上,安装最新版本的 [Visual Studio](https://visualstudio.microsoft.com/downloads/),并勾选“使用 C++ 进行桌面开发”选项一起安装.

#### 17)更新rust

```
rustup update stable
```

ps：Foundry 通常只支持在最新的稳定 Rust 版本上构建。 如果您使用的是较旧的 Rust 版本，则可以使用命令进行更新

#### 18)安装foundry包

```
cargo install --git https://github.com/foundry-rs/foundry --profile local --locked forge cast chisel anvil
```

#### 19)建议

在windows下安装会出现一些莫名其妙的问题,所以还是建议使用WSL ubuntu来安装,所以wsl安装可以忽略16~18步骤,直接20步骤

#### 20)WSL下安装foundry

```
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

安装安装后，有三个命令行工具 `forge`, `cast`, `anvil` 组成

- **forge**: 用来执行初始化项目、管理依赖、测试、构建、部署智能合约 ;
- **cast**: 执行以太坊 RPC 调用的命令行工具, 进行智能合约调用、发送交易或检索任何类型的链数据,说白了就是与链上交互的工具
- **anvil**: 创建一个本地测试网节点, 也可以用来分叉其他与 EVM 兼容的网络。

#### 21)项目集成foundry

在`hardhat.config.js`中引入require("@nomicfoundation/hardhat-foundry");

编辑foundry.toml

```
[profile.default]
# 自動依照合約內容偵測所使用的 solidity compiler 版本
#auto_detect_solc = true
# 手动指定版本
solc-version = '0.8.24'
# 是否开启solc优化器
optimizer = true
# solc优化的运行次数 
optimizer-runs = 10_000_000
# 合约目录 
src = 'contracts'
# 合约编译后目录 
out = 'artifacts/contracts'
# 项目依赖
libs = ['node_modules', 'lib']
# 测试目录
test = 'test'
# 缓存的路径
cache_path  = 'cache/foundry'
# 是否忽略缓存
force = false 
# 默认打印gas-reports报告
gas_reports = ["*"]
```

执行以下命令

```
cd upgradeNftDemo
git init
npx hardhat init-foundry
```

整个项目目录解析:

- `src`：智能合约目录
- `ignition` ：合约脚本文件目录
- `lib`: 依赖库目录
- `test`：智能合约测试用例文件夹
- `foundry.toml`：配置文件,配置连接的网络URL 及编译选项



#### 22)编译合约

在test目录下创建一个合约NFT.t.sol,源代码请看目录

foundry 测试用例使用 `.t.sol` 后缀，约定具有以`test`开头的函数的合约都被认为是一个测试

ps:好了,终端执行以下命令

```
cd upgradeNftDemo
forge build
```

#### 23)测试合约

```
forge test -vv
```

在 `testSetNumber(uint256)` 模糊测试中的`(runs: 256, μ: 28064, ~: 28453)`，含义是：

- "runs" 是指模糊器 fuzzer 测试的场景数量。 默认情况下，模糊器 fuzzer 将生成 256 个场景，但是，其可以使用 [`FOUNDRY_FUZZ_RUNS`](https://learnblockchain.cn/docs/foundry/i18n/zh/reference/config/testing.html#runs) 环境变量进行配置。
- “μ”（希腊字母 mu）是所有模糊运行中使用的平均 Gas
- “~”（波浪号）是所有模糊运行中使用的中值 Gas

#### 24)测试合约2

```
forge test -vvvv 
```

ps：四个v显示所有测试的堆栈跟踪，并显示失败测试的设置（setup）跟踪。

三个v会现实详细的log信息，还显示失败测试的堆栈跟踪

终端打印更详细的数据如下

```
[⠊] Compiling...
[⠢] Compiling 2 files with 0.8.24
[⠆] Solc 0.8.24 finished in 2.14s
Compiler run successful!

Ran 4 tests for test/Nft.t.sol:RouterV3AndFactoryV3Test
[PASS] testFailSetManager() (gas: 17238)
Logs:
  test contract:  0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496
  factoryV3: 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f
  routerV3: 0x2e234DAe75C793f67A35089C9d99245E1C58470b
  manager: 0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496
  bob: 0x1D96F2f6BeF1202E4Ce1Ff6Dad0c2CB002861d3e

Traces:
  [17238] RouterV3AndFactoryV3Test::testFailSetManager()
    ├─ [2404] RouterV3::manager() [staticcall]
    │   └─ ← [Return] RouterV3AndFactoryV3Test: [0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496]
    ├─ [0] console::log("manager:", RouterV3AndFactoryV3Test: [0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496]) [staticcall]
    │   └─ ← [Stop] 
    ├─ [0] VM::addr(<pk>) [staticcall]
    │   └─ ← [Return] bob: [0x1D96F2f6BeF1202E4Ce1Ff6Dad0c2CB002861d3e]
    ├─ [0] VM::label(bob: [0x1D96F2f6BeF1202E4Ce1Ff6Dad0c2CB002861d3e], "bob")
    │   └─ ← [Return] 
    ├─ [0] console::log("bob:", bob: [0x1D96F2f6BeF1202E4Ce1Ff6Dad0c2CB002861d3e]) [staticcall]
    │   └─ ← [Stop] 
    ├─ [0] VM::prank(bob: [0x1D96F2f6BeF1202E4Ce1Ff6Dad0c2CB002861d3e])
    │   └─ ← [Return] 
    ├─ [614] RouterV3::setManager(bob: [0x1D96F2f6BeF1202E4Ce1Ff6Dad0c2CB002861d3e])
    │   └─ ← [Revert] revert: Only Manager
    └─ ← [Revert] revert: Only Manager

[PASS] testSetFee() (gas: 165)
Logs:
  test contract:  0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496
  factoryV3: 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f
  routerV3: 0x2e234DAe75C793f67A35089C9d99245E1C58470b

Traces:
  [165] RouterV3AndFactoryV3Test::testSetFee()
    └─ ← [Stop] 

[PASS] testSetFun() (gas: 166)
Logs:
  test contract:  0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496
  factoryV3: 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f
  routerV3: 0x2e234DAe75C793f67A35089C9d99245E1C58470b

Traces:
  [166] RouterV3AndFactoryV3Test::testSetFun()
    └─ ← [Stop] 

[PASS] testSetManager() (gas: 19220)
Logs:
  test contract:  0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496
  factoryV3: 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f
  routerV3: 0x2e234DAe75C793f67A35089C9d99245E1C58470b
  alice: 0x328809Bc894f92807417D2dAD6b7C998c1aFdac6

Traces:
  [19220] RouterV3AndFactoryV3Test::testSetManager()
    ├─ [0] VM::addr(<pk>) [staticcall]
    │   └─ ← [Return] alice: [0x328809Bc894f92807417D2dAD6b7C998c1aFdac6]
    ├─ [0] VM::label(alice: [0x328809Bc894f92807417D2dAD6b7C998c1aFdac6], "alice")
    │   └─ ← [Return] 
    ├─ [0] console::log("alice:", alice: [0x328809Bc894f92807417D2dAD6b7C998c1aFdac6]) [staticcall]
    │   └─ ← [Stop] 
    ├─ [6685] RouterV3::setManager(alice: [0x328809Bc894f92807417D2dAD6b7C998c1aFdac6])
    │   ├─ emit ChangeManger(_newManger: alice: [0x328809Bc894f92807417D2dAD6b7C998c1aFdac6])
    │   └─ ← [Stop] 
    └─ ← [Stop] 

Suite result: ok. 4 passed; 0 failed; 0 skipped; finished in 2.53ms (831.55µs CPU time)

Ran 1 test suite in 5.22ms (2.53ms CPU time): 4 tests passed, 0 failed, 0 skipped (4 total tests)
```



#### 25)生成gas-report报告

```
forge test -vvvvv   --gas-report
```





#### 26)部署合约

描述:由于我们的合约部署后还得调用合约设置一些参数才可以使用,所以分为3部分.

步骤一：

命令一

```
forge create  contracts/FactoryV3.sol:FactoryV3 --rpc-url sepolia --private-key=0x私钥
```

命令一执行后打印数据如下:

```
[⠊] Compiling...
No files changed, compilation skipped
Deployer: 0x91d2FA384b6c98b137316Ce0388B8C0114a5859d
Deployed to: 0xfeef078d9a9913b2df8ea4800a18b9ccea93c617
Transaction hash: 0x3bfd91a612692a716c0520697a3674c513a62498ad5c421abaae46ac9c74d70e
```

命令二

```
forge create  contracts/RouterV3.sol:RouterV3 --constructor-args "factoryV3的合约地址" --rpc-url sepolia --private-key=0x私钥
```

命令二执行后打印数据如下:

```
[⠊] Compiling...
No files changed, compilation skipped
Deployer: 0x91d2FA384b6c98b137316Ce0388B8C0114a5859d
Deployed to: 0x1108A90a7eE5cb0640Bf8a59cbA2abC99b551ad3
Transaction hash: 0x870b2b6288756ea2d6abd0e710a41ac21216fb3f9521eb9d1e72a68ba0409f98
```



总结

ps:命令`forge create  contracts/待部署的合约 --constructor-args  构造函数的参数 -rpc-url RPC --private-key=0x私钥`

就是正式部署合约的操作





步骤二

描述:以下都是验证源代码的操作

```
forge verify-contract 已部署的FactoryV3合约地址 contracts/FactoryV3.sol:FactoryV3 --rpc-url  sepolia  --etherscan-api-key 你的etherscan-api-key
```

ps:执行命令后打印数据如下

```
Start verifying contract `0xFEef078d9a9913b2dF8EA4800A18b9CcEa93C617` deployed on sepolia

Submitting verification for [contracts/FactoryV3.sol:FactoryV3] 0xFEef078d9a9913b2dF8EA4800A18b9CcEa93C617.
Submitted contract for verification:
        Response: `OK`
        GUID: `pmwzpmccvh8cmxuzv2kx4efii9xvcuiyvxy8qpn3rqnd1fypaw`
        URL: https://sepolia.etherscan.io/address/0xfeef078d9a9913b2df8ea4800a18b9ccea93c617
```



```
forge verify-contract 已部署的RouterV3合约地址 contracts/RouterV3.sol:RouterV3 --constructor-args $(cast abi-encode "constructor(address)" "已部署的FacroryV3合约地址") --rpc-url sepolia  --etherscan-api-key 你的etherscan-api-key`
```

ps:执行命令后打印数据如下

```
Submitting verification for [contracts/RouterV3.sol:RouterV3] 0x1108A90a7eE5cb0640Bf8a59cbA2abC99b551ad3.
Submitted contract for verification:
        Response: `OK`
        GUID: `rwjvubisx3sxxivpzmvftv4yatjejypg3k3kc4wlsrgih1y8fd`
        URL: https://sepolia.etherscan.io/address/0x1108a90a7ee5cb0640bf8a59cba2abc99b551ad3
```





步骤三

(1)

```
cast send 已部署的routerV3合约地址 "setFee(uint256)" 1000000000000 --rpc-url sepolia --private-key=0x私钥
```

ps:执行上面的命令,即发送一笔交易,打印的数据如下:

```
blockHash               0x014ba9e8d8a7f2806f60a9c0098febf9379daad120025835bf63897b660def7b
blockNumber             5718701
contractAddress         
cumulativeGasUsed       14364790
effectiveGasPrice       5549388642
from                    0x91d2FA384b6c98b137316Ce0388B8C0114a5859d
gasUsed                 47298
logs                    [{"address":"0x1108a90a7ee5cb0640bf8a59cba2abc99b551ad3","topics":["0x91e72fa36e0202be93e86c97a3d3d3497cf0a06cf859b14b616a304367835a8e","0x000000000000000000000000000000000000000000000000000000e8d4a51000","0x0000000000000000000000000000000000000000000000000000000000000000"],"data":"0x","blockHash":"0x014ba9e8d8a7f2806f60a9c0098febf9379daad120025835bf63897b660def7b","blockNumber":"0x5742ad","transactionHash":"0x371ccdfead81b24be757638eec5d9a3abad60f0a3aeab35a5af125630745a096","transactionIndex":"0x4f","logIndex":"0xa4","removed":false}]
logsBloom               0x00000000000001000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100400000000000000000000000000000000000800000020040000000000000000800000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000010000000000040000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000
root                    
status                  1 (success)
transactionHash         0x371ccdfead81b24be757638eec5d9a3abad60f0a3aeab35a5af125630745a096
transactionIndex        79
type                    2
blobGasPrice            
blobGasUsed             
to                      0x1108A90a7eE5cb0640Bf8a59cbA2abC99b551ad3
```



(2)

```
cast send 已部署的FactoryV3合约地址  "onlyInitialize(address)" "RouterV3合约地址" --rpc-url sepolia --private-key=0x私钥
```

ps:执行上面的命令,即发送一笔交易,打印的数据如下:

```
blockHash               0x27c8f4851d958e411c316e437381e4dc9a085cefcc2526b3e9c992a3b37c2e31
blockNumber             5718759
contractAddress         
cumulativeGasUsed       14440485
effectiveGasPrice       7413060294
from                    0x91d2FA384b6c98b137316Ce0388B8C0114a5859d
gasUsed                 49203
logs                    []
logsBloom               0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
root                    
status                  1 (success)
transactionHash         0x58ba3560cc9e2f41caad87c82474bffc4eb86187acbfdd184a28190e19eeb71d
transactionIndex        129
type                    2
blobGasPrice            
blobGasUsed             
to                      0xFEef078d9a9913b2dF8EA4800A18b9CcEa93C617
```



```
cast call 已部署的routerV3合约地址 "fee()" --rpc-url sepolia 
```

执行上面的命令,即查询链上的数据,打印的数据如下

```
0x000000000000000000000000000000000000000000000000000000e8d4a51000
```











#### 27)以脚本形式运行合约

```
forge script ignition/modules/Nft/DeployNft.s.sol:DeployNftScript -vvvv --rpc-url sepolia --broadcast  --private-key=你的私钥
```

ps:终端打印数据如下

```
[⠊] Compiling...
[⠒] Compiling 52 files with 0.8.24
[⠢] Solc 0.8.24 finished in 1.96s
Compiler run successful!
Traces:
  [6582167] → new DeployNftScript@0x5b73C5498c1E3b4dbA84de0F1833c4a029d90519
    └─ ← [Return] 32759 bytes of code

  [121] DeployNftScript::setUp()
    └─ ← [Stop] 

  [2916] DeployNftScript::run()
    ├─ [0] VM::envUint("PRIVATE_KEY") [staticcall]
    │   └─ ← [Revert] failed parsing $PRIVATE_KEY as type `uint256`: missing hex prefix ("0x") for hex string
    └─ ← [Revert] failed parsing $PRIVATE_KEY as type `uint256`: missing hex prefix ("0x") for hex string


Error: 
script failed: failed parsing $PRIVATE_KEY as type `uint256`: missing hex prefix ("0x") for hex string
xhh@xhh:~/upgeadeNftDemo$ forge script ignition/modules/Nft/DeployNft.s.sol:DeployNftScript -vvvv --rpc-url sepolia --private-key 37816f9c9a823301610654f5b6fc216237edf60815093ba22d4e1b13ecf83272 --broadcast 
[⠊] Compiling...
[⠊] Compiling 52 files with 0.8.24
[⠒] Solc 0.8.24 finished in 1.92s
Compiler run successful!
Traces:
  [6582167] → new DeployNftScript@0x5b73C5498c1E3b4dbA84de0F1833c4a029d90519
    └─ ← [Return] 32759 bytes of code

  [121] DeployNftScript::setUp()
    └─ ← [Stop] 

  [2916] DeployNftScript::run()
    ├─ [0] VM::envUint("PRIVATE_KEY") [staticcall]
    │   └─ ← [Revert] failed parsing $PRIVATE_KEY as type `uint256`: missing hex prefix ("0x") for hex string
    └─ ← [Revert] failed parsing $PRIVATE_KEY as type `uint256`: missing hex prefix ("0x") for hex string


Error: 
script failed: failed parsing $PRIVATE_KEY as type `uint256`: missing hex prefix ("0x") for hex string
xhh@xhh:~/upgeadeNftDemo$ forge script ignition/modules/Nft/DeployNft.s.sol:DeployNftScript -vvvv --rpc-url sepolia --private-key 0x37816f9c9a823301610654f5b6fc216237edf60815093ba22d4e1b13ecf83272 --broadcast
[⠊] Compiling...
[⠃] Compiling 52 files with 0.8.24
[⠊] Solc 0.8.24 finished in 1.83s
Compiler run successful!
Traces:
  [6228118] DeployNftScript::run()
    ├─ [0] VM::envUint("PRIVATE_KEY") [staticcall]
    │   └─ ← [Return] <env var value>
    ├─ [0] VM::startBroadcast(<pk>)
    │   └─ ← [Return] 
    ├─ [5254998] → new FactoryV3@0x63399Fce5fC19547D20332c918ad98594d87bDcc
    │   ├─ [3009702] → new NfinityV2@0x416b97464237FEE6C93a7F0ae041fBB64d159fE0
    │   │   └─ ← [Return] 15032 bytes of code
    │   └─ ← [Return] 10806 bytes of code
    ├─ [0] console::log("test contract: ", DeployNftScript: [0x5b73C5498c1E3b4dbA84de0F1833c4a029d90519]) [staticcall]
    │   └─ ← [Stop] 
    ├─ [0] console::log("factoryV3:", FactoryV3: [0x63399Fce5fC19547D20332c918ad98594d87bDcc]) [staticcall]
    │   └─ ← [Stop] 
    ├─ [814335] → new RouterV3@0xccdD5466741e3C5e587D345B6592F69F1B60165F
    │   ├─ emit ChangeManger(newManger: 0x91d2FA384b6c98b137316Ce0388B8C0114a5859d, oldManager: 0x0000000000000000000000000000000000000000)
    │   ├─ emit ChangeFun(newFun: true, oldFun: false)
    │   └─ ← [Return] 3940 bytes of code
    ├─ [0] console::log("routerV3:", RouterV3: [0xccdD5466741e3C5e587D345B6592F69F1B60165F]) [staticcall]
    │   └─ ← [Stop] 
    ├─ [22899] FactoryV3::onlyInitialize(RouterV3: [0xccdD5466741e3C5e587D345B6592F69F1B60165F])
    │   └─ ← [Stop] 
    ├─ [2375] RouterV3::setFun(true)
    │   ├─ emit ChangeFun(newFun: true, oldFun: true)
    │   └─ ← [Stop] 
    ├─ [24002] RouterV3::setFee(1000000000000000 [1e15])
    │   ├─ emit ChangeFee(newFee: 1000000000000000 [1e15], oldFee: 0)
    │   └─ ← [Stop] 
    ├─ [380] RouterV3::manager() [staticcall]
    │   └─ ← [Return] 0x91d2FA384b6c98b137316Ce0388B8C0114a5859d
    ├─ [0] console::log("manager:", 0x91d2FA384b6c98b137316Ce0388B8C0114a5859d) [staticcall]
    │   └─ ← [Stop] 
    ├─ [0] VM::stopBroadcast()
    │   └─ ← [Return] 
    └─ ← [Stop] 


Script ran successfully.

== Logs ==
  test contract:  0x5b73C5498c1E3b4dbA84de0F1833c4a029d90519
  factoryV3: 0x63399Fce5fC19547D20332c918ad98594d87bDcc
  routerV3: 0xccdD5466741e3C5e587D345B6592F69F1B60165F
  manager: 0x91d2FA384b6c98b137316Ce0388B8C0114a5859d

## Setting up 1 EVM.
==========================
Simulated On-chain Traces:

  [5254998] → new FactoryV3@0x63399Fce5fC19547D20332c918ad98594d87bDcc
    ├─ [3009702] → new <unknown>@0x27574d61a08f1914C7B03c6A7741Fd0a90Cf4710
    │   └─ ← [Return] 15032 bytes of code
    └─ ← [Return] 10806 bytes of code

  [814335] → new RouterV3@0xccdD5466741e3C5e587D345B6592F69F1B60165F
    ├─ emit ChangeManger(newManger: 0x91d2FA384b6c98b137316Ce0388B8C0114a5859d, oldManager: 0x0000000000000000000000000000000000000000)
    ├─ emit ChangeFun(newFun: true, oldFun: false)
    └─ ← [Return] 3940 bytes of code

  [27699] FactoryV3::onlyInitialize(RouterV3: [0xccdD5466741e3C5e587D345B6592F69F1B60165F])
    └─ ← [Stop] 

  [4375] RouterV3::setFun(true)
    ├─ emit ChangeFun(newFun: true, oldFun: true)
    └─ ← [Stop] 

  [26002] RouterV3::setFee(1000000000000000 [1e15])
    ├─ emit ChangeFee(newFee: 1000000000000000 [1e15], oldFee: 0)
    └─ ← [Stop] 


==========================

Chain 11155111

Estimated gas price: 0.526012664 gwei

Estimated total gas used for script: 8764695

Estimated amount required: 0.00461034056609748 ETH

==========================
##
Sending transactions [0 - 4].
⠒ [00:00:01] [################################################################################################################################################] 5/5 txes (0.0s)##
Waiting for receipts.
⠂ [00:00:30] [############################################################################################################################################] 5/5 receipts (0.0s)
##### sepolia
✅  [Success]Hash: 0xf158b0f1b3a033517d10af8e49ce28f7d8b31a92a74d5174c88566d805233658
Contract Address: 0x63399Fce5fC19547D20332c918ad98594d87bDcc
Block: 5713584
Paid: 0.002984753898649026 ETH (5680542 gas * 0.525434703 gwei)


##### sepolia
✅  [Success]Hash: 0xca49b9d3bd6485b7aa8a78f507cb57718d77edb05e0603d2bdb53d1966a88adf
Contract Address: 0xccdD5466741e3C5e587D345B6592F69F1B60165F
Block: 5713584
Paid: 0.000487161513798777 ETH (927159 gas * 0.525434703 gwei)


##### sepolia
✅  [Success]Hash: 0xce8bc3215753aa70da528dade929f7e31eddd81564c6a8d755f02fb92cce863c
Block: 5713584
Paid: 0.000025815132393093 ETH (49131 gas * 0.525434703 gwei)


##### sepolia
✅  [Success]Hash: 0xaa395c9989947aea30fa4a63b4793f35bfb253c9aab76311a9686cabaaeafb3f
Block: 5713584
Paid: 0.000013440094268037 ETH (25579 gas * 0.525434703 gwei)


##### sepolia
✅  [Success]Hash: 0xd8010f90a8374a26434b0f6c1ff0e0f243aa7ae5e39b77f2d54b53b58e6c9347
Block: 5713584
Paid: 0.000024835196671998 ETH (47266 gas * 0.525434703 gwei)



==========================

ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
Total Paid: 0.003536005835780931 ETH (6729677 gas * avg 0.525434703 gwei)

Transactions saved to: /home/xhh/upgeadeNftDemo/broadcast/DeployNft.s.sol/11155111/run-latest.json

Sensitive values saved to: /home/xhh/upgeadeNftDemo/cache/foundry/DeployNft.s.sol/11155111/run-latest.json
```





#### 28)hardhat fork

描述:Fork主网意思是模拟具有与主网相同的状态的网络，但它将作为本地开发网络工作。 这样你就可以与部署的协议进行交互，并在本地测试复杂的交互.

```
// 启动本地节点
npx hardhat node 
// fork到本地节点并进行单元测试
npx hardhat test --network localhost
```



#### 29)foundry fork

```
forge test --fork-url sepolia --fork-block-number 5718536
```

ps:执行以上命令就会在wsl系统下，就会去拉取数据缓存到`~/.foundry/cache/rpc/<chain name>/<block number>` 中.

要清除缓存,只需删除目录或运行 [`forge clean`](https://learnblockchain.cn/docs/foundry/i18n/zh/reference/forge/forge-clean.html)（删除所有构建工件和缓存目录）.

详细操作步骤,请查看[分叉测试 - Foundry 中文文档 (learnblockchain.cn)](https://learnblockchain.cn/docs/foundry/i18n/zh/forge/fork-testing.html)

#### 30)anvil的使用
描述:`anvil` 命令创建一个本地开发网节点（好像是对 hardhat node的封装 ），用于部署和测试智能合约。它也可以用来分叉其他与 EVM 兼容的网络。

```
anvil --port 端口号
```

ps: 启动本地node节点

```
anvil --fork-url=$RPC --fork-block-number=<BLOCK>
```

ps:从节点URL（需要是存档节点）fork 区块链状态，可以指定某个区块时的状态。


#### 31)项目涉及的命令

```shell
npx hardhat help
npx hardhat accounts
npx hardhat compile
npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/XXXX.js --network localhost
npx hardhat ignition deploy ./ignition/modules/XXXX.js --network 部署的网络
npx hardhat verify 合约地址 <构造函数参数> --network 部署的网络
npx hardhat coverage
npx hardhat run ./ignition/modules/XXXX.js --network $RPC
forge build
forge test -vvvv
forge create 合约路径 --constructor-args "构造函数参数" --rpc-url $RPC --private-key=0x私钥
forge script 合约路径 -vvvv --rpc-url $rpc --broadcast  --private-key=0x私钥
forge verify-contract 合约地址 合约路径 --rpc-url  $RPC --etherscan-api-key 你的etherscan-api-key
cast call 合约地址 "合约方法" --rpc-url $RPC
cast send 合约地址 "合约方法" --rpc-url $RPC --private-key=0x私钥
anvil --port 端口号
anvil --fork-url=$RPC --fork-block-number=<BLOCK>
```
