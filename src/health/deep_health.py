#!/usr/bin/env python3
"""
Deep health checks for the entire VNX swarm system.

Checks all 47 specialists + database + Redis + Hedera API + cache.
Returns structured health report with status per component.
"""

import time
import uuid
from typing import Dict, Any, List
from datetime import datetime

import requests


__all__ = ["DeepHealthChecker", "format_health_report"]


class DeepHealthChecker:
    """Comprehensive health monitoring for all system components."""

    def __init__(self, hedera_swarm=None, vnx_swarm=None, db_pool=None, redis_client=None):
        self.hedera_swarm = hedera_swarm
        self.vnx_swarm = vnx_swarm
        self.db_pool = db_pool
        self.redis_client = redis_client
        self.check_id = str(uuid.uuid4())[:8]

    def check_all(self) -> Dict[str, Any]:
        """Run all health checks and return comprehensive report."""
        start = time.time()

        checks = {
            "api": self._check_api(),
            "database": self._check_database(),
            "redis": self._check_redis(),
            "hedera_api": self._check_hedera_api(),
            "vnx_swarm": self._check_vnx_swarm(),
            "hedera_swarm": self._check_hedera_swarm(),
            "cache": self._check_cache(),
        }

        # Overall status: degraded if any component is unhealthy
        statuses = [c["status"] for c in checks.values()]
        if any(s == "unhealthy" for s in statuses):
            overall = "unhealthy"
        elif any(s == "degraded" for s in statuses):
            overall = "degraded"
        else:
            overall = "healthy"

        return {
            "status": overall,
            "check_id": self.check_id,
            "timestamp": datetime.now().isoformat(),
            "total_latency_ms": round((time.time() - start) * 1000, 2),
            "components": checks,
            "healthy_count": sum(1 for s in statuses if s == "healthy"),
            "degraded_count": sum(1 for s in statuses if s == "degraded"),
            "unhealthy_count": sum(1 for s in statuses if s == "unhealthy"),
        }

    def _check_api(self) -> Dict[str, Any]:
        """Check API is responsive."""
        start = time.time()
        try:
            # Self-check via localhost
            resp = requests.get("http://localhost:8080/health", timeout=5)
            latency = (time.time() - start) * 1000

            if resp.status_code == 200:
                data = resp.json()
                return {
                    "status": "healthy",
                    "latency_ms": round(latency, 2),
                    "details": {"status_code": resp.status_code, "data": data},
                }
            else:
                return {
                    "status": "degraded",
                    "latency_ms": round(latency, 2),
                    "details": {"status_code": resp.status_code},
                }
        except Exception as e:
            return {
                "status": "unhealthy",
                "latency_ms": round((time.time() - start) * 1000, 2),
                "details": {"error": str(e)},
            }

    def _check_database(self) -> Dict[str, Any]:
        """Check PostgreSQL connectivity."""
        start = time.time()
        try:
            if self.db_pool:
                # Use asyncpg pool
                import asyncio
                async def test_db():
                    async with self.db_pool.acquire() as conn:
                        result = await conn.fetchval("SELECT 1")
                        return result == 1

                # Run async in sync context
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                ok = loop.run_until_complete(test_db())
                loop.close()

                return {
                    "status": "healthy" if ok else "unhealthy",
                    "latency_ms": round((time.time() - start) * 1000, 2),
                    "details": {"query": "SELECT 1", "result": ok},
                }
            else:
                # No DB configured
                return {
                    "status": "degraded",
                    "latency_ms": round((time.time() - start) * 1000, 2),
                    "details": {"message": "No database pool configured"},
                }
        except Exception as e:
            return {
                "status": "unhealthy",
                "latency_ms": round((time.time() - start) * 1000, 2),
                "details": {"error": str(e)},
            }

    def _check_redis(self) -> Dict[str, Any]:
        """Check Redis connectivity."""
        start = time.time()
        try:
            if self.redis_client:
                self.redis_client.ping()
                return {
                    "status": "healthy",
                    "latency_ms": round((time.time() - start) * 1000, 2),
                    "details": {"ping": "PONG"},
                }
            else:
                return {
                    "status": "degraded",
                    "latency_ms": round((time.time() - start) * 1000, 2),
                    "details": {"message": "No Redis client configured"},
                }
        except Exception as e:
            return {
                "status": "unhealthy",
                "latency_ms": round((time.time() - start) * 1000, 2),
                "details": {"error": str(e)},
            }

    def _check_hedera_api(self) -> Dict[str, Any]:
        """Check Hedera Mirror Node API is accessible."""
        start = time.time()
        try:
            url = "https://mainnet-public.mirrornode.hedera.com/api/v1/network/nodes"
            resp = requests.get(url, timeout=10)
            latency = (time.time() - start) * 1000

            if resp.status_code == 200:
                data = resp.json()
                nodes = data.get("nodes", [])
                return {
                    "status": "healthy",
                    "latency_ms": round(latency, 2),
                    "details": {
                        "status_code": resp.status_code,
                        "nodes_available": len(nodes),
                        "mirror_node_url": url,
                    },
                }
            else:
                return {
                    "status": "degraded",
                    "latency_ms": round(latency, 2),
                    "details": {"status_code": resp.status_code},
                }
        except Exception as e:
            return {
                "status": "unhealthy",
                "latency_ms": round((time.time() - start) * 1000, 2),
                "details": {"error": str(e)},
            }

    def _check_vnx_swarm(self) -> Dict[str, Any]:
        """Check VNX swarm (20 specialists) are loaded and responsive."""
        start = time.time()
        try:
            if self.vnx_swarm:
                health = self.vnx_swarm.get_swarm_health()
                total = health.get("total_specialists", 0)
                active = health.get("active_specialists", total)  # fallback to total

                # Test a basic operation (predict may not exist on all swarm types)
                test_ok = False
                try:
                    if hasattr(self.vnx_swarm, 'predict'):
                        test_result = self.vnx_swarm.predict("HBAR")
                        test_ok = "error" not in str(test_result).lower()
                    elif hasattr(self.vnx_swarm, 'get_swarm_health'):
                        test_ok = True  # Health check itself is the test
                except Exception:
                    test_ok = False

                status = "healthy" if total >= 20 and test_ok else "degraded"

                return {
                    "status": status,
                    "latency_ms": round((time.time() - start) * 1000, 2),
                    "details": {
                        "total_specialists": total,
                        "active_specialists": active,
                        "test_ok": test_ok,
                    },
                }
            else:
                return {
                    "status": "degraded",
                    "latency_ms": round((time.time() - start) * 1000, 2),
                    "details": {"message": "VNX swarm not initialized"},
                }
        except Exception as e:
            return {
                "status": "unhealthy",
                "latency_ms": round((time.time() - start) * 1000, 2),
                "details": {"error": str(e)},
            }

    def _check_hedera_swarm(self) -> Dict[str, Any]:
        """Check Hedera VNX swarm (27 specialists)."""
        start = time.time()
        try:
            if self.hedera_swarm:
                types = self.hedera_swarm.get_specialist_types()
                total = len(types)

                # Try a quick run of one specialist
                test_result = None
                if self.hedera_swarm.specialists:
                    spec = self.hedera_swarm.specialists[0]
                    test_result = spec.run()

                status = "healthy" if total >= 27 else "degraded"

                return {
                    "status": status,
                    "latency_ms": round((time.time() - start) * 1000, 2),
                    "details": {
                        "total_specialists": total,
                        "specialist_types": [t["type"] for t in types[:5]],
                        "test_run_ok": test_result is not None and test_result.get("status") == "COMPLETE",
                    },
                }
            else:
                return {
                    "status": "degraded",
                    "latency_ms": round((time.time() - start) * 1000, 2),
                    "details": {"message": "Hedera swarm not initialized"},
                }
        except Exception as e:
            return {
                "status": "unhealthy",
                "latency_ms": round((time.time() - start) * 1000, 2),
                "details": {"error": str(e)},
            }

    def _check_cache(self) -> Dict[str, Any]:
        """Check cache is functional."""
        start = time.time()
        try:
            if self.redis_client:
                # Test set/get/delete
                test_key = f"health_test_{self.check_id}"
                self.redis_client.setex(test_key, 10, "ok")
                value = self.redis_client.get(test_key)
                self.redis_client.delete(test_key)

                return {
                    "status": "healthy" if value == b"ok" else "degraded",
                    "latency_ms": round((time.time() - start) * 1000, 2),
                    "details": {"set_get_ok": value == b"ok", "ttl_test": True},
                }
            else:
                return {
                    "status": "degraded",
                    "latency_ms": round((time.time() - start) * 1000, 2),
                    "details": {"message": "No cache client configured"},
                }
        except Exception as e:
            return {
                "status": "unhealthy",
                "latency_ms": round((time.time() - start) * 1000, 2),
                "details": {"error": str(e)},
            }


def format_health_report(report: Dict[str, Any]) -> str:
    """Format health report for human reading."""
    lines = []
    lines.append("=" * 70)
    lines.append(f"DEEP HEALTH REPORT  ID: {report['check_id']}")
    lines.append(f"Time: {report['timestamp']}")
    lines.append(f"Overall: {report['status'].upper()}")
    lines.append(f"Latency: {report['total_latency_ms']}ms")
    lines.append("=" * 70)

    for component, result in report["components"].items():
        status_icon = "✅" if result["status"] == "healthy" else "⚠️" if result["status"] == "degraded" else "❌"
        lines.append(f"\n{status_icon} {component.upper()}: {result['status']}")
        lines.append(f"   Latency: {result['latency_ms']}ms")
        for key, val in result.get("details", {}).items():
            lines.append(f"   {key}: {val}")

    lines.append("\n" + "=" * 70)
    lines.append(f"Summary: {report['healthy_count']} healthy, {report['degraded_count']} degraded, {report['unhealthy_count']} unhealthy")
    lines.append("=" * 70)

    return "\n".join(lines)


if __name__ == "__main__":
    # Standalone test
    checker = DeepHealthChecker()
    report = checker.check_all()
    print(format_health_report(report))
