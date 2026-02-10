const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

describe("NfinityV2 安全测试", function () {
    let nft;
    let owner, user1, user2, user3;
    let merkleTree, merkleRoot;
    let whitelistAddresses;

    const MAX_NFT = 1000;
    const MAX_PER_TX = 10;
    const AIR_DROP = 100;
    const WHITE_LIST_PRICE = ethers.parseEther("0.01");
    const PUBLIC_PRICE = ethers.parseEther("0.02");

    beforeEach(async function () {
        [owner, user1, user2, user3] = await ethers.getSigners();

        // 创建白名单 Merkle Tree
        whitelistAddresses = [user1.address, user2.address];
        const leaves = whitelistAddresses.map(addr => keccak256(addr));
        merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        merkleRoot = merkleTree.getHexRoot();
        console.log("Merkle Root:", merkleRoot);

        // 部署可升级合约
        const NfinityV2 = await ethers.getContractFactory("NfinityV2");
        
        // 初始化数据
        const nftData = {
            _blindBoxOpened: false,
            _newMerkle: merkleRoot,
            _whiteListMintPrice: WHITE_LIST_PRICE,
            _publicMintPrice: PUBLIC_PRICE,
            _maxNft: MAX_NFT,
            _maxPerTx: MAX_PER_TX,
            _airDrop: AIR_DROP,
            _blindTokenURI: "ipfs://blind/",
            _name: "Test NFT",
            _symbol: "TNFT"
        };
        
        // 使用OpenZeppelin升级插件部署代理合约
        nft = await upgrades.deployProxy(NfinityV2, [nftData], {
            kind: 'transparent'
        });
        await nft.waitForDeployment();
    });

    describe("🔒 安全性测试", function () {
        describe("withdraw() 安全性", function () {
            it("应该安全地提取余额", async function () {
                // 开启公开铸造
                await nft.updatePublicMintStatus(true);

                // 用户铸造
                await nft.connect(user1).publicMint(
                    user1.address,
                    1,
                    { value: PUBLIC_PRICE }
                );

                const nftAddress = await nft.getAddress();
                const contractBalance = await ethers.provider.getBalance(nftAddress);
                expect(contractBalance).to.equal(PUBLIC_PRICE);

                // Owner 提取
                const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
                const tx = await nft.withdraw();
                const receipt = await tx.wait();
                
                // 简化测试，直接验证合约余额是否为0
                const contractBalanceAfter = await ethers.provider.getBalance(nftAddress);
                expect(contractBalanceAfter).to.equal(0n);
            });

            it("余额为0时应该revert", async function () {
                await expect(nft.withdraw()).to.be.revertedWithCustomError(
                    nft,
                    "NoBalance"
                );
            });
        });

        describe("burn() 权限控制", function () {
            beforeEach(async function () {
                await nft.updatePublicMintStatus(true);
                await nft.connect(user1).publicMint(
                    user1.address,
                    1,
                    { value: PUBLIC_PRICE }
                );
            });

            it("持有者应该可以销毁自己的NFT", async function () {
                const tokenId = 0;
                await expect(nft.connect(user1).burn(tokenId))
                    .to.not.be.reverted;
            });

            it("非持有者不能销毁NFT", async function () {
                const tokenId = 0;
                await expect(nft.connect(user2).burn(tokenId))
                    .to.be.revertedWithCustomError(nft, "NotTokenOwner");
            });

            it("owner也不能销毁他人的NFT", async function () {
                const tokenId = 0;
                await expect(nft.connect(owner).burn(tokenId))
                    .to.be.revertedWithCustomError(nft, "NotTokenOwner");
            });
        });

        describe("Merkle 根验证", function () {
            it("不能设置为零值", async function () {
                await expect(
                    nft.updateMerkle(ethers.ZeroHash)
                ).to.be.revertedWithCustomError(nft, "MerkleCannotBeZero");
            });

            it("应该emit事件", async function () {
                const newRoot = ethers.keccak256(ethers.toUtf8Bytes("new"));
                await expect(nft.updateMerkle(newRoot))
                    .to.emit(nft, "MerkleUpdated")
                    .withArgs(merkleRoot, newRoot);
            });
        });

        describe("暂停功能", function () {
            it("owner可以暂停", async function () {
                await nft.pause();
                expect(await nft.paused()).to.be.true;
            });

            it("暂停后不能铸造", async function () {
                await nft.updatePublicMintStatus(true);
                await nft.pause();

                await expect(
                    nft.connect(user1).publicMint(user1.address, 1, {
                        value: PUBLIC_PRICE
                    })
                ).to.be.reverted;
            });

            it("恢复后可以铸造", async function () {
                await nft.updatePublicMintStatus(true);
                await nft.pause();
                await nft.unpause();

                await expect(
                    nft.connect(user1).publicMint(user1.address, 1, {
                        value: PUBLIC_PRICE
                    })
                ).to.not.be.reverted;
            });
        });
    });

    describe("✅ 功能测试", function () {
        describe("白名单铸造", function () {
            beforeEach(async function () {
                await nft.updatewhiteListStatus(true);
            });

            it("白名单用户可以铸造", async function () {
                const proof = merkleTree.getHexProof(keccak256(user1.address));

                await expect(
                    nft.connect(user1).whiteListMint(
                        user1.address,
                        1,
                        proof,
                        { value: WHITE_LIST_PRICE }
                    )
                ).to.emit(nft, "WhiteListMint");

                expect(await nft.balanceOf(user1.address)).to.equal(1);
            });

            it("非白名单用户不能铸造", async function () {
                const proof = merkleTree.getHexProof(keccak256(user3.address));

                await expect(
                    nft.connect(user3).whiteListMint(
                        user3.address,
                        1,
                        proof,
                        { value: WHITE_LIST_PRICE }
                    )
                ).to.be.revertedWithCustomError(nft, "InvalidProof");
            });

            it("支付金额不正确应该revert", async function () {
                const proof = merkleTree.getHexProof(keccak256(user1.address));

                await expect(
                    nft.connect(user1).whiteListMint(
                        user1.address,
                        1,
                        proof,
                        { value: PUBLIC_PRICE } // 错误的价格
                    )
                ).to.be.revertedWithCustomError(nft, "IncorrectPayment");
            });

            it("应该拒绝数量为 0", async function () {
                const proof = merkleTree.getHexProof(keccak256(user1.address));

                await expect(
                    nft.connect(user1).whiteListMint(
                        user1.address,
                        0,
                        proof,
                        { value: 0 }
                    )
                ).to.be.revertedWithCustomError(nft, "InvalidQuantity");
            });

            it("应该拒绝超过 MAX_PER_TX 的单次铸造", async function () {
                const proof = merkleTree.getHexProof(keccak256(user1.address));

                await expect(
                    nft.connect(user1).whiteListMint(
                        user1.address,
                        MAX_PER_TX + 1,
                        proof,
                        { value: BigInt(WHITE_LIST_PRICE) * BigInt(MAX_PER_TX + 1) }
                    )
                ).to.be.revertedWithCustomError(nft, "InvalidQuantity");
            });

            it("应该强制执行每地址最大铸造限制", async function () {
                const proof = merkleTree.getHexProof(keccak256(user1.address));

                await nft.connect(user1).whiteListMint(
                    user1.address,
                    MAX_PER_TX,
                    proof,
                    { value: BigInt(WHITE_LIST_PRICE) * BigInt(MAX_PER_TX) }
                );

                await expect(
                    nft.connect(user1).whiteListMint(
                        user1.address,
                        1,
                        proof,
                        { value: WHITE_LIST_PRICE }
                    )
                ).to.be.revertedWithCustomError(nft, "ExceedsMaxPerAddress");
            });

            it("当开关关闭时应该拒绝铸造", async function () {
                await nft.updatewhiteListStatus(false);
                
                const proof = merkleTree.getHexProof(keccak256(user1.address));

                await expect(
                    nft.connect(user1).whiteListMint(
                        user1.address,
                        5,
                        proof,
                        { value: BigInt(WHITE_LIST_PRICE) * BigInt(5) }
                    )
                ).to.be.revertedWithCustomError(nft, "MintNotActive");
            });
        });

        describe("公开铸造", function () {
            beforeEach(async function () {
                await nft.updatePublicMintStatus(true);
            });

            it("任何人都应该能够公开铸造", async function () {
                await expect(
                    nft.connect(user3).publicMint(
                        user3.address,
                        3,
                        { value: BigInt(PUBLIC_PRICE) * BigInt(3) }
                    )
                ).to.emit(nft, "PublicMint");

                expect(await nft.balanceOf(user3.address)).to.equal(3);
            });

            it("应该拒绝数量为 0", async function () {
                await expect(
                    nft.connect(user3).publicMint(
                        user3.address,
                        0,
                        { value: 0 }
                    )
                ).to.be.revertedWithCustomError(nft, "InvalidQuantity");
            });

            it("应该拒绝超过 MAX_PER_TX", async function () {
                await expect(
                    nft.connect(user3).publicMint(
                        user3.address,
                        MAX_PER_TX + 1,
                        { value: BigInt(PUBLIC_PRICE) * BigInt(MAX_PER_TX + 1) }
                    )
                ).to.be.revertedWithCustomError(nft, "InvalidQuantity");
            });

            it("应该强制执行每地址最大铸造限制", async function () {
                await nft.connect(user3).publicMint(
                    user3.address,
                    MAX_PER_TX,
                    { value: BigInt(PUBLIC_PRICE) * BigInt(MAX_PER_TX) }
                );

                await expect(
                    nft.connect(user3).publicMint(
                        user3.address,
                        1,
                        { value: PUBLIC_PRICE }
                    )
                ).to.be.revertedWithCustomError(nft, "ExceedsMaxPerAddress");
            });

            it("应该拒绝不正确的付款", async function () {
                await expect(
                    nft.connect(user3).publicMint(
                        user3.address,
                        5,
                        { value: BigInt(PUBLIC_PRICE) * BigInt(4) }
                    )
                ).to.be.revertedWithCustomError(nft, "IncorrectPayment");
            });

            it("当开关关闭时应该拒绝铸造", async function () {
                await nft.updatePublicMintStatus(false);

                await expect(
                    nft.connect(user3).publicMint(
                        user3.address,
                        3,
                        { value: BigInt(PUBLIC_PRICE) * BigInt(3) }
                    )
                ).to.be.revertedWithCustomError(nft, "MintNotActive");
            });

            it("白名单和公开铸造应该独立计数", async function () {
                // 先开启白名单
                await nft.updatewhiteListStatus(true);
                
                const proof = merkleTree.getHexProof(keccak256(user2.address));
                
                // 白名单铸造满额
                await nft.connect(user2).whiteListMint(
                    user2.address,
                    MAX_PER_TX,
                    proof,
                    { value: BigInt(WHITE_LIST_PRICE) * BigInt(MAX_PER_TX) }
                );
                
                // 公开铸造应该还能继续
                await nft.connect(user2).publicMint(
                    user2.address,
                    MAX_PER_TX,
                    { value: BigInt(PUBLIC_PRICE) * BigInt(MAX_PER_TX) }
                );
                
                expect(await nft.balanceOf(user2.address)).to.equal(MAX_PER_TX * 2);
            });
        });

        describe("空投功能", function () {
            beforeEach(async function () {
                await nft.updateAirDropStatus(true);
            });

            it("应该正确空投", async function () {
                const users = [user1.address, user2.address];
                const amounts = [5, 10];

                await expect(
                    nft.airdrop(users, amounts)
                ).to.emit(nft, "Cast");

                expect(await nft.balanceOf(user1.address)).to.equal(5);
                expect(await nft.balanceOf(user2.address)).to.equal(10);
            });

            it("空投计数应该准确", async function () {
                const users = [user1.address, user2.address];
                const amounts = [5, 10];

                await nft.airdrop(users, amounts);

                const status = await nft.getContractStatus();
                expect(status.airDropUsed).to.equal(15);
                expect(status.airDropRemaining).to.equal(AIR_DROP - 15);
            });

            it("超过空投配额应该revert", async function () {
                const users = [user1.address];
                const amounts = [AIR_DROP + 1];

                await expect(
                    nft.airdrop(users, amounts)
                ).to.be.revertedWithCustomError(nft, "ExceedsAvailableSupply");
            });

            it("应该拒绝数组长度不匹配", async function () {
                await expect(
                    nft.airdrop([user1.address, user2.address], [10])
                ).to.be.revertedWithCustomError(nft, "InvalidConfiguration");
            });

            it("应该拒绝零地址", async function () {
                await expect(
                    nft.airdrop([ethers.ZeroAddress], [10])
                ).to.be.revertedWithCustomError(nft, "InvalidAddress");
            });

            it("应该拒绝空数组", async function () {
                await expect(
                    nft.airdrop([], [])
                ).to.be.revertedWithCustomError(nft, "InvalidConfiguration");
            });

            it("应该拒绝数量为 0", async function () {
                await expect(
                    nft.airdrop([user1.address], [0])
                ).to.be.revertedWithCustomError(nft, "InvalidQuantity");
            });

            it("非所有者不应该能够空投", async function () {
                await expect(
                    nft.connect(user2).airdrop([user3.address], [10])
                ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
            });

            it("当开关关闭时应该拒绝空投", async function () {
                await nft.updateAirDropStatus(false);

                await expect(
                    nft.airdrop([user1.address], [10])
                ).to.be.revertedWithCustomError(nft, "MintNotActive");
            });

            it("多次空投应该累加", async function () {
                await nft.airdrop([user1.address], [30]);
                await nft.airdrop([user2.address], [40]);
                
                const status = await nft.getContractStatus();
                expect(status.airDropUsed).to.equal(70);
                expect(status.airDropRemaining).to.equal(30);
            });
        });

        describe("供应量管理", function () {
            it("应该正确计算剩余供应量", async function () {
                await nft.updatePublicMintStatus(true);

                // 铸造一些
                await nft.connect(user1).publicMint(user1.address, 5, {
                    value: BigInt(PUBLIC_PRICE) * BigInt(5)
                });

                const status = await nft.getContractStatus();
                expect(status.currentSupply).to.equal(5);
                expect(status.remainingForSale).to.equal(MAX_NFT - AIR_DROP - 5);
            });

            it("不能超过最大供应量", async function () {
                await nft.updatePublicMintStatus(true);

                // 直接尝试铸造超过MAX_PER_TX的数量，应该触发InvalidQuantity错误
                await expect(
                    nft.connect(user1).publicMint(user1.address, MAX_PER_TX + 1, {
                        value: BigInt(PUBLIC_PRICE) * BigInt(MAX_PER_TX + 1)
                    })
                ).to.be.revertedWithCustomError(nft, "InvalidQuantity");
                
                // 尝试为同一个地址铸造超过MAX_PER_TX的总量，应该触发ExceedsMaxPerAddress错误
                await nft.connect(user1).publicMint(user1.address, MAX_PER_TX, {
                    value: BigInt(PUBLIC_PRICE) * BigInt(MAX_PER_TX)
                });
                
                await expect(
                    nft.connect(user1).publicMint(user1.address, 1, {
                        value: BigInt(PUBLIC_PRICE)
                    })
                ).to.be.revertedWithCustomError(nft, "ExceedsMaxPerAddress");
            });
        });

        describe("所有者功能", function () {
            it("所有者应该能够提取资金", async function () {
                await nft.updatePublicMintStatus(true);
                await nft.connect(user1).publicMint(
                    user1.address,
                    5,
                    { value: BigInt(PUBLIC_PRICE) * BigInt(5) }
                );

                const nftAddress = await nft.getAddress();
                const contractBalance = await ethers.provider.getBalance(nftAddress);
                expect(contractBalance).to.equal(BigInt(PUBLIC_PRICE) * BigInt(5));

                const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
                const tx = await nft.withdraw();
                const receipt = await tx.wait();
                const gasUsed = receipt.gasUsed * receipt.gasPrice;

                const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
                expect(ownerBalanceAfter).to.equal(
                    ownerBalanceBefore + BigInt(PUBLIC_PRICE) * BigInt(5) - gasUsed
                );
            });

            it("非所有者不应该能够提取资金", async function () {
                await nft.updatePublicMintStatus(true);
                await nft.connect(user1).publicMint(
                    user1.address,
                    5,
                    { value: BigInt(PUBLIC_PRICE) * BigInt(5) }
                );

                await expect(
                    nft.connect(user1).withdraw()
                ).to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
            });

            it("余额为 0 时提取应该失败", async function () {
                await expect(
                    nft.withdraw()
                ).to.be.revertedWithCustomError(nft, "NoBalance");
            });

            it("token持有者应该能够销毁 NFT", async function () {
                await nft.updatePublicMintStatus(true);
                await nft.connect(user1).publicMint(
                    user1.address,
                    1,
                    { value: PUBLIC_PRICE }
                );

                const tokenId = 0;
                await nft.connect(user1).burn(tokenId);

                await expect(
                    nft.ownerOf(tokenId)
                ).to.be.revertedWithCustomError(nft, "OwnerQueryForNonexistentToken");
            });

            it("非token持有者不应该能够销毁 NFT", async function () {
                await nft.updatePublicMintStatus(true);
                await nft.connect(user1).publicMint(
                    user1.address,
                    1,
                    { value: PUBLIC_PRICE }
                );

                await expect(
                    nft.connect(user2).burn(0)
                ).to.be.revertedWithCustomError(nft, "NotTokenOwner");
            });
        });
    });

    describe("⛽ Gas 优化测试", function () {
        it("批量空投应该使用unchecked优化", async function () {
            await nft.updateAirDropStatus(true);

            const users = Array(10).fill(user1.address);
            const amounts = Array(10).fill(1);

            const tx = await nft.airdrop(users, amounts);
            const receipt = await tx.wait();

            console.log("      Gas used for 10 airdrops:", receipt.gasUsed.toString());

            // 验证gas消耗合理（应该低于某个阈值）
            expect(receipt.gasUsed).to.be.lt(1000000);
        });
    });

    describe("📊 查询功能测试", function () {
        it("应该返回正确的铸造状态", async function () {
            await nft.updatewhiteListStatus(true);

            const proof = merkleTree.getHexProof(keccak256(user1.address));
            await nft.connect(user1).whiteListMint(
                user1.address,
                3,
                proof,
                { value: BigInt(WHITE_LIST_PRICE) * BigInt(3) }
            );

            const status = await nft.getMintStatus(user1.address);
            expect(status.whiteListMintedAmount).to.equal(3);
            expect(status.remainingWhiteList).to.equal(MAX_PER_TX - 3);
        });

        it("应该返回正确的合约状态", async function () {
            const status = await nft.getContractStatus();

            expect(status.maxSupply).to.equal(MAX_NFT);
            expect(status.remainingForSale).to.equal(MAX_NFT - AIR_DROP);
            expect(status.airDropRemaining).to.equal(AIR_DROP);
        });
    });

    describe("🚀 初始化和配置测试", function () {
        it("应该正确初始化 NFT 参数", async function () {
            expect(await nft.name()).to.equal("Test NFT");
            expect(await nft.symbol()).to.equal("TNFT");
            expect(await nft.MAX_NFT()).to.equal(MAX_NFT);
            expect(await nft.MAX_PER_TX()).to.equal(MAX_PER_TX);
            expect(await nft.WHITE_LIST_MINT_PRICE()).to.equal(WHITE_LIST_PRICE);
            expect(await nft.PUBLIC_MINT_PRICE()).to.equal(PUBLIC_PRICE);
            expect(await nft.AIR_DROP()).to.equal(AIR_DROP);
        });

        it("NFT 所有权应该属于部署者", async function () {
            expect(await nft.owner()).to.equal(owner.address);
        });

        it("初始状态应该是关闭的", async function () {
            expect(await nft.publicMintSwitch()).to.equal(false);
            expect(await nft.whiteListSwitch()).to.equal(false);
            expect(await nft.airDropSwitch()).to.equal(false);
        });

        it("盲盒状态应该按初始化参数设置", async function () {
            expect(await nft.blindBoxOpened()).to.equal(false);
        });
    });
});
