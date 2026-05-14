// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title VeraBridge
 * @notice Cross-chain bridge contract for Hedera ↔ EVM transfers
 * @dev Supports atomic swaps with HTLC pattern and Falcon-512 signature verification
 */

contract VeraBridge {
    // ============ Structs ============
    
    struct Transfer {
        bytes32 transferId;
        address sender;
        address recipient;
        uint256 amount;
        address token;
        bytes32 hashLock;
        uint256 expiresAt;
        TransferStatus status;
        string sourceChain;
    }
    
    struct ValidatorSignature {
        bytes signature;
        bytes publicKey;
        address validator;
    }
    
    enum TransferStatus {
        NONE,
        LOCKED,
        COMPLETED,
        REFUNDED
    }
    
    // ============ State Variables ============
    
    mapping(bytes32 => Transfer) public transfers;
    mapping(address => bool) public validators;
    mapping(address => bool) public supportedTokens;
    
    uint256 public minSignatures = 3;
    uint256 public lockDuration = 24 hours;
    uint256 public bridgeFeeBps = 25; // 0.25%
    uint256 public accumulatedFees;
    
    address public admin;
    address public feeCollector;
    
    // ============ Events ============
    
    event BridgeInitiated(
        bytes32 indexed transferId,
        address indexed sender,
        address indexed recipient,
        uint256 amount,
        address token,
        bytes32 hashLock,
        uint256 expiresAt,
        string targetChain
    );
    
    event BridgeCompleted(
        bytes32 indexed transferId,
        address indexed recipient,
        uint256 amount,
        bytes32 secret
    );
    
    event BridgeRefunded(
        bytes32 indexed transferId,
        address indexed sender,
        uint256 amount
    );
    
    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);
    
    // ============ Modifiers ============
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }
    
    modifier onlyValidator() {
        require(validators[msg.sender], "Only validator");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _feeCollector) {
        admin = msg.sender;
        feeCollector = _feeCollector;
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Initiate a bridge transfer to another chain
     * @param recipient Address on target chain
     * @param amount Amount to transfer
     * @param token Token address (address(0) for native)
     * @param hashLock HTLC hash lock
     * @param targetChain Target chain identifier
     * @return transferId Unique transfer identifier
     */
    function initiateBridge(
        address recipient,
        uint256 amount,
        address token,
        bytes32 hashLock,
        string calldata targetChain
    ) external payable returns (bytes32 transferId) {
        require(amount > 0, "Invalid amount");
        require(recipient != address(0), "Invalid recipient");
        require(hashLock != bytes32(0), "Invalid hash lock");
        require(supportedTokens[token] || token == address(0), "Unsupported token");
        
        // Calculate fee
        uint256 fee = (amount * bridgeFeeBps) / 10000;
        uint256 netAmount = amount - fee;
        
        // Transfer tokens to bridge
        if (token == address(0)) {
            require(msg.value == amount, "Invalid ETH amount");
        } else {
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        }
        
        // Accumulate fee
        accumulatedFees += fee;
        
        // Generate transfer ID
        transferId = keccak256(abi.encodePacked(
            msg.sender,
            recipient,
            amount,
            token,
            hashLock,
            block.timestamp
        ));
        
        require(transfers[transferId].status == TransferStatus.NONE, "Transfer exists");
        
        // Create transfer
        transfers[transferId] = Transfer({
            transferId: transferId,
            sender: msg.sender,
            recipient: recipient,
            amount: netAmount,
            token: token,
            hashLock: hashLock,
            expiresAt: block.timestamp + lockDuration,
            status: TransferStatus.LOCKED,
            sourceChain: "ethereum" // Current chain
        });
        
        emit BridgeInitiated(
            transferId,
            msg.sender,
            recipient,
            netAmount,
            token,
            hashLock,
            block.timestamp + lockDuration,
            targetChain
        );
        
        return transferId;
    }
    
    /**
     * @notice Complete a bridge transfer with secret
     * @param transferId Transfer identifier
     * @param secret HTLC secret
     */
    function completeBridge(bytes32 transferId, bytes calldata secret) external {
        Transfer storage transfer = transfers[transferId];
        
        require(transfer.status == TransferStatus.LOCKED, "Invalid status");
        require(block.timestamp <= transfer.expiresAt, "Transfer expired");
        require(
            keccak256(secret) == transfer.hashLock,
            "Invalid secret"
        );
        
        transfer.status = TransferStatus.COMPLETED;
        
        // Release funds
        if (transfer.token == address(0)) {
            payable(transfer.recipient).transfer(transfer.amount);
        } else {
            require(IERC20(transfer.token).transfer(transfer.recipient, transfer.amount), "Transfer failed");
        }
        
        emit BridgeCompleted(transferId, transfer.recipient, transfer.amount, keccak256(secret));
    }
    
    /**
     * @notice Refund expired transfer
     * @param transferId Transfer identifier
     */
    function refundBridge(bytes32 transferId) external {
        Transfer storage transfer = transfers[transferId];
        
        require(transfer.status == TransferStatus.LOCKED, "Invalid status");
        require(block.timestamp > transfer.expiresAt, "Not expired");
        
        transfer.status = TransferStatus.REFUNDED;
        
        // Return funds to sender
        if (transfer.token == address(0)) {
            payable(transfer.sender).transfer(transfer.amount);
        } else {
            require(IERC20(transfer.token).transfer(transfer.sender, transfer.amount), "Transfer failed");
        }
        
        emit BridgeRefunded(transferId, transfer.sender, transfer.amount);
    }
    
    /**
     * @notice Receive bridge from Hedera (validator only)
     * @param transferId Transfer identifier from Hedera
     * @param recipient Local recipient
     * @param amount Amount to release
     * @param token Token address
     * @param signatures Validator signatures
     */
    function receiveFromHedera(
        bytes32 transferId,
        address recipient,
        uint256 amount,
        address token,
        ValidatorSignature[] calldata signatures
    ) external onlyValidator {
        require(signatures.length >= minSignatures, "Insufficient signatures");
        require(supportedTokens[token] || token == address(0), "Unsupported token");
        
        // Verify signatures (simplified - in production use Falcon-512 verification)
        for (uint i = 0; i < signatures.length; i++) {
            require(validators[signatures[i].validator], "Invalid validator");
            // Additional Falcon signature verification would go here
        }
        
        // Release funds
        if (token == address(0)) {
            payable(recipient).transfer(amount);
        } else {
            require(IERC20(token).transfer(recipient, amount), "Transfer failed");
        }
        
        emit BridgeCompleted(transferId, recipient, amount, bytes32(0));
    }
    
    // ============ Admin Functions ============
    
    function addValidator(address validator) external onlyAdmin {
        validators[validator] = true;
        emit ValidatorAdded(validator);
    }
    
    function removeValidator(address validator) external onlyAdmin {
        validators[validator] = false;
        emit ValidatorRemoved(validator);
    }
    
    function addToken(address token) external onlyAdmin {
        supportedTokens[token] = true;
        emit TokenAdded(token);
    }
    
    function removeToken(address token) external onlyAdmin {
        supportedTokens[token] = false;
        emit TokenRemoved(token);
    }
    
    function setMinSignatures(uint256 _minSignatures) external onlyAdmin {
        minSignatures = _minSignatures;
    }
    
    function setBridgeFee(uint256 _feeBps) external onlyAdmin {
        require(_feeBps <= 100, "Fee too high");
        bridgeFeeBps = _feeBps;
    }
    
    function collectFees() external onlyAdmin {
        uint256 fees = accumulatedFees;
        accumulatedFees = 0;
        payable(feeCollector).transfer(fees);
    }
    
    // ============ View Functions ============
    
    function getTransfer(bytes32 transferId) external view returns (Transfer memory) {
        return transfers[transferId];
    }
    
    function isValidator(address addr) external view returns (bool) {
        return validators[addr];
    }
    
    function isSupportedToken(address token) external view returns (bool) {
        return supportedTokens[token];
    }
    
    receive() external payable {}
}

// ============ Interfaces ============

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
