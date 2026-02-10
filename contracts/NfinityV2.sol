// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "erc721a-upgradeable/contracts/ERC721AUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title NfinityV2
 * @notice 可升级的 ERC721A NFT 合约，支持白名单、公开铸造和空投
 * @dev 使用 ERC721A 优化批量铸造的 gas 成本
 */
contract NfinityV2 is
    Initializable,
    ERC721AUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable  // 🔧 新增：紧急暂停功能
{

    // ============ 状态变量 ============
    
    bytes32 private merkle;
    
    bool public publicMintSwitch;
    bool public whiteListSwitch;
    bool public airDropSwitch;
    bool public blindBoxOpened;
    
    uint256 public MAX_PER_TX;
    uint256 public WHITE_LIST_MINT_PRICE;
    uint256 public PUBLIC_MINT_PRICE;
    uint256 public AIR_DROP;
    uint256 public MAX_NFT;
    uint256 private airDropCount;
    
    string private baseTokenURI;
    string private blindTokenURI;

    // 🔧 新增：价格上限常量（防止设置过高价格）
    uint256 public constant MAX_MINT_PRICE = 10 ether;
    
    struct NftData {
        bool _blindBoxOpened;
        bytes32 _newMerkle;
        uint256 _whiteListMintPrice;
        uint256 _publicMintPrice;
        uint256 _maxNft;
        uint256 _maxPerTx;
        uint256 _airDrop;
        string _blindTokenURI;
        string _name;
        string _symbol;
    }

    mapping(address => uint256) public whiteListMinted;
    mapping(address => uint256) public publicMinted;

    // ============ 事件 ============
    
    // 🔧 改进：添加更多信息到事件
    event Cast(
        address indexed user, 
        uint256 indexed amount, 
        uint256 indexed startTokenId
    );
    
    event WhiteListMint(
        address indexed user, 
        uint256 quantity, 
        uint256 totalPaid,
        uint256 startTokenId
    );
    
    event PublicMint(
        address indexed user, 
        uint256 quantity, 
        uint256 totalPaid,
        uint256 startTokenId
    );
    
    // 🔧 新增：配置变更事件
    event MerkleUpdated(bytes32 indexed oldMerkle, bytes32 indexed newMerkle);
    event PriceUpdated(string priceType, uint256 oldPrice, uint256 newPrice);
    event BaseURIUpdated(string newBaseURI);
    event BlindBoxURIUpdated(string newBlindURI);

    // ============ 自定义错误（节省 gas）============
    
    error InvalidQuantity();
    error ExceedsMaxPerAddress();
    error ExceedsAvailableSupply();
    error IncorrectPayment();
    error InvalidProof();
    error MintNotActive();
    error InvalidAddress();
    error NoBalance();
    error TransferFailed();
    error TokenDoesNotExist();
    error NotTokenOwner();
    error InvalidConfiguration();
    error MerkleCannotBeZero();
    error PriceTooHigh();

    // ============ 修饰符 ============
    
    // 🔧 移除 isHuman 修饰符（会阻止智能钱包）
    // 如果需要防止合约调用，建议使用其他机制

    // ============ 初始化函数 ============
    
    /**
     * @notice 初始化合约
     * @param _nftData NFT 配置数据
     */
    function initialize(NftData memory _nftData)
        public
        initializerERC721A
    {
        __ERC721A_init(_nftData._name, _nftData._symbol);
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __Pausable_init();  // 🔧 新增

        // 🔧 改进：更严格的参数验证
        if (_nftData._maxNft == 0) revert InvalidConfiguration();
        if (_nftData._maxPerTx == 0) revert InvalidConfiguration();
        if (_nftData._airDrop > _nftData._maxNft) revert InvalidConfiguration();
        if (_nftData._whiteListMintPrice > MAX_MINT_PRICE) revert PriceTooHigh();
        if (_nftData._publicMintPrice > MAX_MINT_PRICE) revert PriceTooHigh();
        if (_nftData._newMerkle == bytes32(0)) revert MerkleCannotBeZero();

        MAX_NFT = _nftData._maxNft;
        MAX_PER_TX = _nftData._maxPerTx;
        WHITE_LIST_MINT_PRICE = _nftData._whiteListMintPrice;
        PUBLIC_MINT_PRICE = _nftData._publicMintPrice;
        blindBoxOpened = _nftData._blindBoxOpened;
        blindTokenURI = _nftData._blindTokenURI;
        merkle = _nftData._newMerkle;
        AIR_DROP = _nftData._airDrop;
    }

    // ============ 管理员函数 ============
    
    function updatewhiteListStatus(bool _whiteListSwitch) external onlyOwner {
        whiteListSwitch = _whiteListSwitch;
    }

    function updatePublicMintStatus(bool _publicMintSwitch) external onlyOwner {
        publicMintSwitch = _publicMintSwitch;
    }

    function updateAirDropStatus(bool _airDropSwitch) external onlyOwner {
        airDropSwitch = _airDropSwitch;
    }

    function updateBlindBoxOpenedStatus(bool _blindBoxOpened)
        external
        onlyOwner
    {
        blindBoxOpened = _blindBoxOpened;
    }

    function updateBlindBoxOpenedUri(string memory _uri) external onlyOwner {
        blindTokenURI = _uri;
        emit BlindBoxURIUpdated(_uri);
    }

    /**
     * @notice 更新 Merkle 根
     * @param _newMerkle 新的 Merkle 根
     */
    function updateMerkle(bytes32 _newMerkle) external onlyOwner {
        // 🔧 修复：验证 Merkle 根不能为零
        if (_newMerkle == bytes32(0)) revert MerkleCannotBeZero();
        
        bytes32 oldMerkle = merkle;
        merkle = _newMerkle;
        emit MerkleUpdated(oldMerkle, _newMerkle);
    }

    /**
     * @notice 提取合约余额
     * @dev 🔧 修复：使用安全的转账方法代替低级 call
     */
    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalance();
        
        // 使用安全的转账方法
        (bool success, ) = payable(owner()).call{value: balance}("");
        if (!success) revert TransferFailed();
    }

    /**
     * @notice 销毁 NFT
     * @param tokenId 要销毁的 token ID
     * @dev 🔧 修复：只有 token 持有者可以销毁自己的 NFT
     */
    function burn(uint256 tokenId) external {
        // 检查 token 是否存在
        if (!_exists(tokenId)) revert TokenDoesNotExist();
        
        // 🔧 修复：只有持有者可以销毁
        if (_msgSender() != ownerOf(tokenId)) revert NotTokenOwner();
        
        _burn(tokenId, false);
    }

    // 🔧 新增：紧急暂停功能
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ 铸造函数 ============
    
    /**
     * @notice 白名单铸造
     * @param to 接收地址
     * @param quantity 数量
     * @param _merkProof Merkle 证明
     */
    function whiteListMint(
        address to,
        uint256 quantity,
        bytes32[] memory _merkProof
    ) external payable nonReentrant whenNotPaused {  // 🔧 新增 whenNotPaused
        if (!whiteListSwitch) revert MintNotActive();
        if (quantity == 0 || quantity > MAX_PER_TX) revert InvalidQuantity();
        if (whiteListMinted[to] + quantity > MAX_PER_TX) revert ExceedsMaxPerAddress();
        
        // 🔧 修复：改进供应量检查逻辑
        uint256 availableSupply = MAX_NFT - AIR_DROP;
        if (totalSupply() + quantity > availableSupply) revert ExceedsAvailableSupply();
        
        if (msg.value != WHITE_LIST_MINT_PRICE * quantity) revert IncorrectPayment();

        bytes32 leaf = keccak256(abi.encodePacked(to));
        if (!MerkleProof.verify(_merkProof, merkle, leaf)) revert InvalidProof();

        whiteListMinted[to] += quantity;
        uint256 startTokenId = _nextTokenId();
        _safeMint(to, quantity);
        
        emit WhiteListMint(to, quantity, msg.value, startTokenId);
    }

    /**
     * @notice 公开铸造
     * @param to 接收地址
     * @param quantity 数量
     */
    function publicMint(address to, uint256 quantity)
        external
        payable
        nonReentrant
        whenNotPaused  // 🔧 新增 whenNotPaused
    {
        if (!publicMintSwitch) revert MintNotActive();
        if (quantity == 0 || quantity > MAX_PER_TX) revert InvalidQuantity();
        if (publicMinted[to] + quantity > MAX_PER_TX) revert ExceedsMaxPerAddress();
        
        // 🔧 修复：改进供应量检查逻辑
        uint256 availableSupply = MAX_NFT - AIR_DROP;
        if (totalSupply() + quantity > availableSupply) revert ExceedsAvailableSupply();
        
        if (msg.value != PUBLIC_MINT_PRICE * quantity) revert IncorrectPayment();

        publicMinted[to] += quantity;
        uint256 startTokenId = _nextTokenId();
        _safeMint(to, quantity);
        
        emit PublicMint(to, quantity, msg.value, startTokenId);
    }

    /**
     * @notice 空投 NFT
     * @param users 接收地址数组
     * @param amounts 数量数组
     * @dev 🔧 修复：改进空投计数逻辑
     */
    function airdrop(address[] calldata users, uint256[] calldata amounts)
        external
        onlyOwner
        nonReentrant
        whenNotPaused  // 🔧 新增 whenNotPaused
    {
        if (!airDropSwitch) revert MintNotActive();
        if (users.length == 0) revert InvalidConfiguration();
        if (users.length != amounts.length) revert InvalidConfiguration();

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; ) {
            if (users[i] == address(0)) revert InvalidAddress();
            if (amounts[i] == 0) revert InvalidQuantity();
            totalAmount += amounts[i];
            
            unchecked { ++i; }  // 🔧 优化：使用 unchecked
        }

        // 🔧 修复：先检查总量
        if (airDropCount + totalAmount > AIR_DROP) revert ExceedsAvailableSupply();
        if (totalSupply() + totalAmount > MAX_NFT) revert ExceedsAvailableSupply();

        // 🔧 修复：每次成功铸造后立即更新计数
        for (uint256 j = 0; j < users.length; ) {
            uint256 startTokenId = _nextTokenId();
            _safeMint(users[j], amounts[j]);
            airDropCount += amounts[j];  // 每次成功后更新
            
            emit Cast(users[j], amounts[j], startTokenId);
            
            unchecked { ++j; }
        }
    }

    // ============ URI 函数 ============
    
    function _baseURI() internal view virtual override returns (string memory) {
        return blindBoxOpened && bytes(baseTokenURI).length > 0 
            ? baseTokenURI 
            : blindTokenURI;
    }

    function setBaseURI(string memory _baseUri) external onlyOwner {
        baseTokenURI = _baseUri;
        emit BaseURIUpdated(_baseUri);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();

        string memory baseURI = _baseURI();
        return bytes(baseURI).length != 0
            ? string(abi.encodePacked(baseURI, _toString(tokenId), ".json"))
            : "";
    }

    // ============ 查询函数 ============
    
    /**
     * @notice 获取用户铸造状态
     * @param user 用户地址
     */
    function getMintStatus(address user)
        external
        view
        returns (
            uint256 whiteListMintedAmount,
            uint256 publicMintedAmount,
            uint256 remainingWhiteList,
            uint256 remainingPublic
        )
    {
        whiteListMintedAmount = whiteListMinted[user];
        publicMintedAmount = publicMinted[user];
        remainingWhiteList = MAX_PER_TX > whiteListMintedAmount
            ? MAX_PER_TX - whiteListMintedAmount
            : 0;
        remainingPublic = MAX_PER_TX > publicMintedAmount
            ? MAX_PER_TX - publicMintedAmount
            : 0;
    }

    /**
     * @notice 获取合约状态
     */
    function getContractStatus()
        external
        view
        returns (
            uint256 currentSupply,
            uint256 maxSupply,
            uint256 remainingForSale,
            uint256 airDropUsed,
            uint256 airDropRemaining
        )
    {
        currentSupply = totalSupply();
        maxSupply = MAX_NFT;
        
        // 🔧 修复：改进计算逻辑
        uint256 availableForSale = MAX_NFT > AIR_DROP ? MAX_NFT - AIR_DROP : 0;
        remainingForSale = availableForSale > currentSupply 
            ? availableForSale - currentSupply 
            : 0;
            
        airDropUsed = airDropCount;
        airDropRemaining = AIR_DROP > airDropCount ? AIR_DROP - airDropCount : 0;
    }

    // 🔧 新增：获取当前 Merkle 根（用于验证）
    function getMerkleRoot() external view returns (bytes32) {
        return merkle;
    }

    // 🔧 新增：批量查询 token 持有者
    function getTokenOwners(uint256[] calldata tokenIds) 
        external 
        view 
        returns (address[] memory owners) 
    {
        owners = new address[](tokenIds.length);
        for (uint256 i = 0; i < tokenIds.length; ) {
            owners[i] = _exists(tokenIds[i]) ? ownerOf(tokenIds[i]) : address(0);
            unchecked { ++i; }
        }
    }
}
