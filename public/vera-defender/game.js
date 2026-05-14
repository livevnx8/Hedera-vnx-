/**
 * Vera Defender - Core Game Engine
 * Galaga-style space shooter with Hedera HCS integration
 */

// Game Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_SPEED = 8;
const BULLET_SPEED = 12;
const ENEMY_SPEED = 2;

// Game State
const state = {
    score: 0,
    wave: 1,
    lives: 3,
    hbarEarned: 0,
    isPlaying: false,
    isPaused: false,
    enemies: [],
    bullets: [],
    particles: [],
    powerUps: [],
    hcsMessages: 0,
    achievements: [],
    playerPowerUps: {
        shield: false,
        multiShot: false,
        slowMo: false
    }
};

// Canvas Setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Player
const player = {
    x: CANVAS_WIDTH / 2 - 20,
    y: CANVAS_HEIGHT - 80,
    width: 40,
    height: 40,
    color: '#0f0',
    shootCooldown: 0
};

// Input Handling
const keys = {};
document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space' && state.isPlaying && !state.isPaused) {
        shoot();
    }
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

// UI Elements
const screens = {
    start: document.getElementById('start-screen'),
    gameOver: document.getElementById('game-over-screen'),
    wave: document.getElementById('wave-screen')
};

const displays = {
    score: document.getElementById('score'),
    wave: document.getElementById('wave'),
    lives: document.getElementById('lives'),
    hbar: document.getElementById('hbar-earned'),
    hcsCount: document.getElementById('hcs-count'),
    hcsMessages: document.getElementById('hcs-messages')
};

// Sound Effects (synthesized)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    switch(type) {
        case 'shoot':
            osc.frequency.value = 800;
            osc.type = 'square';
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.1);
            break;
        case 'explosion':
            osc.frequency.value = 100;
            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.3);
            break;
        case 'powerup':
            osc.frequency.value = 400;
            osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.3);
            break;
        case 'boss':
            osc.frequency.value = 200;
            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            for (let i = 0; i < 5; i++) {
                gain.gain.setValueAtTime(0.3, audioCtx.currentTime + i * 0.1);
                gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + i * 0.1 + 0.1);
            }
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.5);
            break;
    }
}

// Shooting
function shoot() {
    if (player.shootCooldown > 0) return;
    
    playSound('shoot');
    
    if (state.playerPowerUps.multiShot) {
        // Triple shot
        state.bullets.push({
            x: player.x,
            y: player.y,
            dx: -2,
            dy: -BULLET_SPEED,
            color: '#0f0'
        });
        state.bullets.push({
            x: player.x + player.width / 2,
            y: player.y,
            dx: 0,
            dy: -BULLET_SPEED,
            color: '#0f0'
        });
        state.bullets.push({
            x: player.x + player.width,
            y: player.y,
            dx: 2,
            dy: -BULLET_SPEED,
            color: '#0f0'
        });
    } else {
        // Single shot
        state.bullets.push({
            x: player.x + player.width / 2,
            y: player.y,
            dx: 0,
            dy: -BULLET_SPEED,
            color: '#0f0'
        });
    }
    
    player.shootCooldown = state.playerPowerUps.multiShot ? 8 : 15;
}

// Enemy Types
const ENEMY_TYPES = {
    CARBON_MINION: {
        hp: 1,
        score: 100,
        color: '#0f0',
        pattern: 'grid'
    },
    GAS_GUZZLER: {
        hp: 1,
        score: 200,
        color: '#ff0',
        pattern: 'dive'
    },
    VALIDATOR: {
        hp: 3,
        score: 500,
        color: '#0ff',
        pattern: 'grid'
    },
    TOPIC_TERROR: {
        hp: 2,
        score: 300,
        color: '#f0f',
        pattern: 'dive'
    }
};

// Spawn Enemy Wave
function spawnWave(waveNum) {
    const rows = 4 + Math.min(Math.floor(waveNum / 3), 3);
    const cols = 8;
    const startX = 50;
    const startY = 50;
    const spacingX = 80;
    const spacingY = 60;
    
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            let type = 'CARBON_MINION';
            
            // Determine enemy type based on row and wave
            if (row === 0) {
                type = waveNum % 3 === 0 ? 'VALIDATOR' : 'GAS_GUZZLER';
            } else if (row === 1 && waveNum > 2) {
                type = 'TOPIC_TERROR';
            }
            
            state.enemies.push({
                x: startX + col * spacingX,
                y: startY + row * spacingY,
                width: 30,
                height: 30,
                type: type,
                ...ENEMY_TYPES[type],
                hp: ENEMY_TYPES[type].hp,
                direction: 1,
                diveY: 0,
                isDiving: false,
                originalX: startX + col * spacingX,
                originalY: startY + row * spacingY
            });
        }
    }
    
    // Boss every 5 waves
    if (waveNum % 5 === 0) {
        spawnBoss(waveNum);
    }
}

