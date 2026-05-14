-- Vera Sandbox Database Initialization
-- Creates tables for development testing

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Sandbox sessions table
CREATE TABLE IF NOT EXISTS sandbox_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data JSONB DEFAULT '{}'
);

-- Topics table (for HCS topic tracking)
CREATE TABLE IF NOT EXISTS sandbox_topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id VARCHAR(255) UNIQUE NOT NULL,
    memo TEXT,
    network VARCHAR(50) DEFAULT 'testnet',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP WITH TIME ZONE,
    message_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}'
);

-- Agents table
CREATE TABLE IF NOT EXISTS sandbox_agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(255) UNIQUE NOT NULL,
    agent_type VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'inactive',
    config JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    stopped_at TIMESTAMP WITH TIME ZONE,
    cycles INTEGER DEFAULT 0
);

-- Agent logs table
CREATE TABLE IF NOT EXISTS sandbox_agent_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id VARCHAR(255) REFERENCES sandbox_agents(agent_id),
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Carbon projects table
CREATE TABLE IF NOT EXISTS sandbox_carbon_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(255) UNIQUE NOT NULL,
    project_name VARCHAR(500),
    project_type VARCHAR(100),
    location VARCHAR(100),
    vintage INTEGER,
    total_tons BIGINT,
    verified_tons BIGINT DEFAULT 0,
    retired_tons BIGINT DEFAULT 0,
    quality_score DECIMAL(5,2),
    status VARCHAR(50) DEFAULT 'pending',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    validated_at TIMESTAMP WITH TIME ZONE
);

-- Energy grid data table
CREATE TABLE IF NOT EXISTS sandbox_energy_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    region VARCHAR(100) NOT NULL,
    zone VARCHAR(100),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    frequency DECIMAL(10,3),
    total_generation DECIMAL(15,2),
    total_load DECIMAL(15,2),
    carbon_intensity DECIMAL(10,4),
    sources JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
);

-- API requests log (for debugging)
CREATE TABLE IF NOT EXISTS sandbox_api_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    method VARCHAR(10) NOT NULL,
    path TEXT NOT NULL,
    query_params JSONB DEFAULT '{}',
    body JSONB DEFAULT '{}',
    response_status INTEGER,
    response_time_ms INTEGER,
    client_ip INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_agent_logs_agent_id ON sandbox_agent_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created_at ON sandbox_agent_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_carbon_projects_status ON sandbox_carbon_projects(status);
CREATE INDEX IF NOT EXISTS idx_energy_data_region ON sandbox_energy_data(region);
CREATE INDEX IF NOT EXISTS idx_energy_data_timestamp ON sandbox_energy_data(timestamp);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON sandbox_api_logs(created_at);

-- Insert sample data for testing

-- Sample topics
INSERT INTO sandbox_topics (topic_id, memo, network, metadata) VALUES
('0.0.1001', 'Vera Core Topic', 'testnet', '{"type": "core", "purpose": "main coordination"}'),
('0.0.1002', 'Carbon Validation', 'testnet', '{"type": "carbon", "purpose": "carbon credit validation"}'),
('0.0.1003', 'Energy Grid Data', 'testnet', '{"type": "energy", "purpose": "grid monitoring"}'),
('0.0.1004', 'DeFi Analytics', 'testnet', '{"type": "defi", "purpose": "yield and arbitrage"}')
ON CONFLICT (topic_id) DO NOTHING;

-- Sample carbon projects (West Virginia examples)
INSERT INTO sandbox_carbon_projects (project_id, project_name, project_type, location, vintage, total_tons, verified_tons, quality_score, status, metadata) VALUES
('VCS-VCU-1523', 'West Virginia Forest Conservation', 'FORESTRY', 'WV', 2023, 50000, 50000, 98.5, 'verified', '{"region": "Northern WV", "species": "mixed hardwood"}'),
('VCS-VCU-1524', 'Appalachian Solar Farm', 'RENEWABLE_ENERGY', 'WV', 2023, 75000, 75000, 96.2, 'verified', '{"capacity_mw": 150, "grid_zone": "PJM_AEP"}'),
('ACR-CR-7892', 'WV Carbon Capture Pilot', 'DIRECT_AIR_CAPTURE', 'WV', 2024, 15000, 12000, 99.1, 'verified', '{"technology": "solid sorbent", "pilot": true}')
ON CONFLICT (project_id) DO NOTHING;

-- Sample energy data
INSERT INTO sandbox_energy_data (region, zone, frequency, total_generation, total_load, carbon_intensity, sources) VALUES
('West Virginia', 'PJM_AEP', 60.02, 6050.5, 5820.3, 0.623, '{
  "coal": {"mw": 3500, "percent": 57.8, "carbon_intensity": 0.82},
  "natural_gas": {"mw": 1200, "percent": 19.8, "carbon_intensity": 0.49},
  "wind": {"mw": 800, "percent": 13.2, "carbon_intensity": 0.011},
  "hydro": {"mw": 400, "percent": 6.6, "carbon_intensity": 0.024},
  "solar": {"mw": 150, "percent": 2.5, "carbon_intensity": 0.048}
}');

-- Create update trigger for timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sandbox_sessions_updated_at BEFORE UPDATE ON sandbox_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
