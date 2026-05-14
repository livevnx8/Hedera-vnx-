// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title HederaPredictionMarket
 * @notice Prediction market for HBAR and Hedera ecosystem tokens
 * @dev Deploy on Hedera EVM (chainId: 295 for mainnet, 296 for testnet)
 */
contract HederaPredictionMarket {
    
    struct Market {
        string token;           // Token symbol (e.g., "HBAR")
        uint256 endTime;        // When market resolves
        uint256 totalUpBets;    // Total HBAR bet on UP
        uint256 totalDownBets;  // Total HBAR bet on DOWN
        uint256 initialOddsUp;  // Initial UP odds (basis points, e.g., 5500 = 55%)
        bool resolved;          // Has market been resolved?
        bool outcome;           // true = UP won, false = DOWN won
        address creator;        // Market creator
        mapping(address => Bet) bets;  // User bets
        address[] bettors;      // List of bettors for payout
    }
    
    struct Bet {
        bool direction;         // true = UP, false = DOWN
        uint256 amount;         // Bet amount in tinybars
        bool claimed;           // Has user claimed winnings?
    }
    
    // Market ID => Market
    mapping(uint256 => Market) public markets;
    uint256 public marketCount;
    
    // Oracle address (authorized to resolve markets)
    address public oracle;
    
    // Platform fee (0.5% = 50 basis points)
    uint256 public constant PLATFORM_FEE_BPS = 50;
    uint256 public constant BPS_DENOMINATOR = 10000;
    
    // Minimum bet: 1 HBAR = 100,000,000 tinybars
    uint256 public constant MIN_BET = 100_000_000;
    
    // Events
    event MarketCreated(
        uint256 indexed marketId,
        string token,
        uint256 endTime,
        uint256 initialOddsUp
    );
    
    event BetPlaced(
        uint256 indexed marketId,
        address indexed bettor,
        bool direction,
        uint256 amount
    );
    
    event MarketResolved(
        uint256 indexed marketId,
        bool outcome,
        uint256 totalPool
    );
    
    event WinningsClaimed(
        uint256 indexed marketId,
        address indexed bettor,
        uint256 amount
    );
    
    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle can call");
        _;
    }
    
    constructor(address _oracle) {
        require(_oracle != address(0), "Invalid oracle");
        oracle = _oracle;
    }
    
    /**
     * @notice Create a new prediction market
     * @param _token Token symbol (e.g., "HBAR")
     * @param _duration Duration in seconds until market resolves
     * @param _initialOddsUp Initial UP probability in basis points (e.g., 5500 = 55%)
     */
    function createMarket(
        string calldata _token,
        uint256 _duration,
        uint256 _initialOddsUp
    ) external returns (uint256 marketId) {
        require(_duration >= 3600, "Duration must be >= 1 hour");
        require(_initialOddsUp > 0 && _initialOddsUp < BPS_DENOMINATOR, "Invalid odds");
        
        marketId = marketCount++;
        Market storage market = markets[marketId];
        
        market.token = _token;
        market.endTime = block.timestamp + _duration;
        market.initialOddsUp = _initialOddsUp;
        market.creator = msg.sender;
        
        emit MarketCreated(marketId, _token, market.endTime, _initialOddsUp);
        
        return marketId;
    }
    
    /**
     * @notice Place a bet on a market
     * @param _marketId Market ID
     * @param _direction true = UP, false = DOWN
     */
    function placeBet(uint256 _marketId, bool _direction) external payable {
        Market storage market = markets[_marketId];
        
        require(block.timestamp < market.endTime, "Market closed");
        require(!market.resolved, "Market already resolved");
        require(msg.value >= MIN_BET, "Bet too small (min 1 HBAR)");
        require(market.bets[msg.sender].amount == 0, "Already bet");
        
        // Record bet
        market.bets[msg.sender] = Bet({
            direction: _direction,
            amount: msg.value,
            claimed: false
        });
        market.bettors.push(msg.sender);
        
        // Update totals
        if (_direction) {
            market.totalUpBets += msg.value;
        } else {
            market.totalDownBets += msg.value;
        }
        
        emit BetPlaced(_marketId, msg.sender, _direction, msg.value);
    }
    
    /**
     * @notice Resolve a market (oracle only)
     * @param _marketId Market ID
     * @param _outcome true = UP won, false = DOWN won
     */
    function resolveMarket(uint256 _marketId, bool _outcome) external onlyOracle {
        Market storage market = markets[_marketId];
        
        require(block.timestamp >= market.endTime, "Market not expired");
        require(!market.resolved, "Already resolved");
        
        market.resolved = true;
        market.outcome = _outcome;
        
        uint256 totalPool = market.totalUpBets + market.totalDownBets;
        
        emit MarketResolved(_marketId, _outcome, totalPool);
    }
    
    /**
     * @notice Claim winnings from a resolved market
     * @param _marketId Market ID
     */
    function claimWinnings(uint256 _marketId) external {
        Market storage market = markets[_marketId];
        
        require(market.resolved, "Market not resolved");
        
        Bet storage bet = market.bets[msg.sender];
        require(bet.amount > 0, "No bet placed");
        require(!bet.claimed, "Already claimed");
        require(bet.direction == market.outcome, "Bet lost");
        
        // Calculate winnings
        uint256 winningPool = market.outcome ? market.totalUpBets : market.totalDownBets;
        uint256 losingPool = market.outcome ? market.totalDownBets : market.totalUpBets;
        uint256 totalPool = winningPool + losingPool;
        
        // Winner's share = (bet / winningPool) * totalPool * (1 - fee)
        uint256 grossWinnings = (bet.amount * totalPool) / winningPool;
        uint256 fee = (grossWinnings * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
        uint256 netWinnings = grossWinnings - fee;
        
        bet.claimed = true;
        
        // Transfer winnings
        (bool success, ) = payable(msg.sender).call{value: netWinnings}("");
        require(success, "Transfer failed");
        
        emit WinningsClaimed(_marketId, msg.sender, netWinnings);
    }
    
    /**
     * @notice Get market info
     */
    function getMarketInfo(uint256 _marketId) external view returns (
        string memory token,
        uint256 endTime,
        uint256 totalUp,
        uint256 totalDown,
        uint256 initialOddsUp,
        bool resolved,
        bool outcome,
        address creator
    ) {
        Market storage market = markets[_marketId];
        return (
            market.token,
            market.endTime,
            market.totalUpBets,
            market.totalDownBets,
            market.initialOddsUp,
            market.resolved,
            market.outcome,
            market.creator
        );
    }
    
    /**
     * @notice Get user's bet for a market
     */
    function getUserBet(uint256 _marketId, address _user) external view returns (
        bool direction,
        uint256 amount,
        bool claimed
    ) {
        Bet storage bet = markets[_marketId].bets[_user];
        return (bet.direction, bet.amount, bet.claimed);
    }
    
    /**
     * @notice Get current odds for a market
     */
    function getCurrentOdds(uint256 _marketId) external view returns (
        uint256 upOddsBps,
        uint256 downOddsBps
    ) {
        Market storage market = markets[_marketId];
        uint256 total = market.totalUpBets + market.totalDownBets;
        
        if (total == 0) {
            return (market.initialOddsUp, BPS_DENOMINATOR - market.initialOddsUp);
        }
        
        upOddsBps = (market.totalUpBets * BPS_DENOMINATOR) / total;
        downOddsBps = BPS_DENOMINATOR - upOddsBps;
        
        return (upOddsBps, downOddsBps);
    }
    
    /**
     * @notice Update oracle address (in case of rotation)
     */
    function updateOracle(address _newOracle) external onlyOracle {
        require(_newOracle != address(0), "Invalid oracle");
        oracle = _newOracle;
    }
    
    /**
     * @notice Get all active (unresolved) markets
     */
    function getActiveMarkets() external view returns (uint256[] memory) {
        uint256 activeCount = 0;
        for (uint256 i = 0; i < marketCount; i++) {
            if (!markets[i].resolved && block.timestamp < markets[i].endTime) {
                activeCount++;
            }
        }
        
        uint256[] memory active = new uint256[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < marketCount; i++) {
            if (!markets[i].resolved && block.timestamp < markets[i].endTime) {
                active[idx++] = i;
            }
        }
        
        return active;
    }
    
    // Allow contract to receive HBAR
    receive() external payable {}
}
