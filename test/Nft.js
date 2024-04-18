const {
    time,
    loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");


describe("RouterV3 FactotyV3", function () {

    async function deployNftInitContract() {

        const FEE = 1_000_000_000_000_000;
        let ISSTART = true;

        //获取hardhat内置的账户
        const [owner, alice, bob, jack] = await ethers.getSigners();

        const FactoryV3 = await ethers.getContractFactory("FactoryV3");
        const RouterV3 = await ethers.getContractFactory("RouterV3");

        const factoryV3 = await FactoryV3.deploy();
        const routerV3 = await RouterV3.deploy(factoryV3.target);

        await factoryV3.onlyInitialize(routerV3.target);
        await routerV3.setFun(ISSTART);
        await routerV3.setFee(FEE);

        return { factoryV3, routerV3, owner, alice, bob, jack, FEE, ISSTART };
    }

    describe("Deployment", function () {

        it("It can only be called by the administrator, otherwise an error will be returned", async function () {
            const { routerV3, FEE, ISSTART } = await loadFixture(
                deployNftInitContract
            );

            expect(await routerV3.isFun()).to.equal(
                ISSTART
            );

            expect(await routerV3.fee()).to.equal(
                FEE
            );

        });

    });

    describe("RouterV3 SetManager", function () {
        describe("Validations", function () {

            it("It can only be called by the manager, otherwise an error will be returned", async function () {
                const { routerV3, alice, bob, jack } = await loadFixture(
                    deployNftInitContract
                );

                const AliceTx = await routerV3.setManager(alice.address);
                await AliceTx.wait();

                await expect(routerV3.connect(bob).setManager(jack.address)).to.be.revertedWith(
                    "Only Manager"
                );


            });

        })

        describe("RouterV3 Events", function () {
            it("Should emit an event on setManger", async function () {
                const { routerV3, owner, alice, bob } = await loadFixture(
                    deployNftInitContract
                );

                await expect(routerV3.setManager(alice.address))
                    .to.emit(routerV3, "ChangeManger")
                    .withArgs(alice.address, owner);

                await expect(routerV3.connect(alice).setManager(bob.address))
                    .to.emit(routerV3, "ChangeManger")
                    .withArgs(bob.address, alice.address);

            });
        });

    });

    describe("RouterV3 SetFee", function () {
        describe("Validations", function () {

            it("It can only be called by the manager, otherwise an error will be returned", async function () {
                const { routerV3, alice, bob, jack, FEE } = await loadFixture(
                    deployNftInitContract
                );

                const AliceTx = await routerV3.setFee(FEE);
                await AliceTx.wait();

                expect(await routerV3.fee()).to.equal(FEE);

                await expect(routerV3.connect(bob).setFee(FEE)).to.be.revertedWith(
                    "Only Manager"
                );


            });

        })

        describe("RouterV3 Events", function () {
            it("Should emit an event on setFee", async function () {
                const { routerV3, alice, FEE } = await loadFixture(
                    deployNftInitContract
                );

                await expect(routerV3.setFee(FEE))
                    .to.emit(routerV3, "ChangeFee")
                    .withArgs(FEE, routerV3.fee());

                const AliceTx = await routerV3.setManager(alice.address);
                AliceTx.wait();

                await expect(routerV3.connect(alice).setFee(1_000_000_000))
                    .to.emit(routerV3, "ChangeFee")
                    .withArgs(1_000_000_000, routerV3.fee());

            });
        });

    });

    describe("RouterV3 SetFun", function () {
        describe("Validations", function () {

            it("It can only be called by the manager, otherwise an error will be returned", async function () {
                const { routerV3, alice, bob, jack } = await loadFixture(
                    deployNftInitContract
                );

                const AliceTx = await routerV3.setFun(true);
                await AliceTx.wait();

                expect(await routerV3.isFun()).to.equal(true);

                await expect(routerV3.connect(bob).setFun(false)).to.be.revertedWith(
                    "Only Manager"
                );


            });

        })

        describe("RouterV3 Events", function () {
            it("Should emit an event on setFun", async function () {
                const { routerV3, alice, ISSTART } = await loadFixture(
                    deployNftInitContract
                );

                await expect(routerV3.setFun(ISSTART))
                    .to.emit(routerV3, "ChangeFun")
                    .withArgs(ISSTART, routerV3.isFun());

                const AliceTx = await routerV3.setManager(alice.address);
                AliceTx.wait();

                await expect(routerV3.connect(alice).setFun(false))
                    .to.emit(routerV3, "ChangeFun")
                    .withArgs(false, routerV3.isFun());

            });
        });

    });

    describe("RouterV3 Withdraw", function () {

        it("It can only be called by the administrator, otherwise an error will be returned.", async function () {
            const { routerV3, alice } = await loadFixture(
                deployNftInitContract
            );


            const tx = await routerV3.withdraw();
            tx.wait();

            await expect(routerV3.connect(alice).withdraw()).to.be.revertedWith(
                "Only Manager"
            );

        });

    });

    describe("RouterV3 PreCreate", function () {
        it("Should fail if the switch is not true", async function () {
            const { routerV3, FEE } = await loadFixture(
                deployNftInitContract
            );

            const tx = await routerV3.setFun(false);
            tx.wait();
            await expect(routerV3.preCreate(false, "0xeeefd63003e0e702cb41cd0043015a6e26ddb38073cc6ffeb0ba3e808ba8c097", [1314520, 0, FEE, 10000, 10, 200], " ", "Age of Dino - Dinosty", "DINOSTY", { value: ethers.parseEther("0.001") })).to.be.revertedWith(
                "Not yet open"
            );
        });

        it("Create nft", async function () {
            const { routerV3, factoryV3, alice, bob, jack, FEE } = await loadFixture(
                deployNftInitContract
            );

            let nftV1 = await routerV3.connect(alice).preCreate(false, "0xeeefd63003e0e702cb41cd0043015a6e26ddb38073cc6ffeb0ba3e808ba8c097", [1314520, 0, FEE, 10000, 10, 200], " ", "Age of Dino - Dinosty", "DINOSTY", { value: ethers.parseEther("0.001") });
            let nftV2 = await routerV3.connect(bob).preCreate(false, "0xeeefd63003e0e702cb41cd0043015a6e26ddb38073cc6ffeb0ba3e808ba8c097", [666666, 0, FEE, 666666, 666, 66], " ", "Azuki", "Azuki", { value: ethers.parseEther("0.03") });
            let nftV3 = await routerV3.connect(jack).preCreate(true, "0xeeefd63003e0e702cb41cd0043015a6e26ddb38073cc6ffeb0ba3e808ba8c097", [88888888, 0, FEE, 88888888, 8888, 888], "https://www.baidu.com ", "CHuBBiT Official Collection", "CBT", { value: ethers.parseEther("0.004") });
            await nftV1.wait();
            await nftV2.wait();
            await nftV3.wait();

            const block = await ethers.provider.getBlockNumber();
            // console.log(`当前区块高度: ${block}`);
            const createNftEvents = await factoryV3.queryFilter('NftCreated', block - 10, block);
            // 解析NftCreated事件的数据(变量在args中)
            const nftAddress = createNftEvents[0].args["_proxy"];
            const nftAddressV2 = createNftEvents[1].args["_proxy"];
            const nftAddressV3 = createNftEvents[2].args["_proxy"];

            expect((await routerV3.getOwnerNft(alice))[0]).to.equal(nftAddress);
            expect((await routerV3.getOwnerNft(bob))[0]).to.equal(nftAddressV2);
            expect((await routerV3.getOwnerNft(jack))[0]).to.equal(nftAddressV3);


        })

    });
});