// Spawn Boss
function spawnBoss(waveNum) {
    playSound('boss');
    
    const bossTypes = ['CONGESTION_KRAKEN', 'FORK_PHOENIX', 'GAS_FEE_GOLEM', 'CONSENSUS_DRAGON'];
    const bossType = bossTypes[Math.floor((waveNum / 5 - 1) % bossTypes.length)];
    
    state.enemies.push({
        x: CANVAS_WIDTH / 2 - 60,
        y: 50,
        width: 120,
        height: 80,
        type: 'BOSS',
        bossType: bossType,
        hp: 20 + waveNum * 5,
        maxHp: 20 + waveNum * 5,
        score: 5000,
        color: '#f00',
        direction: 1,
        speed: 2,
        shootCooldown: 60
    });
    
    logHCS('BOSS_SPAWN', `Boss ${bossType} appeared on wave ${waveNum}!`);
}

// Create Explosion Particles
function createExplosion(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        state.particles.push({
            x: x,
            y: y,
            dx: (Math.random() - 0.5) * 8,
            dy: (Math.random() - 0.5) * 8,
            life: 30,
            color: color,
            size: Math.random() * 4 + 2
        });
    }
}

// Spawn Power-Up
function spawnPowerUp(x, y) {
    const types = ['SHIELD', 'MULTI_SHOT', 'HBAR_BLAST', 'SLOW_MO'];
    const type = types[Math.floor(Math.random() * types.length)];
    
    state.powerUps.push({
        x: x,
        y: y,
        type: type,
        width: 25,
        height: 25,
        dy: 2,
        color: type === 'HBAR_BLAST' ? '#ff0' : '#0ff'
    });
}

// Apply Power-Up
function applyPowerUp(type) {
    playSound('powerup');
    
    switch(type) {
        case 'SHIELD':
            state.playerPowerUps.shield = true;
            setTimeout(() => state.playerPowerUps.shield = false, 10000);
            logHCS('POWERUP', 'Shield activated for 10s!');
            break;
        case 'MULTI_SHOT':
            state.playerPowerUps.multiShot = true;
            setTimeout(() => state.playerPowerUps.multiShot = false, 15000);
            logHCS('POWERUP', 'Multi-shot activated for 15s!');
            break;
        case 'HBAR_BLAST':
            // Screen clear
            state.enemies.forEach(enemy => {
                createExplosion(enemy.x + enemy.width/2, enemy.y + enemy.height/2, enemy.color, 20);
                state.score += enemy.score;
            });
            state.enemies = state.enemies.filter(e => e.type === 'BOSS');
            logHCS('POWERUP', 'HBAR BLAST! Screen cleared!');
            break;
        case 'SLOW_MO':
            state.playerPowerUps.slowMo = true;
            setTimeout(() => state.playerPowerUps.slowMo = false, 8000);
            logHCS('POWERUP', 'Slow-motion activated for 8s!');
            break;
    }
    
    updatePowerUpUI();
}

// Update Power-Up UI
function updatePowerUpUI() {
    const container = document.getElementById('powerups');
    container.innerHTML = '';
    
    if (state.playerPowerUps.shield) {
        container.innerHTML += '<div class="powerup">🛡️ SHIELD</div>';
    }
    if (state.playerPowerUps.multiShot) {
        container.innerHTML += '<div class="powerup">⚡ MULTI</div>';
    }
    if (state.playerPowerUps.slowMo) {
        container.innerHTML += '<div class="powerup">⏱️ SLOW</div>';
    }
}

// HCS Logging
function logHCS(type, message) {
    state.hcsMessages++;
    displays.hcsCount.textContent = state.hcsMessages;
    
    const logDiv = displays.hcsMessages;
    const entry = document.createElement('div');
    entry.className = 'hcs-message';
    entry.innerHTML = `<span style="color: #0f0;">[${new Date().toLocaleTimeString()}]</span> <b>${type}</b>: ${message}`;
    logDiv.insertBefore(entry, logDiv.firstChild);
    
    // Keep only last 10 messages
    while (logDiv.children.length > 10) {
        logDiv.removeChild(logDiv.lastChild);
    }
}

