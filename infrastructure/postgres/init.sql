-- Vera VNX Swarm Database Schema
-- PostgreSQL 16

-- Drop tables if they exist (for fresh init)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS specialist_runs CASCADE;
DROP TABLE IF EXISTS predictions CASCADE;
DROP TABLE IF EXISTS alert_history CASCADE;
DROP TABLE IF EXISTS health_checks CASCADE;
DROP TABLE IF EXISTS system_metrics CASCADE;

-- Predictions table: stores all price direction predictions
CREATE TABLE predictions (
    id SERIAL PRIMARY KEY,
    token VARCHAR(10) NOT NULL,
    direction VARCHAR(4) NOT NULL CHECK (direction IN ('UP', 'DOWN')),
    up_probability DECIMAL(6,4) NOT NULL CHECK (up_probability >= 0 AND up_probability <= 1),
    confidence DECIMAL(6,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    model_type VARCHAR(50) NOT NULL DEFAULT 'full_precision',
    inference_time_ms DECIMAL(8,2),
    features JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    actual_direction VARCHAR(4) CHECK (actual_direction IN ('UP', 'DOWN')),
    was_correct BOOLEAN,
    accuracy_window VARCHAR(20) DEFAULT '1h'
);

CREATE INDEX idx_predictions_token_time ON predictions(token, created_at DESC);
CREATE INDEX idx_predictions_created_at ON predictions(created_at DESC);

-- Specialist runs: logs each of the 47 specialists
CREATE TABLE specialist_runs (
    id SERIAL PRIMARY KEY,
    specialist_id VARCHAR(50) NOT NULL,
    specialization VARCHAR(100) NOT NULL,
    swarm_type VARCHAR(20) NOT NULL CHECK (swarm_type IN ('vnx', 'hedera_vnx')),
    status VARCHAR(20) NOT NULL,
    confidence DECIMAL(6,4),
    latency_ms DECIMAL(8,2),
    result JSONB,
    alert_count INTEGER DEFAULT 0,
    alerts JSONB,
    run_batch VARCHAR(36), -- groups a full swarm run
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_specialist_runs_id ON specialist_runs(specialist_id, created_at DESC);
CREATE INDEX idx_specialist_runs_batch ON specialist_runs(run_batch);
CREATE INDEX idx_specialist_runs_swarm_type ON specialist_runs(swarm_type, created_at DESC);

-- Alert history: persistent alert tracking
CREATE TABLE alert_history (
    id SERIAL PRIMARY KEY,
    specialist_id VARCHAR(50) NOT NULL,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    message TEXT,
    metadata JSONB,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_alert_history_specialist ON alert_history(specialist_id, created_at DESC);
CREATE INDEX idx_alert_history_severity ON alert_history(severity, created_at DESC);
CREATE INDEX idx_alert_history_unack ON alert_history(acknowledged) WHERE acknowledged = FALSE;

-- Health checks: deep health monitoring
CREATE TABLE health_checks (
    id SERIAL PRIMARY KEY,
    component VARCHAR(50) NOT NULL,
    component_type VARCHAR(20) NOT NULL CHECK (component_type IN ('specialist', 'database', 'redis', 'hedera_api', 'cache', 'api')),
    status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'unknown')),
    response_time_ms DECIMAL(8,2),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_health_checks_component ON health_checks(component, created_at DESC);
CREATE INDEX idx_health_checks_type ON health_checks(component_type, created_at DESC);

-- System metrics: time-series data for Grafana
CREATE TABLE system_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(18,6) NOT NULL,
    labels JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_system_metrics_name_time ON system_metrics(metric_name, created_at DESC);
CREATE INDEX idx_system_metrics_created_at ON system_metrics(created_at DESC);

-- Audit logs: every API request and specialist action
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    user_id VARCHAR(100),
    endpoint VARCHAR(200),
    method VARCHAR(10),
    request_payload JSONB,
    response_status INTEGER,
    response_payload JSONB,
    ip_address INET,
    user_agent TEXT,
    processing_time_ms DECIMAL(8,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_endpoint ON audit_logs(endpoint, created_at DESC);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- View: prediction accuracy summary
CREATE OR REPLACE VIEW prediction_accuracy_summary AS
SELECT
    token,
    model_type,
    COUNT(*) as total_predictions,
    SUM(CASE WHEN was_correct = TRUE THEN 1 ELSE 0 END) as correct_count,
    ROUND(
        100.0 * SUM(CASE WHEN was_correct = TRUE THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0),
        2
    ) as accuracy_pct,
    ROUND(AVG(confidence)::numeric, 4) as avg_confidence,
    ROUND(AVG(inference_time_ms)::numeric, 2) as avg_latency_ms,
    MAX(created_at) as last_prediction
FROM predictions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY token, model_type;

-- View: specialist health summary (last hour)
CREATE OR REPLACE VIEW specialist_health_summary AS
SELECT
    specialist_id,
    specialization,
    swarm_type,
    COUNT(*) as runs_last_hour,
    ROUND(AVG(latency_ms)::numeric, 2) as avg_latency_ms,
    SUM(alert_count) as total_alerts,
    MAX(created_at) as last_run
FROM specialist_runs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY specialist_id, specialization, swarm_type;

-- View: unacknowledged alerts
CREATE OR REPLACE VIEW unacknowledged_alerts AS
SELECT
    id,
    specialist_id,
    alert_type,
    severity,
    message,
    metadata,
    created_at,
    EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as minutes_ago
FROM alert_history
WHERE acknowledged = FALSE
ORDER BY
    CASE severity
        WHEN 'CRITICAL' THEN 1
        WHEN 'WARNING' THEN 2
        WHEN 'INFO' THEN 3
    END,
    created_at DESC;

-- Function: clean old records (run via cron)
CREATE OR REPLACE FUNCTION cleanup_old_records(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    DELETE FROM system_metrics WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    DELETE FROM health_checks WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;

    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '1 day' * retention_days;
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant privileges (for app user)
-- CREATE USER vera_app WITH PASSWORD 'changeme';
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO vera_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vera_app;
