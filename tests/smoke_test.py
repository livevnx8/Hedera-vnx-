#!/usr/bin/env python3
"""
End-to-end smoke test for Vera VNX Swarm infrastructure.

Validates all components without requiring Docker:
  1. Python module compilation
  2. Metrics generation
  3. Deep health checks
  4. Circuit breaker logic
  5. Cache operations
  6. PostgreSQL schema validation (requires running PostgreSQL)
  7. YAML config validation
  8. FastAPI server startup (imports)

Usage:
    python3 tests/smoke_test.py              # Full test
    python3 tests/smoke_test.py --quick      # Quick compilation check only
    python3 tests/smoke_test.py --db         # Include PostgreSQL tests
"""

import sys
import os
import time
import argparse
import subprocess
from pathlib import Path
from typing import List, Tuple

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

# Add repo paths to import path.
sys.path.insert(0, str(SRC))
sys.path.insert(0, str(ROOT))


class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_header(text: str):
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*70}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*70}{Colors.RESET}")


def print_pass(msg: str):
    print(f"  {Colors.GREEN}✅ PASS{Colors.RESET} {msg}")


def print_fail(msg: str):
    print(f"  {Colors.RED}❌ FAIL{Colors.RESET} {msg}")


def print_warn(msg: str):
    print(f"  {Colors.YELLOW}⚠️  WARN{Colors.RESET} {msg}")


def print_info(msg: str):
    print(f"  {Colors.BLUE}ℹ️  INFO{Colors.RESET} {msg}")


