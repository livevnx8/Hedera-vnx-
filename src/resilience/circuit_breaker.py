#!/usr/bin/env python3
"""
Circuit breaker pattern for Hedera and external API resilience.

Prevents cascade failures when Hedera Mirror Node or CoinGecko are down.
States: CLOSED (normal) -> OPEN (failing) -> HALF_OPEN (testing recovery)

Usage:
    breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=30)

    @breaker
    def fetch_hedera_data():
        return requests.get("https://mainnet-public.mirrornode.hedera.com/...")

    result = fetch_hedera_data()  # Automatically protected
"""

import time
import functools
from enum import Enum
from typing import Any, Callable, Optional, Dict


__all__ = [
    "CircuitState", "CircuitBreaker", "CircuitBreakerOpenError",
    "APICircuitBreakers", "retry_with_backoff",
]


class CircuitState(Enum):
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject fast
    HALF_OPEN = "half_open"  # Testing if service recovered


class CircuitBreaker:
    """
    Circuit breaker for external API calls.

    Args:
        failure_threshold: Number of failures before opening circuit
        recovery_timeout: Seconds to wait before trying again
        half_open_max_calls: Number of test calls in half-open state
        success_threshold: Successes needed to close circuit
    """

    def __init__(
        self,
        name: str = "default",
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 3,
        success_threshold: int = 2,
        fallback_value: Any = None,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self.success_threshold = success_threshold
        self.fallback_value = fallback_value

        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.last_failure_time = 0
        self.half_open_calls = 0

        # Metrics
        self.total_calls = 0
        self.total_failures = 0
        self.total_successes = 0
        self.total_fallbacks = 0
        self.state_changes = []

    def _transition_to(self, new_state: CircuitState):
        """Record state transition."""
        old_state = self.state
        self.state = new_state
        self.state_changes.append({
            "from": old_state.value,
            "to": new_state.value,
            "timestamp": time.time(),
        })

        # Reset counters on transition
        if new_state == CircuitState.CLOSED:
            self.failure_count = 0
            self.success_count = 0
            self.half_open_calls = 0
        elif new_state == CircuitState.OPEN:
            self.success_count = 0
            self.half_open_calls = 0
        elif new_state == CircuitState.HALF_OPEN:
            self.failure_count = 0
            self.success_count = 0
            self.half_open_calls = 0

    def _should_attempt(self) -> bool:
        """Check if we should attempt the call based on current state."""
        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            # Check if recovery timeout has passed
            if time.time() - self.last_failure_time >= self.recovery_timeout:
                self._transition_to(CircuitState.HALF_OPEN)
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            if self.half_open_calls < self.half_open_max_calls:
                return True
            return False

        return True

    def _record_success(self):
        """Record a successful call."""
        self.total_successes += 1

        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            self.half_open_calls += 1

            if self.success_count >= self.success_threshold:
                self._transition_to(CircuitState.CLOSED)
        else:
            self.failure_count = 0  # Reset failure count on success

    def _record_failure(self):
        """Record a failed call."""
        self.total_failures += 1
        self.failure_count += 1
        self.last_failure_time = time.time()

        if self.state == CircuitState.HALF_OPEN:
            self.half_open_calls += 1
            self._transition_to(CircuitState.OPEN)
        elif self.failure_count >= self.failure_threshold:
            self._transition_to(CircuitState.OPEN)

    def __call__(self, func: Callable) -> Callable:
        """Decorator to wrap a function with circuit breaker."""
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            return self.call(func, *args, **kwargs)

        # Attach breaker for inspection
        wrapper._circuit_breaker = self
        return wrapper

    def call(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with circuit breaker protection."""
        self.total_calls += 1

        if not self._should_attempt():
            self.total_fallbacks += 1
            if self.fallback_value is not None:
                return self.fallback_value
            raise CircuitBreakerOpenError(
                f"Circuit '{self.name}' is OPEN. Last failure: {self.last_failure_time}"
            )

        try:
            result = func(*args, **kwargs)
            self._record_success()
            return result
        except Exception as e:
            self._record_failure()
            raise

    def get_state(self) -> Dict[str, Any]:
        """Get current circuit breaker state."""
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self.failure_count,
            "success_count": self.success_count,
            "last_failure_time": self.last_failure_time,
            "total_calls": self.total_calls,
            "total_failures": self.total_failures,
            "total_successes": self.total_successes,
            "total_fallbacks": self.total_fallbacks,
            "failure_rate": round(self.total_failures / max(self.total_calls, 1) * 100, 2),
        }


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is open."""
    pass


# Pre-configured breakers for common APIs
class APICircuitBreakers:
    """Circuit breakers for all external APIs."""

    def __init__(self):
        # Hedera Mirror Node: tolerant (can be slow, but don't hammer it)
        self.hedera_mirror = CircuitBreaker(
            name="hedera_mirror",
            failure_threshold=3,
            recovery_timeout=60.0,
            fallback_value={"error": "Hedera Mirror Node unavailable", "cached": True},
        )

        # CoinGecko: strict (rate limits, don't retry too aggressively)
        self.coingecko = CircuitBreaker(
            name="coingecko",
            failure_threshold=2,
            recovery_timeout=120.0,
            fallback_value={"error": "CoinGecko rate limited", "cached": True},
        )

        # Hedera Consensus Service: moderate
        self.hcs = CircuitBreaker(
            name="hcs",
            failure_threshold=5,
            recovery_timeout=30.0,
            fallback_value={"error": "HCS temporarily unavailable", "cached": True},
        )

        # Hedera Token Service: moderate
        self.hts = CircuitBreaker(
            name="hts",
            failure_threshold=5,
            recovery_timeout=30.0,
            fallback_value={"error": "HTS temporarily unavailable", "cached": True},
        )

    def get_all_states(self) -> Dict[str, Any]:
        """Get all circuit breaker states."""
        return {
            "hedera_mirror": self.hedera_mirror.get_state(),
            "coingecko": self.coingecko.get_state(),
            "hcs": self.hcs.get_state(),
            "hts": self.hts.get_state(),
        }

    def reset_all(self):
        """Reset all circuit breakers to CLOSED."""
        for breaker in [self.hedera_mirror, self.coingecko, self.hcs, self.hts]:
            breaker._transition_to(CircuitState.CLOSED)


# Retry with exponential backoff
def retry_with_backoff(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    exceptions: tuple = (Exception,),
    on_retry: Callable = None,
):
    """Retry decorator with exponential backoff and jitter."""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            delay = base_delay

            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    if attempt == max_retries:
                        raise

                    # Exponential backoff with jitter
                    import random
                    jitter = random.uniform(0, delay * 0.1)
                    sleep_time = min(delay + jitter, max_delay)

                    if on_retry:
                        on_retry(attempt + 1, max_retries, e, sleep_time)

                    time.sleep(sleep_time)
                    delay *= 2

            # Should never reach here
            raise RuntimeError("Retry loop exited unexpectedly")

        return wrapper
    return decorator


if __name__ == "__main__":
    # Test circuit breaker
    breaker = CircuitBreaker(
        name="test",
        failure_threshold=3,
        recovery_timeout=5.0,
    )

    @breaker
    def flaky_function(should_fail: bool = False):
        if should_fail:
            raise RuntimeError("Simulated failure")
        return "success"

    # Test normal operation
    print("Test 1: Normal call")
    print(f"  Result: {flaky_function(False)}")
    print(f"  State: {breaker.get_state()}")

    # Test failures
    print("\nTest 2: Trigger failures")
    for i in range(5):
        try:
            flaky_function(True)
        except Exception as e:
            print(f"  Call {i+1}: {e}")

    print(f"  State: {breaker.state.value}")
    print(f"  Stats: {breaker.get_state()}")

    # Test circuit open
    print("\nTest 3: Circuit should be open")
    try:
        flaky_function(False)
    except CircuitBreakerOpenError as e:
        print(f"  Expected: {e}")

    # Test recovery
    print("\nTest 4: Wait for recovery")
    time.sleep(6)
    print(f"  State after timeout: {breaker.state.value}")

    # Test half-open recovery
    for i in range(3):
        try:
            result = flaky_function(False)
            print(f"  Recovery call {i+1}: {result}")
        except Exception as e:
            print(f"  Recovery call {i+1}: {e}")

    print(f"  Final state: {breaker.state.value}")
    print(f"  Final stats: {breaker.get_state()}")
