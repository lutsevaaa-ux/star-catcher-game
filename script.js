const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const livesEl = document.getElementById("lives");
const timeEl = document.getElementById("time");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayKicker = document.getElementById("overlayKicker");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");

const BEST_SCORE_KEY = "starCatcherBestScore";
const GAME_SECONDS = 60;
const START_LIVES = 3;
const STAR_POINTS = 10;

let score = 0;
let lives = START_LIVES;
let timeLeft = GAME_SECONDS;
let bestScore = Number(localStorage.getItem(BEST_SCORE_KEY) || 0);
let objects = [];
let particles = [];
let stars = [];
let player = {
  x: 0,
  y: 0,
  width: 116,
  height: 28,
  speed: 560
};

let keys = new Set();
let gameState = "ready";
let lastFrame = 0;
let elapsed = 0;
let spawnTimer = 0;
let animationId = null;
let pointerActive = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;

  canvas.width = Math.max(320, Math.floor(rect.width * scale));
  canvas.height = Math.max(320, Math.floor(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const width = rect.width;
  const height = rect.height;
  player.width = clamp(width * 0.13, 82, 132);
  player.height = clamp(height * 0.052, 24, 34);
  player.x = clamp(player.x || width / 2 - player.width / 2, 10, width - player.width - 10);
  player.y = height - player.height - 26;
  buildBackgroundStars(width, height);
}

function buildBackgroundStars(width, height) {
  const count = Math.round(clamp((width * height) / 7600, 42, 130));
  stars = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height * 0.84,
    radius: Math.random() * 1.6 + 0.4,
    alpha: Math.random() * 0.55 + 0.2
  }));
}

function resetGame() {
  const rect = canvas.getBoundingClientRect();
  score = 0;
  lives = START_LIVES;
  timeLeft = GAME_SECONDS;
  elapsed = 0;
  spawnTimer = 0;
  objects = [];
  particles = [];
  player.x = rect.width / 2 - player.width / 2;
  player.y = rect.height - player.height - 26;
  updateHud();
}

function startGame() {
  resetGame();
  gameState = "playing";
  overlay.classList.remove("is-visible");
  lastFrame = performance.now();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
}

function endGame() {
  gameState = "ended";
  const previousBest = bestScore;
  bestScore = Math.max(bestScore, score);
  localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
  updateHud();

  overlayKicker.textContent = score > previousBest ? "Новый результат" : "Финиш";
  overlayTitle.textContent = `${score} очков`;
  overlayText.textContent = `Рекорд: ${bestScore}`;
  startButton.textContent = "Сыграть снова";
  overlay.classList.add("is-visible");
}

function updateHud() {
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  timeEl.textContent = Math.ceil(timeLeft);
  bestEl.textContent = bestScore;
}

function spawnObject() {
  const rect = canvas.getBoundingClientRect();
  const difficulty = 1 + elapsed / 35;
  const isMeteor = Math.random() < clamp(0.22 + elapsed / 260, 0.22, 0.38);
  const size = isMeteor
    ? Math.random() * 13 + 22
    : Math.random() * 10 + 20;

  objects.push({
    type: isMeteor ? "meteor" : "star",
    x: Math.random() * (rect.width - size * 2) + size,
    y: -size - 8,
    size,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 3.4,
    speed: (isMeteor ? 155 : 120) * difficulty + Math.random() * 70
  });
}

function update(delta) {
  const rect = canvas.getBoundingClientRect();
  elapsed += delta;
  timeLeft = Math.max(0, GAME_SECONDS - elapsed);

  const move = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0)
    - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);

  if (!pointerActive && move !== 0) {
    player.x += move * player.speed * delta;
  }

  player.x = clamp(player.x, 10, rect.width - player.width - 10);
  player.y = rect.height - player.height - 26;

  spawnTimer -= delta;
  if (spawnTimer <= 0) {
    spawnObject();
    spawnTimer = clamp(0.72 - elapsed * 0.006, 0.28, 0.72);
  }

  for (const item of objects) {
    item.y += item.speed * delta;
    item.rotation += item.spin * delta;
  }

  for (const particle of particles) {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta;
  }

  particles = particles.filter((particle) => particle.life > 0);
  resolveCollisions(rect.height);

  if (timeLeft <= 0 || lives <= 0) {
    endGame();
  }

  updateHud();
}

