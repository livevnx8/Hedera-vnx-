"""Initial schema for Vera VNX Swarm

Revision ID: 001
Revises:
Create Date: 2026-05-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create initial Vera VNX Swarm schema."""

    # Predictions table
    op.create_table(
        'predictions',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('token', sa.String(10), nullable=False),
        sa.Column('direction', sa.String(4), nullable=False),
        sa.Column('up_probability', sa.Numeric(6, 4), nullable=False),
        sa.Column('confidence', sa.Numeric(6, 4), nullable=False),
        sa.Column('model_type', sa.String(50), nullable=False, server_default='full_precision'),
        sa.Column('inference_time_ms', sa.Numeric(8, 2)),
        sa.Column('features', sa.JSON()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.Column('actual_direction', sa.String(4)),
        sa.Column('was_correct', sa.Boolean()),
        sa.Column('accuracy_window', sa.String(20), server_default='1h'),
        sa.CheckConstraint("direction IN ('UP', 'DOWN')", name='ck_predictions_direction'),
        sa.CheckConstraint('up_probability >= 0 AND up_probability <= 1', name='ck_predictions_up_probability'),
        sa.CheckConstraint('confidence >= 0 AND confidence <= 1', name='ck_predictions_confidence'),
        sa.CheckConstraint("actual_direction IN ('UP', 'DOWN')", name='ck_predictions_actual_direction'),
    )
    op.create_index('idx_predictions_token_time', 'predictions', ['token', sa.text('created_at DESC')])
    op.create_index('idx_predictions_created_at', 'predictions', [sa.text('created_at DESC')])

    # Specialist runs table
    op.create_table(
        'specialist_runs',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('specialist_id', sa.String(50), nullable=False),
        sa.Column('specialization', sa.String(100), nullable=False),
        sa.Column('swarm_type', sa.String(20), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('confidence', sa.Numeric(6, 4)),
        sa.Column('latency_ms', sa.Numeric(8, 2)),
        sa.Column('result', sa.JSON()),
        sa.Column('alert_count', sa.Integer(), server_default='0'),
        sa.Column('alerts', sa.JSON()),
        sa.Column('run_batch', sa.String(36)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.CheckConstraint("swarm_type IN ('vnx', 'hedera_vnx')", name='ck_specialist_runs_swarm_type'),
    )
    op.create_index('idx_specialist_runs_id', 'specialist_runs', ['specialist_id', sa.text('created_at DESC')])
    op.create_index('idx_specialist_runs_batch', 'specialist_runs', ['run_batch'])
    op.create_index('idx_specialist_runs_swarm_type', 'specialist_runs', ['swarm_type', sa.text('created_at DESC')])

    # Alert history table
    op.create_table(
        'alert_history',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('specialist_id', sa.String(50), nullable=False),
        sa.Column('alert_type', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('message', sa.Text()),
        sa.Column('metadata', sa.JSON()),
        sa.Column('acknowledged', sa.Boolean(), server_default='false'),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.CheckConstraint("severity IN ('INFO', 'WARNING', 'CRITICAL')", name='ck_alert_history_severity'),
    )
    op.create_index('idx_alert_history_specialist', 'alert_history', ['specialist_id', sa.text('created_at DESC')])
    op.create_index('idx_alert_history_severity', 'alert_history', ['severity', sa.text('created_at DESC')])
    op.create_index('idx_alert_history_unack', 'alert_history', ['acknowledged'], postgresql_where=sa.text('acknowledged = FALSE'))

    # Health checks table
    op.create_table(
        'health_checks',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('component', sa.String(50), nullable=False),
        sa.Column('component_type', sa.String(20), nullable=False),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('response_time_ms', sa.Numeric(8, 2)),
        sa.Column('details', sa.JSON()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
        sa.CheckConstraint(
            "component_type IN ('specialist', 'database', 'redis', 'hedera_api', 'cache', 'api')",
            name='ck_health_checks_component_type',
        ),
        sa.CheckConstraint(
            "status IN ('healthy', 'degraded', 'unhealthy', 'unknown')",
            name='ck_health_checks_status',
        ),
    )
    op.create_index('idx_health_checks_component', 'health_checks', ['component', sa.text('created_at DESC')])
    op.create_index('idx_health_checks_type', 'health_checks', ['component_type', sa.text('created_at DESC')])

    # System metrics table
    op.create_table(
        'system_metrics',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('metric_name', sa.String(100), nullable=False),
        sa.Column('metric_value', sa.Numeric(18, 6), nullable=False),
        sa.Column('labels', sa.JSON()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('idx_system_metrics_name_time', 'system_metrics', ['metric_name', sa.text('created_at DESC')])
    op.create_index('idx_system_metrics_created_at', 'system_metrics', [sa.text('created_at DESC')])

    # Audit logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('user_id', sa.String(100)),
        sa.Column('endpoint', sa.String(200)),
        sa.Column('method', sa.String(10)),
        sa.Column('request_payload', sa.JSON()),
        sa.Column('response_status', sa.Integer()),
        sa.Column('response_payload', sa.JSON()),
        sa.Column('ip_address', postgresql.INET()),
        sa.Column('user_agent', sa.Text()),
        sa.Column('processing_time_ms', sa.Numeric(8, 2)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()')),
    )
    op.create_index('idx_audit_logs_action', 'audit_logs', ['action', sa.text('created_at DESC')])
    op.create_index('idx_audit_logs_endpoint', 'audit_logs', ['endpoint', sa.text('created_at DESC')])
    op.create_index('idx_audit_logs_created_at', 'audit_logs', [sa.text('created_at DESC')])

    op.execute("""
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
        GROUP BY token, model_type
    """)

    op.execute("""
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
        GROUP BY specialist_id, specialization, swarm_type
    """)

    op.execute("""
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
            created_at DESC
    """)

    op.execute("""
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
        $$ LANGUAGE plpgsql
    """)


def downgrade() -> None:
    """Drop all tables."""
    op.execute('DROP FUNCTION IF EXISTS cleanup_old_records(INTEGER)')
    op.execute('DROP VIEW IF EXISTS unacknowledged_alerts')
    op.execute('DROP VIEW IF EXISTS specialist_health_summary')
    op.execute('DROP VIEW IF EXISTS prediction_accuracy_summary')
    op.drop_table('audit_logs')
    op.drop_table('system_metrics')
    op.drop_table('health_checks')
    op.drop_table('alert_history')
    op.drop_table('specialist_runs')
    op.drop_table('predictions')
