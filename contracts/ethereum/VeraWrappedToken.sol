// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VeraWrappedToken
 * @notice ERC-20 wrapper for Hedera native assets
 * @dev Minted when bridging FROM Hedera, burned when bridging TO Hedera
 */
contract VeraWrappedToken is ERC20, Ownable {
    address public bridge;
    string public originalSymbol;
    uint8 private _decimals;

    event Minted(address indexed to, uint256 amount, string hederaTx);
    event Burned(address indexed from, uint256 amount, string hederaAccount);

    modifier onlyBridge() {
        require(msg.sender == bridge, "Only bridge can call");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _originalSymbol,
        uint8 __decimals,
        address _bridge
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        originalSymbol = _originalSymbol;
        _decimals = __decimals;
        bridge = _bridge;
    }

    /**
     * @notice Mint tokens (called by bridge when receiving from Hedera)
     * @param _to Recipient address
     * @param _amount Amount to mint
     * @param _hederaTx Hedera transaction reference
     */
    function mint(address _to, uint256 _amount, string calldata _hederaTx) 
        external 
        onlyBridge 
    {
        _mint(_to, _amount);
        emit Minted(_to, _amount, _hederaTx);
    }

    /**
     * @notice Burn tokens (called when bridging TO Hedera)
     * @param _from Address burning tokens
     * @param _amount Amount to burn
     * @param _hederaAccount Destination Hedera account
     */
    function burnFrom(address _from, uint256 _amount, string calldata _hederaAccount) 
        external 
        onlyBridge 
    {
        _burn(_from, _amount);
        emit Burned(_from, _amount, _hederaAccount);
    }

    /**
     * @notice Update bridge address
     * @param _newBridge New bridge contract address
     */
    function setBridge(address _newBridge) external onlyOwner {
        bridge = _newBridge;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
