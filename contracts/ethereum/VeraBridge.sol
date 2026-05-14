// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VeraBridge Ethereum Contract
 * @notice Trustless bridge for Hedera <> Ethereum transfers
 * @dev Uses HTLC (Hash Time-Locked Contracts) for atomic swaps
 */
contract VeraBridge is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // HTLC Structure
    struct HTLC {
        bytes32 hashLock;
        address sender;
        address recipient;
        address token;
        uint256 amount;
        uint256 expiry;
        bool claimed;
        bool refunded;
        string hederaAccount;  // Destination on Hedera
    }

    // Validator signature structure
    struct ValidatorSignature {
        address validator;
        bytes signature;
        uint256 timestamp;
    }

    // State variables
    mapping(bytes32 => HTLC) public htlcs;
    mapping(address => bool) public validators;
    mapping(address => uint256) public validatorStakes;
    mapping(bytes32 => ValidatorSignature[]) public htlcSignatures;
    
    uint256 public requiredSignatures = 3;
    uint256 public validatorCount = 0;
    uint256 public minStake = 10000 * 10**18; // 10,000 VERA tokens
    uint256 public bridgeFee = 10; // 0.10% = 10 basis points (Super Highway pricing)
    uint256 public constant FEE_DENOMINATOR = 10000;
    
    // Fee tiers
    uint256 public constant FOUNDING_MEMBER_FEE = 5; // 0.05% for early adopters
    uint256 public constant PARTNER_FEE = 8; // 0.08% for API partners
    uint256 public constant STANDARD_FEE = 10; // 0.10% standard
    
    mapping(address => bool) public foundingMembers;
    mapping(address => bool) public partners;
    mapping(string => address) public wrappedTokens; // symbol => contract
    mapping(address => string) public tokenToSymbol;

    // Events
    event HTLCCreated(
        bytes32 indexed htlcId,
        address indexed sender,
        string hederaAccount,
        address token,
        uint256 amount,
        bytes32 hashLock,
        uint256 expiry
    );
    
    event HTLCClaimed(
        bytes32 indexed htlcId,
        address indexed recipient,
        bytes32 secret
    );
    
    event HTLCRefunded(
        bytes32 indexed htlcId,
        address indexed sender
    );
    
    event ValidatorAdded(address indexed validator, uint256 stake);
    event ValidatorRemoved(address indexed validator);
    event BridgeFeeUpdated(uint256 newFee);
    event WrappedTokenRegistered(string symbol, address token);

    // Modifiers
    modifier onlyValidator() {
        require(validators[msg.sender], "Not a validator");
        _;
    }

    modifier htlcExists(bytes32 _htlcId) {
        require(htlcs[_htlcId].sender != address(0), "HTLC does not exist");
        _;
    }

    modifier htlcNotClaimed(bytes32 _htlcId) {
        require(!htlcs[_htlcId].claimed, "HTLC already claimed");
        _;
    }

    modifier htlcNotRefunded(bytes32 _htlcId) {
        require(!htlcs[_htlcId].refunded, "HTLC already refunded");
        _;
    }

    /**
     * @notice Create a new HTLC for bridging to Hedera
     * @param _hashLock SHA-256 hash of the secret
     * @param _hederaAccount Destination Hedera account (0.0.xxxxx)
     * @param _token ERC20 token address (address(0) for ETH)
     * @param _amount Amount to bridge
     * @param _expiry Timeout in seconds (min 1 hour, max 7 days)
     */
    function createHTLC(
        bytes32 _hashLock,
        string calldata _hederaAccount,
        address _token,
        uint256 _amount,
        uint256 _expiry
    ) external payable nonReentrant returns (bytes32 htlcId) {
        require(_amount > 0, "Amount must be > 0");
        require(_expiry >= 3600 && _expiry <= 604800, "Expiry must be 1hr-7days");
        require(bytes(_hederaAccount).length > 0, "Invalid Hedera account");

        uint256 fee = (_amount * bridgeFee) / FEE_DENOMINATOR;
        uint256 netAmount = _amount - fee;

        if (_token == address(0)) {
            require(msg.value == _amount, "ETH amount mismatch");
        } else {
            require(msg.value == 0, "ETH not accepted for ERC20");
            IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        }

        htlcId = keccak256(abi.encodePacked(
            msg.sender,
            _hederaAccount,
            _token,
            _amount,
            _hashLock,
            block.timestamp
        ));

        require(htlcs[htlcId].sender == address(0), "HTLC already exists");

        htlcs[htlcId] = HTLC({
            hashLock: _hashLock,
            sender: msg.sender,
            recipient: address(0), // Set when claiming from Hedera
            token: _token,
            amount: netAmount,
            expiry: block.timestamp + _expiry,
            claimed: false,
            refunded: false,
            hederaAccount: _hederaAccount
        });

        emit HTLCCreated(
            htlcId,
            msg.sender,
            _hederaAccount,
            _token,
            netAmount,
            _hashLock,
            block.timestamp + _expiry
        );

        return htlcId;
    }

    /**
     * @notice Claim an HTLC with the secret (called when receiving from Hedera)
     * @param _htlcId The HTLC ID
     * @param _secret The preimage that hashes to hashLock
     * @param _validatorSignatures At least 3 validator signatures
     */
    function claimHTLC(
        bytes32 _htlcId,
        bytes32 _secret,
        ValidatorSignature[] calldata _validatorSignatures
    ) external nonReentrant htlcExists(_htlcId) htlcNotClaimed(_htlcId) htlcNotRefunded(_htlcId) {
        HTLC storage htlc = htlcs[_htlcId];
        
        require(block.timestamp <= htlc.expiry, "HTLC expired");
        require(keccak256(abi.encodePacked(_secret)) == htlc.hashLock, "Invalid secret");
        require(_validatorSignatures.length >= requiredSignatures, "Insufficient signatures");

        // Verify validator signatures
        bytes32 message = keccak256(abi.encodePacked(_htlcId, _secret, htlc.hederaAccount));
        bytes32 ethSignedMessage = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", message));

        for (uint256 i = 0; i < _validatorSignatures.length; i++) {
            address validator = _validatorSignatures[i].validator;
            require(validators[validator], "Invalid validator");
            
            address recovered = recoverSigner(ethSignedMessage, _validatorSignatures[i].signature);
            require(recovered == validator, "Invalid signature");
            
            // Prevent duplicate validators
            for (uint256 j = 0; j < i; j++) {
                require(_validatorSignatures[j].validator != validator, "Duplicate validator");
            }
        }

        htlc.claimed = true;
        htlc.recipient = msg.sender;

        // Store signatures for audit
        for (uint256 i = 0; i < _validatorSignatures.length; i++) {
            htlcSignatures[_htlcId].push(_validatorSignatures[i]);
        }

        // Transfer tokens
        if (htlc.token == address(0)) {
            (bool success, ) = msg.sender.call{value: htlc.amount}("");
            require(success, "ETH transfer failed");
        } else {
            IERC20(htlc.token).safeTransfer(msg.sender, htlc.amount);
        }

        emit HTLCClaimed(_htlcId, msg.sender, _secret);
    }

    /**
     * @notice Refund an expired HTLC
     * @param _htlcId The HTLC ID
     */
    function refundHTLC(bytes32 _htlcId) 
        external 
        nonReentrant 
        htlcExists(_htlcId) 
        htlcNotClaimed(_htlcId) 
        htlcNotRefunded(_htlcId) 
    {
        HTLC storage htlc = htlcs[_htlcId];
        require(block.timestamp > htlc.expiry, "HTLC not expired");
        require(msg.sender == htlc.sender, "Only sender can refund");

        htlc.refunded = true;

        if (htlc.token == address(0)) {
            (bool success, ) = htlc.sender.call{value: htlc.amount}("");
            require(success, "ETH refund failed");
        } else {
            IERC20(htlc.token).safeTransfer(htlc.sender, htlc.amount);
        }

        emit HTLCRefunded(_htlcId, htlc.sender);
    }

    /**
     * @notice Add a validator
     * @param _validator Validator address
     */
    function addValidator(address _validator) external onlyOwner {
        require(!validators[_validator], "Already a validator");
        require(validatorStakes[_validator] >= minStake, "Insufficient stake");
        
        validators[_validator] = true;
        validatorCount++;
        
        emit ValidatorAdded(_validator, validatorStakes[_validator]);
    }

    /**
     * @notice Remove a validator
     * @param _validator Validator address
     */
    function removeValidator(address _validator) external onlyOwner {
        require(validators[_validator], "Not a validator");
        
        validators[_validator] = false;
        validatorCount--;
        
        // Return stake
        uint256 stake = validatorStakes[_validator];
        validatorStakes[_validator] = 0;
        
        // In production, this would transfer VERA tokens back
        // For now, just emit event
        
        emit ValidatorRemoved(_validator);
    }

    /**
     * @notice Stake VERA tokens to become a validator
     * @param _amount Amount to stake
     */
    function stake(uint256 _amount) external {
        require(_amount >= minStake, "Below minimum stake");
        // In production, transfer VERA tokens
        validatorStakes[msg.sender] += _amount;
    }

    /**
     * @notice Register a wrapped token
     * @param _symbol Token symbol (e.g., "WHBAR")
     * @param _token ERC20 contract address
     */
    function registerWrappedToken(string calldata _symbol, address _token) external onlyOwner {
        wrappedTokens[_symbol] = _token;
        tokenToSymbol[_token] = _symbol;
        emit WrappedTokenRegistered(_symbol, _token);
    }

    /**
     * @notice Update bridge fee
     * @param _newFee New fee in basis points (25 = 0.25%)
     */
    function setBridgeFee(uint256 _newFee) external onlyOwner {
        require(_newFee <= 100, "Fee too high"); // Max 1%
        bridgeFee = _newFee;
        emit BridgeFeeUpdated(_newFee);
    }

    /**
     * @notice Update required signatures
     * @param _newRequired New signature threshold
     */
    function setRequiredSignatures(uint256 _newRequired) external onlyOwner {
        require(_newRequired > 0 && _newRequired <= validatorCount, "Invalid threshold");
        requiredSignatures = _newRequired;
    }

    /**
     * @notice Get HTLC details
     */
    function getHTLC(bytes32 _htlcId) external view returns (HTLC memory) {
        return htlcs[_htlcId];
    }

    /**
     * @notice Get validator signatures for an HTLC
     */
    function getHTLCSignatures(bytes32 _htlcId) external view returns (ValidatorSignature[] memory) {
        return htlcSignatures[_htlcId];
    }

    /**
     * @notice Check if address is validator
     */
    function isValidator(address _addr) external view returns (bool) {
        return validators[_addr];
    }

    /**
     * @notice Add founding member (0.05% fee forever)
     * @param _member Member address
     */
    function addFoundingMember(address _member) external onlyOwner {
        foundingMembers[_member] = true;
        emit FoundingMemberAdded(_member);
    }

    /**
     * @notice Remove founding member
     * @param _member Member address
     */
    function removeFoundingMember(address _member) external onlyOwner {
        foundingMembers[_member] = false;
        emit FoundingMemberRemoved(_member);
    }

    /**
     * @notice Add partner (0.08% fee)
     * @param _partner Partner address
     */
    function addPartner(address _partner) external onlyOwner {
        partners[_partner] = true;
        emit PartnerAdded(_partner);
    }

    /**
     * @notice Remove partner
     * @param _partner Partner address
     */
    function removePartner(address _partner) external onlyOwner {
        partners[_partner] = false;
        emit PartnerRemoved(_partner);
    }

    /**
     * @notice Get effective fee for a user
     * @param _user User address
     * @return Fee in basis points
     */
    function getEffectiveFee(address _user) external view returns (uint256) {
        if (foundingMembers[_user]) {
            return FOUNDING_MEMBER_FEE; // 0.05%
        } else if (partners[_user]) {
            return PARTNER_FEE; // 0.08%
        } else {
            return bridgeFee; // 0.10% standard
        }
    }

    /**
     * @notice Check if address is founding member
     */
    function isFoundingMember(address _addr) external view returns (bool) {
        return foundingMembers[_addr];
    }

    /**
     * @notice Check if address is partner
     */
    function isPartner(address _addr) external view returns (bool) {
        return partners[_addr];
    }

    // Events for fee tier management
    event FoundingMemberAdded(address indexed member);
    event FoundingMemberRemoved(address indexed member);
    event PartnerAdded(address indexed partner);
    event PartnerRemoved(address indexed partner);

    // Helper function to recover signer from signature
    function recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _signature) 
        internal 
        pure 
        returns (address) 
    {
        (bytes32 r, bytes32 s, uint8 v) = splitSignature(_signature);
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }

    function splitSignature(bytes memory sig) 
        internal 
        pure 
        returns (bytes32 r, bytes32 s, uint8 v) 
    {
        require(sig.length == 65, "Invalid signature length");
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
    }

    // Receive ETH
    receive() external payable {}
}