function resolveCollisions(height) {
  const nextObjects = [];
  const basketTop = player.y + player.height * 0.18;
  const basketLeft = player.x - 6;
  const basketRight = player.x + player.width + 6;

  for (const item of objects) {
    const hitX = item.x + item.size > basketLeft && item.x - item.size < basketRight;
    const hitY = item.y + item.size > basketTop && item.y - item.size < player.y + player.height;

    if (hitX && hitY) {
      if (item.type === "star") {
        score += STAR_POINTS;
        burst(item.x, item.y, "#ffd45a", 12);
      } else {
        lives -= 1;
        shakeBasket();
        burst(item.x, item.y, "#f06b56", 14);
      }
      continue;
    }

    if (item.y - item.size < height + 40) {
      nextObjects.push(item);
    }
  }

  objects = nextObjects;
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 140 + 40;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: Math.random() * 3 + 1.5,
      color,
      life: Math.random() * 0.42 + 0.24
    });
  }
}

function shakeBasket() {
  player.x += (Math.random() - 0.5) * 18;
}

function drawBackground(width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#07111f");
  sky.addColorStop(0.58, "#10243b");
  sky.addColorStop(1, "#163248");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  for (const star of stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const ground = ctx.createLinearGradient(0, height - 92, 0, height);
  ground.addColorStop(0, "rgba(13, 48, 61, 0)");
  ground.addColorStop(1, "rgba(31, 83, 86, 0.62)");
  ctx.fillStyle = ground;
  ctx.fillRect(0, height - 92, width, 92);
}

function drawStar(x, y, radius, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();

  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const pointRadius = i % 2 === 0 ? radius : radius * 0.45;
    ctx.lineTo(Math.cos(angle) * pointRadius, Math.sin(angle) * pointRadius);
  }

  ctx.closePath();
  ctx.fillStyle = "#ffd45a";
  ctx.shadowColor = "rgba(255, 212, 90, 0.9)";
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#fff2a8";
  ctx.stroke();
  ctx.restore();
}

function drawMeteor(x, y, radius, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const tail = ctx.createLinearGradient(-radius * 2.4, 0, radius, 0);
  tail.addColorStop(0, "rgba(240, 107, 86, 0)");
  tail.addColorStop(1, "rgba(255, 161, 92, 0.62)");
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.ellipse(-radius * 0.9, 0, radius * 1.9, radius * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f06b56";
  ctx.shadowColor = "rgba(240, 107, 86, 0.85)";
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffb46f";
  ctx.beginPath();
  ctx.arc(radius * 0.18, -radius * 0.18, radius * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBasket() {
  const x = player.x;
  const y = player.y;
  const width = player.width;
  const height = player.height;

  ctx.save();
  ctx.shadowColor = "rgba(101, 214, 206, 0.35)";
  ctx.shadowBlur = 18;

  ctx.fillStyle = "#65d6ce";
  ctx.beginPath();
  ctx.roundRect(x, y + height * 0.28, width, height * 0.56, 8);
  ctx.fill();

  ctx.fillStyle = "#25566a";
  ctx.beginPath();
  ctx.roundRect(x + 8, y + height * 0.36, width - 16, height * 0.34, 6);
  ctx.fill();

  ctx.lineWidth = 5;
  ctx.strokeStyle = "#d2fff8";
  ctx.beginPath();
  ctx.arc(x + width / 2, y + height * 0.36, width * 0.38, Math.PI, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const particle of particles) {
    ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  drawBackground(width, height);

  for (const item of objects) {
    if (item.type === "star") {
      drawStar(item.x, item.y, item.size * 0.72, item.rotation);
    } else {
      drawMeteor(item.x, item.y, item.size * 0.76, item.rotation);
    }
  }

  drawParticles();
  drawBasket();
}

function loop(now) {
  const delta = Math.min((now - lastFrame) / 1000, 0.033);
  lastFrame = now;

  if (gameState === "playing") {
    update(delta);
  }

  draw();
  animationId = requestAnimationFrame(loop);
}

function setPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  player.x = clamp(x - player.width / 2, 10, rect.width - player.width - 10);
}

startButton.addEventListener("click", startGame);

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }

  if ((event.code === "Space" || event.code === "Enter") && gameState !== "playing") {
    startGame();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

canvas.addEventListener("pointerdown", (event) => {
  pointerActive = true;
  canvas.setPointerCapture(event.pointerId);
  setPointerPosition(event);
});

canvas.addEventListener("pointermove", (event) => {
  if (pointerActive) {
    setPointerPosition(event);
  }
});

canvas.addEventListener("pointerup", () => {
  pointerActive = false;
});

canvas.addEventListener("pointercancel", () => {
  pointerActive = false;
});

window.addEventListener("resize", () => {
  resizeCanvas();
  draw();
});

bestEl.textContent = bestScore;
resizeCanvas();
resetGame();
draw();
