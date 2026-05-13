#!/usr/bin/env python3
"""Run a Vera OS deep health report.

Without live Docker services, local API, Redis, and PostgreSQL checks may show
as degraded or unhealthy. That is useful for preflight checks because the report
shows exactly which dependencies are missing.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vera_os import HealthService


def main() -> None:
    service = HealthService()
    report = service.report()
    print(service.format(report))


if __name__ == "__main__":
    main()
