/**
 * Vera Defender - Game Lattice Visualization
 * Interactive network diagram of game architecture
 */

const canvas = document.getElementById('lattice-canvas');
const ctx = canvas.getContext('2d');

// Set canvas size
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// Game Lattice Structure
const lattice = {
    nodes: [],
    connections: [],
    particles: [],
    selectedNode: null,
    animating: true,
    messageCount: 0
};

// Color scheme
const COLORS = {
    topic: '#0f0',
    agent: '#0ff',
    entity: '#ff0',
    player: '#f0f',
    revenue: '#f00',
    connection: '#0f0',
    text: '#0f0'
};

// Node types
const NODE_TYPES = {
    TOPIC: 'topic',
    AGENT: 'agent',
    ENTITY: 'entity',
    PLAYER: 'player',
    REVENUE: 'revenue'
};

// Initialize lattice nodes
function initLattice() {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    // HCS Topics (Center layer)
    lattice.nodes.push(
        {
            id: 'topic-game-events',
            type: NODE_TYPES.TOPIC,
            label: 'Game Events\n0.0.10414316',
            x: cx - 200,
            y: cy - 150,
            radius: 35,
            color: COLORS.topic,
            description: 'Real-time game events: enemy spawns, power-ups, boss battles',
            metrics: { messages: 0, latency: '12ms' }
        },
        {
            id: 'topic-player-actions',
            type: NODE_TYPES.TOPIC,
            label: 'Player Actions\n0.0.10414317',
            x: cx,
            y: cy - 200,
            radius: 35,
            color: COLORS.topic,
            description: 'Player scores, achievements, leaderboard submissions',
            metrics: { messages: 0, latency: '8ms' }
        },
        {
            id: 'topic-swarm-coord',
            type: NODE_TYPES.TOPIC,
            label: 'Swarm Coord\n0.0.10414318',
            x: cx + 200,
            y: cy - 150,
            radius: 35,
            color: COLORS.topic,
            description: 'Vera agent coordination: difficulty, waves, power-ups',
            metrics: { messages: 0, latency: '15ms' }
        }
    );
    
    // Game Agents (Swarm layer)
    lattice.nodes.push(
        {
            id: 'agent-wave-master',
            type: NODE_TYPES.AGENT,
            label: 'Wave Master\nAgent',
            x: cx - 300,
            y: cy,
            radius: 40,
            color: COLORS.agent,
            description: 'DeFi Analyst Agent - Controls enemy wave formations',
            metrics: { waves: 0, difficulty: '1.0x' }
        },
        {
            id: 'agent-difficulty-oracle',
            type: NODE_TYPES.AGENT,
            label: 'Difficulty\nOracle',
            x: cx + 300,
            y: cy,
            radius: 40,
            color: COLORS.agent,
            description: 'Energy Auditor Agent - Adaptive difficulty scaling',
            metrics: { adjustments: 0, accuracy: '85%' }
        }
    );
    
    // Game Entities (Logic layer)
    lattice.nodes.push(
        {
            id: 'entity-player',
            type: NODE_TYPES.ENTITY,
            label: 'Player Ship',
            x: cx,
            y: cy + 100,
            radius: 30,
            color: COLORS.entity,
            description: 'Player-controlled ship with power-ups',
            metrics: { score: 0, lives: 3 }
        },
        {
            id: 'entity-enemies',
            type: NODE_TYPES.ENTITY,
            label: 'Enemy Grid',
            x: cx - 150,
            y: cy + 100,
            radius: 30,
            color: '#fa0',
            description: 'Carbon Minions, Gas Guzzlers, Validators, Topic Terrors',
            metrics: { count: 0, types: 4 }
        },
        {
            id: 'entity-boss',
            type: NODE_TYPES.ENTITY,
            label: 'Bosses',
            x: cx + 150,
            y: cy + 100,
            radius: 30,
            color: '#f00',
            description: 'Congestion Kraken, Fork Phoenix, Gas Fee Golem, Consensus Dragon',
            metrics: { spawned: 0, defeated: 0 }
        },
        {
            id: 'entity-powerups',
            type: NODE_TYPES.ENTITY,
            label: 'Power-ups',
            x: cx,
            y: cy + 200,
            radius: 25,
            color: '#0ff',
            description: 'Shield, Multi-shot, HBAR Blast, Slow-Mo',
            metrics: { spawned: 0, collected: 0 }
        }
    );
    
    // Player Actions (Input layer)
    lattice.nodes.push(
        {
            id: 'player-move',
            type: NODE_TYPES.PLAYER,
            label: 'Movement\n← →',
            x: cx - 100,
            y: cy + 300,
            radius: 25,
            color: COLORS.player,
            description: 'Arrow key movement input',
            metrics: { events: 0 }
        },
        {
            id: 'player-shoot',
            type: NODE_TYPES.PLAYER,
            label: 'Shoot\nSPACE',
            x: cx + 100,
            y: cy + 300,
            radius: 25,
            color: COLORS.player,
            description: 'Spacebar shooting input',
            metrics: { bullets: 0 }
        }
    );
    
    // Revenue/Economics layer
    lattice.nodes.push(
        {
            id: 'revenue-game-cost',
            type: NODE_TYPES.REVENUE,
            label: 'Game Cost\n0.01 HBAR',
            x: cx - 400,
            y: cy + 150,
            radius: 30,
            color: COLORS.revenue,
            description: 'Cost per game session',
            metrics: { collected: 0, total: '0.00' }
        },
        {
            id: 'revenue-continue',
            type: NODE_TYPES.REVENUE,
            label: 'Continue\n0.05 HBAR',
            x: cx - 400,
            y: cy + 250,
            radius: 30,
            color: COLORS.revenue,
            description: 'Cost to continue after game over',
            metrics: { collected: 0, total: '0.00' }
        },
        {
            id: 'revenue-earnings',
            type: NODE_TYPES.REVENUE,
            label: 'Earnings\n0.001/1k pts',
            x: cx + 400,
            y: cy + 150,
            radius: 30,
            color: '#0a0',
            description: 'Player earnings per 1000 points',
            metrics: { paid: 0, total: '0.00' }
        }
    );
    
    // Create connections
    createConnections();
    
    updateStats();
}

