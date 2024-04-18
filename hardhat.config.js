require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-foundry");

const fs = require("fs");
const path = require("path");
const dotenv = require('dotenv');

// 构造出.env*文件的绝对路径
// const appDirectory = fs.realpathSync(process.cwd());
// const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath);
// const pathsDotenv = resolveApp(".env");

// 加载.env.example文件
//dotenv.config({ path: `${pathsDotenv}.example` });

dotenv.config();


// 配置hardhat accounts参数
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});


if (!process.env.MNEMONIC && !process.env.SEPOLIA_URL) {
  console.log("请配置.env.......");
  process.exit();
}

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
        // 指定HD Wallet层级路径
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
      accounts: [],
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
    L1: "ethereum",
    // 默认获取eth价格,可设置其它token 
    token: "ETH",
    // coinmarkercap获取价格
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
    // 设置1层以太坊网络
    // 实时获取网络的gasPrice
    gasPriceApi: process.env.GAS_PRICE_API,
    gasPrice: process.env.GAS_PRICE_API
  },
  // 验证合约并开开源
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY
    },
  },
  // contractSizer: {
  //     alphaSort: true,
  //     disambiguatePaths: false,
  //     runOnCompile: true,
  //     strict: true,
  // },
};
