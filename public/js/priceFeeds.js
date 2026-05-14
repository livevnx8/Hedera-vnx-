/**
 * Live Price Feed Integration
 * 
 * Uses CoinGecko API for real-time token prices
 * Falls back to cached prices if API fails
 */

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class PriceFeed {
  constructor() {
    this.cache = new Map();
    this.apiUrl = 'https://api.coingecko.com/api/v3';
  }

  /**
   * Get live price for a token
   */
  async getPrice(tokenId) {
    // Check cache first
    const cached = this.cache.get(tokenId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.price;
    }

    try {
      const price = await this.fetchFromAPI(tokenId);
      
      // Update cache
      this.cache.set(tokenId, {
        price,
        timestamp: Date.now()
      });
      
      return price;
    } catch (error) {
      console.warn(`Failed to fetch price for ${tokenId}, using cache or fallback`, error);
      
      // Return cached price even if stale
      if (cached) {
        return cached.price;
      }
      
      // Return fallback price
      return this.getFallbackPrice(tokenId);
    }
  }

  /**
   * Fetch from CoinGecko API
   */
  async fetchFromAPI(tokenId) {
    const response = await fetch(
      `${this.apiUrl}/simple/price?ids=${tokenId}&vs_currencies=usd&include_24hr_change=true`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data[tokenId] || !data[tokenId].usd) {
      throw new Error('Invalid response format');
    }
    
    return {
      usd: data[tokenId].usd,
      change24h: data[tokenId].usd_24h_change || 0,
      timestamp: Date.now()
    };
  }

  /**
   * Get multiple prices at once
   */
  async getPrices(tokenIds) {
    const ids = Array.isArray(tokenIds) ? tokenIds.join(',') : tokenIds;
    
    try {
      const response = await fetch(
        `${this.apiUrl}/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Update cache for all tokens
      Object.entries(data).forEach(([tokenId, priceData]) => {
        this.cache.set(tokenId, {
          price: {
            usd: priceData.usd,
            change24h: priceData.usd_24h_change || 0,
            timestamp: Date.now()
          },
          timestamp: Date.now()
        });
      });
      
      return data;
    } catch (error) {
      console.error('Failed to fetch prices:', error);
      
      // Return cached/fallback prices
      const results = {};
      tokenIds.forEach(id => {
        const cached = this.cache.get(id);
        results[id] = cached ? { usd: cached.price.usd } : { usd: this.getFallbackPrice(id).usd };
      });
      
      return results;
    }
  }

  /**
   * Get exchange rate between two tokens
   */
  async getExchangeRate(fromToken, toToken) {
    const prices = await this.getPrices([fromToken, toToken]);
    
    const fromPrice = prices[fromToken]?.usd;
    const toPrice = prices[toToken]?.usd;
    
    if (!fromPrice || !toPrice) {
      throw new Error('Price data unavailable');
    }
    
    return fromPrice / toPrice;
  }

  /**
   * Fallback prices if API fails
   */
  getFallbackPrice(tokenId) {
    const fallbacks = {
      'ethereum': { usd: 3500, change24h: 0 },
      'bitcoin': { usd: 67000, change24h: 0 },
      'hedera-hashgraph': { usd: 0.06, change24h: 0 },
      'matic-network': { usd: 0.65, change24h: 0 },
      'usd-coin': { usd: 1.0, change24h: 0 },
      'tether': { usd: 1.0, change24h: 0 },
      'wrapped-bitcoin': { usd: 67000, change24h: 0 }
    };
    
    return fallbacks[tokenId] || { usd: 0, change24h: 0 };
  }

  /**
   * Convert token symbol to CoinGecko ID
   */
  symbolToId(symbol) {
    const mapping = {
      'ETH': 'ethereum',
      'BTC': 'bitcoin',
      'HBAR': 'hedera-hashgraph',
      'MATIC': 'matic-network',
      'POL': 'matic-network',
      'USDC': 'usd-coin',
      'USDT': 'tether',
      'WBTC': 'wrapped-bitcoin'
    };
    
    return mapping[symbol.toUpperCase()] || symbol.toLowerCase();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, value]) => ({
        token: key,
        age: Date.now() - value.timestamp,
        price: value.price.usd
      }))
    };
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Token rates for bridge calculations
const TOKEN_RATES = {
  'ETH': { coingeckoId: 'ethereum', decimals: 18, hederaRate: 200 },
  'USDC': { coingeckoId: 'usd-coin', decimals: 6, hederaRate: 1 },
  'USDT': { coingeckoId: 'tether', decimals: 6, hederaRate: 1 },
  'WBTC': { coingeckoId: 'wrapped-bitcoin', decimals: 8, hederaRate: 0.00005 },
  'MATIC': { coingeckoId: 'matic-network', decimals: 18, hederaRate: 100 },
  'HBAR': { coingeckoId: 'hedera-hashgraph', decimals: 8, hederaRate: 1 }
};

export { PriceFeed, TOKEN_RATES };
export default new PriceFeed();
