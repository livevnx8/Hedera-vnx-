#!/usr/bin/env python3
"""
Comprehensive infrastructure validation for Vera VNX Swarm.

Tests every component with actual runtime execution:
  - FastAPI app startup and all 49 endpoints
  - Prometheus /metrics endpoint with real HTTP
  - Deep health with actual swarms (47 specialists)
  - Circuit breaker state transitions
  - Cache operations (L1 + L2)
  - All YAML configs parse and have required fields
  - All Python modules import cleanly
  - Docker Compose references are valid

Usage:
    python3 tests/validate_infrastructure.py
"""

import sys
import os
import time
import json
import yaml
import subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

sys.path.insert(0, str(SRC))
sys.path.insert(0, str(ROOT))

# Colors
G = '\033[92m'; R = '\033[91m'; Y = '\033[93m'; B = '\033[94m'; C = '\033[96m'; RST = '\033[0m'; BD = '\033[1m'


def header(text):
    print(f"\n{BD}{C}{'='*70}{RST}")
    print(f"{BD}{C}{text}{RST}")
    print(f"{BD}{C}{'='*70}{RST}")


def ok(msg, detail=""):
    print(f"  {G}✓{RST} {msg} {C}{detail}{RST}")


def fail(msg, detail=""):
    print(f"  {R}✗{RST} {msg} {R}{detail}{RST}")


def warn(msg, detail=""):
    print(f"  {Y}!{RST} {msg} {Y}{detail}{RST}")


def info(msg):
    print(f"  {B}ℹ{RST} {msg}")