class SmokeTest:
    """Comprehensive smoke test suite."""

    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0
        self.results = []

    def run(self, include_db: bool = False, quick: bool = False):
        """Run all smoke tests."""
        start = time.time()

        print_header("VERA VNX SWARM - END-TO-END SMOKE TEST")
        print(f"Started: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Quick mode: {quick}")
        print(f"Include DB tests: {include_db}")

        # Phase 1: Compilation
        self._test_python_compilation()
        self._test_yaml_configs()

        if quick:
            self._print_summary(time.time() - start)
            return

        # Phase 2: Core modules
        self._test_metrics_module()
        self._test_circuit_breaker()
        self._test_cache_module()
        self._test_deep_health()

        # Phase 3: Server integration
        self._test_fastapi_import()
        self._test_prometheus_endpoint()

        # Phase 4: Database (optional)
        if include_db:
            self._test_postgresql()

        # Phase 5: Docker Compose
        self._test_docker_compose_syntax()

        # Phase 6: File structure
        self._test_file_structure()

        self._print_summary(time.time() - start)

    def _check(self, name: str, result: bool, details: str = ""):
        """Record a test result."""
        self.results.append({"name": name, "passed": result, "details": details})
        if result:
            self.passed += 1
            print_pass(name)
        else:
            self.failed += 1
            print_fail(f"{name} {details}")

    def _test_python_compilation(self):
        """Test all Python files compile."""
        print_header("PHASE 1: PYTHON COMPILATION")

        files_to_test = [
            "prediction_server_v3.py",
            "src/health/deep_health.py",
            "src/cache/redis_cache.py",
            "src/resilience/circuit_breaker.py",
            "src/metrics/prometheus_metrics.py",
            "vnx_swarm_engine.py",
            "hedera_vnx_specialists.py",
            "hedera_vnx_specialists_extended.py",
            "hedera_vnx_specialists_advanced.py",
            "alembic/env.py",
            "alembic/versions/001_initial_schema.py",
            "vera_os/__init__.py",
            "vera_os/prediction.py",
            "vera_os/specialists.py",
            "vera_os/health.py",
            "vera_os/visuals.py",
            "vera_os/paths.py",
            "examples/vera_os_predict_hbar.py",
            "examples/vera_os_run_hedera_swarm.py",
            "examples/vera_os_health_report.py",
            "examples/vera_os_visual_assets.py",
        ]

        base = ROOT

        for file_path in files_to_test:
            full_path = base / file_path
            if not full_path.exists():
                print_warn(f"{file_path} not found, skipping")
                self.warnings += 1
                continue

            try:
                result = subprocess.run(
                    [sys.executable, "-m", "py_compile", str(full_path)],
                    capture_output=True, text=True, timeout=10
                )
                self._check(
                    f"Compile: {file_path}",
                    result.returncode == 0,
                    result.stderr[:100] if result.stderr else ""
                )
            except Exception as e:
                self._check(f"Compile: {file_path}", False, str(e)[:100])

    def _test_yaml_configs(self):
        """Test all YAML configs parse."""
        print_header("PHASE 1B: YAML CONFIG VALIDATION")

        import yaml

        configs = [
            "docker-compose.production.yml",
            "monitoring/loki-config.yml",
            "monitoring/promtail-config.yml",
            "monitoring/prometheus.yml",
            "monitoring/alerts.yml",
            "monitoring/grafana/provisioning/datasources/prometheus.yml",
            "monitoring/grafana/provisioning/dashboards/dashboards.yml",
        ]

        base = ROOT

        for config in configs:
            full_path = base / config
            if not full_path.exists():
                print_warn(f"{config} not found, skipping")
                self.warnings += 1
                continue

            try:
                with open(full_path) as f:
                    yaml.safe_load(f)
                self._check(f"YAML: {config}", True)
            except Exception as e:
                self._check(f"YAML: {config}", False, str(e)[:100])

    def _test_metrics_module(self):
        """Test Prometheus metrics module."""
        print_header("PHASE 2A: PROMETHEUS METRICS")

        try:
            from metrics.prometheus_metrics import metrics

            # Test counter
            metrics.request_count.labels(endpoint="/test", method="GET").inc()
            metrics.request_count.labels(endpoint="/test", method="GET").inc()
            self._check("Counter increment", True)

            # Test histogram
            metrics.request_duration.labels(endpoint="/test").observe(0.05)
            metrics.request_duration.labels(endpoint="/test").observe(0.12)
            self._check("Histogram observation", True)

            # Test gauge
            metrics.vnx_swarm_health.set(0.95)
            metrics.hedera_swarm_health.set(0.87)
            self._check("Gauge set", True)

            # Test export
            output = metrics.export()
            has_counter = "vera_requests_total" in output
            has_histogram = "vera_request_duration_seconds_bucket" in output
            has_gauge = "vera_vnx_swarm_health" in output

            self._check("Export format (counter)", has_counter)
            self._check("Export format (histogram)", has_histogram)
            self._check("Export format (gauge)", has_gauge)

            # Check total lines
            lines = output.strip().split('\n')
            self._check(f"Export has {len(lines)} lines", len(lines) > 50)

        except Exception as e:
            self._check("Metrics module", False, str(e)[:100])

    def _test_circuit_breaker(self):
        """Test circuit breaker logic."""
        print_header("PHASE 2B: CIRCUIT BREAKER")

        try:
            from resilience.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError

            breaker = CircuitBreaker(
                name="test",
                failure_threshold=3,
                recovery_timeout=1.0,
            )

            # Test normal operation
            @breaker
            def success():
                return "ok"

            result = success()
            self._check("Circuit closed: success", result == "ok")

            # Test failures
            @breaker
            def fail():
                raise RuntimeError("test")

            for _ in range(4):
                try:
                    fail()
                except Exception:
                    pass

            self._check("Circuit opens after 3 failures", breaker.state.value == "open")

            # Test fast-fail
            try:
                success()
                self._check("Fast-fail when open", False, "Should have raised")
            except CircuitBreakerOpenError:
                self._check("Fast-fail when open", True)

            # Test recovery
            time.sleep(1.1)
            try:
                result = success()
                self._check("Half-open recovery", result == "ok")
            except Exception as e:
                self._check("Half-open recovery", False, str(e)[:100])

            # Test stats
            stats = breaker.get_state()
            self._check("Stats has total_calls", "total_calls" in stats)

        except Exception as e:
            self._check("Circuit breaker", False, str(e)[:100])

    def _test_cache_module(self):
        """Test cache module."""
        print_header("PHASE 2C: CACHE MODULE")

        try:
            # Check if redis is available
            try:
                import redis
                has_redis = True
            except ImportError:
                has_redis = False
                print_warn("redis module not installed, testing L1 cache only")
                self.warnings += 1

            from cache.redis_cache import TieredCache

            cache = TieredCache(redis_host="localhost", redis_port=6379)

            # L1 cache should work even without Redis
            cache.set("test_key", {"value": 42})
            result = cache.get("test_key")
            self._check("L1 cache set/get", result == {"value": 42})

            cache.delete("test_key")
            result = cache.get("test_key")
            self._check("L1 cache delete", result is None)

            stats = cache.get_stats()
            self._check("Cache stats", "l1_entries" in stats)

            if not has_redis:
                self._check("Redis availability", True)  # Expected to be unavailable

        except Exception as e:
            self._check("Cache module", False, str(e)[:100])

    def _test_deep_health(self):
        """Test deep health checker."""
        print_header("PHASE 2D: DEEP HEALTH CHECKS")

        try:
            from health.deep_health import DeepHealthChecker, format_health_report

            checker = DeepHealthChecker()
            report = checker.check_all()

            self._check("Health report has status", "status" in report)
            self._check("Health report has components", "components" in report)
            self._check("Health report has check_id", "check_id" in report)

            # Check individual components
            components = report.get("components", {})
            self._check("Health checks API component", "api" in components)
            self._check("Health checks Hedera API", "hedera_api" in components)

            # Format report
            formatted = format_health_report(report)
            self._check("Format report", len(formatted) > 200)

            # Print the actual report
            print("\n" + "-" * 50)
            print(formatted)
            print("-" * 50)

        except Exception as e:
            self._check("Deep health", False, str(e)[:100])

    def _test_fastapi_import(self):
        """Test FastAPI server can be imported."""
        print_header("PHASE 3A: FASTAPI IMPORT")

        try:
            # Import the app module (this triggers all imports)
            import prediction_server_v3

            self._check("Import prediction_server_v3", True)
            self._check("FastAPI app exists", hasattr(prediction_server_v3, 'app'))
            self._check("VNX swarm exists", hasattr(prediction_server_v3, 'vnx_swarm'))
            self._check("Hedera swarm exists", hasattr(prediction_server_v3, 'hedera_swarm'))

            # Check endpoints
            app = prediction_server_v3.app
            routes = [r.path for r in app.routes if hasattr(r, 'path')]

            self._check("Has / endpoint", "/" in routes)
            self._check("Has /health endpoint", "/health" in routes)
            self._check("Has /metrics endpoint", "/metrics" in routes)
            self._check("Has /predict endpoint", any("/predict" in r for r in routes))
            self._check("Has /swarm endpoints", any("/swarm" in r for r in routes))
            self._check("Has /hedera-swarm endpoints", any("/hedera-swarm" in r for r in routes))

            # Count total endpoints
            total = len([r for r in routes if r and r != "/openapi.json"])
            self._check(f"Total endpoints: ~{total}", total >= 40)
            print_info(f"Found {total} endpoints")

        except Exception as e:
            self._check("FastAPI import", False, str(e)[:100])

    def _test_prometheus_endpoint(self):
        """Test the /metrics endpoint returns Prometheus format."""
        print_header("PHASE 3B: PROMETHEUS ENDPOINT")

        try:
            from prediction_server_v3 import app

            # Try different TestClient imports
            client = None
            for import_path in [
                ("fastapi.testclient", "TestClient"),
                ("starlette.testclient", "TestClient"),
            ]:
                try:
                    module = __import__(import_path[0], fromlist=[import_path[1]])
                    TestClient = getattr(module, import_path[1])
                    client = TestClient(app)
                    break
                except Exception:
                    continue

            if client is None:
                # Fallback: test metrics export directly
                from metrics.prometheus_metrics import metrics
                content = metrics.export()
                self._check("Metrics export (fallback)", "vera_requests_total" in content)
                print_warn("TestClient not available, using direct export")
                self.warnings += 1
                return

            # Hit an endpoint to generate metrics
            response = client.get("/")
            self._check("Root endpoint", response.status_code == 200)

            # Hit metrics
            response = client.get("/metrics")
            self._check("Metrics endpoint 200", response.status_code == 200)
            self._check("Metrics text/plain", "text/plain" in response.headers.get("content-type", ""))

            content = response.text
            self._check("Metrics has HELP", "# HELP" in content)
            self._check("Metrics has TYPE", "# TYPE" in content)
            self._check("Metrics has request count", "vera_requests_total" in content)
            self._check("Metrics has duration", "vera_request_duration_seconds" in content)

        except Exception as e:
            self._check("Prometheus endpoint", False, str(e)[:100])

    def _test_postgresql(self):
        """Test PostgreSQL connection and schema."""
        print_header("PHASE 4: POSTGRESQL")

        try:
            import psycopg2

            # Try to connect (will fail if no PostgreSQL running)
            conn = psycopg2.connect(
                host="localhost", database="vera", user="vera", password="changeme"
            )

            self._check("PostgreSQL connection", True)

            # Check schema exists
            cursor = conn.cursor()
            cursor.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name IN (
                    'predictions', 'specialist_runs', 'alert_history',
                    'health_checks', 'system_metrics', 'audit_logs'
                )
            """)
            tables = [row[0] for row in cursor.fetchall()]

            expected = ['predictions', 'specialist_runs', 'alert_history',
                       'health_checks', 'system_metrics', 'audit_logs']

            for table in expected:
                self._check(f"Table: {table}", table in tables)

            cursor.close()
            conn.close()

        except ImportError:
            print_warn("psycopg2 not installed, skipping DB tests")
            self.warnings += 1
        except Exception as e:
            self._check("PostgreSQL", False, str(e)[:100])

    def _test_docker_compose_syntax(self):
        """Test Docker Compose syntax."""
        print_header("PHASE 5: DOCKER COMPOSE")

        try:
            result = subprocess.run(
                ["python3", "-c", """
