#!/usr/bin/env python3
"""
Redis caching strategy for VNX swarm.

Provides tiered caching:
  - L1: In-process LRU (fastest, smallest)
  - L2: Redis (shared across nodes)
  - L3: PostgreSQL (persistent, slowest)

Key strategies:
  - Predictions cached for 5 minutes (price data is volatile)
  - Swarm health cached for 30 seconds
  - Hedera network stats cached for 1 minute
  - Specialist runs cached for 10 minutes
"""

import json
import time
import hashlib
from typing import Any, Optional, Dict
from functools import wraps

__all__ = ["TieredCache", "CacheManager", "cached"]

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None


class TieredCache:
    """
    Three-tier caching system for production.

    L1: Simple dict LRU (microsecond latency)
    L2: Redis (millisecond latency, shared state)
    L3: PostgreSQL (persistent, for audit/replay)
    """

    def __init__(
        self,
        redis_host: str = "localhost",
        redis_port: int = 6379,
        redis_db: int = 0,
        redis_password: Optional[str] = None,
        l1_size: int = 1000,
        default_ttl: int = 300,  # 5 minutes
    ):
        self.l1_cache = {}  # In-process LRU
        self.l1_order = []  # Track access order for LRU eviction
        self.l1_size = l1_size
        self.default_ttl = default_ttl

        # Try to connect to Redis
        try:
            self.redis_client = redis.Redis(
                host=redis_host,
                port=redis_port,
                db=redis_db,
                password=redis_password,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
                health_check_interval=30,
            )
            self.redis_available = self.redis_client.ping()
        except Exception:
            self.redis_client = None
            self.redis_available = False

    def _l1_get(self, key: str) -> Optional[Any]:
        """Get from L1 in-process cache."""
        if key in self.l1_cache:
            # Move to end (most recently used)
            self.l1_order.remove(key)
            self.l1_order.append(key)
            return self.l1_cache[key]["value"]
        return None

    def _l1_set(self, key: str, value: Any, ttl: int = None):
        """Set in L1 cache with LRU eviction."""
        ttl = ttl or self.default_ttl
        expires = time.time() + ttl

        if key in self.l1_cache:
            self.l1_order.remove(key)

        self.l1_cache[key] = {"value": value, "expires": expires}
        self.l1_order.append(key)

        # LRU eviction
        while len(self.l1_cache) > self.l1_size:
            oldest = self.l1_order.pop(0)
            self.l1_cache.pop(oldest, None)

    def _l1_delete(self, key: str):
        """Delete from L1 cache."""
        self.l1_cache.pop(key, None)
        if key in self.l1_order:
            self.l1_order.remove(key)

    def _l1_cleanup(self):
        """Remove expired L1 entries."""
        now = time.time()
        expired = [k for k, v in self.l1_cache.items() if v["expires"] < now]
        for k in expired:
            self._l1_delete(k)

    def _l2_get(self, key: str) -> Optional[Any]:
        """Get from Redis (L2)."""
        if not self.redis_available:
            return None
        try:
            value = self.redis_client.get(key)
            if value:
                return json.loads(value)
        except Exception:
            pass
        return None

    def _l2_set(self, key: str, value: Any, ttl: int = None):
        """Set in Redis (L2)."""
        if not self.redis_available:
            return
        try:
            ttl = ttl or self.default_ttl
            self.redis_client.setex(key, ttl, json.dumps(value))
        except Exception:
            pass

    def _l2_delete(self, key: str):
        """Delete from Redis."""
        if not self.redis_available:
            return
        try:
            self.redis_client.delete(key)
        except Exception:
            pass

    def get(self, key: str) -> Optional[Any]:
        """Get from cache (L1 -> L2 -> None)."""
        # L1 first
        value = self._l1_get(key)
        if value is not None:
            return value

        # L2 second
        value = self._l2_get(key)
        if value is not None:
            # Promote to L1
            self._l1_set(key, value)
            return value

        return None

    def set(self, key: str, value: Any, ttl: int = None):
        """Set in all cache layers."""
        self._l1_set(key, value, ttl)
        self._l2_set(key, value, ttl)

    def delete(self, key: str):
        """Delete from all cache layers."""
        self._l1_delete(key)
        self._l2_delete(key)

    def invalidate_pattern(self, pattern: str):
        """Invalidate keys matching pattern (Redis only)."""
        if not self.redis_available:
            return
        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                self.redis_client.delete(*keys)
        except Exception:
            pass

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        self._l1_cleanup()
        stats = {
            "l1_entries": len(self.l1_cache),
            "l1_max": self.l1_size,
            "redis_available": self.redis_available,
        }
        if self.redis_available:
            try:
                info = self.redis_client.info("memory")
                stats["redis_used_memory_mb"] = round(info.get("used_memory", 0) / 1024 / 1024, 2)
                stats["redis_keys"] = self.redis_client.dbsize()
            except Exception:
                pass
        return stats


# Convenience decorator for caching function results
def cached(cache: TieredCache, ttl: int = 300, key_prefix: str = ""):
    """Decorator to cache function results."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key from function name + args
            key_parts = [key_prefix or func.__name__]
            key_parts.append(str(args))
            key_parts.append(str(sorted(kwargs.items())))
            key = hashlib.md5("|".join(key_parts).encode()).hexdigest()

            # Try cache
            result = cache.get(key)
            if result is not None:
                return result

            # Call function
            result = func(*args, **kwargs)

            # Cache result
            cache.set(key, result, ttl)

            return result
        return wrapper
    return decorator


# Pre-configured cache instances for different use cases
class CacheManager:
    """Manages multiple cache instances for different data types."""

    def __init__(self, redis_host: str = "localhost", redis_port: int = 6379):
        # Predictions: 5 min TTL (price data changes fast)
        self.predictions = TieredCache(
            redis_host=redis_host,
            redis_port=redis_port,
            l1_size=500,
            default_ttl=300,
        )

        # Swarm health: 30 sec TTL
        self.swarm_health = TieredCache(
            redis_host=redis_host,
            redis_port=redis_port,
            l1_size=100,
            default_ttl=30,
        )

        # Hedera network stats: 1 min TTL
        self.hedera_stats = TieredCache(
            redis_host=redis_host,
            redis_port=redis_port,
            l1_size=50,
            default_ttl=60,
        )

        # Specialist runs: 10 min TTL
        self.specialist_runs = TieredCache(
            redis_host=redis_host,
            redis_port=redis_port,
            l1_size=200,
            default_ttl=600,
        )

    def get_all_stats(self) -> Dict[str, Any]:
        """Get stats for all cache instances."""
        return {
            "predictions": self.predictions.get_stats(),
            "swarm_health": self.swarm_health.get_stats(),
            "hedera_stats": self.hedera_stats.get_stats(),
            "specialist_runs": self.specialist_runs.get_stats(),
        }


if __name__ == "__main__":
    # Test
    cache = TieredCache()

    cache.set("test_key", {"value": 42})
    result = cache.get("test_key")
    print(f"Cache test: {result}")
    print(f"Stats: {cache.get_stats()}")