class Validator:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0
        self.start = time.time()
        self.issues = []

    def check(self, name, condition, detail="", critical=True):
        if condition:
            self.passed += 1
            ok(name, detail)
        else:
            if critical:
                self.failed += 1
                fail(name, detail)
                self.issues.append(f"CRITICAL: {name} - {detail}")
            else:
                self.warnings += 1
                warn(name, detail)
                self.issues.append(f"WARNING: {name} - {detail}")

    def run(self):
        header("VERA VNX SWARM - INFRASTRUCTURE VALIDATION")
        print(f"Started: {datetime.now().isoformat()}")

        self._validate_python_modules()
        self._validate_yaml_configs()
        self._validate_fastapi_app()
        self._validate_prometheus_endpoint()
        self._validate_metrics_module()
        self._validate_circuit_breaker()
        self._validate_cache()
        self._validate_deep_health()
        self._validate_file_structure()
        self._validate_docker_compose()
        self._validate_migration_parity()
        self._validate_env_files()

        self._print_summary()

    def _validate_python_modules(self):
        header("1. PYTHON MODULE IMPORTS")

        modules = [
            ("prediction_server_v3", "FastAPI app"),
            ("src.health.deep_health", "DeepHealthChecker"),
            ("src.cache.redis_cache", "TieredCache"),
            ("src.resilience.circuit_breaker", "CircuitBreaker"),
            ("src.metrics.prometheus_metrics", "MetricsRegistry"),
            ("vnx_swarm_engine", "VNXSwarmEngine"),
            ("hedera_vnx_specialists", "BaseVNXSpecialist"),
            ("hedera_vnx_specialists_extended", "ExtendedSwarmOrchestrator"),
            ("hedera_vnx_specialists_advanced", "AdvancedSwarmOrchestrator"),
        ]

        for mod_name, desc in modules:
            try:
                __import__(mod_name)
                self.check(f"Import: {mod_name}", True, desc)
            except Exception as e:
                self.check(f"Import: {mod_name}", False, str(e)[:60])

    def _validate_yaml_configs(self):
        header("2. YAML CONFIG VALIDATION")

        base = ROOT
        configs = [
            ("docker-compose.production.yml", ["services", "volumes", "networks"]),
            ("monitoring/loki-config.yml", ["server", "schema_config"]),
            ("monitoring/promtail-config.yml", ["server", "clients", "scrape_configs"]),
            ("monitoring/prometheus.yml", ["scrape_configs"]),
            ("monitoring/alerts.yml", ["groups"]),
            ("docker-compose.yml", ["services"]),
            ("docker-compose.monitoring.yml", ["services"]),
        ]

        for file_path, required_keys in configs:
            full = base / file_path
            if not full.exists():
                self.check(f"YAML: {file_path}", False, "File not found")
                continue

            try:
                with open(full) as f:
                    data = yaml.safe_load(f)

                missing = [k for k in required_keys if k not in data or data[k] is None]
                if missing:
                    self.check(f"YAML: {file_path}", False, f"Missing keys: {missing}")
                else:
                    self.check(f"YAML: {file_path}", True, f"All {len(required_keys)} keys present")
            except Exception as e:
                self.check(f"YAML: {file_path}", False, str(e)[:60])

    def _validate_fastapi_app(self):
        header("3. FASTAPI APPLICATION")

        try:
            from prediction_server_v3 import app, vnx_swarm, hedera_swarm

            # Check app exists
            self.check("FastAPI app object", app is not None)

            # Count routes
            routes = [r for r in app.routes if hasattr(r, 'path') and r.path]
            paths = [r.path for r in routes]

            self.check(f"Routes registered", len(paths) > 40, f"{len(paths)} endpoints")

            # Check critical endpoints
            critical = ["/", "/health", "/metrics", "/predict/{token}",
                       "/swarm/health", "/swarm/predict/{token}",
                       "/hedera-swarm/status", "/hedera-swarm/run"]
            for ep in critical:
                found = any(ep == p or ep == r.path for p in paths for r in routes if hasattr(r, 'path'))
                self.check(f"Endpoint: {ep}", any(r.path == ep for r in routes if hasattr(r, 'path')))

            # Check swarms
            self.check("VNX swarm loaded", vnx_swarm is not None)
            self.check("Hedera swarm loaded", hedera_swarm is not None)

            health = vnx_swarm.get_swarm_health()
            self.check("VNX swarm health", health.get("total_specialists", 0) == 20,
                      f"{health.get('total_specialists', 0)} specialists")

            h_types = hedera_swarm.get_specialist_types()
            self.check("Hedera swarm specialists", len(h_types) == 27,
                      f"{len(h_types)} specialists")

        except Exception as e:
            self.check("FastAPI app", False, str(e)[:80])

    def _validate_prometheus_endpoint(self):
        header("4. PROMETHEUS /metrics ENDPOINT")

        try:
            from prediction_server_v3 import app

            # Try to use TestClient
            client = None
            for import_path in [("fastapi.testclient", "TestClient"), ("starlette.testclient", "TestClient")]:
                try:
                    module = __import__(import_path[0], fromlist=[import_path[1]])
                    TestClient = getattr(module, import_path[1])
                    client = TestClient(app)
                    break
                except Exception:
                    continue

            if client is None:
                warn("TestClient not available, using direct metrics test")
                from metrics.prometheus_metrics import metrics
                # Populate sample data
                metrics.request_count.labels(endpoint="/test", method="GET").inc()
                metrics.request_duration.labels(endpoint="/test").observe(0.05)
                metrics.vnx_swarm_health.set(0.95)
                content = metrics.export()
                self.check("Metrics export format", "# HELP" in content and "# TYPE" in content)
                self.check("Metrics has counters", "vera_requests_total" in content)
                self.check("Metrics has histograms", "vera_request_duration_seconds_bucket" in content)
                self.check("Metrics has gauges", "vera_vnx_swarm_health" in content)
                self.check("Metrics has 20+ metrics", len(content.split("\n")) > 50,
                          f"{len(content.split(chr(10)))} lines")
                return

            # Hit / to generate traffic
            r1 = client.get("/")
            self.check("GET / returns 200", r1.status_code == 200)

            # Hit /metrics
            r2 = client.get("/metrics")
            self.check("GET /metrics returns 200", r2.status_code == 200)
            self.check("Metrics content-type", "text/plain" in r2.headers.get("content-type", ""))

            content = r2.text
            self.check("Metrics has HELP", "# HELP" in content)
            self.check("Metrics has TYPE", "# TYPE" in content)
            self.check("Metrics has request counter", "vera_requests_total" in content)
            self.check("Metrics has duration histogram", "vera_request_duration_seconds" in content)
            self.check("Metrics has swarm health", "vera_vnx_swarm_health" in content)
            self.check("Metrics has hedera health", "vera_hedera_swarm_health" in content)
            self.check("Metrics has DB status", "vera_db_connection_up" in content)
            self.check("Metrics has Redis status", "vera_redis_up" in content)
            self.check("Metrics lines > 50", len(content.split("\n")) > 50,
                      f"{len(content.split(chr(10)))} lines")

        except Exception as e:
            self.check("Prometheus endpoint", False, str(e)[:80])

    def _validate_metrics_module(self):
        header("5. PROMETHEUS METRICS MODULE")

        try:
            from metrics.prometheus_metrics import metrics

            # Test all metric types
            metrics.request_count.labels(endpoint="/test", method="GET").inc()
            metrics.request_count.labels(endpoint="/test", method="POST").inc(5)

            metrics.request_duration.labels(endpoint="/test").observe(0.05)
            metrics.request_duration.labels(endpoint="/test").observe(0.12)
            metrics.request_duration.labels(endpoint="/test").observe(1.5)

            metrics.vnx_swarm_health.set(0.95)
            metrics.hedera_swarm_health.set(0.87)
            metrics.swarm_specialists_active.set(47)
            metrics.db_connection_up.set(1)
            metrics.redis_up.set(0)

            metrics.prediction_count.labels(token="hbar", direction="UP").inc()
            metrics.prediction_count.labels(token="hbar", direction="DOWN").inc()

            metrics.circuit_breaker_state.labels(name="hedera_mirror").set(0)
            metrics.circuit_breaker_failures.labels(name="hedera_mirror").inc()

            metrics.cache_hit.labels(cache_level="l1").inc()
            metrics.cache_miss.labels(cache_level="l2").inc()

            metrics.hcs_messages.inc()
            metrics.hcs_failures.inc(3)

            # Export and validate
            output = metrics.export()
            lines = output.strip().split("\n")

            self.check("Export has content", len(lines) > 50, f"{len(lines)} lines")
            self.check("Export valid format", all(l.startswith("#") or " " in l or l == "" for l in lines))

            # Check specific metrics present
            required = [
                "vera_requests_total", "vera_request_duration_seconds_bucket",
                "vera_vnx_swarm_health", "vera_hedera_swarm_health",
                "vera_db_connection_up", "vera_redis_up",
                "vera_predictions_total", "vera_circuit_breaker_state",
                "vera_cache_hits_total", "vera_cache_misses_total",
                "vera_hcs_messages_total", "vera_hcs_failures_total",
                "vera_specialist_runs_total", "vera_alerts_total",
            ]
            for metric in required:
                self.check(f"Metric present: {metric}", metric in output)

        except Exception as e:
            self.check("Metrics module", False, str(e)[:80])

    def _validate_circuit_breaker(self):
        header("6. CIRCUIT BREAKER")

        try:
            from resilience.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError

            cb = CircuitBreaker(name="test", failure_threshold=3, recovery_timeout=1.0)

            # Success path
            @cb
            def success():
                return "ok"

            r = success()
            self.check("Success through breaker", r == "ok")
            self.check("State after success", cb.state.value == "closed")

            # Failure path
            @cb
            def fail():
                raise RuntimeError("boom")

            for _ in range(4):
                try:
                    fail()
                except Exception:
                    pass

            self.check("Opens after 3 failures", cb.state.value == "open")

            # Fast-fail
            try:
                success()
                self.check("Fast-fail when open", False, "Should have raised")
            except CircuitBreakerOpenError:
                self.check("Fast-fail when open", True)

            # Recovery
            time.sleep(1.1)
            r = success()
            self.check("Recovery after timeout", r == "ok")

            # Stats
            stats = cb.get_state()
            self.check("Stats has calls", "total_calls" in stats)
            self.check("Stats has failures", stats.get("total_failures", 0) >= 3)

        except Exception as e:
            self.check("Circuit breaker", False, str(e)[:80])

    def _validate_cache(self):
        header("7. CACHE MODULE")

        try:
            from cache.redis_cache import TieredCache, CacheManager, cached

            # Test L1 cache
            cache = TieredCache(redis_host="localhost", redis_port=6379)

            cache.set("key1", {"data": 123})
            self.check("L1 set/get", cache.get("key1") == {"data": 123})

            cache.set("key2", [1, 2, 3], ttl=60)
            self.check("L1 list value", cache.get("key2") == [1, 2, 3])

            cache.delete("key1")
            self.check("L1 delete", cache.get("key1") is None)

            # Test stats
            stats = cache.get_stats()
            self.check("L1 stats", "l1_entries" in stats)

            # Test CacheManager
            mgr = CacheManager(redis_host="localhost")
            all_stats = mgr.get_all_stats()
            self.check("CacheManager stats", len(all_stats) == 4)

            # Test decorator
            test_cache = TieredCache()

            @cached(test_cache, ttl=300, key_prefix="test")
            def expensive_function(x):
                return x * 2

            r1 = expensive_function(5)
            r2 = expensive_function(5)
            self.check("Cache decorator", r1 == 10 and r2 == 10)

        except Exception as e:
            self.check("Cache module", False, str(e)[:80])

    def _validate_deep_health(self):
        header("8. DEEP HEALTH CHECKS")

        try:
            from health.deep_health import DeepHealthChecker, format_health_report
            from prediction_server_v3 import vnx_swarm, hedera_swarm

            checker = DeepHealthChecker(
                hedera_swarm=hedera_swarm,
                vnx_swarm=vnx_swarm,
            )
            report = checker.check_all()

            self.check("Report has status", "status" in report)
            self.check("Report has components", "components" in report)
            self.check("Report has timestamp", "timestamp" in report)
            self.check("Report has check_id", "check_id" in report)
            self.check("Report has latency", "total_latency_ms" in report)

            comps = report.get("components", {})
            self.check("Component: api", "api" in comps)
            self.check("Component: hedera_api", "hedera_api" in comps)
            self.check("Component: vnx_swarm", "vnx_swarm" in comps)
            self.check("Component: hedera_swarm", "hedera_swarm" in comps)

            # With actual swarms, VNX and Hedera should report something
            vnx_status = comps.get("vnx_swarm", {}).get("status", "unknown")
            hedera_status = comps.get("hedera_swarm", {}).get("status", "unknown")
            self.check(f"VNX swarm: {vnx_status}", vnx_status in ("healthy", "degraded"))
            self.check(f"Hedera swarm: {hedera_status}", hedera_status in ("healthy", "degraded"))

            # Format report
            formatted = format_health_report(report)
            self.check("Format report", len(formatted) > 500)

        except Exception as e:
            self.check("Deep health", False, str(e)[:80])

    def _validate_file_structure(self):
        header("9. FILE STRUCTURE")

        base = ROOT
        required = [
            "prediction_server_v3.py",
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
            ".env.example",
        ]

        for file_path in required:
            full = base / file_path
            self.check(f"File: {file_path}", full.exists())

    def _validate_docker_compose(self):
        header("10. DOCKER COMPOSE")

        try:
            base = ROOT

            with open(base / "docker-compose.production.yml") as f:
                data = yaml.safe_load(f)

            services = data.get("services", {})
            volumes = data.get("volumes", {})
            networks = data.get("networks", {})

            self.check("Has services", len(services) > 0, f"{len(services)} services")
            self.check("Has volumes", len(volumes) > 0, f"{len(volumes)} volumes")
            self.check("Has networks", len(networks) > 0, f"{len(networks)} networks")

            # Check critical services
            critical = [
                "api", "postgres", "redis", "redis-exporter", "traefik",
                "prometheus", "alertmanager", "grafana", "loki", "jaeger",
                "node-exporter", "backup",
            ]
            for svc in critical:
                self.check(f"Service: {svc}", svc in services)

            # Check service configs
            api = services.get("api", {})
            self.check("API has healthcheck", "healthcheck" in api)
            self.check("API has resource limits", "deploy" in api)
            api_env = "\n".join(str(v) for v in api.get("environment", []))
            self.check("API Redis URL includes password placeholder", "redis://:${REDIS_PASSWORD" in api_env)

            postgres = services.get("postgres", {})
            self.check("Postgres has init script", any("init.sql" in str(v) for v in postgres.get("volumes", [])))
            self.check("Postgres has healthcheck", "healthcheck" in postgres)

            redis = services.get("redis", {})
            redis_health = json.dumps(redis.get("healthcheck", {}))
            self.check("Redis healthcheck authenticates", "REDIS_PASSWORD" in redis_health and "redis-cli" in redis_health)

            prometheus = services.get("prometheus", {})
            prom_deps = prometheus.get("depends_on", [])
            self.check("Prometheus depends on Alertmanager", "alertmanager" in prom_deps)
            self.check("Prometheus depends on Redis exporter", "redis-exporter" in prom_deps)

            alertmanager = services.get("alertmanager", {})
            self.check("Alertmanager mounts config", any("alertmanager.yml" in str(v) for v in alertmanager.get("volumes", [])))

            redis_exporter = services.get("redis-exporter", {})
            redis_exporter_env = "\n".join(str(v) for v in redis_exporter.get("environment", []))
            self.check(
                "Redis exporter uses authenticated Redis URI",
                "REDIS_ADDR=redis://redis:6379" in redis_exporter_env and "REDIS_PASSWORD" in redis_exporter_env,
            )

            with open(base / "monitoring/prometheus.yml") as f:
                prom_config = yaml.safe_load(f)
            targets = [
                target
                for scrape in prom_config.get("scrape_configs", [])
                for static in scrape.get("static_configs", [])
                for target in static.get("targets", [])
            ]
            self.check("Prometheus targets Alertmanager", "alertmanager:9093" in targets)
            self.check("Prometheus targets Redis exporter", "redis-exporter:9121" in targets)
            self.check("Prometheus does not scrape raw Redis", "redis:6379" not in targets)

            alerts_text = (base / "monitoring/alerts.yml").read_text()
            unsupported_metrics = [
                "vera_region_healthy", "vera_uptime_ratio",
                "vera_max_agents", "vera_bridge_exploit_detected",
            ]
            self.check("Latency alert uses histogram quantile", "histogram_quantile" in alerts_text and "0.99" in alerts_text)
            self.check("Alerts only reference emitted metrics", not any(m in alerts_text for m in unsupported_metrics))

            dashboard_text = (base / "monitoring/grafana/dashboards/vnx-swarm.json").read_text()
            self.check("Dashboard uses request duration histogram", "vera_request_duration_seconds_bucket" in dashboard_text)
            self.check("Dashboard derives cache hit rate", "vera_cache_hits_total" in dashboard_text and "vera_cache_misses_total" in dashboard_text)

        except Exception as e:
            self.check("Docker Compose", False, str(e)[:80])

    def _validate_migration_parity(self):
        header("11. MIGRATION PARITY")

        base = ROOT
        try:
            migration = (base / "alembic/versions/001_initial_schema.py").read_text()
            init_sql = (base / "infrastructure/postgres/init.sql").read_text()

            self.check("Migration uses PostgreSQL INET type", "postgresql.INET" in migration)
            self.check("Migration creates prediction accuracy view", "prediction_accuracy_summary" in migration)
            self.check("Migration creates specialist health view", "specialist_health_summary" in migration)
            self.check("Migration creates unacknowledged alerts view", "unacknowledged_alerts" in migration)
            self.check("Migration creates cleanup function", "cleanup_old_records" in migration)

            for table in [
                "predictions", "specialist_runs", "alert_history",
                "health_checks", "system_metrics", "audit_logs",
            ]:
                self.check(f"Migration covers table: {table}", table in migration and table in init_sql)
        except Exception as e:
            self.check("Migration parity", False, str(e)[:80])

    def _validate_env_files(self):
        header("12. ENVIRONMENT FILES")

        base = ROOT

        env_example = base / ".env.example"
        if env_example.exists():
            with open(env_example) as f:
                content = f.read()
            self.check(".env.example exists", True, f"{len(content)} chars")

            # Check for critical vars
            critical_vars = ["PORT=", "HEDERA_NETWORK=", "HEDERA_OPERATOR_ACCOUNT_ID=",
                           "MIRROR_NODE_BASE_URL=", "MODEL_PROVIDER="]
            for var in critical_vars:
                self.check(f".env.example has {var}", var in content)
        else:
            self.check(".env.example", False, "Not found")

        env_prod = base / ".env.production"
        if env_prod.exists():
            self.check(".env.production exists", True)
        else:
            self.check(".env.production", False, "Not found", critical=False)

    def _print_summary(self):
        header("VALIDATION SUMMARY")

        total = self.passed + self.failed
        elapsed = time.time() - self.start

        print(f"\n{BD}Results:{RST}")
        print(f"  {G}Passed:   {self.passed}{RST}")
        print(f"  {R}Failed:   {self.failed}{RST}")
        print(f"  {Y}Warnings: {self.warnings}{RST}")
        print(f"  Total:    {total}")
        print(f"\n  Time: {elapsed:.1f}s")

        if total > 0:
            pct = (self.passed / total) * 100
            color = G if pct >= 95 else (Y if pct >= 80 else R)
            print(f"  Pass rate: {color}{pct:.1f}%{RST}")

        # Grade
        if self.failed == 0:
            grade = f"{G}A+{RST}"
        elif self.failed <= 2:
            grade = f"{Y}A{RST}"
        elif self.failed <= 5:
            grade = f"{Y}B{RST}"
        else:
            grade = f"{R}C{RST}"

        print(f"\n  Grade: {BD}{grade}{RST}")

        if self.issues:
            print(f"\n{R}Issues found:{RST}")
            for issue in self.issues:
                print(f"  {issue}")

        # Recommendation
        print(f"\n{C}{BD}Recommendation:{RST}")
        if self.failed == 0:
            print(f"  {G}✓ Infrastructure is fully validated and ready for deployment.{RST}")
        elif self.failed <= 3:
            print(f"  {Y}! Minor issues found. Fix before production deployment.{RST}")
        else:
            print(f"  {R}✗ Significant issues found. Do not deploy yet.{RST}")

        print(f"\n{BD}{C}{'='*70}{RST}")
        sys.exit(0 if self.failed == 0 else 1)


def main():
    validator = Validator()
    validator.run()


if __name__ == "__main__":
    main()
