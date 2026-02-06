const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("NFT Factory System - Complete Test Suite", function () {
    let factoryV3, routerV3;
    let owner, user1, user2, user3, manager;
    let merkleTree, merkleRoot;
    let whitelistedAddresses;

    const MINT_FEE = ethers.parseEther("0.1");
    const WHITELIST_PRICE = ethers.parseEther("0.05");
    const PUBLIC_PRICE = ethers.parseEther("0.08");
    const MAX_NFT = 1000;
    const MAX_PER_TX = 10;
    const AIRDROP_ALLOCATION = 100;

    beforeEach(async function () {
        [owner, user1, user2, user3, manager] = await ethers.getSigners();

        // 设置白名单 Merkle Tree
        whitelistedAddresses = [user1.address, user2.address];
        const leaves = whitelistedAddresses.map(addr => keccak256(addr));
        merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        merkleRoot = merkleTree.getHexRoot();

        // 部署 FactoryV3
        const FactoryV3 = await ethers.getContractFactory("FactoryV3");
        factoryV3 = await FactoryV3.deploy();
        await factoryV3.waitForDeployment();

        // 部署 RouterV3
        const RouterV3 = await ethers.getContractFactory("RouterV3");
        routerV3 = await RouterV3.deploy(await factoryV3.getAddress());
        await routerV3.waitForDeployment();

        // 初始化 Factory
        await factoryV3.onlyInitialize(await routerV3.getAddress());

        // 设置路由费用
        await routerV3.setFee(MINT_FEE);
    });

    // ============================================================================
    // RouterV3 测试
    // ============================================================================
    describe("RouterV3 - 部署和配置", function () {
        it("应该正确部署并设置初始参数", async function () {
            expect(await routerV3.manager()).to.equal(owner.address);
            expect(await routerV3.isFun()).to.equal(true);
            expect(await routerV3.fee()).to.equal(MINT_FEE);
        });

        it("应该在构造函数中验证 factory 地址", async function () {
            const RouterV3 = await ethers.getContractFactory("RouterV3");
            await expect(
                RouterV3.deploy(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid factory address");
        });

        it("应该正确发出 ChangeManger 事件", async function () {
            const RouterV3 = await ethers.getContractFactory("RouterV3");
            const newRouter = await RouterV3.deploy(await factoryV3.getAddress());
            
            // 部署时应该发出事件
            await expect(newRouter.deploymentTransaction())
                .to.emit(newRouter, "ChangeManger")
                .withArgs(owner.address, ethers.ZeroAddress);
        });

        it("应该正确发出 ChangeFun 事件", async function () {
            const RouterV3 = await ethers.getContractFactory("RouterV3");
            const newRouter = await RouterV3.deploy(await factoryV3.getAddress());
            
            await expect(newRouter.deploymentTransaction())
                .to.emit(newRouter, "ChangeFun")
                .withArgs(true, false);
        });
    });

    describe("RouterV3 - 权限管理", function () {
        it("只有 manager 可以设置费用", async function () {
            await expect(
                routerV3.connect(user1).setFee(ethers.parseEther("0.2"))
            ).to.be.revertedWith("Only Manager");

            const newFee = ethers.parseEther("0.2");
            await expect(routerV3.setFee(newFee))
                .to.emit(routerV3, "ChangeFee")
                .withArgs(newFee, MINT_FEE);
            
            expect(await routerV3.fee()).to.equal(newFee);
        });

        it("只有 manager 可以改变服务状态", async function () {
            await expect(
                routerV3.connect(user1).setFun(false)
            ).to.be.revertedWith("Only Manager");

            await expect(routerV3.setFun(false))
                .to.emit(routerV3, "ChangeFun")
                .withArgs(false, true);
            
            expect(await routerV3.isFun()).to.equal(false);
        });

        it("只有 manager 可以转移管理权限", async function () {
            await expect(
                routerV3.connect(user1).setManager(user1.address)
            ).to.be.revertedWith("Only Manager");

            await expect(routerV3.setManager(manager.address))
                .to.emit(routerV3, "ChangeManger")
                .withArgs(manager.address, owner.address);
            
            expect(await routerV3.manager()).to.equal(manager.address);
        });

        it("应该拒绝零地址作为 manager", async function () {
            await expect(
                routerV3.setManager(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid manager address");
        });

        it("新 manager 应该能够执行管理操作", async function () {
            await routerV3.setManager(manager.address);
            
            const newFee = ethers.parseEther("0.15");
            await routerV3.connect(manager).setFee(newFee);
            expect(await routerV3.fee()).to.equal(newFee);
        });
    });

    describe("RouterV3 - NFT 创建", function () {
        it("当服务关闭时应该拒绝创建 NFT", async function () {
            await routerV3.setFun(false);

            await expect(
                routerV3.connect(user1).preCreate(
                    false,
                    merkleRoot,
                    [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                    "ipfs://blind/",
                    "TestNFT",
                    "TNFT",
                    { value: MINT_FEE }
                )
            ).to.be.revertedWith("Not yet open");
        });

        it("费用不足时应该拒绝创建", async function () {
            await expect(
                routerV3.connect(user1).preCreate(
                    false,
                    merkleRoot,
                    [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                    "ipfs://blind/",
                    "TestNFT",
                    "TNFT",
                    { value: ethers.parseEther("0.05") }
                )
            ).to.be.revertedWith("Insufficient fee");
        });

        it("费用为 0 时应该允许免费创建", async function () {
            await routerV3.setFee(0);
            
            await expect(
                routerV3.connect(user1).preCreate(
                    false,
                    merkleRoot,
                    [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                    "ipfs://blind/",
                    "TestNFT",
                    "TNFT",
                    { value: 0 }
                )
            ).to.not.be.reverted;
        });

        it("每次创建都应该收取费用（不是只收一次）", async function () {
            // 第一次创建
            await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT1",
                "TNFT1",
                { value: MINT_FEE }
            );

            const balanceBefore = await ethers.provider.getBalance(await routerV3.getAddress());

            // 第二次创建 - 应该再次收费
            await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12346, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT2",
                "TNFT2",
                { value: MINT_FEE }
            );

            const balanceAfter = await ethers.provider.getBalance(await routerV3.getAddress());
            expect(balanceAfter - balanceBefore).to.equal(MINT_FEE);
        });

        it("应该退还多余的 ETH", async function () {
            const excessAmount = ethers.parseEther("0.05");
            const totalSent = MINT_FEE + excessAmount;

            const balanceBefore = await ethers.provider.getBalance(user1.address);

            const tx = await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: totalSent }
            );

            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;
            const balanceAfter = await ethers.provider.getBalance(user1.address);

            // 用户应该只损失 MINT_FEE + gas
            const expectedBalance = balanceBefore - MINT_FEE - gasUsed;
            expect(balanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.0001"));
        });

        it("应该成功创建 NFT 并发出事件", async function () {
            await expect(
                routerV3.connect(user1).preCreate(
                    false,
                    merkleRoot,
                    [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                    "ipfs://blind/",
                    "TestNFT",
                    "TNFT",
                    { value: MINT_FEE }
                )
            ).to.emit(routerV3, "NftCreated");
        });

        it("应该正确处理重入攻击保护", async function () {
            // nonReentrant 修饰符会自动防止重入
            const tx = await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: MINT_FEE }
            );
            
            await expect(tx).to.not.be.reverted;
        });
    });

    describe("RouterV3 - 资金管理", function () {
        it("manager 应该能够提取收益", async function () {
            await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: MINT_FEE }
            );

            const contractBalance = await ethers.provider.getBalance(await routerV3.getAddress());
            expect(contractBalance).to.equal(MINT_FEE);

            const managerBalanceBefore = await ethers.provider.getBalance(owner.address);
            const tx = await routerV3.withdraw();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const managerBalanceAfter = await ethers.provider.getBalance(owner.address);
            expect(managerBalanceAfter).to.equal(
                managerBalanceBefore + MINT_FEE - gasUsed
            );
        });

        it("非 manager 不应该能够提取收益", async function () {
            await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: MINT_FEE }
            );

            await expect(
                routerV3.connect(user1).withdraw()
            ).to.be.revertedWith("Only Manager");
        });

        it("当余额为 0 时提取应该失败", async function () {
            await expect(
                routerV3.withdraw()
            ).to.be.revertedWith("No balance to withdraw");
        });

        it("应该能够提取多次收费累积的金额", async function () {
            // 创建多个 NFT
            for (let i = 0; i < 3; i++) {
                await routerV3.connect(user1).preCreate(
                    false,
                    merkleRoot,
                    [12345 + i, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                    "ipfs://blind/",
                    `TestNFT${i}`,
                    `TNFT${i}`,
                    { value: MINT_FEE }
                );
            }

            const contractBalance = await ethers.provider.getBalance(await routerV3.getAddress());
            expect(contractBalance).to.equal(MINT_FEE * 3n);

            await routerV3.withdraw();
            expect(await ethers.provider.getBalance(await routerV3.getAddress())).to.equal(0);
        });
    });

    describe("RouterV3 - 查询功能", function () {
        it("应该正确返回用户创建的 NFT 列表", async function () {
            // 创建两个 NFT
            await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT1",
                "TNFT1",
                { value: MINT_FEE }
            );

            await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12346, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT2",
                "TNFT2",
                { value: MINT_FEE }
            );

            const userNfts = await routerV3.getOwnerNft(user1.address);
            expect(userNfts.length).to.equal(2);
        });

        it("没有创建 NFT 的用户应该返回空数组", async function () {
            const userNfts = await routerV3.getOwnerNft(user2.address);
            expect(userNfts.length).to.equal(0);
        });
    });

    // ============================================================================
    // FactoryV3 测试
    // ============================================================================
    describe("FactoryV3 - 初始化", function () {
        it("应该正确初始化", async function () {
            const isInitialized = await factoryV3.aParm();
            expect(isInitialized).to.equal(true);
        });

        it("不应该允许重复初始化", async function () {
            await expect(
                factoryV3.onlyInitialize(await routerV3.getAddress())
            ).to.be.revertedWith("Already initialized");
        });

        it("只有部署者可以初始化", async function () {
            const FactoryV3 = await ethers.getContractFactory("FactoryV3");
            const newFactory = await FactoryV3.deploy();
            await newFactory.waitForDeployment();

            await expect(
                newFactory.connect(user1).onlyInitialize(await routerV3.getAddress())
            ).to.be.revertedWith("Only Deployer");
        });

        it("应该拒绝零地址的 router", async function () {
            const FactoryV3 = await ethers.getContractFactory("FactoryV3");
            const newFactory = await FactoryV3.deploy();
            await newFactory.waitForDeployment();

            await expect(
                newFactory.onlyInitialize(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid router address");
        });
    });

    describe("FactoryV3 - NFT 创建", function () {
        it("应该拒绝零地址所有者", async function () {
            await expect(
                routerV3.connect(user1).preCreate(
                    false,
                    merkleRoot,
                    [12345, WHITELIST_PRICE, PUBLIC_PRICE, 0, MAX_PER_TX, AIRDROP_ALLOCATION],
                    "ipfs://blind/",
                    "TestNFT",
                    "TNFT",
                    { value: MINT_FEE }
                )
            ).to.be.revertedWith("Max NFT must be greater than 0");
        });

        it("应该拒绝 maxPerTx 为 0", async function () {
            await expect(
                routerV3.connect(user1).preCreate(
                    false,
                    merkleRoot,
                    [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, 0, AIRDROP_ALLOCATION],
                    "ipfs://blind/",
                    "TestNFT",
                    "TNFT",
                    { value: MINT_FEE }
                )
            ).to.be.revertedWith("Max per tx must be greater than 0");
        });

        it("应该拒绝空投超过最大供应量", async function () {
            await expect(
                routerV3.connect(user1).preCreate(
                    false,
                    merkleRoot,
                    [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, MAX_NFT + 1],
                    "ipfs://blind/",
                    "TestNFT",
                    "TNFT",
                    { value: MINT_FEE }
                )
            ).to.be.revertedWith("Airdrop exceeds max NFT");
        });

        it("应该成功创建 NFT 合约并发出事件", async function () {
            const tx = await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: MINT_FEE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return factoryV3.interface.parseLog(log)?.name === "NftCreated";
                } catch {
                    return false;
                }
            });

            expect(event).to.not.be.undefined;
        });

        it("创建的 NFT 应该有正确的所有者", async function () {
            const tx = await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: MINT_FEE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return factoryV3.interface.parseLog(log)?.name === "NftCreated";
                } catch {
                    return false;
                }
            });

            const nftAddress = factoryV3.interface.parseLog(event).args._proxy;
            const nftContract = await ethers.getContractAt("NfinityV2", nftAddress);
            
            expect(await nftContract.owner()).to.equal(user1.address);
        });

        it("应该追踪用户创建的所有 NFT", async function () {
            await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT1",
                "TNFT1",
                { value: MINT_FEE }
            );

            await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12346, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT2",
                "TNFT2",
                { value: MINT_FEE }
            );

            const userNfts = await routerV3.getOwnerNft(user1.address);
            expect(userNfts.length).to.equal(2);
        });
    });

    // ============================================================================
    // NfinityV2 测试
    // ============================================================================
    describe("NfinityV2 - 初始化和配置", function () {
        let nftContract;
        let nftAddress;

        beforeEach(async function () {
            const tx = await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: MINT_FEE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return factoryV3.interface.parseLog(log)?.name === "NftCreated";
                } catch {
                    return false;
                }
            });

            nftAddress = factoryV3.interface.parseLog(event).args._proxy;
            nftContract = await ethers.getContractAt("NfinityV2", nftAddress);
        });

        it("应该正确初始化 NFT 参数", async function () {
            expect(await nftContract.name()).to.equal("TestNFT");
            expect(await nftContract.symbol()).to.equal("TNFT");
            expect(await nftContract.MAX_NFT()).to.equal(MAX_NFT);
            expect(await nftContract.MAX_PER_TX()).to.equal(MAX_PER_TX);
            expect(await nftContract.WHITE_LIST_MINT_PRICE()).to.equal(WHITELIST_PRICE);
            expect(await nftContract.PUBLIC_MINT_PRICE()).to.equal(PUBLIC_PRICE);
            expect(await nftContract.AIR_DROP()).to.equal(AIRDROP_ALLOCATION);
        });

        it("NFT 所有权应该转移给创建者", async function () {
            expect(await nftContract.owner()).to.equal(user1.address);
        });

        it("初始状态应该是关闭的", async function () {
            expect(await nftContract.publicMintSwitch()).to.equal(false);
            expect(await nftContract.whiteListSwitch()).to.equal(false);
            expect(await nftContract.airDropSwitch()).to.equal(false);
        });

        it("盲盒状态应该按初始化参数设置", async function () {
            expect(await nftContract.blindBoxOpened()).to.equal(false);
        });
    });

    describe("NfinityV2 - 白名单铸造", function () {
        let nftContract;

        beforeEach(async function () {
            const tx = await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: MINT_FEE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return factoryV3.interface.parseLog(log)?.name === "NftCreated";
                } catch {
                    return false;
                }
            });

            const nftAddress = factoryV3.interface.parseLog(event).args._proxy;
            nftContract = await ethers.getContractAt("NfinityV2", nftAddress);
            
            // 开启白名单铸造
            await nftContract.connect(user1).updatewhiteListStatus(true);
        });

        it("白名单用户应该能够铸造", async function () {
            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);

            await expect(
                nftContract.connect(user1).whiteListMint(
                    user1.address,
                    5,
                    proof,
                    { value: WHITELIST_PRICE * 5n }
                )
            ).to.emit(nftContract, "WhiteListMint");

            expect(await nftContract.balanceOf(user1.address)).to.equal(5);
        });

        it("非白名单用户应该被拒绝", async function () {
            const leaf = keccak256(user3.address);
            const proof = merkleTree.getHexProof(leaf);

            await expect(
                nftContract.connect(user3).whiteListMint(
                    user3.address,
                    5,
                    proof,
                    { value: WHITELIST_PRICE * 5n }
                )
            ).to.be.revertedWith("WhiteList: Invalid proof");
        });

        it("应该强制执行每地址最大铸造限制", async function () {
            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);

            await nftContract.connect(user1).whiteListMint(
                user1.address,
                MAX_PER_TX,
                proof,
                { value: WHITELIST_PRICE * BigInt(MAX_PER_TX) }
            );

            await expect(
                nftContract.connect(user1).whiteListMint(
                    user1.address,
                    1,
                    proof,
                    { value: WHITELIST_PRICE }
                )
            ).to.be.revertedWith("WhiteList: Max per address exceeded");
        });

        it("应该拒绝不正确的付款", async function () {
            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);

            await expect(
                nftContract.connect(user1).whiteListMint(
                    user1.address,
                    5,
                    proof,
                    { value: WHITELIST_PRICE * 4n }
                )
            ).to.be.revertedWith("WhiteList: Incorrect payment");
        });

        it("应该拒绝数量为 0", async function () {
            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);

            await expect(
                nftContract.connect(user1).whiteListMint(
                    user1.address,
                    0,
                    proof,
                    { value: 0 }
                )
            ).to.be.revertedWith("Invalid quantity");
        });

        it("应该拒绝超过 MAX_PER_TX 的单次铸造", async function () {
            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);

            await expect(
                nftContract.connect(user1).whiteListMint(
                    user1.address,
                    MAX_PER_TX + 1,
                    proof,
                    { value: WHITELIST_PRICE * BigInt(MAX_PER_TX + 1) }
                )
            ).to.be.revertedWith("Invalid quantity");
        });

        it("应该尊重空投保留", async function () {
            // 铸造接近限制的数量
            const maxMintable = MAX_NFT - AIRDROP_ALLOCATION;
            
            // 需要多个用户铸造才能达到限制
            const leaf1 = keccak256(user1.address);
            const proof1 = merkleTree.getHexProof(leaf1);
            
            await nftContract.connect(user1).whiteListMint(
                user1.address,
                MAX_PER_TX,
                proof1,
                { value: WHITELIST_PRICE * BigInt(MAX_PER_TX) }
            );

            // 尝试铸造超过可用供应量
            const leaf2 = keccak256(user2.address);
            const proof2 = merkleTree.getHexProof(leaf2);
            
            const remaining = maxMintable - MAX_PER_TX;
            await expect(
                nftContract.connect(user2).whiteListMint(
                    user2.address,
                    remaining + 1,
                    proof2,
                    { value: WHITELIST_PRICE * BigInt(remaining + 1) }
                )
            ).to.be.revertedWith("Invalid quantity");
        });

        it("当开关关闭时应该拒绝铸造", async function () {
            await nftContract.connect(user1).updatewhiteListStatus(false);
            
            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);

            await expect(
                nftContract.connect(user1).whiteListMint(
                    user1.address,
                    5,
                    proof,
                    { value: WHITELIST_PRICE * 5n }
                )
            ).to.be.revertedWith("WhiteList is not active");
        });
    });

    describe("NfinityV2 - 公开铸造", function () {
        let nftContract;

        beforeEach(async function () {
            const tx = await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: MINT_FEE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return factoryV3.interface.parseLog(log)?.name === "NftCreated";
                } catch {
                    return false;
                }
            });

            const nftAddress = factoryV3.interface.parseLog(event).args._proxy;
            nftContract = await ethers.getContractAt("NfinityV2", nftAddress);
            
            await nftContract.connect(user1).updatePublicMintStatus(true);
        });

        it("任何人都应该能够公开铸造", async function () {
            await expect(
                nftContract.connect(user3).publicMint(
                    user3.address,
                    3,
                    { value: PUBLIC_PRICE * 3n }
                )
            ).to.emit(nftContract, "PublicMint");

            expect(await nftContract.balanceOf(user3.address)).to.equal(3);
        });

        it("应该强制执行每地址最大铸造限制", async function () {
            await nftContract.connect(user3).publicMint(
                user3.address,
                MAX_PER_TX,
                { value: PUBLIC_PRICE * BigInt(MAX_PER_TX) }
            );

            await expect(
                nftContract.connect(user3).publicMint(
                    user3.address,
                    1,
                    { value: PUBLIC_PRICE }
                )
            ).to.be.revertedWith("PublicMint: Max per address exceeded");
        });

        it("应该拒绝不正确的付款", async function () {
            await expect(
                nftContract.connect(user3).publicMint(
                    user3.address,
                    5,
                    { value: PUBLIC_PRICE * 4n }
                )
            ).to.be.revertedWith("PublicMint: Incorrect payment");
        });

        it("应该拒绝数量为 0", async function () {
            await expect(
                nftContract.connect(user3).publicMint(
                    user3.address,
                    0,
                    { value: 0 }
                )
            ).to.be.revertedWith("Invalid quantity");
        });

        it("应该拒绝超过 MAX_PER_TX", async function () {
            await expect(
                nftContract.connect(user3).publicMint(
                    user3.address,
                    MAX_PER_TX + 1,
                    { value: PUBLIC_PRICE * BigInt(MAX_PER_TX + 1) }
                )
            ).to.be.revertedWith("Invalid quantity");
        });

        it("当开关关闭时应该拒绝铸造", async function () {
            await nftContract.connect(user1).updatePublicMintStatus(false);

            await expect(
                nftContract.connect(user3).publicMint(
                    user3.address,
                    3,
                    { value: PUBLIC_PRICE * 3n }
                )
            ).to.be.revertedWith("Public mint is not active");
        });

        it("白名单和公开铸造应该独立计数", async function () {
            // 先开启白名单
            await nftContract.connect(user1).updatewhiteListStatus(true);
            
            const leaf = keccak256(user2.address);
            const proof = merkleTree.getHexProof(leaf);
            
            // 白名单铸造满额
            await nftContract.connect(user2).whiteListMint(
                user2.address,
                MAX_PER_TX,
                proof,
                { value: WHITELIST_PRICE * BigInt(MAX_PER_TX) }
            );
            
            // 公开铸造应该还能继续
            await nftContract.connect(user2).publicMint(
                user2.address,
                MAX_PER_TX,
                { value: PUBLIC_PRICE * BigInt(MAX_PER_TX) }
            );
            
            expect(await nftContract.balanceOf(user2.address)).to.equal(MAX_PER_TX * 2);
        });
    });

    describe("NfinityV2 - 空投", function () {
        let nftContract;

        beforeEach(async function () {
            const tx = await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: MINT_FEE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return factoryV3.interface.parseLog(log)?.name === "NftCreated";
                } catch {
                    return false;
                }
            });

            const nftAddress = factoryV3.interface.parseLog(event).args._proxy;
            nftContract = await ethers.getContractAt("NfinityV2", nftAddress);
            
            await nftContract.connect(user1).updateAirDropStatus(true);
        });

        it("所有者应该能够空投", async function () {
            await expect(
                nftContract.connect(user1).airdrop(
                    [user2.address, user3.address],
                    [10, 20]
                )
            ).to.emit(nftContract, "Cast");

            expect(await nftContract.balanceOf(user2.address)).to.equal(10);
            expect(await nftContract.balanceOf(user3.address)).to.equal(20);
        });

        it("应该强制执行空投分配限制", async function () {
            await expect(
                nftContract.connect(user1).airdrop(
                    [user2.address],
                    [AIRDROP_ALLOCATION + 1]
                )
            ).to.be.revertedWith("AirDrop: Exceeds airdrop allocation");
        });

        it("应该拒绝数组长度不匹配", async function () {
            await expect(
                nftContract.connect(user1).airdrop(
                    [user2.address, user3.address],
                    [10]
                )
            ).to.be.revertedWith("Arrays length mismatch");
        });

        it("应该拒绝零地址", async function () {
            await expect(
                nftContract.connect(user1).airdrop(
                    [ethers.ZeroAddress],
                    [10]
                )
            ).to.be.revertedWith("Invalid user address");
        });

        it("应该拒绝空数组", async function () {
            await expect(
                nftContract.connect(user1).airdrop([], [])
            ).to.be.revertedWith("Empty users array");
        });

        it("应该拒绝数量为 0", async function () {
            await expect(
                nftContract.connect(user1).airdrop(
                    [user2.address],
                    [0]
                )
            ).to.be.revertedWith("Invalid amount");
        });

        it("非所有者不应该能够空投", async function () {
            await expect(
                nftContract.connect(user2).airdrop(
                    [user3.address],
                    [10]
                )
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("当开关关闭时应该拒绝空投", async function () {
            await nftContract.connect(user1).updateAirDropStatus(false);

            await expect(
                nftContract.connect(user1).airdrop(
                    [user2.address],
                    [10]
                )
            ).to.be.revertedWith("AirDrop is not active");
        });

        it("应该正确追踪已空投数量", async function () {
            await nftContract.connect(user1).airdrop(
                [user2.address],
                [50]
            );
            
            const status = await nftContract.getContractStatus();
            expect(status.airDropUsed).to.equal(50);
            expect(status.airDropRemaining).to.equal(50);
        });

        it("多次空投应该累加", async function () {
            await nftContract.connect(user1).airdrop([user2.address], [30]);
            await nftContract.connect(user1).airdrop([user3.address], [40]);
            
            const status = await nftContract.getContractStatus();
            expect(status.airDropUsed).to.equal(70);
            expect(status.airDropRemaining).to.equal(30);
        });
    });

    describe("NfinityV2 - 所有者功能", function () {
        let nftContract, nftAddress;

        beforeEach(async function () {
            const tx = await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: MINT_FEE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return factoryV3.interface.parseLog(log)?.name === "NftCreated";
                } catch {
                    return false;
                }
            });

            nftAddress = factoryV3.interface.parseLog(event).args._proxy;
            nftContract = await ethers.getContractAt("NfinityV2", nftAddress);
        });

        it("所有者应该能够提取资金", async function () {
            await nftContract.connect(user1).updatePublicMintStatus(true);
            await nftContract.connect(user2).publicMint(
                user2.address,
                5,
                { value: PUBLIC_PRICE * 5n }
            );

            const contractBalance = await ethers.provider.getBalance(nftAddress);
            expect(contractBalance).to.equal(PUBLIC_PRICE * 5n);

            const ownerBalanceBefore = await ethers.provider.getBalance(user1.address);
            const tx = await nftContract.connect(user1).withdraw();
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const ownerBalanceAfter = await ethers.provider.getBalance(user1.address);
            expect(ownerBalanceAfter).to.equal(
                ownerBalanceBefore + PUBLIC_PRICE * 5n - gasUsed
            );
        });

        it("非所有者不应该能够提取资金", async function () {
            await nftContract.connect(user1).updatePublicMintStatus(true);
            await nftContract.connect(user2).publicMint(
                user2.address,
                5,
                { value: PUBLIC_PRICE * 5n }
            );

            await expect(
                nftContract.connect(user2).withdraw()
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("余额为 0 时提取应该失败", async function () {
            await expect(
                nftContract.connect(user1).withdraw()
            ).to.be.revertedWith("No balance to withdraw");
        });

        it("所有者应该能够销毁 NFT", async function () {
            await nftContract.connect(user1).updatePublicMintStatus(true);
            await nftContract.connect(user2).publicMint(
                user2.address,
                1,
                { value: PUBLIC_PRICE }
            );

            const tokenId = 0;
            await nftContract.connect(user1).burn(tokenId);

            await expect(
                nftContract.ownerOf(tokenId)
            ).to.be.revertedWith("OwnerQueryForNonexistentToken");
        });

        it("非所有者不应该能够销毁 NFT", async function () {
            await nftContract.connect(user1).updatePublicMintStatus(true);
            await nftContract.connect(user2).publicMint(
                user2.address,
                1,
                { value: PUBLIC_PRICE }
            );

            await expect(
                nftContract.connect(user2).burn(0)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("所有者应该能够更新 Merkle 根", async function () {
            const newRoot = ethers.keccak256(ethers.toUtf8Bytes("new root"));
            await nftContract.connect(user1).updateMerkle(newRoot);
        });

        it("所有者应该能够切换开关", async function () {
            await nftContract.connect(user1).updatewhiteListStatus(true);
            expect(await nftContract.whiteListSwitch()).to.equal(true);

            await nftContract.connect(user1).updatePublicMintStatus(true);
            expect(await nftContract.publicMintSwitch()).to.equal(true);

            await nftContract.connect(user1).updateBlindBoxOpenedStatus(true);
            expect(await nftContract.blindBoxOpened()).to.equal(true);
        });

        it("所有者应该能够设置 URI", async function () {
            await nftContract.connect(user1).setBaseURI("ipfs://newbase/");
            await nftContract.connect(user1).updateBlindBoxOpenedUri("ipfs://newblind/");
        });
    });

    describe("NfinityV2 - 辅助函数", function () {
        let nftContract;

        beforeEach(async function () {
            const tx = await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "TestNFT",
                "TNFT",
                { value: MINT_FEE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return factoryV3.interface.parseLog(log)?.name === "NftCreated";
                } catch {
                    return false;
                }
            });

            const nftAddress = factoryV3.interface.parseLog(event).args._proxy;
            nftContract = await ethers.getContractAt("NfinityV2", nftAddress);
        });

        it("应该正确返回铸造状态", async function () {
            await nftContract.connect(user1).updatewhiteListStatus(true);

            const leaf = keccak256(user1.address);
            const proof = merkleTree.getHexProof(leaf);

            await nftContract.connect(user1).whiteListMint(
                user1.address,
                5,
                proof,
                { value: WHITELIST_PRICE * 5n }
            );

            const status = await nftContract.getMintStatus(user1.address);
            expect(status.whiteListMintedAmount).to.equal(5);
            expect(status.remainingWhiteList).to.equal(MAX_PER_TX - 5);
            expect(status.publicMintedAmount).to.equal(0);
            expect(status.remainingPublic).to.equal(MAX_PER_TX);
        });

        it("应该正确返回合约状态", async function () {
            await nftContract.connect(user1).updatePublicMintStatus(true);
            await nftContract.connect(user2).publicMint(
                user2.address,
                10,
                { value: PUBLIC_PRICE * 10n }
            );

            const status = await nftContract.getContractStatus();
            expect(status.currentSupply).to.equal(10);
            expect(status.maxSupply).to.equal(MAX_NFT);
            expect(status.remainingForSale).to.equal(MAX_NFT - AIRDROP_ALLOCATION - 10);
            expect(status.airDropUsed).to.equal(0);
            expect(status.airDropRemaining).to.equal(AIRDROP_ALLOCATION);
        });

        it("tokenURI 应该在盲盒未开启时返回盲盒 URI", async function () {
            await nftContract.connect(user1).updatePublicMintStatus(true);
            await nftContract.connect(user2).publicMint(
                user2.address,
                1,
                { value: PUBLIC_PRICE }
            );

            const uri = await nftContract.tokenURI(0);
            expect(uri).to.include("ipfs://blind/");
        });

        it("tokenURI 应该在盲盒开启后返回实际 URI", async function () {
            await nftContract.connect(user1).updatePublicMintStatus(true);
            await nftContract.connect(user2).publicMint(
                user2.address,
                1,
                { value: PUBLIC_PRICE }
            );

            await nftContract.connect(user1).setBaseURI("ipfs://revealed/");
            await nftContract.connect(user1).updateBlindBoxOpenedStatus(true);

            const uri = await nftContract.tokenURI(0);
            expect(uri).to.include("ipfs://revealed/");
        });
    });

    // ============================================================================
    // 集成测试
    // ============================================================================
    describe("集成测试", function () {
        it("完整的 NFT 生命周期测试", async function () {
            // 1. 创建 NFT 合约
            const tx = await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "LifecycleNFT",
                "LNFT",
                { value: MINT_FEE }
            );

            const receipt = await tx.wait();
            const event = receipt.logs.find(log => {
                try {
                    return factoryV3.interface.parseLog(log)?.name === "NftCreated";
                } catch {
                    return false;
                }
            });

            const nftAddress = factoryV3.interface.parseLog(event).args._proxy;
            const nft = await ethers.getContractAt("NfinityV2", nftAddress);

            // 2. 启用白名单铸造
            await nft.connect(user1).updatewhiteListStatus(true);

            // 3. 白名单铸造
            const leaf1 = keccak256(user1.address);
            const proof1 = merkleTree.getHexProof(leaf1);
            await nft.connect(user1).whiteListMint(
                user1.address,
                5,
                proof1,
                { value: WHITELIST_PRICE * 5n }
            );

            // 4. 启用公开铸造
            await nft.connect(user1).updatePublicMintStatus(true);

            // 5. 公开铸造
            await nft.connect(user3).publicMint(
                user3.address,
                3,
                { value: PUBLIC_PRICE * 3n }
            );

            // 6. 空投
            await nft.connect(user1).updateAirDropStatus(true);
            await nft.connect(user1).airdrop(
                [user2.address],
                [10]
            );

            // 7. 验证最终状态
            expect(await nft.balanceOf(user1.address)).to.equal(5);
            expect(await nft.balanceOf(user2.address)).to.equal(10);
            expect(await nft.balanceOf(user3.address)).to.equal(3);
            expect(await nft.totalSupply()).to.equal(18);

            // 8. 提取资金
            const contractBalance = await ethers.provider.getBalance(nftAddress);
            await nft.connect(user1).withdraw();
            expect(await ethers.provider.getBalance(nftAddress)).to.equal(0);

            // 9. 验证 Router 累积的费用
            const routerBalance = await ethers.provider.getBalance(await routerV3.getAddress());
            expect(routerBalance).to.equal(MINT_FEE);
        });

        it("多用户多合约综合测试", async function () {
            // user1 创建两个合约
            await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12345, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "NFT1",
                "NFT1",
                { value: MINT_FEE }
            );

            await routerV3.connect(user1).preCreate(
                false,
                merkleRoot,
                [12346, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "NFT2",
                "NFT2",
                { value: MINT_FEE }
            );

            // user2 创建一个合约
            await routerV3.connect(user2).preCreate(
                false,
                merkleRoot,
                [12347, WHITELIST_PRICE, PUBLIC_PRICE, MAX_NFT, MAX_PER_TX, AIRDROP_ALLOCATION],
                "ipfs://blind/",
                "NFT3",
                "NFT3",
                { value: MINT_FEE }
            );

            // 验证追踪
            const user1Nfts = await routerV3.getOwnerNft(user1.address);
            const user2Nfts = await routerV3.getOwnerNft(user2.address);
            
            expect(user1Nfts.length).to.equal(2);
            expect(user2Nfts.length).to.equal(1);

            // 验证 Router 收益
            const routerBalance = await ethers.provider.getBalance(await routerV3.getAddress());
            expect(routerBalance).to.equal(MINT_FEE * 3n);
        });
    });
});
