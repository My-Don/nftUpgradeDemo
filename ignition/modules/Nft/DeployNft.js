
const  { ethers, network } = require("hardhat");


// 部署合约到测试网
async function main() {

    const [deployer] = await ethers.getSigners();

    console.log(
      "Deploying contracts with the account:",
      deployer.address
    );

  const FactoryV3 = await ethers.getContractFactory("FactoryV3");
  const factoryV3 = await FactoryV3.deploy();

  const RouterV3 = await ethers.getContractFactory("RouterV3");
  const routerV3 = await RouterV3.deploy(factoryV3.target);

  console.log(`FactoryV3 Contract deployed to ${factoryV3.target} on ${network.name}`);

  console.log(`RouterV3 Contract deployed to ${routerV3.target} on ${network.name}`);

  console.log(`Verifying contract on Etherscan...`);

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
});


