class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = canvas.width || 1000;
    this.height = canvas.height || 560;
    this.originX = this.width / 2;
    this.originY = this.height / 2;

    this.stadium = {
      preset: 'classic',
      theme: 'turf',
      width: 800,
      height: 400,
      halfW: 400,
      halfH: 200,
      goalWidth: 150,
      goalHalfW: 75,
      goalDepth: 70,
      postRadius: 8,
      centerCircleRadius: 80,
      posts: [],
      segments: []
    };

    // --- REPLAY SYSTEM ---
    this.historyBuffer = []; // stores last 360 frames (~6s at 60fps)
    this.maxHistory = 360;
    this.isReplaying = false;
    this.replayFrames = [];
    this.replayIndex = 0;
    this.replaySpeedTimer = 0;
    this.onReplayFinished = null;
    this.savedGoalReplays = []; // stores full goal replays for post-match review
    this.replayLabel = 'TEKRAR [0.5x]';

    // --- DYNAMIC WEATHER & STADIUM LIGHTING ---
    this.weatherMode = 'night'; // 'day', 'night', 'rain', 'sunset'
    this.rainDrops = [];
    this.rainSplashes = [];
    this.initRainParticles();

    // --- VISUAL JUICE & VFX ---
    this.ballTrail = []; // previous ball positions for neon tail
    this.confetti = [];  // goal celebration particles
    this.shakeDuration = 0;
    this.shakeIntensity = 0;

    // --- CINEMATIC CAMERA ZOOM & GOAL EFFECTS ---
    this.cameraZoom = 1.0;
    this.targetZoom = 1.0;
    this.zoomTargetX = 0;
    this.zoomTargetY = 0;
    this.goalZoomDuration = 0;

    // --- TRAINING MODE OBJECTS ---
    this.trainingMode = false;
    this.trainingDummies = [];
    this.trainingTargets = [];

    // --- GAME MODE & BOMB BALL VFX ---
    this.gameMode = 'classic';
    this.bombState = null;
    this.explosionShockwaves = [];
    this.explosionSparks = [];
    this.bumperShockwaves = [];

    // --- HIGH-PERFORMANCE SMOOTH INTERPOLATION ---
    this.smoothBall = null;
    this.smoothPlayers = new Map();

    // ResizeObserver: Only recalculates canvas size on actual DOM resize (NEVER in 60fps render loop)
    if (typeof ResizeObserver !== 'undefined' && this.canvas && this.canvas.parentElement) {
      try {
        const ro = new ResizeObserver(() => this.resize());
        ro.observe(this.canvas.parentElement);
      } catch (e) {}
    }
    this.resize();
  }

  // Dynamic canvas resize that fills the mobile/desktop viewport with crisp DPI resolution
  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);

    if (w <= 0 || h <= 0) return;
    if (w === this.width && h === this.height) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.floor(w * dpr);
    const targetH = Math.floor(h * dpr);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.originX = w / 2;
    this.originY = h / 2;
  }

  triggerGoalZoom(targetX, targetY, duration = 160) {
    this.targetZoom = 1.25;
    this.zoomTargetX = targetX || 0;
    this.zoomTargetY = targetY || 0;
    this.goalZoomDuration = duration;
  }

  initRainParticles() {
    this.rainDrops = [];
    for (let i = 0; i < 110; i++) {
      this.rainDrops.push({
        x: (Math.random() - 0.5) * (this.width + 400),
        y: (Math.random() - 0.5) * (this.height + 400),
        speed: 12 + Math.random() * 8,
        length: 14 + Math.random() * 8,
        slant: -3.5
      });
    }
  }

  setWeather(mode) {
    if (['day', 'night', 'rain', 'sunset'].includes(mode)) {
      this.weatherMode = mode;
    }
  }

  calculateBaseScale() {
    const { halfW, halfH, goalDepth } = this.stadium;
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.innerWidth <= 1024;
    const isBombMode = (this.gameMode === 'bomb' || this.stadium.noGoals);

    // Stadium outer bezel is (halfH + 56) and (halfW + 56)
    // Goal nets reach (halfW + (goalDepth || 70)), unless in enclosed bomb arena
    const effectiveGoalDepth = isBombMode ? 0 : (goalDepth || 70);
    const vertPadding = isTouch ? 28 : 26;
    const sidePadding = isTouch ? 45 : 36;

    const totalNeededH = (halfH + 56 + vertPadding) * 2;
    const totalNeededW = (halfW + effectiveGoalDepth + sidePadding) * 2;

    const scaleX = this.width / totalNeededW;
    const scaleY = this.height / totalNeededH;

    const fit = Math.min(scaleX, scaleY);
    return Math.min(1.25, Math.max(0.45, fit));
  }

  setStadium(stadiumData) {
    this.stadium = {
      ...stadiumData,
      theme: stadiumData.theme || 'turf',
      halfW: stadiumData.width / 2,
      halfH: stadiumData.height / 2,
      goalHalfW: stadiumData.goalWidth / 2,
      noGoals: !!stadiumData.noGoals,
      bumpers: stadiumData.bumpers || []
    };

    this.resize();
  }

  triggerScreenShake(intensity = 6, duration = 12) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
  }

  spawnConfetti(team) {
    const colors = team === 'red'
      ? ['#ff4d4d', '#ff1a1a', '#ff9999', '#ffffff', '#ffd166']
      : ['#3399ff', '#0066ff', '#80bfff', '#ffffff', '#ffd166'];

    for (let i = 0; i < 90; i++) {
      this.confetti.push({
        x: (Math.random() - 0.5) * this.stadium.width,
        y: -this.stadium.halfH - Math.random() * 80,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 4 + 2,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        life: 140
      });
    }
  }

  startReplay(onComplete, goalInfo = null) {
    if (this.historyBuffer.length < 30) {
      if (onComplete) onComplete();
      return;
    }

    const framesCopy = [...this.historyBuffer];

    // Archive goal replay for post-match review modal (max 5 to prevent memory leak)
    if (goalInfo) {
      if (this.savedGoalReplays.length >= 5) {
        this.savedGoalReplays.shift();
      }
      this.savedGoalReplays.push({
        scorerName: goalInfo.scorerName || 'Oyuncu',
        team: goalInfo.team || 'red',
        timeFormatted: goalInfo.timeFormatted || '00:00',
        isOwnGoal: !!goalInfo.isOwnGoal,
        milestoneText: goalInfo.milestoneText || '',
        frames: framesCopy
      });
    }

    this.isReplaying = true;
    this.currentReplayInfo = goalInfo;
    this.replayFrames = framesCopy;
    this.replayIndex = 0;
    this.replaySpeedTimer = 0;
    this.replayLabel = 'GOL TEKRARI [1.0x]';
    this.onReplayFinished = onComplete;
  }

  playSavedGoalReplay(index, onComplete) {
    const replayObj = this.savedGoalReplays[index];
    if (!replayObj || !replayObj.frames || replayObj.frames.length === 0) return;

    this.isReplaying = true;
    this.currentReplayInfo = replayObj;
    this.replayFrames = [...replayObj.frames];
    this.replayIndex = 0;
    this.replaySpeedTimer = 0;
    this.replayLabel = `GOL ANI: ${replayObj.scorerName} (${replayObj.timeFormatted})`;
    this.onReplayFinished = onComplete;
  }

  stopReplay() {
    this.isReplaying = false;
    this.currentReplayInfo = null;
    this.replayFrames = [];
    if (this.onReplayFinished) {
      this.onReplayFinished();
      this.onReplayFinished = null;
    }
  }

  recordFrame(gameState) {
    if (this.isReplaying || !gameState) return;

    this.historyBuffer.push({
      ball: { ...gameState.ball },
      players: gameState.players ? gameState.players.map(p => ({ ...p })) : []
    });

    if (this.historyBuffer.length > this.maxHistory) {
      this.historyBuffer.shift();
    }
  }

  render(liveGameState, myId) {
    const ctx = this.ctx;

    // Dark sleek stadium arena floor surrounding the pitch
    ctx.fillStyle = '#080b13';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Save live frame to history buffer
    if (!this.isReplaying && liveGameState) {
      this.recordFrame(liveGameState);
    }

    // Determine which state to render (Live vs Replay)
    let currentFrame = liveGameState;
    if (this.isReplaying) {
      // Cinematic Replay Pacing:
      // İlk %40 (atak başlangıcı / paslaşma) 1.0x hızda akar,
      // Son %60 (şut, kaleci müdahalesi ve topun fileleri havalandırması) 0.5x ağır çekimde oynar!
      const totalFrames = this.replayFrames.length;
      const isSlowMo = (this.replayIndex >= Math.floor(totalFrames * 0.4));

      this.replaySpeedTimer++;
      const shouldAdvance = isSlowMo ? (this.replaySpeedTimer % 2 === 0) : true;
      if (shouldAdvance) {
        this.replayIndex++;
      }

      this.replayLabel = isSlowMo ? 'AĞIR ÇEKİM [0.5x]' : 'GOL TEKRARI [1.0x]';

      if (this.replayIndex >= this.replayFrames.length) {
        this.stopReplay();
        return;
      }
      currentFrame = this.replayFrames[this.replayIndex];
    }

    // Direct 60 FPS crisp physics rendering (no rubberbanding, lag or lerp oscillation)
    const interpBall = (currentFrame && currentFrame.ball) ? currentFrame.ball : null;
    const interpPlayers = (currentFrame && currentFrame.players) ? currentFrame.players : [];

    // Calculate Screen Shake offset
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeDuration > 0) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeDuration--;
    }

    // Handle Smooth Cinematic Camera Zoom
    if (this.goalZoomDuration > 0) {
      this.goalZoomDuration--;
      if (this.goalZoomDuration === 0) {
        this.targetZoom = 1.0;
        this.zoomTargetX = 0;
        this.zoomTargetY = 0;
      }
    }
    // Smooth lerp zoom
    this.cameraZoom += (this.targetZoom - this.cameraZoom) * 0.08;

    // Responsive pitch fit scale: guarantees the field fits the screen with safe margins
    const baseScale = this.calculateBaseScale();
    const finalScale = baseScale * this.cameraZoom;

    ctx.save();
    if (this.dpr && this.dpr !== 1) {
      ctx.scale(this.dpr, this.dpr);
    }
    ctx.translate(this.originX + shakeX, this.originY + shakeY);
    ctx.scale(finalScale, finalScale);

    if (this.cameraZoom > 1.01) {
      ctx.translate(-this.zoomTargetX * (this.cameraZoom - 1) * 0.5, -this.zoomTargetY * (this.cameraZoom - 1) * 0.5);
    }

    // 1. Draw Ground (Theme: Turf / Futsal / Hockey)
    this.drawGround(ctx);

    // 2. Draw Pitch Markings
    this.drawMarkings(ctx);

    // 2b. Draw Team Dugouts (Yedek Kulübeleri) & Locker Room Tunnel
    this.drawTeamDugouts(ctx);
    this.drawLockerRoomTunnel(ctx, currentFrame ? currentFrame.state : null);

    // 3. Draw Goal Nets & Posts (Suppressed in enclosed Bomb Tag arena)
    if (this.gameMode !== 'bomb' && !this.stadium.noGoals) {
      this.drawGoalNets(ctx);
      this.drawPosts(ctx);
    } else {
      this.drawBombArenaWalls(ctx);
    }

    // 4b. Draw Training Targets and Dummies
    if (this.trainingMode) {
      this.drawTrainingObjects(ctx);
    }

    // 4c. Draw Custom Stadium Pinball Bumpers
    this.drawBumpers(ctx);

    // 5. Draw Ball Speed Trail & Ball (Bomb or Classic)
    if (interpBall) {
      if (currentFrame && currentFrame.gameMode) this.gameMode = currentFrame.gameMode;
      if (currentFrame && currentFrame.bomb) this.bombState = currentFrame.bomb;

      this.drawBallTrail(ctx, interpBall);
      if (this.gameMode === 'bomb') {
        this.drawBombBall(ctx, interpBall, this.bombState);
      } else {
        this.drawBall(ctx, interpBall);
      }
    }

    // 6. Draw Players
    if (interpPlayers && interpPlayers.length > 0) {
      for (const player of interpPlayers) {
        this.drawPlayer(ctx, player, player.id === myId);
      }
    }

    // 7. Draw Explosion Shockwaves & Debris
    this.drawExplosionVFX(ctx);

    // 7b. Draw Confetti
    this.drawConfetti(ctx);

    // 8. Draw Dynamic Weather & Stadium Lighting (Night Floodlights, Rain Particles, Sunset Glow)
    this.drawWeatherAndLighting(ctx);

    ctx.restore();

    // 9. Replay Watermark Overlay
    if (this.isReplaying) {
      ctx.save();
      if (this.dpr && this.dpr !== 1) {
        ctx.scale(this.dpr, this.dpr);
      }
      this.drawReplayOverlay(ctx);
      ctx.restore();
    }
  }


  drawGround(ctx) {
    const { halfW, halfH, theme } = this.stadium;
    const margin = 56;

    // Stadium Outer Bezel Glow (Modern Curved Console / Frame)
    ctx.save();
    ctx.fillStyle = '#0a0d14';
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.roundRect(-halfW - margin, -halfH - margin, (halfW + margin) * 2, (halfH + margin) * 2, 24);
    ctx.fill();

    // Stadium Outer Border Neon Bevel (Golden Corner Flood LED Strips as seen in design)
    ctx.strokeStyle = '#1e2638';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(-halfW - margin + 3, -halfH - margin + 3, (halfW + margin) * 2 - 6, (halfH + margin) * 2 - 6, 22);
    ctx.stroke();

    // Corner Neon Accent Bars (Top-Left, Top-Right, Bottom-Left, Bottom-Right LED Lights)
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 4;

    // Top-Left Neon Strip
    ctx.beginPath();
    ctx.moveTo(-halfW - margin + 30, -halfH - margin + 3);
    ctx.lineTo(-halfW - margin + 90, -halfH - margin + 3);
    ctx.stroke();

    // Top-Right Neon Strip
    ctx.beginPath();
    ctx.moveTo(halfW + margin - 90, -halfH - margin + 3);
    ctx.lineTo(halfW + margin - 30, -halfH - margin + 3);
    ctx.stroke();

    // Bottom-Left Neon Strip
    ctx.beginPath();
    ctx.moveTo(-halfW - margin + 30, halfH + margin - 3);
    ctx.lineTo(-halfW - margin + 90, halfH + margin - 3);
    ctx.stroke();

    // Bottom-Right Neon Strip
    ctx.beginPath();
    ctx.moveTo(halfW + margin - 90, halfH + margin - 3);
    ctx.lineTo(halfW + margin - 30, halfH + margin - 3);
    ctx.stroke();

    ctx.restore();

    if (theme === 'futsal') {
      // Wood parquet flooring
      ctx.fillStyle = '#6e3c15';
      ctx.fillRect(-halfW - margin + 8, -halfH - margin + 8, (halfW + margin - 8) * 2, (halfH + margin - 8) * 2);

      // Plank stripes
      const plankCount = 14;
      const plankHeight = (halfH * 2) / plankCount;
      for (let i = 0; i < plankCount; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#b0733c' : '#bd7f46';
        ctx.fillRect(-halfW, -halfH + i * plankHeight, halfW * 2, plankHeight);
      }
    } else if (theme === 'hockey') {
      // Frosted ice blue rink
      ctx.fillStyle = '#6b92b0';
      ctx.fillRect(-halfW - margin + 8, -halfH - margin + 8, (halfW + margin - 8) * 2, (halfH + margin - 8) * 2);

      ctx.fillStyle = '#d4ebf9';
      ctx.fillRect(-halfW, -halfH, halfW * 2, halfH * 2);
    } else if (theme === 'street') {
      // Dark asphalt & street concrete pitch
      ctx.fillStyle = '#1e232a';
      ctx.fillRect(-halfW - margin + 8, -halfH - margin + 8, (halfW + margin - 8) * 2, (halfH + margin - 8) * 2);

      // Inner pitch with dark industrial asphalt grid
      ctx.fillStyle = '#2b313d';
      ctx.fillRect(-halfW, -halfH, halfW * 2, halfH * 2);

      // Metal chainlink boundary highlight
      ctx.strokeStyle = '#4a5568';
      ctx.lineWidth = 4;
      ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
    } else if (theme === 'neon') {
      // Dark cybernetic grid with neon lines
      ctx.fillStyle = '#05070e';
      ctx.fillRect(-halfW - margin + 8, -halfH - margin + 8, (halfW + margin - 8) * 2, (halfH + margin - 8) * 2);

      ctx.fillStyle = '#0a0e18';
      ctx.fillRect(-halfW, -halfH, halfW * 2, halfH * 2);

      // Cyber grid lines
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let x = -halfW; x <= halfW; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, -halfH);
        ctx.lineTo(x, halfH);
        ctx.stroke();
      }
      for (let y = -halfH; y <= halfH; y += 40) {
        ctx.beginPath();
        ctx.moveTo(-halfW, y);
        ctx.lineTo(halfW, y);
        ctx.stroke();
      }
      ctx.restore();

      // Glowing cyan boundary
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
    } else {
      // Modern Vibrant Premier Grass Pitch
      ctx.fillStyle = '#134724';
      ctx.fillRect(-halfW - margin + 8, -halfH - margin + 8, (halfW + margin - 8) * 2, (halfH + margin - 8) * 2);

      const stripeCount = 12;
      const stripeWidth = (halfW * 2) / stripeCount;
      for (let i = 0; i < stripeCount; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#186330' : '#1e753a';
        ctx.fillRect(-halfW + i * stripeWidth, -halfH, stripeWidth, halfH * 2);
      }
    }
  }

  drawMarkings(ctx) {
    const { halfW, halfH, centerCircleRadius, theme } = this.stadium;
    const isBomb = (this.gameMode === 'bomb');

    ctx.strokeStyle = isBomb ? 'rgba(255, 71, 87, 0.85)' : ((theme === 'hockey') ? '#225588' : (theme === 'street' ? '#f59e0b' : (theme === 'neon' ? '#00f0ff' : (theme === 'futsal' ? '#ffffff' : 'rgba(255, 255, 255, 0.75)'))));
    ctx.lineWidth = 3;

    // Pitch border
    ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);

    // Halfway line
    ctx.beginPath();
    ctx.moveTo(0, -halfH);
    ctx.lineTo(0, halfH);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(0, 0, centerCircleRadius, 0, Math.PI * 2);
    ctx.stroke();

    if (isBomb) {
      // Stylized Center Hazard Emblem in Bomb Mode
      ctx.save();
      ctx.fillStyle = 'rgba(255, 71, 87, 0.16)';
      ctx.beginPath();
      ctx.arc(0, 0, centerCircleRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '22px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💣', 0, 0);
      ctx.restore();
    } else {
      // Kickoff spot
      ctx.fillStyle = (theme === 'hockey') ? '#cc2222' : (theme === 'street' ? '#f59e0b' : '#ffffff');
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawBombArenaWalls(ctx) {
    const { halfW, halfH } = this.stadium;
    const now = Date.now();
    const hazardPulse = Math.sin(now / 180) * 0.2 + 0.8;
    const springPulse = Math.sin(now / 110) * 1.5;

    ctx.save();
    // 1. Electrified glowing boundary walls on Left and Right (Enclosed Arena)
    // Left Wall (Red Team Side)
    ctx.strokeStyle = `rgba(255, 59, 48, ${0.85 * hazardPulse})`;
    ctx.lineWidth = 6;
    ctx.shadowColor = '#ff3b30';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(-halfW, -halfH);
    ctx.lineTo(-halfW, halfH);
    ctx.stroke();

    // Right Wall (Blue Team Side)
    ctx.strokeStyle = `rgba(0, 128, 255, ${0.85 * hazardPulse})`;
    ctx.shadowColor = '#0080ff';
    ctx.beginPath();
    ctx.moveTo(halfW, -halfH);
    ctx.lineTo(halfW, halfH);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 2. Spring-Loaded Corner Bumpers (Yaylı Köşe Tamponları - 45px diagonal bevels)
    const cornerSize = 45;
    const corners = [
      { p1: [-halfW + cornerSize, -halfH], p2: [-halfW, -halfH + cornerSize], corner: [-halfW, -halfH], nx: 1, ny: 1 },
      { p1: [halfW - cornerSize, -halfH], p2: [halfW, -halfH + cornerSize], corner: [halfW, -halfH], nx: -1, ny: 1 },
      { p1: [-halfW + cornerSize, halfH], p2: [-halfW, halfH - cornerSize], corner: [-halfW, halfH], nx: 1, ny: -1 },
      { p1: [halfW - cornerSize, halfH], p2: [halfW, halfH - cornerSize], corner: [halfW, halfH], nx: -1, ny: -1 }
    ];

    for (const c of corners) {
      ctx.save();
      // 2a. Corner pocket backplate (dark hazard chamber)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.beginPath();
      ctx.moveTo(c.corner[0], c.corner[1]);
      ctx.lineTo(c.p1[0], c.p1[1]);
      ctx.lineTo(c.p2[0], c.p2[1]);
      ctx.closePath();
      ctx.fill();

      // 2b. Mechanical Spring Coils connecting corner vertex to bumper bar
      const strutCount = 3;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2.2;
      ctx.shadowBlur = 0;

      for (let s = 1; s <= strutCount; s++) {
        const ratio = s / (strutCount + 1);
        const bx = c.p1[0] + (c.p2[0] - c.p1[0]) * ratio;
        const by = c.p1[1] + (c.p2[1] - c.p1[1]) * ratio;
        const cx = c.corner[0];
        const cy = c.corner[1];

        // Draw spring coil zigzag
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const zigSteps = 4;
        for (let z = 1; z <= zigSteps; z++) {
          const t = z / (zigSteps + 1);
          const px = cx + (bx - cx) * t;
          const py = cy + (by - cy) * t;
          const perpOffset = (z % 2 === 0 ? 3.5 : -3.5);
          const perpX = -(c.p2[1] - c.p1[1]) / 63.64 * perpOffset;
          const perpY = (c.p2[0] - c.p1[0]) / 63.64 * perpOffset;
          ctx.lineTo(px + perpX, py + perpY);
        }
        ctx.lineTo(bx, by);
        ctx.stroke();

        // Spring anchor piston head
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(bx, by, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2c. Base Backplate Rail (Heavy bracket backing)
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c.p1[0], c.p1[1]);
      ctx.lineTo(c.p2[0], c.p2[1]);
      ctx.stroke();

      // 2d. Active Neon Spring Bumper Bar (Vibrant Glowing Hazard Yellow)
      ctx.strokeStyle = '#ffd700';
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 5;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(c.p1[0], c.p1[1]);
      ctx.lineTo(c.p2[0], c.p2[1]);
      ctx.stroke();

      // Inner highlight line for high-velocity metallic sheen
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(c.p1[0] + (c.p2[0] - c.p1[0]) * 0.15, c.p1[1] + (c.p2[1] - c.p1[1]) * 0.15);
      ctx.lineTo(c.p1[0] + (c.p2[0] - c.p1[0]) * 0.85, c.p1[1] + (c.p2[1] - c.p1[1]) * 0.85);
      ctx.stroke();

      // Chrome End Bolts
      ctx.fillStyle = '#f8fafc';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(c.p1[0], c.p1[1], 3.2, 0, Math.PI * 2);
      ctx.arc(c.p2[0], c.p2[1], 3.2, 0, Math.PI * 2);
      ctx.fill();

      // Energy ⚡ glyph indicating high bounce direction
      const midX = (c.p1[0] + c.p2[0]) * 0.5;
      const midY = (c.p1[1] + c.p2[1]) * 0.5;
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡', midX + c.nx * 10, midY + c.ny * 10);

      ctx.restore();
    }

    ctx.restore();
  }

  drawLockerRoomTunnel(ctx, state) {
    const { halfH } = this.stadium;
    const isWalkout = state === 'WALKOUT';
    const now = Date.now();

    ctx.save();

    // 1. Red & Blue Carpet Runner leading up to (NOT inside) the pitch
    // Strictly stops at y = -halfH (touchline outer edge)
    const runnerTop = -halfH - 50;
    const runnerBottom = -halfH;
    const runnerHeight = runnerBottom - runnerTop;
    const runnerHalfW = 26;

    // Carpet Shadow / Underlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(-runnerHalfW - 2, runnerTop, (runnerHalfW + 2) * 2, runnerHeight + 2);

    // Left Half: Red Carpet
    const redCarpetGrad = ctx.createLinearGradient(-runnerHalfW, 0, 0, 0);
    redCarpetGrad.addColorStop(0, '#991b1b');
    redCarpetGrad.addColorStop(1, '#dc2626');
    ctx.fillStyle = redCarpetGrad;
    ctx.fillRect(-runnerHalfW, runnerTop, runnerHalfW, runnerHeight);

    // Right Half: Blue Carpet
    const blueCarpetGrad = ctx.createLinearGradient(0, 0, runnerHalfW, 0);
    blueCarpetGrad.addColorStop(0, '#2563eb');
    blueCarpetGrad.addColorStop(1, '#1e40af');
    ctx.fillStyle = blueCarpetGrad;
    ctx.fillRect(0, runnerTop, runnerHalfW, runnerHeight);

    // Gold trim borders along runner edges
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-runnerHalfW, runnerTop);
    ctx.lineTo(-runnerHalfW, runnerBottom);
    ctx.moveTo(runnerHalfW, runnerTop);
    ctx.lineTo(runnerHalfW, runnerBottom);
    ctx.moveTo(-runnerHalfW, runnerBottom);
    ctx.lineTo(runnerHalfW, runnerBottom);
    ctx.stroke();

    // Center divider gold seam
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, runnerTop);
    ctx.lineTo(0, runnerBottom);
    ctx.stroke();

    // 2. Tunnel Spotlight Projection during Walkout (Focused on the runner outside pitch)
    if (isWalkout) {
      const pulse = 0.25 + Math.sin(now / 180) * 0.08;
      const spotGrad = ctx.createRadialGradient(0, -halfH - 26, 2, 0, -halfH - 8, 30);
      spotGrad.addColorStop(0, `rgba(255, 240, 180, ${pulse})`);
      spotGrad.addColorStop(1, 'rgba(255, 240, 180, 0)');
      ctx.fillStyle = spotGrad;
      ctx.beginPath();
      ctx.arc(0, -halfH - 8, 30, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Stadium Tunnel Canopy / Bellows Structure (Set back from the pitch)
    const tunnelW = 74;
    const tunnelH = 34;
    const tunnelY = -halfH - 50;

    // Accordion bellows ribs (ends at -halfH - 16, comfortably outside the pitch)
    const ribCount = 4;
    const ribH = tunnelH / ribCount;
    for (let i = 0; i < ribCount; i++) {
      const ribY = tunnelY + i * ribH;
      ctx.fillStyle = (i % 2 === 0) ? '#0f172a' : '#1e293b';
      ctx.beginPath();
      ctx.roundRect(-tunnelW / 2 - (ribCount - i) * 1.5, ribY, tunnelW + (ribCount - i) * 3, ribH + 1, [4, 4, 2, 2]);
      ctx.fill();

      // Rib highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Interior Shadow Opening (Dark Tunnel Depth)
    const mouthGrad = ctx.createLinearGradient(0, tunnelY, 0, -halfH - 16);
    mouthGrad.addColorStop(0, '#020617');
    mouthGrad.addColorStop(0.7, '#090d16');
    mouthGrad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
    ctx.fillStyle = mouthGrad;
    ctx.beginPath();
    ctx.roundRect(-22, tunnelY + 6, 44, 28, [8, 8, 0, 0]);
    ctx.fill();

    // 4. Side Guide Pylons (Strictly outside pitch at -halfH - 6)
    // Left Red Pylon
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = isWalkout ? 14 : 6;
    ctx.beginPath();
    ctx.arc(-runnerHalfW - 5, -halfH - 6, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Right Blue Pylon
    ctx.fillStyle = '#3b82f6';
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = isWalkout ? 14 : 6;
    ctx.beginPath();
    ctx.arc(runnerHalfW + 5, -halfH - 6, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 5. Header Arch Sign: "SOYUNMA ODASI"
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-37, tunnelY - 8, 74, 14, 4);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 7.5px "Chakra Petch", "Rajdhani", sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SOYUNMA ODASI', 0, tunnelY - 1);

    ctx.restore();
  }

  drawTeamDugouts(ctx) {
    const { halfW, halfH } = this.stadium;
    const dugoutY = -halfH - 50;
    const dugoutH = 38;
    const dugoutW = 152;
    const seatY = -halfH - 28;
    const dugoutOffset = Math.max(120, Math.min(200, halfW * 0.38));

    const dugouts = [
      {
        team: 'red',
        name: '🔴 KIRMIZI YEDEK KULÜBESİ',
        centerX: -dugoutOffset,
        accentColor: '#ef4444',
        cushionColor: '#dc2626',
        cushionDark: '#991b1b',
        roofTint: 'rgba(239, 68, 68, 0.08)'
      },
      {
        team: 'blue',
        name: '🔵 MAVİ YEDEK KULÜBESİ',
        centerX: dugoutOffset,
        accentColor: '#3b82f6',
        cushionColor: '#2563eb',
        cushionDark: '#1e40af',
        roofTint: 'rgba(59, 130, 246, 0.08)'
      }
    ];

    for (const d of dugouts) {
      const left = d.centerX - dugoutW / 2;
      const top = dugoutY;

      ctx.save();

      // 1. Dugout Foundation Floor Mat (Slight dark rubber pad)
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.beginPath();
      ctx.roundRect(left - 2, top + 10, dugoutW + 4, dugoutH - 8, [4, 4, 2, 2]);
      ctx.fill();

      // Floor trim
      ctx.strokeStyle = d.accentColor;
      ctx.lineWidth = 1;
      ctx.stroke();

      // 2. 4 Molded Bucket Seats (Recaro-style stadium bench seats)
      const slotOffsets = [-54, -18, 18, 54];
      for (let i = 0; i < slotOffsets.length; i++) {
        const sx = d.centerX + slotOffsets[i];
        const sy = seatY;

        // Seat drop shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(sx, sy + 10, 11, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bucket Seat Backrest
        const seatGrad = ctx.createLinearGradient(sx, sy - 14, sx, sy + 4);
        seatGrad.addColorStop(0, d.cushionColor);
        seatGrad.addColorStop(1, d.cushionDark);
        ctx.fillStyle = seatGrad;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.2;

        ctx.beginPath();
        ctx.roundRect(sx - 11, sy - 14, 22, 17, [5, 5, 2, 2]);
        ctx.fill();
        ctx.stroke();

        // Seat Base Cushion
        ctx.fillStyle = d.cushionColor;
        ctx.beginPath();
        ctx.roundRect(sx - 12, sy + 2, 24, 7, [2, 2, 4, 4]);
        ctx.fill();
        ctx.stroke();

        // Headrest accent line
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(sx - 5, sy - 12, 10, 3, 1.5);
        ctx.fill();
      }

      // 3. Curved Acrylic / Polycarbonate Shelter Roof (Modern glass canopy)
      const glassGrad = ctx.createLinearGradient(left, top, left, top + dugoutH);
      glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      glassGrad.addColorStop(0.25, d.roofTint);
      glassGrad.addColorStop(0.85, 'rgba(15, 23, 42, 0.75)');
      glassGrad.addColorStop(1, 'rgba(15, 23, 42, 0.9)');

      ctx.fillStyle = glassGrad;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      ctx.roundRect(left, top, dugoutW, dugoutH, [8, 8, 2, 2]);
      ctx.fill();
      ctx.stroke();

      // Top Glass Glint reflection line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(left + 10, top + 2);
      ctx.lineTo(left + dugoutW - 10, top + 2);
      ctx.stroke();

      // Side Support Metallic Pillars
      ctx.fillStyle = '#334155';
      ctx.fillRect(left, top + 2, 3.5, dugoutH - 2);
      ctx.fillRect(left + dugoutW - 3.5, top + 2, 3.5, dugoutH - 2);

      // 4. Canopy Team Header Plate
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = d.accentColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(d.centerX - 56, top - 8, 112, 13, 3);
      ctx.fill();
      ctx.stroke();

      // Team Header Text
      ctx.font = 'bold 7px "Chakra Petch", "Rajdhani", sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(d.name, d.centerX, top - 2);

      ctx.restore();
    }
  }

  drawGoalNets(ctx) {
    const { halfW, goalHalfW, goalDepth } = this.stadium;
    const now = Date.now();
    const netWiggle = Math.sin(now / 120) * 1.5;

    // Left Goal Net (Red Team Goal Frame Neon Glow)
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(230, 57, 70, 0.12)';
    ctx.fillRect(-halfW - goalDepth, -goalHalfW, goalDepth, goalHalfW * 2);

    ctx.strokeStyle = 'rgba(255, 120, 130, 0.65)';
    ctx.lineWidth = 1.3;
    // Net grid lines (Left)
    for (let x = -halfW - goalDepth; x <= -halfW; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, -goalHalfW);
      ctx.lineTo(x + netWiggle, goalHalfW);
      ctx.stroke();
    }
    for (let y = -goalHalfW; y <= goalHalfW; y += 12) {
      ctx.beginPath();
      ctx.moveTo(-halfW - goalDepth, y);
      ctx.lineTo(-halfW, y + netWiggle);
      ctx.stroke();
    }
    ctx.strokeStyle = '#ff4d5a';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(-halfW - goalDepth, -goalHalfW, goalDepth, goalHalfW * 2);
    ctx.restore();

    // Right Goal Net (Blue Team Goal Frame Neon Glow)
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0, 140, 255, 0.12)';
    ctx.fillRect(halfW, -goalHalfW, goalDepth, goalHalfW * 2);

    ctx.strokeStyle = 'rgba(100, 190, 255, 0.65)';
    ctx.lineWidth = 1.3;
    // Net grid lines (Right)
    for (let x = halfW; x <= halfW + goalDepth; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, -goalHalfW);
      ctx.lineTo(x - netWiggle, goalHalfW);
      ctx.stroke();
    }
    for (let y = -goalHalfW; y <= goalHalfW; y += 12) {
      ctx.beginPath();
      ctx.moveTo(halfW, y);
      ctx.lineTo(halfW + goalDepth, y - netWiggle);
      ctx.stroke();
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    ctx.strokeRect(halfW, -goalHalfW, goalDepth, goalHalfW * 2);
    ctx.restore();
  }

  drawPosts(ctx) {
    const posts = this.stadium.posts || [];
    for (const post of posts) {
      const isLeft = post.x < 0;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.arc(post.x + 2, post.y + 2, post.radius, 0, Math.PI * 2);
      ctx.fill();

      // Glowing Post Neon Ring
      ctx.shadowColor = isLeft ? '#ff4d5a' : '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(post.x, post.y, post.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isLeft ? '#e63946' : '#0284c7';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawTrainingObjects(ctx) {
    // 1. Draw Defense Dummy Wall (Kuklalar)
    for (const dummy of this.trainingDummies) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(dummy.x + 2, dummy.y + 3, dummy.radius * 1.1, dummy.radius * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dummy Body (Orange training cones/dummies)
      ctx.fillStyle = '#ff9f43';
      ctx.beginPath();
      ctx.arc(dummy.x, dummy.y, dummy.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#d35400';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Training number / mannequin icon
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🛡️', dummy.x, dummy.y);
      ctx.restore();
    }

    // 2. Draw 90 Degree Goal Target Rings (Köşe Hedef Halkaları)
    const now = Date.now();
    const ringPulse = Math.sin(now / 150) * 2;

    for (const target of this.trainingTargets) {
      ctx.save();
      ctx.strokeStyle = target.hit ? '#4cd137' : '#ffd32a';
      ctx.lineWidth = 3;
      ctx.shadowColor = target.hit ? '#4cd137' : '#ffd32a';
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.arc(target.x, target.y, target.radius + ringPulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = target.hit ? 'rgba(76, 209, 55, 0.4)' : 'rgba(255, 211, 42, 0.25)';
      ctx.beginPath();
      ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 11px "Chakra Petch", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(target.label || '🎯', target.x, target.y);
      ctx.restore();
    }
  }

  drawBallTrail(ctx, ball) {
    const speed = Math.hypot(ball.vx || 0, ball.vy || 0);

    // Normal trail
    if (speed > 2.5) {
      this.ballTrail.push({
        x: ball.x,
        y: ball.y,
        alpha: 0.75,
        isFire: speed > 6.8,
        size: (ball.radius || 10) * (speed > 6.8 ? 0.9 : 0.6)
      });
    }

    // Render trail points & fiery sparks
    for (let i = 0; i < this.ballTrail.length; i++) {
      const pt = this.ballTrail[i];
      pt.alpha *= 0.8;

      if (pt.isFire) {
        // Blazing Fire / Super Shot Trail
        const fireColors = ['#ff3b30', '#ff9500', '#ffd60a'];
        ctx.fillStyle = fireColors[i % fireColors.length];
        ctx.shadowColor = '#ff4500';
        ctx.shadowBlur = 10;
      } else {
        ctx.fillStyle = `rgba(255, 209, 102, ${pt.alpha})`;
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * pt.alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    this.ballTrail = this.ballTrail.filter(pt => pt.alpha > 0.04);
  }

  drawBall(ctx, ball) {
    const r = ball.radius || 10;
    const speed = Math.hypot(ball.vx || 0, ball.vy || 0);

    // Drop Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(ball.x + 2, ball.y + 3, r * 1.1, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle energetic halo when moving fast (Matches ChatGPT mockup)
    if (speed > 2.8) {
      ctx.save();
      ctx.shadowColor = speed > 6.8 ? '#ff4500' : '#38bdf8';
      ctx.shadowBlur = speed > 6.8 ? 16 : 10;
      ctx.strokeStyle = speed > 6.8 ? 'rgba(255, 69, 0, 0.7)' : 'rgba(56, 189, 248, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, r + 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Ball Body 3D Radial Gradient
    const grad = ctx.createRadialGradient(
      ball.x - r * 0.35, ball.y - r * 0.35, r * 0.1,
      ball.x, ball.y, r
    );
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#f0f0f0');
    grad.addColorStop(1, '#cccccc');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Authentic Soccer Ball Pentagon Pattern (Rotates with ball movement)
    ctx.save();
    const angle = (ball.x * 0.08 + ball.y * 0.08);
    ctx.translate(ball.x, ball.y);
    ctx.rotate(angle);

    // Center dark pentagon patch
    ctx.fillStyle = '#1e232a';
    ctx.beginPath();
    const pR = r * 0.38;
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const px = Math.cos(a) * pR;
      const py = Math.sin(a) * pR;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // 5 seam lines radiating out to the edge
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const px1 = Math.cos(a) * pR;
      const py1 = Math.sin(a) * pR;
      const px2 = Math.cos(a) * (r * 0.95);
      const py2 = Math.sin(a) * (r * 0.95);
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
    }
    ctx.restore();

    // Outer crisp border
    ctx.strokeStyle = '#1a202c';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawBombBall(ctx, ball, bombInfo = null) {
    const r = ball.radius || 11;
    const holderTeam = bombInfo ? bombInfo.holderTeam : null;
    const ticks = bombInfo ? bombInfo.ticks : 1200;
    const seconds = bombInfo ? bombInfo.timer : Math.ceil(ticks / 60);
    const isUrgent = ticks <= 240; // last 4 seconds
    const now = Date.now();
    const pulse = Math.sin(now / (isUrgent ? 80 : 200));

    ctx.save();
    // 1. Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(ball.x + 2, ball.y + 4, r * 1.25, r * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. Glowing danger halo around bomb
    let haloColor = 'rgba(255, 140, 0, 0.4)';
    if (holderTeam === 'red') haloColor = 'rgba(255, 59, 48, 0.75)';
    else if (holderTeam === 'blue') haloColor = 'rgba(0, 140, 255, 0.75)';
    if (isUrgent) haloColor = `rgba(255, 0, 50, ${0.7 + pulse * 0.3})`;

    ctx.shadowColor = haloColor;
    ctx.shadowBlur = 16 + (isUrgent ? pulse * 8 : 0);
    ctx.strokeStyle = haloColor;
    ctx.lineWidth = isUrgent ? 3.5 : 2.5;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r + 2.5 + (isUrgent ? pulse * 2 : 0), 0, Math.PI * 2);
    ctx.stroke();

    // 3. Metallic Bomb Sphere Body (Cast iron cannonball gradient)
    const bombGrad = ctx.createRadialGradient(
      ball.x - r * 0.35, ball.y - r * 0.35, r * 0.1,
      ball.x, ball.y, r
    );
    bombGrad.addColorStop(0, '#667085');
    bombGrad.addColorStop(0.35, '#2b2f38');
    bombGrad.addColorStop(0.85, '#121418');
    bombGrad.addColorStop(1, '#050608');

    ctx.fillStyle = bombGrad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.fill();

    // 4. Brass Fuse Cap on Top of Bomb
    const capW = r * 0.55;
    const capH = r * 0.32;
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(ball.x - capW / 2, ball.y - r - capH * 0.6, capW, capH);

    // 5. Burning Twisted Fuse with Spark Particles
    const fuseStartX = ball.x;
    const fuseStartY = ball.y - r - capH * 0.6;
    const fuseTipX = fuseStartX + Math.sin(now / 150) * 4;
    const fuseTipY = fuseStartY - 7;

    ctx.strokeStyle = '#c29b38';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(fuseStartX, fuseStartY);
    ctx.quadraticCurveTo(fuseStartX - 3, fuseStartY - 4, fuseTipX, fuseTipY);
    ctx.stroke();

    // Sparks at fuse tip
    const sparkCount = isUrgent ? 6 : 3;
    for (let i = 0; i < sparkCount; i++) {
      const sparkAngle = Math.random() * Math.PI * 2;
      const sparkDist = Math.random() * (isUrgent ? 9 : 5);
      ctx.fillStyle = (Math.random() > 0.4) ? '#ffcc00' : '#ff3b30';
      ctx.beginPath();
      ctx.arc(fuseTipX + Math.cos(sparkAngle) * sparkDist, fuseTipY + Math.sin(sparkAngle) * sparkDist, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Central Digital Countdown Number
    ctx.shadowBlur = 10;
    ctx.shadowColor = isUrgent ? '#ff0033' : '#ffd700';
    ctx.fillStyle = isUrgent ? '#ff3b30' : '#ffffff';
    ctx.font = `bold ${Math.max(10, r * 1.15)}px "Chakra Petch", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(seconds), ball.x, ball.y + 1);

    ctx.restore();
  }

  drawBumpers(ctx) {
    const bumpers = (this.stadium && this.stadium.bumpers) ? this.stadium.bumpers : [];
    if (!bumpers || bumpers.length === 0) return;

    const now = Date.now();
    const pulse = Math.sin(now / 160);

    for (const b of bumpers) {
      const r = b.radius || 20;
      const col = b.color || '#ff007f';

      ctx.save();
      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(b.pos.x + 2, b.pos.y + 3, r * 1.1, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Outer glowing neon pulse ring
      ctx.shadowColor = col;
      ctx.shadowBlur = 14 + pulse * 4;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, r + 2 + pulse * 1.5, 0, Math.PI * 2);
      ctx.stroke();

      // Bumper body gradient (metallic arcade button)
      const grad = ctx.createRadialGradient(
        b.pos.x - r * 0.3, b.pos.y - r * 0.3, r * 0.1,
        b.pos.x, b.pos.y, r
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, col);
      grad.addColorStop(0.85, '#1a0520');
      grad.addColorStop(1, '#050208');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Center glowing emblem
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, r * 0.32, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  triggerBombExplosion(x, y, isGoal = false) {
    this.triggerScreenShake(isGoal ? 28 : 22, isGoal ? 32 : 24);

    // Shockwave expansion rings
    this.explosionShockwaves.push({
      x,
      y,
      radius: 8,
      maxRadius: isGoal ? 260 : 180,
      alpha: 1.0,
      color: isGoal ? '#ffd700' : '#ff3b30'
    });
    this.explosionShockwaves.push({
      x,
      y,
      radius: 4,
      maxRadius: isGoal ? 200 : 130,
      alpha: 1.0,
      color: '#ff9500'
    });

    // 40+ Fire & Smoke Explosion Debris Particles
    const particleCount = isGoal ? 50 : 36;
    const colors = ['#ff3b30', '#ff9500', '#ffd60a', '#ffffff', '#555555'];
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 2;
      this.explosionSparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 8 + 4,
        alpha: 1.0,
        color: colors[Math.floor(Math.random() * colors.length)],
        decay: 0.02 + Math.random() * 0.025
      });
    }
  }

  triggerBumperHit(x, y) {
    this.bumperShockwaves.push({
      x,
      y,
      radius: 4,
      maxRadius: 44,
      alpha: 1.0,
      color: '#ffd700'
    });
    // Golden spring rebound spark burst
    for (let i = 0; i < 7; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 5 + 2;
      this.explosionSparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 2,
        alpha: 1.0,
        color: '#ffea00',
        decay: 0.04 + Math.random() * 0.03
      });
    }
  }

  drawExplosionVFX(ctx) {
    // 0. Draw spring bumper hit shockwave rings
    for (let i = 0; i < this.bumperShockwaves.length; i++) {
      const bsw = this.bumperShockwaves[i];
      ctx.save();
      ctx.strokeStyle = bsw.color;
      ctx.globalAlpha = Math.max(0, bsw.alpha);
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(bsw.x, bsw.y, bsw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      bsw.radius += 3.2;
      bsw.alpha -= 0.07;
    }
    this.bumperShockwaves = this.bumperShockwaves.filter(bsw => bsw.alpha > 0.01);

    // 1. Draw and expand shockwave rings
    for (let i = 0; i < this.explosionShockwaves.length; i++) {
      const sw = this.explosionShockwaves[i];
      ctx.save();
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = Math.max(0, sw.alpha);
      ctx.lineWidth = 4.5 * sw.alpha;
      ctx.shadowColor = sw.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      sw.radius += (sw.maxRadius - sw.radius) * 0.18;
      sw.alpha -= 0.045;
    }
    this.explosionShockwaves = this.explosionShockwaves.filter(sw => sw.alpha > 0.01);

    // 2. Draw and move explosion fire particles
    for (let i = 0; i < this.explosionSparks.length; i++) {
      const p = this.explosionSparks[i];
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.94;
      p.vy *= 0.94;
      p.alpha -= p.decay;
    }
    this.explosionSparks = this.explosionSparks.filter(p => p.alpha > 0.01);
  }

  drawPlayer(ctx, player, isMe) {
    const r = 15;
    const isRed = player.team === 'red';
    const isElim = !!player.isEliminated;
    const mainColor = isRed ? '#e63946' : '#0080ff';
    const darkColor = isRed ? '#9c1c27' : '#004c99';

    ctx.save();
    if (isElim) {
      ctx.globalAlpha = 0.92;
    }

    // Kick indicator ring
    if (player.kicking) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Movement Comet Streak / Speed Trail (Matches ChatGPT Mockup)
    if (Math.hypot(player.vx || 0, player.vy || 0) > 1.0) {
      ctx.save();
      const trailAngle = Math.atan2(player.vy, player.vx);
      const trailGrad = ctx.createLinearGradient(
        player.x, player.y,
        player.x - Math.cos(trailAngle) * 32, player.y - Math.sin(trailAngle) * 32
      );
      trailGrad.addColorStop(0, isRed ? 'rgba(255, 107, 119, 0.65)' : 'rgba(82, 165, 255, 0.65)');
      trailGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = trailGrad;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r * 0.9, trailAngle - Math.PI / 2, trailAngle + Math.PI / 2);
      ctx.lineTo(player.x - Math.cos(trailAngle) * 32, player.y - Math.sin(trailAngle) * 32);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(player.x + 2, player.y + 4, r * 1.15, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Disc body with high-gloss 3D radial gradient
    const grad = ctx.createRadialGradient(
      player.x - r * 0.35, player.y - r * 0.35, r * 0.15,
      player.x, player.y, r
    );
    grad.addColorStop(0, isRed ? '#ff9aa2' : '#8ac8ff');
    grad.addColorStop(0.3, isRed ? '#ff6b77' : '#52a5ff');
    grad.addColorStop(0.75, mainColor);
    grad.addColorStop(1, darkColor);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Glossy Inner Ring Highlight
    ctx.strokeStyle = isMe ? '#ffd166' : 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = isMe ? 2.6 : 1.8;
    ctx.stroke();

    // 👑 Royal Crowned Aura, Custom Cosmetic Auras & 💣 EBE Alert Aura
    const now = Date.now();
    const isEbe = (!isElim && this.gameMode === 'bomb' && this.bombState && this.bombState.holderPlayer && this.bombState.holderPlayer.id === player.id);
    const isEbeUrgent = isEbe && (this.bombState.ticks <= 240);

    if (isEbe) {
      // 💣 Red Hazard Alert Aura around player
      const ebePulse = Math.sin(now / (isEbeUrgent ? 60 : 130)) * 3.5;
      ctx.save();
      ctx.strokeStyle = isEbeUrgent ? 'rgba(255, 0, 51, 0.4)' : 'rgba(255, 59, 48, 0.35)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 4.5 + ebePulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = isEbeUrgent ? '#ff0033' : '#ff3b30';
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 4 + ebePulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (player.hasCrown || player.aura === 'gold') {
      const auraPulse = Math.sin(now / 160) * 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.35)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 3.5 + auraPulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 3 + auraPulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (player.aura === 'flame') {
      // 🔥 Flame Aura
      const flamePulse = Math.sin(now / 120) * 2.5;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 69, 0, 0.35)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 3.5 + flamePulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#ff4500';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 3 + flamePulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (player.aura === 'lightning') {
      // ⚡ Lightning Neon Aura
      const jitter = (Math.random() - 0.5) * 2;
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 3.5 + jitter, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 3 + jitter, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (player.aura === 'chroma') {
      // 🌈 RGB Spectrum Chroma Aura
      const hue = (now / 15) % 360;
      ctx.save();
      ctx.strokeStyle = `hsla(${hue}, 100%, 65%, 0.35)`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `hsl(${hue}, 100%, 65%)`;
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(player.x, player.y, r + 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Avatar / Jersey number
    const avatar = player.avatar || (isRed ? 'R' : 'B');
    ctx.fillStyle = '#ffffff';
    ctx.font = (avatar.length > 1) ? '12px sans-serif' : 'bold 13px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(avatar, player.x, player.y + 1);

    // Floating Crown, EBE Indicator Banner, or Eliminated Dugout Seat Badge
    const hoverY = Math.sin(now / 200) * 2;

    if (isElim) {
      // 🪑 Seated on Team Dugout Bench Seat (Yedek Kulübesi)
      ctx.save();
      // 1. Compact ELENDİ Pill Badge ABOVE Player (width 32px, height 11px)
      const badgeY = player.y - r - 9;
      ctx.fillStyle = isRed ? 'rgba(220, 38, 38, 0.95)' : 'rgba(37, 99, 235, 0.95)';
      ctx.beginPath();
      ctx.roundRect(player.x - 16, badgeY - 5.5, 32, 11, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      ctx.font = 'bold 7px "Chakra Petch", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ELENDİ', player.x, badgeY + 0.5);

      // 2. Crystal Clear Player Name BELOW Player (on grass apron, never overlapping)
      const nameY = player.y + r + 8;
      ctx.font = 'bold 9.5px "Inter", "Rajdhani", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.strokeText(player.name, player.x, nameY);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(player.name, player.x, nameY);
      ctx.restore();
    } else {
      if (isEbe) {
        // Floating 💣 EBE! Pill Banner + Downward Alert Arrow
        ctx.save();
        const bannerY = player.y - r - 22 + hoverY;
        ctx.shadowColor = '#ff0033';
        ctx.shadowBlur = isEbeUrgent ? 16 : 10;

        // Pill background
        ctx.fillStyle = isEbeUrgent ? '#ff0033' : '#dc2626';
        ctx.beginPath();
        ctx.roundRect(player.x - 26, bannerY - 13, 52, 16, 8);
        ctx.fill();

        // Downward pointer arrow
        ctx.fillStyle = isEbeUrgent ? '#ff0033' : '#dc2626';
        ctx.beginPath();
        ctx.moveTo(player.x, bannerY + 6);
        ctx.lineTo(player.x - 5, bannerY + 2);
        ctx.lineTo(player.x + 5, bannerY + 2);
        ctx.closePath();
        ctx.fill();

        // Label text
        ctx.font = 'bold 9px "Chakra Petch", sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(isEbeUrgent ? '⚠️ PATLIYOR!' : '💣 EBE!', player.x, bannerY - 5);
        ctx.restore();
      } else if (player.hasCrown) {
        ctx.save();
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 10;
        ctx.font = '16px "Segoe UI Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText('👑', player.x, player.y - r - 22 + hoverY);
        ctx.restore();
      }

      // Title Tag: [PATLAMAK ÜZERE!] / [BOMBA TAŞIYICISI]
      const titleText = isEbe ? (isEbeUrgent ? '[PATLAMAK ÜZERE!]' : '[BOMBA TAŞIYICISI]') : (player.title ? `[${player.title}]` : (player.hasCrown ? '[Maçın Kralı]' : ''));
      if (titleText) {
        ctx.font = 'bold 9px "Inter", sans-serif';
        ctx.fillStyle = isEbe ? '#ff6b6b' : (player.hasCrown ? '#ffd700' : (isMe ? '#ffeaa7' : '#cbd5e1'));
        ctx.textAlign = 'center';
        ctx.fillText(titleText, player.x, player.y - r - 15 + hoverY);
      }

      // Player Name Pill
      ctx.font = 'bold 11px "Inter", sans-serif';
      ctx.fillStyle = isEbe ? '#ff6b6b' : (player.hasCrown ? '#ffd700' : (isMe ? '#ffd166' : '#ffffff'));
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 4;
      ctx.fillText(player.name, player.x, player.y - r - 4 + hoverY);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  drawConfetti(ctx) {
    for (let i = 0; i < this.confetti.length; i++) {
      const c = this.confetti[i];
      c.x += c.vx;
      c.y += c.vy;
      c.vy += 0.1; // gravity
      c.rotation += c.rotSpeed;
      c.life--;

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rotation);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 4, c.size, c.size / 2);
      ctx.restore();
    }

    this.confetti = this.confetti.filter(c => c.life > 0);
  }

  drawWeatherAndLighting(ctx) {
    const { halfW, halfH } = this.stadium;
    const mode = this.weatherMode || 'night';

    // 1. NIGHT & FLOODLIGHT ATMOSPHERE
    if (mode === 'night') {
      // Stadium 4-Corner Floodlight Cones (Projektör Işıkları)
      const lightColor = 'rgba(235, 248, 255, 0.085)';
      const centerLightColor = 'rgba(255, 255, 255, 0.03)';

      // Top-Left Spotlight
      this.drawFloodlightCone(ctx, -halfW - 30, -halfH - 30, 0, 0, 320, lightColor);
      // Top-Right Spotlight
      this.drawFloodlightCone(ctx, halfW + 30, -halfH - 30, 0, 0, 320, lightColor);
      // Bottom-Left Spotlight
      this.drawFloodlightCone(ctx, -halfW - 30, halfH + 30, 0, 0, 320, lightColor);
      // Bottom-Right Spotlight
      this.drawFloodlightCone(ctx, halfW + 30, halfH + 30, 0, 0, 320, lightColor);

      // Ambient night tint
      ctx.save();
      ctx.fillStyle = 'rgba(4, 9, 22, 0.22)';
      ctx.fillRect(-halfW - 60, -halfH - 60, (halfW + 60) * 2, (halfH + 60) * 2);
      ctx.restore();
    }
    // 2. RAIN & STORMY NIGHT ATMOSPHERE
    else if (mode === 'rain') {
      // Dark gloomy storm tint
      ctx.save();
      ctx.fillStyle = 'rgba(10, 20, 35, 0.32)';
      ctx.fillRect(-halfW - 60, -halfH - 60, (halfW + 60) * 2, (halfH + 60) * 2);

      // Corner Floodlight Cones cutting through the rain
      const rainLightColor = 'rgba(210, 235, 255, 0.07)';
      this.drawFloodlightCone(ctx, -halfW - 30, -halfH - 30, 0, 0, 300, rainLightColor);
      this.drawFloodlightCone(ctx, halfW + 30, -halfH - 30, 0, 0, 300, rainLightColor);
      this.drawFloodlightCone(ctx, -halfW - 30, halfH + 30, 0, 0, 300, rainLightColor);
      this.drawFloodlightCone(ctx, halfW + 30, halfH + 30, 0, 0, 300, rainLightColor);

      // Draw Slanted Rain Drops
      ctx.strokeStyle = 'rgba(200, 225, 255, 0.55)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < this.rainDrops.length; i++) {
        const drop = this.rainDrops[i];
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x + drop.slant, drop.y + drop.length);

        drop.y += drop.speed;
        drop.x += drop.slant;

        // Reset if fell below stadium
        if (drop.y > halfH + 50) {
          drop.y = -halfH - 50 - Math.random() * 40;
          drop.x = (Math.random() - 0.5) * (halfW * 2 + 100);

          // Spawn ground water ripple splash
          if (Math.abs(drop.x) < halfW && Math.random() > 0.4) {
            this.rainSplashes.push({
              x: drop.x,
              y: halfH * (Math.random() * 2 - 1),
              radius: 2,
              maxRadius: 6 + Math.random() * 4,
              alpha: 0.6
            });
          }
        }
      }
      ctx.stroke();

      // Draw Water Droplet Splashes / Ripples on grass
      for (let i = 0; i < this.rainSplashes.length; i++) {
        const sp = this.rainSplashes[i];
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, sp.radius * 1.6, sp.radius * 0.8, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(180, 220, 255, ${sp.alpha})`;
        ctx.lineWidth = 1.0;
        ctx.stroke();

        sp.radius += 0.35;
        sp.alpha -= 0.045;
      }
      this.rainSplashes = this.rainSplashes.filter(sp => sp.alpha > 0);

      ctx.restore();
    }
    // 3. SUNSET / GOLDEN HOUR GLOW
    else if (mode === 'sunset') {
      ctx.save();
      const grad = ctx.createLinearGradient(-halfW, -halfH, halfW, halfH);
      grad.addColorStop(0, 'rgba(255, 120, 50, 0.12)');
      grad.addColorStop(0.5, 'rgba(255, 200, 100, 0.06)');
      grad.addColorStop(1, 'rgba(180, 40, 90, 0.12)');
      ctx.fillStyle = grad;
      ctx.fillRect(-halfW - 50, -halfH - 50, (halfW + 50) * 2, (halfH + 50) * 2);
      ctx.restore();
    }
  }

  drawFloodlightCone(ctx, fx, fy, tx, ty, radius, color) {
    ctx.save();
    const grad = ctx.createRadialGradient(fx, fy, 10, fx, fy, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawReplayOverlay(ctx) {
    ctx.save();
    // Scanline & vignette
    ctx.fillStyle = 'rgba(255, 0, 0, 0.05)';
    ctx.fillRect(0, 0, this.width, this.height);

    // Top watermark badge
    const badgeW = 260;
    const badgeH = 42;
    ctx.fillStyle = 'rgba(14, 17, 23, 0.90)';
    ctx.fillRect(20, 20, badgeW, badgeH);
    ctx.strokeStyle = '#e63946';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, badgeW, badgeH);

    // Pulsing red recording dot
    const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
    ctx.fillStyle = `rgba(230, 57, 70, ${0.5 + pulse * 0.5})`;
    ctx.beginPath();
    ctx.arc(38, 41, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "Chakra Petch", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(this.replayLabel || 'TEKRAR [0.5x]', 54, 46);

    // Milestone text overlay
    if (this.currentReplayInfo && this.currentReplayInfo.milestoneText) {
      const milestone = this.currentReplayInfo.milestoneText;
      ctx.font = 'bold 12px "Chakra Petch", sans-serif';
      const mTextW = ctx.measureText(`⚽ ${milestone}`).width;
      const mBadgeW = Math.max(260, mTextW + 28);
      const mBadgeH = 28;
      const mY = 68;

      ctx.fillStyle = 'rgba(14, 17, 23, 0.90)';
      ctx.fillRect(20, mY, mBadgeW, mBadgeH);
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(20, mY, mBadgeW, mBadgeH);

      ctx.fillStyle = '#ffd700';
      ctx.textAlign = 'left';
      ctx.fillText(`⚽ ${milestone}`, 30, mY + 18);
    }

    ctx.restore();
  }
}