// Update Game
function update() {
    if (!state.isPlaying || state.isPaused) return;
    
    const speedMultiplier = state.playerPowerUps.slowMo ? 0.5 : 1;
    
    // Player Movement
    if (keys['ArrowLeft'] && player.x > 0) {
        player.x -= PLAYER_SPEED;
    }
    if (keys['ArrowRight'] && player.x < CANVAS_WIDTH - player.width) {
        player.x += PLAYER_SPEED;
    }
    
    // Player Shoot Cooldown
    if (player.shootCooldown > 0) player.shootCooldown--;
    
    // Update Bullets
    state.bullets = state.bullets.filter(bullet => {
        bullet.x += bullet.dx * speedMultiplier;
        bullet.y += bullet.dy * speedMultiplier;
        return bullet.y > -10 && bullet.y < CANVAS_HEIGHT + 10;
    });
    
    // Update Enemies
    let moveDown = false;
    const edgeBuffer = 30;
    
    state.enemies.forEach(enemy => {
        if (enemy.type === 'BOSS') {
            // Boss movement
            enemy.x += enemy.speed * enemy.direction * speedMultiplier;
            if (enemy.x <= 0 || enemy.x >= CANVAS_WIDTH - enemy.width) {
                enemy.direction *= -1;
            }
            
            // Boss shooting
            if (enemy.shootCooldown-- <= 0) {
                enemy.shootCooldown = 60;
                // Boss bullets
                state.bullets.push({
                    x: enemy.x + enemy.width / 2,
                    y: enemy.y + enemy.height,
                    dx: 0,
                    dy: 6,
                    color: '#f00',
                    isEnemy: true
                });
            }
        } else {
            // Regular enemy movement
            if (enemy.isDiving) {
                // Diving attack
                enemy.y += 4 * speedMultiplier;
                enemy.x += Math.sin(enemy.y * 0.05) * 3;
                
                if (enemy.y > CANVAS_HEIGHT) {
                    enemy.y = enemy.originalY;
                    enemy.x = enemy.originalX;
                    enemy.isDiving = false;
                }
            } else {
                // Grid movement
                const speed = (ENEMY_SPEED + state.wave * 0.3) * speedMultiplier;
                enemy.x += speed * enemy.direction;
                
                // Check bounds
                if (enemy.x <= edgeBuffer || enemy.x >= CANVAS_WIDTH - enemy.width - edgeBuffer) {
                    moveDown = true;
                }
                
                // Random dive
                if (Math.random() < 0.001 && enemy.pattern === 'dive') {
                    enemy.isDiving = true;
                }
            }
        }
    });
    
    // Move all down at edge
    if (moveDown) {
        state.enemies.forEach(enemy => {
            if (enemy.type !== 'BOSS') {
                enemy.direction *= -1;
                enemy.y += 20;
            }
        });
    }
    
    // Update Power-Ups
    state.powerUps = state.powerUps.filter(pu => {
        pu.y += pu.dy;
        
        // Check collision with player
        if (pu.x < player.x + player.width &&
            pu.x + pu.width > player.x &&
            pu.y < player.y + player.height &&
            pu.y + pu.height > player.y) {
            applyPowerUp(pu.type);
            return false;
        }
        
        return pu.y < CANVAS_HEIGHT + 50;
    });
    
    // Update Particles
    state.particles = state.particles.filter(p => {
        p.x += p.dx;
        p.y += p.dy;
        p.life--;
        return p.life > 0;
    });
    
    // Bullet-Enemy Collisions
    state.bullets.forEach((bullet, bIndex) => {
        if (bullet.isEnemy) {
            // Check collision with player
            if (!state.playerPowerUps.shield &&
                bullet.x > player.x && bullet.x < player.x + player.width &&
                bullet.y > player.y && bullet.y < player.y + player.height) {
                playerHit();
                state.bullets.splice(bIndex, 1);
            }
            return;
        }
        
        state.enemies.forEach((enemy, eIndex) => {
            if (bullet.x > enemy.x && bullet.x < enemy.x + enemy.width &&
                bullet.y > enemy.y && bullet.y < enemy.y + enemy.height) {
                
                enemy.hp--;
                state.bullets.splice(bIndex, 1);
                
                if (enemy.hp <= 0) {
                    playSound('explosion');
                    createExplosion(enemy.x + enemy.width/2, enemy.y + enemy.height/2, enemy.color);
                    state.score += enemy.score;
                    state.hbarEarned += enemy.score / 10000;
                    
                    // Chance for power-up
                    if (Math.random() < 0.1) {
                        spawnPowerUp(enemy.x, enemy.y);
                    }
                    
                    state.enemies.splice(eIndex, 1);
                    
                    // Log to HCS for boss kills
                    if (enemy.type === 'BOSS') {
                        logHCS('BOSS_DEFEATED', `Boss ${enemy.bossType} defeated! +${enemy.score} pts`);
                        unlockAchievement('BOSS_SLAYER');
                    }
                }
                
                updateUI();
            }
        });
    });
    
    // Enemy-Player Collisions
    state.enemies.forEach((enemy, index) => {
        if (enemy.x < player.x + player.width &&
            enemy.x + enemy.width > player.x &&
            enemy.y < player.y + player.height &&
            enemy.y + enemy.height > player.y) {
            
            if (!state.playerPowerUps.shield) {
                playerHit();
            }
            
            // Destroy enemy
            createExplosion(enemy.x + enemy.width/2, enemy.y + enemy.height/2, enemy.color);
            state.enemies.splice(index, 1);
        }
    });
    
    // Check Wave Complete
    if (state.enemies.length === 0) {
        waveComplete();
    }
    
    // Check Game Over
    if (state.lives <= 0) {
        gameOver();
    }
}