// Define connections between nodes
function createConnections() {
    const connections = [
        // Agent to Topic connections
        ['agent-wave-master', 'topic-game-events'],
        ['agent-wave-master', 'topic-swarm-coord'],
        ['agent-difficulty-oracle', 'topic-swarm-coord'],
        ['agent-difficulty-oracle', 'topic-player-actions'],
        
        // Topic to Entity connections
        ['topic-game-events', 'entity-enemies'],
        ['topic-game-events', 'entity-boss'],
        ['topic-game-events', 'entity-powerups'],
        ['topic-player-actions', 'entity-player'],
        ['topic-swarm-coord', 'entity-enemies'],
        ['topic-swarm-coord', 'entity-powerups'],
        
        // Entity to Entity connections
        ['entity-player', 'entity-enemies'],
        ['entity-player', 'entity-boss'],
        ['entity-enemies', 'entity-player'],
        ['entity-boss', 'entity-player'],
        ['entity-powerups', 'entity-player'],
        
        // Player Input to Player
        ['player-move', 'entity-player'],
        ['player-shoot', 'entity-player'],
        ['player-shoot', 'entity-enemies'],
        
        // Revenue connections
        ['revenue-game-cost', 'topic-player-actions'],
        ['revenue-continue', 'topic-player-actions'],
        ['topic-player-actions', 'revenue-earnings'],
        ['entity-player', 'revenue-earnings']
    ];
    
    for (const [from, to] of connections) {
        const fromNode = lattice.nodes.find(n => n.id === from);
        const toNode = lattice.nodes.find(n => n.id === to);
        if (fromNode && toNode) {
            lattice.connections.push({ from: fromNode, to: toNode, active: false });
        }
    }
}

// Draw the lattice
function draw() {
    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw starfield background
    ctx.fillStyle = '#0f03';
    for (let i = 0; i < 50; i++) {
        const x = (i * 137 + Date.now() / 100) % canvas.width;
        const y = (i * 53) % canvas.height;
        ctx.fillRect(x, y, 1, 1);
    }
    
    // Draw connections
    for (const conn of lattice.connections) {
        drawConnection(conn);
    }
    
    // Draw data flow particles
    for (let i = lattice.particles.length - 1; i >= 0; i--) {
        const p = lattice.particles[i];
        drawParticle(p);
        
        // Update particle
        p.progress += p.speed;
        if (p.progress >= 1) {
            lattice.particles.splice(i, 1);
            // Activate connection briefly
            p.connection.active = true;
            setTimeout(() => p.connection.active = false, 100);
        }
    }
    
    // Draw nodes
    for (const node of lattice.nodes) {
        drawNode(node);
    }
    
    // Spawn particles randomly
    if (lattice.animating && Math.random() < 0.05) {
        spawnParticle();
    }
}