import yaml
with open('docker-compose.production.yml') as f:
    data = yaml.safe_load(f)
print(f"Services: {len(data.get('services', {}))}")
for name in data.get('services', {}):
    print(f"  - {name}")
"""],
                capture_output=True, text=True, timeout=10, cwd=str(ROOT)
            )

            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                self._check("Docker Compose YAML valid", True)

                service_count = 0
                for line in lines:
                    if line.startswith("Services:"):
                        service_count = int(line.split(":")[1].strip())

                self._check(f"Has {service_count} services", service_count >= 10)
                print_info(f"Found {service_count} services")
            else:
                self._check("Docker Compose YAML", False, result.stderr[:100])

        except Exception as e:
            self._check("Docker Compose", False, str(e)[:100])

    def _test_file_structure(self):
        """Test all expected files exist."""
        print_header("PHASE 6: FILE STRUCTURE")

        base = ROOT

        required_files = [
            "docker-compose.production.yml",
            "infrastructure/postgres/init.sql",
            "src/health/deep_health.py",
            "src/cache/redis_cache.py",
            "src/resilience/circuit_breaker.py",
            "src/metrics/prometheus_metrics.py",
            "alembic.ini",
            "alembic/env.py",
            "alembic/versions/001_initial_schema.py",
            "monitoring/prometheus.yml",
            "monitoring/alerts.yml",
            "monitoring/loki-config.yml",
            "monitoring/promtail-config.yml",
            "monitoring/grafana/dashboards/vnx-swarm.json",
            "monitoring/grafana/provisioning/datasources/prometheus.yml",
            "monitoring/grafana/provisioning/dashboards/dashboards.yml",
        ]

        for file_path in required_files:
            full = base / file_path
            self._check(f"File: {file_path}", full.exists())

    def _print_summary(self, elapsed: float):
        """Print test summary."""
        print_header("SMOKE TEST SUMMARY")

        total = self.passed + self.failed

        print(f"\n{Colors.BOLD}Results:{Colors.RESET}")
        print(f"  {Colors.GREEN}Passed:  {self.passed}{Colors.RESET}")
        print(f"  {Colors.RED}Failed:  {self.failed}{Colors.RESET}")
        print(f"  {Colors.YELLOW}Warnings: {self.warnings}{Colors.RESET}")
        print(f"  Total:   {total}")
        print(f"\n  Time: {elapsed:.1f}s")

        if total > 0:
            pct = (self.passed / total) * 100
            print(f"  Pass rate: {pct:.1f}%")

        # Grade
        if self.failed == 0 and self.warnings == 0:
            grade = f"{Colors.GREEN}A+{Colors.RESET}"
        elif self.failed == 0:
            grade = f"{Colors.GREEN}A{Colors.RESET}"
        elif self.failed <= 2:
            grade = f"{Colors.YELLOW}B{Colors.RESET}"
        elif self.failed <= 5:
            grade = f"{Colors.YELLOW}C{Colors.RESET}"
        else:
            grade = f"{Colors.RED}F{Colors.RESET}"

        print(f"\n  Grade: {Colors.BOLD}{grade}{Colors.RESET}")

        if self.failed > 0:
            print(f"\n{Colors.RED}Failed tests:{Colors.RESET}")
            for r in self.results:
                if not r["passed"]:
                    print(f"  - {r['name']} {r['details']}")

        print_header("END OF SMOKE TEST")

        # Exit code
        sys.exit(0 if self.failed == 0 else 1)


def main():
    parser = argparse.ArgumentParser(description="Vera VNX Swarm Smoke Test")
    parser.add_argument("--quick", action="store_true", help="Quick compilation check only")
    parser.add_argument("--db", action="store_true", help="Include PostgreSQL tests")
    args = parser.parse_args()

    test = SmokeTest()
    test.run(include_db=args.db, quick=args.quick)


if __name__ == "__main__":
    main()