// Player Hit
function playerHit() {
    playSound('explosion');
    createExplosion(player.x + player.width/2, player.y + player.height/2, '#0f0', 30);
    state.lives--;
    
    // Reset player position
    player.x = CANVAS_WIDTH / 2 - 20;
    
    // Brief invulnerability
    state.isPaused = true;
    setTimeout(() => state.isPaused = false, 1000);
    
    updateUI();
    logHCS('PLAYER_HIT', `Player hit! Lives remaining: ${state.lives}`);
}

// Wave Complete
function waveComplete() {
    state.isPaused = true;
    const bonus = state.wave * 1000;
    state.score += bonus;
    state.hbarEarned += bonus / 10000;
    
    document.getElementById('wave-bonus').textContent = bonus;
    screens.wave.classList.remove('hidden');
    
    logHCS('WAVE_COMPLETE', `Wave ${state.wave} complete! Bonus: ${bonus}`);
    
    setTimeout(() => {
        screens.wave.classList.add('hidden');
        state.wave++;
        state.isPaused = false;
        spawnWave(state.wave);
        updateUI();
    }, 2000);
}

// Update UI
function updateUI() {
    displays.score.textContent = state.score.toLocaleString();
    displays.wave.textContent = state.wave;
    displays.lives.textContent = '♥'.repeat(state.lives);
    displays.hbar.textContent = state.hbarEarned.toFixed(2);
}

// Game Over
function gameOver() {
    state.isPlaying = false;
    
    document.getElementById('final-score').textContent = state.score.toLocaleString();
    document.getElementById('final-wave').textContent = state.wave;
    document.getElementById('final-hbar').textContent = state.hbarEarned.toFixed(2);
    
    screens.gameOver.classList.remove('hidden');
    
    logHCS('GAME_OVER', `Game Over! Score: ${state.score}, Wave: ${state.wave}`);
    submitScore();
}

// Submit Score to HCS
function submitScore() {
    const scoreData = {
        type: 'SCORE_SUBMIT',
        player: 'guest', // Will be wallet address if connected
        score: state.score,
        wave: state.wave,
        hbarEarned: state.hbarEarned,
        achievements: state.achievements,
        timestamp: Date.now()
    };
    
    // In production, this would submit to HCS topic
    console.log('Submitting score:', scoreData);
    logHCS('SCORE_SUBMIT', `Submitted score: ${state.score}`);
}

// Unlock Achievement
function unlockAchievement(id) {
    if (!state.achievements.includes(id)) {
        state.achievements.push(id);
        logHCS('ACHIEVEMENT', `Unlocked: ${id}!`);
    }
}