function drawConnection(conn) {
    const { from, to, active } = conn;
    
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = active ? '#0f0' : '#0f03';
    ctx.lineWidth = active ? 2 : 1;
    ctx.stroke();
    
    // Draw arrow head
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const arrowLength = 10;
    const arrowX = to.x - (to.radius + 5) * Math.cos(angle);
    const arrowY = to.y - (to.radius + 5) * Math.sin(angle);
    
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(
        arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
        arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
        arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fillStyle = active ? '#0f0' : '#0f03';
    ctx.fill();
}

function drawParticle(p) {
    const x = p.connection.from.x + (p.connection.to.x - p.connection.from.x) * p.progress;
    const y = p.connection.from.y + (p.connection.to.y - p.connection.from.y) * p.progress;
    
    ctx.shadowBlur = 10;
    ctx.shadowColor = p.color;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawNode(node) {
    const isSelected = lattice.selectedNode === node;
    
    // Glow effect
    ctx.shadowBlur = isSelected ? 30 : 15;
    ctx.shadowColor = node.color;
    
    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fillStyle = node.color + '22';
    ctx.fill();
    ctx.strokeStyle = node.color;
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.stroke();
    
    // Inner pulse
    if (lattice.animating) {
        const pulse = Math.sin(Date.now() / 500) * 0.2 + 0.8;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 0.6 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = node.color + '44';
        ctx.fill();
    }
    
    ctx.shadowBlur = 0;
    
    // Label
    ctx.fillStyle = COLORS.text;
    ctx.font = '11px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const lines = node.label.split('\n');
    const lineHeight = 12;
    const startY = node.y - ((lines.length - 1) * lineHeight) / 2;
    
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], node.x, startY + i * lineHeight);
    }
    
    // Type indicator
    ctx.font = '9px "Courier New", monospace';
    ctx.fillStyle = node.color;
    ctx.fillText(node.type.toUpperCase(), node.x, node.y + node.radius + 15);
}

function spawnParticle() {
    if (lattice.connections.length === 0) return;
    
    const conn = lattice.connections[Math.floor(Math.random() * lattice.connections.length)];
    
    lattice.particles.push({
        connection: conn,
        progress: 0,
        speed: 0.02 + Math.random() * 0.03,
        color: conn.from.color
    });
    
    lattice.messageCount++;
    updateStats();
}

function updateStats() {
    document.getElementById('stat-topics').textContent = lattice.nodes.filter(n => n.type === NODE_TYPES.TOPIC).length;
    document.getElementById('stat-agents').textContent = lattice.nodes.filter(n => n.type === NODE_TYPES.AGENT).length;
    document.getElementById('stat-entities').textContent = lattice.nodes.filter(n => n.type === NODE_TYPES.ENTITY).length;
    document.getElementById('stat-connections').textContent = lattice.connections.length;
    document.getElementById('stat-mps').textContent = Math.floor(lattice.messageCount / 10);
}

// Mouse interaction
let isDragging = false;
let dragNode = null;

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Find clicked node
    for (const node of lattice.nodes) {
        const dx = x - node.x;
        const dy = y - node.y;
        if (dx * dx + dy * dy < node.radius * node.radius) {
            isDragging = true;
            dragNode = node;
            lattice.selectedNode = node;
            showNodeInfo(node);
            return;
        }
    }
    
    lattice.selectedNode = null;
    hideNodeInfo();
});

canvas.addEventListener('mousemove', (e) => {
    if (isDragging && dragNode) {
        const rect = canvas.getBoundingClientRect();
        dragNode.x = e.clientX - rect.left;
        dragNode.y = e.clientY - rect.top;
    }
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    dragNode = null;
});

function showNodeInfo(node) {
    const info = document.getElementById('node-info');
    const title = document.getElementById('node-title');
    const type = document.getElementById('node-type');
    const desc = document.getElementById('node-desc');
    const metrics = document.getElementById('node-metrics');
    
    title.textContent = node.label.replace('\n', ' - ');
    type.textContent = `Type: ${node.type.toUpperCase()}`;
    desc.textContent = node.description;
    
    // Build metrics HTML
    let metricsHTML = '<strong>Metrics:</strong><br>';
    for (const [key, value] of Object.entries(node.metrics)) {
        metricsHTML += `• ${key}: ${value}<br>`;
    }
    metrics.innerHTML = metricsHTML;
    
    info.classList.add('visible');
}

function hideNodeInfo() {
    document.getElementById('node-info').classList.remove('visible');
}

// Button controls
document.getElementById('reset-btn').addEventListener('click', () => {
    initLattice();
});

document.getElementById('animate-btn').addEventListener('click', () => {
    lattice.animating = !lattice.animating;
    document.getElementById('animate-btn').textContent = lattice.animating ? 'Stop Flow' : 'Animate Flow';
});

document.getElementById('game-btn').addEventListener('click', () => {
    window.location.href = 'index.html';
});

// Animation loop
function animate() {
    draw();
    requestAnimationFrame(animate);
}

// Initialize
initLattice();
animate();

// Periodic metrics update
setInterval(() => {
    // Simulate live metrics updates
    for (const node of lattice.nodes) {
        if (node.type === NODE_TYPES.TOPIC) {
            node.metrics.messages += Math.floor(Math.random() * 5);
        }
        if (node.id === 'entity-player' && lattice.animating) {
            node.metrics.score = (parseInt(node.metrics.score) || 0) + Math.floor(Math.random() * 100);
        }
    }
    
    if (lattice.selectedNode) {
        showNodeInfo(lattice.selectedNode);
    }
}, 1000);

console.log('🎮 Vera Defender Lattice Visualization loaded');
console.log('📊 Nodes:', lattice.nodes.length);
console.log('🔗 Connections:', lattice.connections.length);
