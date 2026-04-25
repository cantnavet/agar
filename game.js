(function () {
    const ENEMY_NAMES = [
        '小红', '大蓝', '绿巨人', '金闪闪', '紫霞', '橙子', '青蛇',
        '粉红豹', '黑旋风', '白银', '青铜', '钻石', '翡翠', '琥珀',
        '珊瑚', '星辰', '月光', '烈焰', '冰霜', '雷霆', '暗影',
        '幻影', '极光', '彗星', '流星', '银河', '黑洞', '超新星'
    ];

    const CELL_COLORS = [
        '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff',
        '#5f27cd', '#01a3a4', '#f368e0', '#ff6348', '#7bed9f',
        '#70a1ff', '#ffa502', '#2ed573', '#ff4757', '#eccc68',
        '#a29bfe', '#fd79a8', '#00cec9', '#e17055', '#6c5ce7'
    ];

    const FOOD_COLORS = [
        '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff',
        '#5f27cd', '#01a3a4', '#f368e0', '#ff6348', '#7bed9f',
        '#70a1ff', '#ffa502', '#2ed573', '#ff4757', '#eccc68',
        '#a29bfe', '#fd79a8', '#00cec9', '#e17055', '#6c5ce7',
        '#fdcb6e', '#e84393', '#00b894', '#636e72', '#d63031'
    ];

    const DIFFICULTY_CONFIG = {
        easy: {
            aiSpeed: 0.6,
            reactionDelay: 60,
            huntRange: 200,
            fleeRange: 150,
            foodSeekRange: 300,
            splitChance: 0,
            ejectChance: 0,
            decisionInterval: 90,
            initialMass: 30,
            maxMass: 300
        },
        medium: {
            aiSpeed: 0.8,
            reactionDelay: 30,
            huntRange: 400,
            fleeRange: 300,
            foodSeekRange: 500,
            splitChance: 0.002,
            ejectChance: 0.001,
            decisionInterval: 45,
            initialMass: 40,
            maxMass: 600
        },
        hard: {
            aiSpeed: 1.0,
            reactionDelay: 10,
            huntRange: 600,
            fleeRange: 400,
            foodSeekRange: 800,
            splitChance: 0.005,
            ejectChance: 0.003,
            decisionInterval: 20,
            initialMass: 50,
            maxMass: 1000
        }
    };

    let canvas, ctx, minimapCanvas, minimapCtx;
    let gameRunning = false;
    let animFrameId = null;
    let startTime = 0;

    let settings = {
        playerName: '玩家',
        enemyCount: 5,
        difficulty: 'medium',
        mapSize: 4000,
        foodCount: 200
    };

    let camera = { x: 0, y: 0, zoom: 1 };
    let mouse = { x: 0, y: 0 };
    let player = null;
    let enemies = [];
    let foods = [];
    let ejectedMass = [];
    let particles = [];
    let frameCount = 0;

    function randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    function distance(a, b) {
        return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
    }

    function massToRadius(mass) {
        return Math.sqrt(mass) * 4;
    }

    function speedFromMass(mass) {
        return Math.max(1.5, 5 * Math.pow(30 / mass, 0.3));
    }

    function createCell(x, y, mass, color, name, isPlayer) {
        return {
            x: x,
            y: y,
            mass: mass,
            color: color,
            name: name,
            isPlayer: !!isPlayer,
            vx: 0,
            vy: 0,
            targetX: x,
            targetY: y,
            decisionTimer: 0,
            currentBehavior: 'wander',
            wanderAngle: Math.random() * Math.PI * 2,
            alive: true,
            mergeTimer: 0,
            cells: [{ x: x, y: y, mass: mass, vx: 0, vy: 0, mergeTimer: 0 }]
        };
    }

    function createFood(count) {
        foods = [];
        for (let i = 0; i < count; i++) {
            spawnFood();
        }
    }

    function spawnFood() {
        foods.push({
            x: randomRange(50, settings.mapSize - 50),
            y: randomRange(50, settings.mapSize - 50),
            radius: randomRange(4, 7),
            color: FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)]
        });
    }

    function createEnemies(count) {
        enemies = [];
        const config = DIFFICULTY_CONFIG[settings.difficulty];
        for (let i = 0; i < count; i++) {
            const x = randomRange(200, settings.mapSize - 200);
            const y = randomRange(200, settings.mapSize - 200);
            const mass = config.initialMass + randomRange(-10, 30);
            const color = CELL_COLORS[i % CELL_COLORS.length];
            const name = ENEMY_NAMES[i % ENEMY_NAMES.length];
            const enemy = createCell(x, y, mass, color, name, false);
            enemy.decisionTimer = Math.floor(Math.random() * config.decisionInterval);
            enemies.push(enemy);
        }
    }

    function initPlayer() {
        const x = settings.mapSize / 2;
        const y = settings.mapSize / 2;
        player = createCell(x, y, 30, '#48dbfb', settings.playerName, true);
    }

    function getTotalMass(cell) {
        return cell.cells.reduce((sum, c) => sum + c.mass, 0);
    }

    function getCenterX(cell) {
        let totalMass = 0;
        let cx = 0;
        for (const c of cell.cells) {
            cx += c.x * c.mass;
            totalMass += c.mass;
        }
        return cx / totalMass;
    }

    function getCenterY(cell) {
        let totalMass = 0;
        let cy = 0;
        for (const c of cell.cells) {
            cy += c.y * c.mass;
            totalMass += c.mass;
        }
        return cy / totalMass;
    }

    function moveCellPart(part, targetX, targetY, speed) {
        const dx = targetX - part.x;
        const dy = targetY - part.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) return;
        const moveSpeed = Math.min(speed, dist);
        part.x += (dx / dist) * moveSpeed;
        part.y += (dy / dist) * moveSpeed;
        part.x = Math.max(massToRadius(part.mass), Math.min(settings.mapSize - massToRadius(part.mass), part.x));
        part.y = Math.max(massToRadius(part.mass), Math.min(settings.mapSize - massToRadius(part.mass), part.y));
    }

    function updatePlayer() {
        if (!player || !player.alive) return;

        const centerX = getCenterX(player);
        const centerY = getCenterY(player);
        const worldMouseX = (mouse.x - canvas.width / 2) / camera.zoom + camera.x;
        const worldMouseY = (mouse.y - canvas.height / 2) / camera.zoom + camera.y;

        for (const part of player.cells) {
            if (part.vx || part.vy) {
                part.x += part.vx;
                part.y += part.vy;
                part.vx *= 0.88;
                part.vy *= 0.88;
                if (Math.abs(part.vx) < 0.3) part.vx = 0;
                if (Math.abs(part.vy) < 0.3) part.vy = 0;
                part.x = Math.max(massToRadius(part.mass), Math.min(settings.mapSize - massToRadius(part.mass), part.x));
                part.y = Math.max(massToRadius(part.mass), Math.min(settings.mapSize - massToRadius(part.mass), part.y));
            } else {
                const speed = speedFromMass(part.mass);
                moveCellPart(part, worldMouseX, worldMouseY, speed);
            }
        }

        separatePlayerCells();
        mergePlayerCells();
        checkFoodCollision(player);
        checkEjectedMassCollision(player);
    }

    function separatePlayerCells() {
        if (!player) return;
        for (let i = 0; i < player.cells.length; i++) {
            for (let j = i + 1; j < player.cells.length; j++) {
                const a = player.cells[i];
                const b = player.cells[j];
                const dist = distance(a, b);
                const minDist = massToRadius(a.mass) + massToRadius(b.mass);
                if (dist < minDist && (a.mergeTimer > 0 || b.mergeTimer > 0)) {
                    const overlap = minDist - dist;
                    if (dist < 0.01) continue;
                    const pushX = ((a.x - b.x) / dist) * overlap * 0.3;
                    const pushY = ((a.y - b.y) / dist) * overlap * 0.3;
                    a.x += pushX;
                    a.y += pushY;
                    b.x -= pushX;
                    b.y -= pushY;
                }
            }
        }
    }

    function mergePlayerCells() {
        if (!player) return;
        for (let i = 0; i < player.cells.length; i++) {
            if (player.cells[i].mergeTimer > 0) {
                player.cells[i].mergeTimer--;
            }
        }
        for (let i = player.cells.length - 1; i >= 0; i--) {
            for (let j = i - 1; j >= 0; j--) {
                const a = player.cells[i];
                const b = player.cells[j];
                if (a.mergeTimer > 0 || b.mergeTimer > 0) continue;
                const dist = distance(a, b);
                const minDist = massToRadius(a.mass) + massToRadius(b.mass);
                if (dist < minDist * 0.5) {
                    b.mass += a.mass;
                    player.cells.splice(i, 1);
                    break;
                }
            }
        }
    }

    function updateEnemies() {
        const config = DIFFICULTY_CONFIG[settings.difficulty];

        for (const enemy of enemies) {
            if (!enemy.alive) continue;

            enemy.decisionTimer--;
            if (enemy.decisionTimer <= 0) {
                enemy.decisionTimer = config.decisionInterval + Math.floor(Math.random() * 20);
                decideBehavior(enemy, config);
            }

            const centerX = getCenterX(enemy);
            const centerY = getCenterY(enemy);

            if (Math.random() < config.splitChance && enemy.cells.length < 8) {
                splitEnemy(enemy);
            }

            for (const part of enemy.cells) {
                if (part.vx || part.vy) {
                    part.x += part.vx;
                    part.y += part.vy;
                    part.vx *= 0.88;
                    part.vy *= 0.88;
                    if (Math.abs(part.vx) < 0.3) part.vx = 0;
                    if (Math.abs(part.vy) < 0.3) part.vy = 0;
                    part.x = Math.max(massToRadius(part.mass), Math.min(settings.mapSize - massToRadius(part.mass), part.x));
                    part.y = Math.max(massToRadius(part.mass), Math.min(settings.mapSize - massToRadius(part.mass), part.y));
                } else {
                    const speed = speedFromMass(part.mass) * config.aiSpeed;
                    moveCellPart(part, enemy.targetX, enemy.targetY, speed);
                }
            }

            separateEnemyCells(enemy);
            mergeEnemyCells(enemy);
            checkFoodCollision(enemy);
            checkEjectedMassCollision(enemy);
        }
    }

    function separateEnemyCells(enemy) {
        for (let i = 0; i < enemy.cells.length; i++) {
            for (let j = i + 1; j < enemy.cells.length; j++) {
                const a = enemy.cells[i];
                const b = enemy.cells[j];
                const dist = distance(a, b);
                const minDist = massToRadius(a.mass) + massToRadius(b.mass);
                if (dist < minDist && (a.mergeTimer > 0 || b.mergeTimer > 0)) {
                    const overlap = minDist - dist;
                    if (dist < 0.01) continue;
                    const pushX = ((a.x - b.x) / dist) * overlap * 0.3;
                    const pushY = ((a.y - b.y) / dist) * overlap * 0.3;
                    a.x += pushX;
                    a.y += pushY;
                    b.x -= pushX;
                    b.y -= pushY;
                }
            }
        }
    }

    function mergeEnemyCells(enemy) {
        for (let i = 0; i < enemy.cells.length; i++) {
            if (enemy.cells[i].mergeTimer > 0) {
                enemy.cells[i].mergeTimer--;
            }
        }
        for (let i = enemy.cells.length - 1; i >= 0; i--) {
            for (let j = i - 1; j >= 0; j--) {
                const a = enemy.cells[i];
                const b = enemy.cells[j];
                if (a.mergeTimer > 0 || b.mergeTimer > 0) continue;
                const dist = distance(a, b);
                const minDist = massToRadius(a.mass) + massToRadius(b.mass);
                if (dist < minDist * 0.5) {
                    b.mass += a.mass;
                    enemy.cells.splice(i, 1);
                    break;
                }
            }
        }
    }

    function decideBehavior(enemy, config) {
        const centerX = getCenterX(enemy);
        const centerY = getCenterY(enemy);
        const enemyMass = getTotalMass(enemy);

        let nearestThreat = null;
        let nearestThreatDist = Infinity;
        let nearestPrey = null;
        let nearestPreyDist = Infinity;
        let nearestFood = null;
        let nearestFoodDist = Infinity;

        if (player && player.alive) {
            const playerCenterX = getCenterX(player);
            const playerCenterY = getCenterY(player);
            const playerMass = getTotalMass(player);
            const dist = distance({ x: centerX, y: centerY }, { x: playerCenterX, y: playerCenterY });

            if (playerMass > enemyMass * 1.2 && dist < config.fleeRange) {
                nearestThreat = { x: playerCenterX, y: playerCenterY };
                nearestThreatDist = dist;
            } else if (enemyMass > playerMass * 1.2 && dist < config.huntRange) {
                nearestPrey = { x: playerCenterX, y: playerCenterY };
                nearestPreyDist = dist;
            }
        }

        for (const other of enemies) {
            if (other === enemy || !other.alive) continue;
            const otherCenterX = getCenterX(other);
            const otherCenterY = getCenterY(other);
            const otherMass = getTotalMass(other);
            const dist = distance({ x: centerX, y: centerY }, { x: otherCenterX, y: otherCenterY });

            if (otherMass > enemyMass * 1.2 && dist < config.fleeRange && dist < nearestThreatDist) {
                nearestThreat = { x: otherCenterX, y: otherCenterY };
                nearestThreatDist = dist;
            } else if (enemyMass > otherMass * 1.2 && dist < config.huntRange && dist < nearestPreyDist) {
                nearestPrey = { x: otherCenterX, y: otherCenterY };
                nearestPreyDist = dist;
            }
        }

        for (const food of foods) {
            const dist = distance({ x: centerX, y: centerY }, food);
            if (dist < config.foodSeekRange && dist < nearestFoodDist) {
                nearestFood = food;
                nearestFoodDist = dist;
            }
        }

        if (nearestThreat && nearestThreatDist < config.fleeRange) {
            enemy.currentBehavior = 'flee';
            const dx = centerX - nearestThreat.x;
            const dy = centerY - nearestThreat.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            enemy.targetX = centerX + (dx / dist) * 500;
            enemy.targetY = centerY + (dy / dist) * 500;
        } else if (nearestPrey && nearestPreyDist < config.huntRange) {
            enemy.currentBehavior = 'hunt';
            enemy.targetX = nearestPrey.x;
            enemy.targetY = nearestPrey.y;
        } else if (nearestFood) {
            enemy.currentBehavior = 'seekFood';
            enemy.targetX = nearestFood.x;
            enemy.targetY = nearestFood.y;
        } else {
            enemy.currentBehavior = 'wander';
            enemy.wanderAngle += randomRange(-0.5, 0.5);
            enemy.targetX = centerX + Math.cos(enemy.wanderAngle) * 300;
            enemy.targetY = centerY + Math.sin(enemy.wanderAngle) * 300;
        }

        enemy.targetX = Math.max(50, Math.min(settings.mapSize - 50, enemy.targetX));
        enemy.targetY = Math.max(50, Math.min(settings.mapSize - 50, enemy.targetY));
    }

    function checkFoodCollision(cell) {
        for (const part of cell.cells) {
            const r = massToRadius(part.mass);
            for (let i = foods.length - 1; i >= 0; i--) {
                const food = foods[i];
                const dist = distance(part, food);
                if (dist < r + food.radius) {
                    part.mass += food.radius * 0.5;
                    spawnParticle(food.x, food.y, food.color, 3);
                    foods.splice(i, 1);
                    spawnFood();
                }
            }
        }
    }

    function checkEjectedMassCollision(cell) {
        for (const part of cell.cells) {
            const r = massToRadius(part.mass);
            for (let i = ejectedMass.length - 1; i >= 0; i--) {
                const em = ejectedMass[i];
                const dist = distance(part, em);
                if (dist < r) {
                    part.mass += em.mass;
                    ejectedMass.splice(i, 1);
                }
            }
        }
    }

    function checkCellCollision() {
        const allCells = [];
        if (player && player.alive) allCells.push(player);
        for (const e of enemies) {
            if (e.alive) allCells.push(e);
        }

        for (let i = 0; i < allCells.length; i++) {
            for (let j = i + 1; j < allCells.length; j++) {
                const a = allCells[i];
                const b = allCells[j];
                if (!a.alive || !b.alive) continue;

                for (let ci = a.cells.length - 1; ci >= 0; ci--) {
                    const partA = a.cells[ci];
                    for (let cj = b.cells.length - 1; cj >= 0; cj--) {
                        const partB = b.cells[cj];
                        const dist = distance(partA, partB);
                        const rA = massToRadius(partA.mass);
                        const rB = massToRadius(partB.mass);

                        if (partA.mass > partB.mass * 1.2 && dist < rA - rB * 0.4) {
                            partA.mass += partB.mass;
                            spawnParticle(partB.x, partB.y, b.color, 8);
                            b.cells.splice(cj, 1);
                            if (b.cells.length === 0) {
                                b.alive = false;
                                if (b.isPlayer) {
                                    gameOver();
                                } else {
                                    respawnEnemy(b);
                                }
                            }
                        } else if (partB.mass > partA.mass * 1.2 && dist < rB - rA * 0.4) {
                            partB.mass += partA.mass;
                            spawnParticle(partA.x, partA.y, a.color, 8);
                            a.cells.splice(ci, 1);
                            if (a.cells.length === 0) {
                                a.alive = false;
                                if (a.isPlayer) {
                                    gameOver();
                                } else {
                                    respawnEnemy(a);
                                }
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    function respawnEnemy(enemy) {
        const config = DIFFICULTY_CONFIG[settings.difficulty];
        const x = randomRange(200, settings.mapSize - 200);
        const y = randomRange(200, settings.mapSize - 200);
        enemy.x = x;
        enemy.y = y;
        enemy.mass = config.initialMass + randomRange(-10, 20);
        enemy.alive = true;
        enemy.cells = [{ x: x, y: y, mass: enemy.mass, vx: 0, vy: 0, mergeTimer: 0 }];
        enemy.decisionTimer = Math.floor(Math.random() * config.decisionInterval);
        enemy.wanderAngle = Math.random() * Math.PI * 2;
    }

    function splitPlayer() {
        if (!player || !player.alive) return;
        const newCells = [];
        for (const part of player.cells) {
            if (player.cells.length + newCells.length >= 16) break;
            if (part.mass < 30) continue;

            const newMass = part.mass / 2;
            part.mass = newMass;

            const worldMouseX = (mouse.x - canvas.width / 2) / camera.zoom + camera.x;
            const worldMouseY = (mouse.y - canvas.height / 2) / camera.zoom + camera.y;
            const dx = worldMouseX - part.x;
            const dy = worldMouseY - part.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            const newPart = {
                x: part.x + (dx / dist) * massToRadius(newMass) * 2,
                y: part.y + (dy / dist) * massToRadius(newMass) * 2,
                mass: newMass,
                vx: (dx / dist) * 15,
                vy: (dy / dist) * 15,
                mergeTimer: 300
            };
            part.mergeTimer = 300;
            newCells.push(newPart);
        }
        player.cells.push(...newCells);
    }

    function splitEnemy(enemy) {
        if (!enemy || !enemy.alive) return;
        const newCells = [];
        for (const part of enemy.cells) {
            if (enemy.cells.length + newCells.length >= 8) break;
            if (part.mass < 30) continue;

            const newMass = part.mass / 2;
            part.mass = newMass;

            const dx = enemy.targetX - part.x;
            const dy = enemy.targetY - part.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            const newPart = {
                x: part.x + (dx / dist) * massToRadius(newMass) * 2,
                y: part.y + (dy / dist) * massToRadius(newMass) * 2,
                mass: newMass,
                vx: (dx / dist) * 15,
                vy: (dy / dist) * 15,
                mergeTimer: 300
            };
            part.mergeTimer = 300;
            newCells.push(newPart);
        }
        enemy.cells.push(...newCells);
    }

    function ejectMass() {
        if (!player || !player.alive) return;
        for (const part of player.cells) {
            if (part.mass < 40) continue;
            part.mass -= 8;

            const worldMouseX = (mouse.x - canvas.width / 2) / camera.zoom + camera.x;
            const worldMouseY = (mouse.y - canvas.height / 2) / camera.zoom + camera.y;
            const dx = worldMouseX - part.x;
            const dy = worldMouseY - part.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            ejectedMass.push({
                x: part.x + (dx / dist) * massToRadius(part.mass),
                y: part.y + (dy / dist) * massToRadius(part.mass),
                mass: 8,
                color: player.color,
                vx: (dx / dist) * 20,
                vy: (dy / dist) * 20
            });
        }
    }

    function updateEjectedMass() {
        for (let i = ejectedMass.length - 1; i >= 0; i--) {
            const em = ejectedMass[i];
            em.x += em.vx;
            em.y += em.vy;
            em.vx *= 0.9;
            em.vy *= 0.9;
            em.x = Math.max(10, Math.min(settings.mapSize - 10, em.x));
            em.y = Math.max(10, Math.min(settings.mapSize - 10, em.y));
            if (Math.abs(em.vx) < 0.1 && Math.abs(em.vy) < 0.1) {
                em.vx = 0;
                em.vy = 0;
            }
        }
    }

    function spawnParticle(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: x,
                y: y,
                vx: randomRange(-3, 3),
                vy: randomRange(-3, 3),
                radius: randomRange(2, 5),
                color: color,
                life: 30
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            p.radius *= 0.95;
            if (p.life <= 0 || p.radius < 0.5) {
                particles.splice(i, 1);
            }
        }
    }

    function updateCamera() {
        if (!player || !player.alive) return;
        const centerX = getCenterX(player);
        const centerY = getCenterY(player);
        const totalMass = getTotalMass(player);
        const targetZoom = Math.max(0.15, Math.min(1, 50 / Math.sqrt(totalMass)));

        camera.x += (centerX - camera.x) * 0.1;
        camera.y += (centerY - camera.y) * 0.1;
        camera.zoom += (targetZoom - camera.zoom) * 0.05;
    }

    function updateLeaderboard() {
        const allCells = [];
        if (player && player.alive) {
            allCells.push({ name: player.name, mass: getTotalMass(player), isPlayer: true });
        }
        for (const e of enemies) {
            if (e.alive) {
                allCells.push({ name: e.name, mass: getTotalMass(e), isPlayer: false });
            }
        }
        allCells.sort((a, b) => b.mass - a.mass);

        const list = document.getElementById('leaderboard-list');
        list.innerHTML = '';
        const top10 = allCells.slice(0, 10);
        for (const entry of top10) {
            const li = document.createElement('li');
            li.className = entry.isPlayer ? 'me' : '';
            li.innerHTML = `<span>${entry.name}</span><span>${Math.floor(entry.mass)}</span>`;
            list.appendChild(li);
        }
    }

    function updateScore() {
        if (!player) return;
        const score = Math.floor(getTotalMass(player));
        document.getElementById('score').textContent = score;
    }

    function drawGrid() {
        const gridSize = 50;
        const startX = Math.floor((camera.x - canvas.width / 2 / camera.zoom) / gridSize) * gridSize;
        const startY = Math.floor((camera.y - canvas.height / 2 / camera.zoom) / gridSize) * gridSize;
        const endX = camera.x + canvas.width / 2 / camera.zoom;
        const endY = camera.y + canvas.height / 2 / camera.zoom;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = startX; x < endX; x += gridSize) {
            const sx = (x - camera.x) * camera.zoom + canvas.width / 2;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, canvas.height);
        }
        for (let y = startY; y < endY; y += gridSize) {
            const sy = (y - camera.y) * camera.zoom + canvas.height / 2;
            ctx.moveTo(0, sy);
            ctx.lineTo(canvas.width, sy);
        }
        ctx.stroke();
    }

    function drawBorder() {
        ctx.strokeStyle = '#ff4757';
        ctx.lineWidth = 4 * camera.zoom;
        const bx = (0 - camera.x) * camera.zoom + canvas.width / 2;
        const by = (0 - camera.y) * camera.zoom + canvas.height / 2;
        const bw = settings.mapSize * camera.zoom;
        const bh = settings.mapSize * camera.zoom;
        ctx.strokeRect(bx, by, bw, bh);
    }

    function worldToScreen(wx, wy) {
        return {
            x: (wx - camera.x) * camera.zoom + canvas.width / 2,
            y: (wy - camera.y) * camera.zoom + canvas.height / 2
        };
    }

    function isOnScreen(wx, wy, radius) {
        const s = worldToScreen(wx, wy);
        const sr = radius * camera.zoom;
        return s.x + sr > 0 && s.x - sr < canvas.width && s.y + sr > 0 && s.y - sr < canvas.height;
    }

    function drawFood() {
        for (const food of foods) {
            if (!isOnScreen(food.x, food.y, food.radius)) continue;
            const s = worldToScreen(food.x, food.y);
            const r = food.radius * camera.zoom;
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fillStyle = food.color;
            ctx.fill();
        }
    }

    function drawEjectedMass() {
        for (const em of ejectedMass) {
            if (!isOnScreen(em.x, em.y, 10)) continue;
            const s = worldToScreen(em.x, em.y);
            const r = Math.sqrt(em.mass) * 2 * camera.zoom;
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fillStyle = em.color;
            ctx.globalAlpha = 0.7;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function drawCell(cell) {
        if (!cell.alive) return;
        for (const part of cell.cells) {
            if (!isOnScreen(part.x, part.y, massToRadius(part.mass))) continue;
            const s = worldToScreen(part.x, part.y);
            const r = massToRadius(part.mass) * camera.zoom;

            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fillStyle = cell.color;
            ctx.fill();

            ctx.strokeStyle = 'rgba(0,0,0,0.2)';
            ctx.lineWidth = Math.max(1, r * 0.05);
            ctx.stroke();

            if (r > 15) {
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${Math.max(10, r * 0.4)}px 'Segoe UI', sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeStyle = 'rgba(0,0,0,0.4)';
                ctx.lineWidth = Math.max(1, r * 0.04);
                ctx.strokeText(cell.name, s.x, s.y);
                ctx.fillText(cell.name, s.x, s.y);

                if (r > 25) {
                    ctx.font = `${Math.max(8, r * 0.25)}px 'Segoe UI', sans-serif`;
                    const massText = Math.floor(part.mass).toString();
                    ctx.strokeText(massText, s.x, s.y + r * 0.35);
                    ctx.fillText(massText, s.x, s.y + r * 0.35);
                }
            }
        }
    }

    function drawParticles() {
        for (const p of particles) {
            if (!isOnScreen(p.x, p.y, p.radius)) continue;
            const s = worldToScreen(p.x, p.y);
            const r = p.radius * camera.zoom;
            ctx.beginPath();
            ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life / 30;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function drawMinimap() {
        const mw = minimapCanvas.width;
        const mh = minimapCanvas.height;
        minimapCtx.clearRect(0, 0, mw, mh);

        minimapCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        minimapCtx.fillRect(0, 0, mw, mh);

        minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        minimapCtx.lineWidth = 1;
        minimapCtx.strokeRect(0, 0, mw, mh);

        const scale = mw / settings.mapSize;

        for (const e of enemies) {
            if (!e.alive) continue;
            const cx = getCenterX(e);
            const cy = getCenterY(e);
            const r = Math.max(2, Math.sqrt(getTotalMass(e)) * scale * 2);
            minimapCtx.beginPath();
            minimapCtx.arc(cx * scale, cy * scale, r, 0, Math.PI * 2);
            minimapCtx.fillStyle = e.color;
            minimapCtx.fill();
        }

        if (player && player.alive) {
            const cx = getCenterX(player);
            const cy = getCenterY(player);
            const r = Math.max(3, Math.sqrt(getTotalMass(player)) * scale * 2);
            minimapCtx.beginPath();
            minimapCtx.arc(cx * scale, cy * scale, r, 0, Math.PI * 2);
            minimapCtx.fillStyle = '#48dbfb';
            minimapCtx.fill();
            minimapCtx.strokeStyle = '#fff';
            minimapCtx.lineWidth = 1;
            minimapCtx.stroke();
        }

        const viewX = (camera.x - canvas.width / 2 / camera.zoom) * scale;
        const viewY = (camera.y - canvas.height / 2 / camera.zoom) * scale;
        const viewW = (canvas.width / camera.zoom) * scale;
        const viewH = (canvas.height / camera.zoom) * scale;
        minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        minimapCtx.lineWidth = 1;
        minimapCtx.strokeRect(viewX, viewY, viewW, viewH);
    }

    function render() {
        ctx.fillStyle = '#0a0a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        drawGrid();
        drawBorder();
        drawFood();
        drawEjectedMass();
        drawParticles();

        const allDrawable = [];
        if (player && player.alive) allDrawable.push(player);
        for (const e of enemies) {
            if (e.alive) allDrawable.push(e);
        }
        allDrawable.sort((a, b) => getTotalMass(a) - getTotalMass(b));
        for (const cell of allDrawable) {
            drawCell(cell);
        }

        drawMinimap();
    }

    function gameLoop() {
        if (!gameRunning) return;

        frameCount++;

        updatePlayer();
        updateEnemies();
        updateEjectedMass();
        checkCellCollision();
        updateParticles();
        updateCamera();
        updateScore();

        render();

        if (frameCount % 30 === 0) {
            updateLeaderboard();
        }

        animFrameId = requestAnimationFrame(gameLoop);
    }

    function gameOver() {
        gameRunning = false;
        const score = Math.floor(getTotalMass(player));
        const survivalTime = Math.floor((Date.now() - startTime) / 1000);
        document.getElementById('final-score').textContent = score;
        document.getElementById('survival-time').textContent = survivalTime;
        document.getElementById('game-over').classList.remove('hidden');
    }

    function startGame() {
        settings.playerName = document.getElementById('player-name').value || '玩家';
        settings.enemyCount = parseInt(document.getElementById('enemy-count').value);
        settings.difficulty = document.getElementById('difficulty').value;
        settings.mapSize = parseInt(document.getElementById('map-size').value);
        settings.foodCount = parseInt(document.getElementById('food-count').value);

        canvas = document.getElementById('game-canvas');
        ctx = canvas.getContext('2d');
        minimapCanvas = document.getElementById('minimap');
        minimapCtx = minimapCanvas.getContext('2d');

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        initPlayer();
        createEnemies(settings.enemyCount);
        createFood(settings.foodCount);
        ejectedMass = [];
        particles = [];

        camera.x = getCenterX(player);
        camera.y = getCenterY(player);
        camera.zoom = 1;

        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        document.getElementById('game-over').classList.add('hidden');

        gameRunning = true;
        startTime = Date.now();
        updateLeaderboard();
        gameLoop();
    }

    function restartGame() {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        gameRunning = false;
        document.getElementById('game-over').classList.add('hidden');
        startGame();
    }

    function backToMenu() {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        gameRunning = false;
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('start-screen').classList.remove('hidden');
    }

    function setupEventListeners() {
        document.getElementById('enemy-count').addEventListener('input', function () {
            document.getElementById('enemy-count-val').textContent = this.value;
        });

        document.getElementById('food-count').addEventListener('input', function () {
            document.getElementById('food-count-val').textContent = this.value;
        });

        document.getElementById('start-btn').addEventListener('click', startGame);
        document.getElementById('restart-btn').addEventListener('click', restartGame);
        document.getElementById('menu-btn').addEventListener('click', backToMenu);

        document.addEventListener('mousemove', function (e) {
            mouse.x = e.clientX;
            mouse.y = e.clientY;
        });

        document.addEventListener('keydown', function (e) {
            if (!gameRunning) return;
            if (e.code === 'Space') {
                e.preventDefault();
                splitPlayer();
            }
            if (e.code === 'KeyW') {
                e.preventDefault();
                ejectMass();
            }
        });

        window.addEventListener('resize', function () {
            if (canvas) {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            }
        });
    }

    setupEventListeners();
})();