// Draw Game
function draw() {
    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Draw starfield background
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 50; i++) {
        const x = (i * 137 + Date.now() / 50) % CANVAS_WIDTH;
        const y = (i * 53) % CANVAS_HEIGHT;
        ctx.fillRect(x, y, 1, 1);
    }
    
    // Draw player
    ctx.shadowBlur = 15;
    ctx.shadowColor = state.playerPowerUps.shield ? '#0ff' : '#0f0';
    ctx.fillStyle = state.playerPowerUps.shield ? '#0ff' : '#0f0';
    
    // Player ship shape
    ctx.beginPath();
    ctx.moveTo(player.x + player.width/2, player.y);
    ctx.lineTo(player.x + player.width, player.y + player.height);
    ctx.lineTo(player.x + player.width/2, player.y + player.height - 10);
    ctx.lineTo(player.x, player.y + player.height);
    ctx.closePath();
    ctx.fill();
    
    // Shield effect
    if (state.playerPowerUps.shield) {
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(player.x + player.width/2, player.y + player.height/2, 35, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    ctx.shadowBlur = 0;
    
    // Draw bullets
    state.bullets.forEach(bullet => {
        ctx.fillStyle = bullet.color;
        ctx.fillRect(bullet.x - 2, bullet.y, 4, 10);
        
        // Bullet trail
        ctx.fillStyle = bullet.color + '44';
        ctx.fillRect(bullet.x - 2, bullet.y + 10, 4, 10);
    });
    
    // Draw enemies
    state.enemies.forEach(enemy => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = enemy.color;
        ctx.fillStyle = enemy.color;
        
        if (enemy.type === 'BOSS') {
            // Boss shape
            ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
            
            // Boss HP bar
            ctx.fillStyle = '#f00';
            ctx.fillRect(enemy.x, enemy.y - 10, enemy.width, 5);
            ctx.fillStyle = '#0f0';
            ctx.fillRect(enemy.x, enemy.y - 10, enemy.width * (enemy.hp / enemy.maxHp), 5);
        } else {
            // Regular enemy shape
            ctx.beginPath();
            ctx.moveTo(enemy.x + enemy.width/2, enemy.y + enemy.height);
            ctx.lineTo(enemy.x, enemy.y);
            ctx.lineTo(enemy.x + enemy.width, enemy.y);
            ctx.closePath();
            ctx.fill();
        }
        
        ctx.shadowBlur = 0;
    });
    
    // Draw power-ups
    state.powerUps.forEach(pu => {
        ctx.shadowBlur = 15;
        ctx.shadowColor = pu.color;
        ctx.fillStyle = pu.color;
        ctx.fillRect(pu.x, pu.y, pu.width, pu.height);
        
        // Power-up icon
        ctx.fillStyle = '#000';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        const icon = pu.type === 'SHIELD' ? '🛡️' : 
                     pu.type === 'MULTI_SHOT' ? '⚡' : 
                     pu.type === 'HBAR_BLAST' ? '💰' : '⏱️';
        ctx.fillText(icon, pu.x + pu.width/2, pu.y + pu.height/2 + 5);
        ctx.shadowBlur = 0;
    });
    
    // Draw particles
    state.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / 30;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.globalAlpha = 1;
    });
}

// Game Loop
function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Start Game
function startGame() {
    state.score = 0;
    state.wave = 1;
    state.lives = 3;
    state.hbarEarned = 0;
    state.enemies = [];
    state.bullets = [];
    state.particles = [];
    state.powerUps = [];
    state.isPlaying = true;
    state.isPaused = false;
    state.achievements = [];
    
    player.x = CANVAS_WIDTH / 2 - 20;
    
    screens.start.classList.add('hidden');
    screens.gameOver.classList.add('hidden');
    
    spawnWave(1);
    updateUI();
    
    logHCS('GAME_START', 'New game started!');
}

// Restart Game
document.getElementById('restart-btn').addEventListener('click', startGame);
document.getElementById('start-btn').addEventListener('click', startGame);

// Connect Wallet (placeholder)
document.getElementById('connect-wallet-btn').addEventListener('click', () => {
    logHCS('WALLET', 'Wallet connection requested (placeholder)');
    alert('Wallet integration coming soon! Play as guest for now.');
});

// Continue (1 HBAR)
document.getElementById('continue-btn').addEventListener('click', () => {
    if (state.lives === 0) {
        state.lives = 1;
        state.isPlaying = true;
        screens.gameOver.classList.add('hidden');
        updateUI();
        logHCS('CONTINUE', 'Player continued with 1 HBAR!');
    }
});

// Start game loop
gameLoop();

// Initial log
logHCS('SYSTEM', 'Vera Defender loaded. Ready to defend the network!');
