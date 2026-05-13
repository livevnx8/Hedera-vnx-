# Production image for the Vera OS FastAPI prediction server.
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VERA_OS_HOME=/app \
    MODELS_DIR=/app/models \
    PORT=8080

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY vera_os ./vera_os
COPY src ./src
COPY alembic.ini ./
COPY alembic ./alembic
COPY infrastructure ./infrastructure
COPY monitoring ./monitoring
COPY *.py ./

RUN mkdir -p /app/cache /app/data/tokens /app/logs /app/models \
    && useradd --create-home --shell /usr/sbin/nologin vera \
    && chown -R vera:vera /app

USER vera

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["sh", "-c", "uvicorn prediction_server_v3:app --host 0.0.0.0 --port ${PORT} --workers ${WORKERS:-4}"]
