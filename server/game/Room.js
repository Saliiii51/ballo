const Vector2D = require('../physics/Vector2D');
const Stadium = require('../physics/Stadium');
const PhysicsEngine = require('../physics/PhysicsEngine');
const SeededRNG = require('../physics/SeededRNG');
const Player = require('./Player');
const BotAI = require('./BotAI');
const OnlineTournament = require('./OnlineTournament');

const BOT_NAME_POOL = [
  { name: 'Messi', avatar: '10' },
  { name: 'Cristiano', avatar: '7' },
  { name: 'Ronaldinho', avatar: '10' },
  { name: 'Haaland', avatar: '9' },
  { name: 'Mbappé', avatar: '7' },
  { name: 'Neymar', avatar: '11' },
  { name: 'Zidane', avatar: '10' },
  { name: 'Henry', avatar: '14' },
  { name: 'Modric', avatar: '10' },
  { name: 'De Bruyne', avatar: '17' },
  { name: 'Drogba', avatar: '11' },
  { name: 'Sneijder', avatar: '10' },
  { name: 'Alex', avatar: '10' },
  { name: 'Hagi', avatar: '10' },
  { name: 'Muslera', avatar: '1' },
  { name: 'Roberto Carlos', avatar: '3' },
  { name: 'Maldini', avatar: '3' },
  { name: 'Bellingham', avatar: '5' },
  { name: 'Vinicius Jr', avatar: '7' },
  { name: 'Ibrahimovic', avatar: '11' },
  { name: 'Kaka', avatar: '22' },
  { name: 'Shevchenko', avatar: '7' },
  { name: 'Lewandowski', avatar: '9' },
  { name: 'Pirlo', avatar: '21' },
  { name: 'Osimhen', avatar: '45' },
  { name: 'Icardi', avatar: '9' },
  { name: 'Arda Güler', avatar: '15' },
  { name: 'Kenan Yıldız', avatar: '10' },
  { name: 'Barış Alper', avatar: '53' },
  { name: 'Kerem', avatar: '7' },
  { name: 'Ferdi', avatar: '2' },
  { name: 'Tadic', avatar: '10' },
  { name: 'Dzeko', avatar: '9' },
  { name: 'Buffon', avatar: '1' },
  { name: 'Neuer', avatar: '1' },
  { name: 'Maradona', avatar: '10' },
  { name: 'Pelé', avatar: '10' },
  { name: 'Maestro', avatar: '🎼' },
  { name: 'Fırtına', avatar: '⚡' },
  { name: 'Panter', avatar: '🐾' },
  { name: 'Sniper', avatar: '🎯' },
  { name: 'Kasırga', avatar: '🌪️' },
  { name: 'Roket', avatar: '🚀' },
  { name: 'Sihirbaz', avatar: '🎩' },
  { name: 'Gladyatör', avatar: '⚔️' },
  { name: 'Terminator', avatar: '🤖' },
  { name: 'Buz Adam', avatar: '❄️' },
  { name: 'Gol Makinesi', avatar: '⚽' },
  { name: 'Akrep', avatar: '🦂' },
  { name: 'Kartal', avatar: '🦅' },
  { name: 'Aslan', avatar: '🦁' },
  { name: 'Boğa', avatar: '🐂' }
];

class Room {
  constructor(name = 'Ballo Arena', io, profileManager = null, roomId = 'main') {
    this.name = name;
    this.io = io;
    this.profileManager = profileManager;
    this.roomId = roomId;

    this.stadium = new Stadium('classic');
    // Deterministik RNG: her maç başında reseed edilir (tekrarlanabilir fizik)
    this.rng = new SeededRNG((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
    this.rngSeed = this.rng.state;
    this.physics = new PhysicsEngine(this.stadium, () => this.rand());
    this.botAI = new BotAI(this);
    this.botDifficulty = 'extreme';

    this.players = new Map(); // socketId -> Player
    this.bots = new Map();    // botId -> Player
    this.botIdCounter = 1;

    // Online turnuva (oda başına tek aktif turnuva)
    this.tournament = null;

    // Oda maç özellikleri (oda kurarken seçilir)
    this.matchFormat = '1v1';
    this.autoFillBots = true;
    this._filling = false; // format bot doldurma özyineleme kilidi

    // Oda sahibi (host): kritik aksiyonlar sadece host'tan kabul edilir
    this.hostId = null;
    // Rate-limit: oda geneli kritik aksiyon cooldown'u (spam önleme)
    this.lastCriticalActionAt = 0;
    this.criticalActionCooldownMs = 1500;
    // Adaptive broadcast: 60Hz fizik, 30Hz network (bant genişliği %50 azalır)
    this.lastBroadcastTick = -100;
    this.destroyed = false;

    // Ball definition
    this.ball = {
      pos: new Vector2D(0, 0),
      vel: new Vector2D(0, 0),
      radius: 10,
      mass: 0.2,
      invMass: 5.0,
      bounciness: this.stadium.ballBounciness,
      damping: this.stadium.ballDamping
    };

    // Match state
    this.state = 'WAITING'; // 'WAITING', 'PLAYING', 'OVERTIME', 'GOAL_CELEBRATION', 'COUNTDOWN', 'GAME_OVER'
    this.isPaused = false;
    this.scores = { red: 0, blue: 0 };
    this.isTrainingRoom = String(this.roomId).startsWith('training_');
    this.scoreLimit = this.isTrainingRoom ? Infinity : 3;
    this.timeLimit = 180; // 3 minutes in seconds
    this.timeElapsed = 0; // in seconds
    this.tickCount = 0;
    this.celebrationTicks = 0;
    this.countdownTicks = 0;
    this.lastCountdownSec = 0;
    this.lastGoalTeam = null;

    // Crown / King of the pitch tracking (Son gol atan oyuncu Taç takar)
    this.crownedPlayerId = null;
    this.crownedPlayerName = null;
    this.lastTouchPlayer = null;
    this.lastTouchByTeam = { red: null, blue: null };

    // Live Match Stats
    this.stats = {
      possession: { red: 50, blue: 50 },
      shots: { red: 0, blue: 0 },
      saves: { red: 0, blue: 0 },
      lastTouchTeam: null,
      touchTicks: { red: 0, blue: 0 }
    };

    // Kickoff team
    this.kickoffTeam = 'red';

    // Match Goal History (time, scorer, own-goal status)
    this.goalEvents = [];
    this.isGoldenGoalPending = false;

    // Static Obstacles (e.g. training dummies / baraj)
    this.obstacles = [];

    // Game Mode & Bomb Ball mechanics
    this.gameMode = 'classic'; // 'classic' or 'bomb'
    this.bombMaxTicks = 1200; // 20 seconds at 60Hz
    this.bombTicks = this.bombMaxTicks;
    this.bombHolderTeam = null;
    this.bombHolderPlayer = null;
    this.bombExploding = false;
    this.nextBombTeam = null; // Alternates fairly on each explosion
    this.isMatchWipeoutPending = false;
    this.lastWipeoutWinner = null;

    // Start 60Hz loop
    this.intervalId = setInterval(() => this.tick(), 1000 / 60);
  }

  broadcastToRoom(event, data) {
    if (this.io && !this.destroyed) {
      this.io.to(this.roomId).emit(event, data);
    }
  }

  // --- Deterministik RNG ---
  rand() {
    return this.rng.next();
  }

  reseed(seed) {
    this.rng.setSeed(seed);
    this.rngSeed = this.rng.state;
  }

  // --- Host / Yetki ---
  isSoloRoom() {
    const id = String(this.roomId || '');
    return id.startsWith('training_') || id.startsWith('tourn_');
  }

  isHost(socketId) {
    if (!socketId) return false;
    if (this.isSoloRoom()) return true; // solo odalarda herkes kendi host'u
    if (!this.hostId) return true; // host yoksa ilk gelen izinli (sonra atanır)
    return this.hostId === socketId;
  }

  ensureHost() {
    if (this.hostId && this.players.has(this.hostId)) return this.hostId;
    // Sıradaki ilk insan oyuncuyu host yap
    const first = this.players.keys().next();
    this.hostId = first.done ? null : first.value;
    return this.hostId;
  }

  // Kritik aksiyonlar (restart/map/bot) için host + rate-limit kontrolü.
  // Dönüş: { ok:true } veya { ok:false, reason }
  checkCriticalAction(socketId) {
    if (!this.isHost(socketId)) {
      return { ok: false, reason: 'Bu işlem sadece oda sahibi (host) tarafından yapılabilir.' };
    }
    const now = Date.now();
    if (now - this.lastCriticalActionAt < this.criticalActionCooldownMs) {
      return { ok: false, reason: 'Çok hızlı işlem yapıyorsun, biraz bekle.' };
    }
    this.lastCriticalActionAt = now;
    return { ok: true };
  }

  shouldBroadcastGameState() {
    // Aktif oyunda 60Hz (her 1 tick), lobide 4Hz, boş odada 1Hz
    if (this.players.size === 0 && this.bots.size === 0) {
      return (this.tickCount - this.lastBroadcastTick) >= 60;
    }
    if (this.state === 'PLAYING' || this.state === 'OVERTIME' || this.state === 'GOAL_CELEBRATION' || this.state === 'WALKOUT') {
      return (this.tickCount - this.lastBroadcastTick) >= 1;
    }
    return (this.tickCount - this.lastBroadcastTick) >= 15;
  }

  maybeBroadcastGameState(force = false) {
    if (force || this.shouldBroadcastGameState()) {
      this.lastBroadcastTick = this.tickCount;
      this.broadcastGameState();
    }
  }

  setObstacles(obstacleList) {
    this.obstacles = Array.isArray(obstacleList) ? obstacleList.map(o => ({
      x: Number(o.x) || 0,
      y: Number(o.y) || 0,
      radius: Number(o.radius) || 15
    })) : [];
  }

  setBallPosition(x, y) {
    this.ball.pos.set(Number(x) || 0, Number(y) || 0);
    this.ball.vel.set(0, 0);
  }

  setCustomStadium(customConfig) {
    if (!customConfig) return;
    const noGoals = (this.gameMode === 'bomb');
    this.stadium.loadCustom(customConfig, noGoals);
    this.ball.damping = this.stadium.ballDamping;
    this.ball.bounciness = this.stadium.ballBounciness;
    for (const p of this.getAllActivePlayers()) {
      p.damping = this.stadium.playerDamping;
    }
    this.resetPositions();
    this.broadcastToRoom('stadium_changed', this.getStadiumData());
    this.broadcastLobby();
  }

  setMap(presetKey) {
    const noGoals = (this.gameMode === 'bomb');
    this.stadium.loadPreset(presetKey, noGoals);
    this.ball.damping = this.stadium.ballDamping;
    this.ball.bounciness = this.stadium.ballBounciness;

    // Apply stadium player damping to all active players
    for (const p of this.getAllActivePlayers()) {
      p.damping = this.stadium.playerDamping;
    }

    this.resetPositions();
    this.broadcastToRoom('stadium_changed', this.getStadiumData());
    this.broadcastLobby();
  }

  getStadiumData() {
    return {
      preset: this.stadium.currentPresetKey,
      name: this.stadium.name,
      theme: this.stadium.theme,
      width: this.stadium.width,
      height: this.stadium.height,
      goalWidth: this.stadium.goalWidth,
      goalDepth: this.stadium.goalDepth,
      postRadius: this.stadium.postRadius,
      centerCircleRadius: this.stadium.centerCircleRadius,
      noGoals: !!this.stadium.noGoals,
      bumpers: (this.stadium && this.stadium.bumpers) ? this.stadium.bumpers : [],
      posts: this.stadium.posts.map(p => ({
        x: p.pos.x,
        y: p.pos.y,
        radius: p.radius,
        color: p.color
      })),
      segments: this.stadium.segments.map(s => ({
        p1: { x: s.p1.x, y: s.p1.y },
        p2: { x: s.p2.x, y: s.p2.y },
        type: s.type
      }))
    };
  }

  addPlayer(socketId, name, avatar = null, requestedTeam = null) {
    // Prevent duplicate player clones on page refresh / reconnect with same name
    const cleanName = String(name || '').trim();
    if (cleanName) {
      const lowerName = cleanName.toLowerCase();
      for (const [existingSocketId, existingPlayer] of this.players.entries()) {
        if (existingPlayer.name && existingPlayer.name.toLowerCase() === lowerName) {
          this.players.delete(existingSocketId);
        }
      }
    }

    const player = new Player(socketId, cleanName || 'Player');
    player.damping = this.stadium.playerDamping;
    if (this.profileManager) {
      const prof = this.profileManager.getProfile(cleanName || 'Player');
      if (prof) {
        player.goals = prof.goals;
        player.avatar = prof.avatar || player.avatar;
        player.aura = prof.aura || 'none';
        player.title = prof.title || 'Çaylak Forvet';
      }
    }
    if (avatar) {
      player.avatar = String(avatar).trim().slice(0, 3);
    }
    this.players.set(socketId, player);

    if (['red', 'blue', 'spec'].includes(requestedTeam)) {
      player.team = requestedTeam;
    } else {
      const redCount = this.getTeamCount('red');
      const blueCount = this.getTeamCount('blue');
      if (redCount <= blueCount) {
        player.team = 'red';
      } else {
        player.team = 'blue';
      }
    }

    // İlk gelen oyuncu host olur (oda sahipliği)
    if (!this.hostId || !this.players.has(this.hostId)) {
      this.hostId = socketId;
    }

    this.checkAutoStart();
    this.broadcastLobby();
    return player;
  }

  removePlayer(socketId) {
    if (this.crownedPlayerId === socketId) {
      this.crownedPlayerId = null;
      this.crownedPlayerName = null;
    }

    // Bomba tutan oyuncu çıktıysa bombayı sahadaki bir başkasına devret
    if (this.gameMode === 'bomb' && this.bombHolderPlayer && this.bombHolderPlayer.id === socketId) {
      const activeCandidates = this.getAllActivePlayers().filter(p => p.id !== socketId && !p.isEliminated);
      if (activeCandidates.length > 0) {
        const sameTeam = activeCandidates.filter(p => p.team === this.bombHolderTeam);
        const target = sameTeam.length > 0 ? sameTeam[Math.floor(Math.random() * sameTeam.length)] : activeCandidates[Math.floor(Math.random() * activeCandidates.length)];
        this.bombHolderPlayer = { id: target.id, name: target.name, team: target.team };
        this.bombHolderTeam = target.team;
      } else {
        this.bombHolderPlayer = null;
        this.bombHolderTeam = null;
      }
    }

    this.players.delete(socketId);

    // Bomba modunda bir takımın tüm oyuncuları çıktıysa karşı takım maçı kazansın
    if (this.gameMode === 'bomb' && (this.state === 'PLAYING' || this.state === 'OVERTIME')) {
      const redAlive = this.getAliveCount('red');
      const blueAlive = this.getAliveCount('blue');
      if (redAlive === 0 && blueAlive > 0) {
        this.lastWipeoutWinner = 'blue';
        this.endMatch('blue');
      } else if (blueAlive === 0 && redAlive > 0) {
        this.lastWipeoutWinner = 'red';
        this.endMatch('red');
      }
    }

    // Host ayrıldıysa sıradaki oyuncuya devret
    if (this.hostId === socketId) {
      this.ensureHost();
    }

    // Turnuva katılımından da çıkar (hükmen galibiyet + braket güncellemesi)
    if (this.tournament && this.tournament.isActive()) {
      const wasPlaying = this.tournament.state === 'PLAYING';
      const liveMatch = wasPlaying ? this.tournament.currentMatch() : null;
      const leaverWasPlaying = !!(liveMatch && liveMatch.p1 && liveMatch.p2 &&
        (liveMatch.p1.id === socketId || liveMatch.p2.id === socketId));
      this.tournament.removeParticipant(socketId);
      if (this.tournament.state === 'DONE') {
        this.broadcastToRoom('online_tournament_end', { champion: this.tournament.champion });
      } else if (wasPlaying && leaverWasPlaying &&
        (this.state === 'PLAYING' || this.state === 'OVERTIME' || this.state === 'WALKOUT')) {
        // Canlı maçtaki oyuncu gitti: yarım kalan maçı bitir, sıradakini kur
        this.setupTournamentMatch();
      }
      this.broadcastToRoom('online_tournament_update', this.getTournamentData());
    }

    // If no human players remain in this room, completely clean up bots and reset state
    if (this.players.size === 0) {
      this.bots.clear();
      this.hostId = null;
      this.tournament = null;
      this.scores = { red: 0, blue: 0 };
      this.timeElapsed = 0;
      this.state = 'WAITING';
      this.lastGoalTeam = null;
      this.celebrationTicks = 0;
      this.isGoldenGoalPending = false;
      this.goalEvents = [];
      this.resetPositions();
    } else {
      this.checkAutoStart();
    }
    this.broadcastLobby();
  }

  startSoloMatch(socketId) {
    this.setupAndStartMatch({ format: '1v1', team: 'red', duration: 180, scoreLimit: 3 }, socketId);
  }

  restartMatch(socketId = null) {
    if (this.matchConfig) {
      this.setupAndStartMatch(this.matchConfig, socketId);
    } else {
      this.startMatch();
    }
  }

  setupAndStartMatch(config = {}, socketId = null) {
    const format = config.format || '1v1'; // '1v1', '2v2', '3v3', '4v4'
    const team = (config.team === 'blue') ? 'blue' : 'red';
    const duration = Number(config.duration) >= 0 ? Number(config.duration) : 180;
    const scoreLimit = Number(config.scoreLimit) >= 0 ? Number(config.scoreLimit) : 3;
    const difficulty = config.difficulty || 'extreme';
    const map = config.map || 'classic';
    const weather = config.weather || 'night';
    const gameMode = (config.gameMode === 'bomb') ? 'bomb' : 'classic';
    const bombSeconds = (config.bombTimer && Number(config.bombTimer) > 0) ? Number(config.bombTimer) : 20;

    this.matchConfig = {
      format,
      team,
      duration,
      scoreLimit,
      difficulty,
      map,
      weather,
      gameMode,
      bombTimer: bombSeconds,
      customStadium: config.customStadium || null
    };

    // 1. Time limit and score limit
    this.isPaused = false;
    this.gameMode = gameMode;
    this.timeLimit = (gameMode === 'bomb') ? Infinity : (duration > 0 ? duration : Infinity);
    this.scoreLimit = (gameMode === 'bomb') ? 3 : (scoreLimit > 0 ? scoreLimit : Infinity);
    this.botDifficulty = difficulty;

    // Bomb timer configuration
    this.bombMaxTicks = bombSeconds * 60;
    this.bombTicks = this.bombMaxTicks;
    this.bombHolderTeam = null;
    this.bombHolderPlayer = null;
    this.bombExploding = false;
    this.nextBombTeam = 'red';

    // 2. Map / Custom Stadium change if needed
    if (map === 'custom' && config.customStadium) {
      this.setCustomStadium(config.customStadium);
    } else if (this.stadium.currentPresetKey !== map || this.stadium.noGoals !== (gameMode === 'bomb')) {
      this.setMap(map);
    }

    // 3. Set requesting human team
    if (socketId) {
      const player = this.players.get(socketId);
      if (player) {
        player.team = team;
      }
    }

    // 4. Clear all existing bots
    this.bots.clear();
    this.botIdCounter = 1;

    // 5. Populate bots to fulfill team format (1v1, 2v2, 3v3, 4v4)
    const teamTargetMap = { '1v1': 1, '2v2': 2, '3v3': 3, '4v4': 4 };
    const targetPerTeam = teamTargetMap[format] || 1;

    let redHumans = 0;
    let blueHumans = 0;
    for (const p of this.players.values()) {
      if (p.team === 'red') redHumans++;
      else if (p.team === 'blue') blueHumans++;
    }

    const redBotsNeeded = Math.max(0, targetPerTeam - redHumans);
    const blueBotsNeeded = Math.max(0, targetPerTeam - blueHumans);

    for (let i = 0; i < redBotsNeeded; i++) {
      this.addBot('red');
    }
    for (let i = 0; i < blueBotsNeeded; i++) {
      this.addBot('blue');
    }

    // 6. Start match fresh
    this.startMatch();
    this.broadcastToRoom('match_configured', this.matchConfig);
    this.broadcastLobby();
  }

  setPlayerTeam(socketId, team) {
    const player = this.players.get(socketId);
    if (!player) return;
    if (['red', 'blue', 'spec'].includes(team)) {
      player.team = team;
      this.resetPlayerPosition(player);
      this.checkAutoStart();
      this.broadcastLobby();
    }
  }

  setPlayerAvatar(socketId, avatar) {
    const player = this.players.get(socketId);
    if (!player) return;
    const cleanAvatar = String(avatar || '').trim().slice(0, 3);
    if (cleanAvatar) {
      player.avatar = cleanAvatar;
      this.broadcastLobby();
    }
  }

  getRandomBotProfile() {
    const usedNames = new Set();
    for (const p of this.players.values()) {
      usedNames.add(p.name.toLowerCase());
    }
    for (const b of this.bots.values()) {
      usedNames.add(b.name.toLowerCase());
    }

    const available = BOT_NAME_POOL.filter(item => !usedNames.has(item.name.toLowerCase()));
    if (available.length > 0) {
      const selected = available[Math.floor(this.rand() * available.length)];
      return { name: selected.name, avatar: selected.avatar };
    }

    // Fallback if all used: pick random and append number
    const fallback = BOT_NAME_POOL[Math.floor(this.rand() * BOT_NAME_POOL.length)];
    return {
      name: `${fallback.name} #${this.bots.size + 1}`,
      avatar: fallback.avatar
    };
  }

  addBot(team = null) {
    const botId = `bot_${this.botIdCounter++}`;
    const targetTeam = team || (this.getTeamCount('red') > this.getTeamCount('blue') ? 'blue' : 'red');
    const { name: botName, avatar: botAvatar } = this.getRandomBotProfile();
    const bot = new Player(botId, botName, true);
    bot.team = targetTeam;
    bot.avatar = botAvatar || '🤖';
    this.botAI.applyDifficulty(bot, this.botDifficulty);
    this.bots.set(botId, bot);

    this.resetPositions();
    this.checkAutoStart();
    this.broadcastLobby();
    return bot;
  }

  removeBot(botId = null) {
    let removedId = null;
    if (botId && this.bots.has(botId)) {
      removedId = botId;
      this.bots.delete(botId);
    } else if (this.bots.size > 0) {
      // Remove last added bot
      removedId = Array.from(this.bots.keys()).pop();
      this.bots.delete(removedId);
    }
    if (removedId && this.crownedPlayerId === removedId) {
      this.crownedPlayerId = null;
      this.crownedPlayerName = null;
    }
    this.checkAutoStart();
    this.broadcastLobby();
  }

  toggleBot() {
    if (this.bots.size > 0) {
      this.removeBot();
    } else {
      this.addBot();
    }
  }

  setBotDifficulty(diff) {
    if (['easy', 'medium', 'hard', 'extreme'].includes(diff)) {
      this.botDifficulty = diff;
      for (const bot of this.bots.values()) {
        this.botAI.applyDifficulty(bot, diff);
      }
      this.broadcastLobby();
    }
  }

  getTeamCount(team) {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.team === team) count++;
    }
    for (const b of this.bots.values()) {
      if (b.team === team) count++;
    }
    return count;
  }

  getAllActivePlayers() {
    const list = [];
    for (const p of this.players.values()) {
      if (p.active && !p.isEliminated) list.push(p);
    }
    for (const b of this.bots.values()) {
      if (b.active && !b.isEliminated) list.push(b);
    }
    return list;
  }

  getAlivePlayers(team) {
    const list = [];
    for (const p of this.players.values()) {
      if (p.active && p.team === team && !p.isEliminated) list.push(p);
    }
    for (const b of this.bots.values()) {
      if (b.active && b.team === team && !b.isEliminated) list.push(b);
    }
    return list;
  }

  getAliveCount(team) {
    return this.getAlivePlayers(team).length;
  }

  getEliminatedCount(team) {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.active && p.team === team && p.isEliminated) count++;
    }
    for (const b of this.bots.values()) {
      if (b.active && b.team === team && b.isEliminated) count++;
    }
    return count;
  }

  getDugoutSeatPos(team, seatIndex) {
    const halfW = this.stadium.halfW || 400;
    const halfH = this.stadium.halfH || 200;
    const dugoutCenterX = (team === 'red' ? -1 : 1) * Math.min(135, halfW * 0.38);
    const dugoutSeatY = -halfH - 28;
    const slotOffsets = [-54, -18, 18, 54];
    const offset = (seatIndex < slotOffsets.length)
      ? slotOffsets[seatIndex]
      : (54 + (seatIndex - 3) * 36);
    return {
      x: Math.round(dugoutCenterX + offset),
      y: Math.round(dugoutSeatY)
    };
  }

  // Oda kurarken seçilen özellikleri uygula (doğrulamalı)
  applyRoomConfig(cfg = {}) {
    const formats = ['1v1', '2v2', '3v3', '4v4'];
    if (formats.includes(cfg.format)) this.matchFormat = cfg.format;
    const diffs = ['easy', 'medium', 'hard', 'extreme'];
    if (diffs.includes(cfg.difficulty)) this.botDifficulty = cfg.difficulty;
    this.autoFillBots = cfg.autoFillBots !== false;

    const mode = (cfg.gameMode === 'bomb') ? 'bomb' : 'classic';
    this.gameMode = mode;
    const dur = Number(cfg.duration);
    this.timeLimit = (mode === 'bomb') ? Infinity : ((dur > 0) ? Math.min(3600, dur) : Infinity);
    const lim = Number(cfg.scoreLimit);
    this.scoreLimit = (mode === 'bomb') ? 3 : ((lim > 0) ? Math.min(30, lim) : Infinity);
    const bt = Number(cfg.bombTimer);
    const bombSec = (bt > 0) ? Math.min(60, Math.max(5, bt)) : 20;
    this.bombMaxTicks = bombSec * 60;
    this.bombTicks = this.bombMaxTicks;
    // Antrenman odası skorsuzdur
    if (this.isTrainingRoom) this.scoreLimit = Infinity;
  }

  getRoomConfig() {
    return {
      format: this.matchFormat,
      duration: (this.timeLimit && this.timeLimit < 9999) ? this.timeLimit : 0,
      scoreLimit: (this.scoreLimit && this.scoreLimit < 9999) ? this.scoreLimit : 0,
      difficulty: this.botDifficulty,
      gameMode: this.gameMode,
      bombTimer: Math.round(this.bombMaxTicks / 60),
      autoFillBots: !!this.autoFillBots
    };
  }

  neverStarted() {
    return this.scores.red === 0 && this.scores.blue === 0 &&
      this.timeElapsed === 0 && this.goalEvents.length === 0;
  }

  // İzleyicileri iki takıma dengeli dağıt (2 kişi olunca maç başlasın diye)
  autoBalanceTeams() {
    const count = (t) => {
      let n = 0;
      for (const p of this.players.values()) if (p.team === t) n++;
      for (const b of this.bots.values()) if (b.team === t) n++;
      return n;
    };
    for (const p of this.players.values()) {
      if (p.team === 'spec') {
        p.team = (count('red') <= count('blue')) ? 'red' : 'blue';
        this.resetPlayerPosition(p);
      }
    }
  }

  // Format dolana kadar eksik takıma bot ekle (örn. 2v2'de 2 insan + 2 bot)
  fillFormatBots() {
    if (!this.autoFillBots || this._filling) return;
    const target = { '1v1': 1, '2v2': 2, '3v3': 3, '4v4': 4 }[this.matchFormat] || 1;
    const humans = (t) => {
      let n = 0;
      for (const p of this.players.values()) if (p.team === t) n++;
      return n;
    };
    const needR = Math.max(0, target - humans('red'));
    const needB = Math.max(0, target - humans('blue'));
    if (needR + needB === 0) return;
    this._filling = true;
    try {
      for (let i = 0; i < needR; i++) this.addBot('red');
      for (let i = 0; i < needB; i++) this.addBot('blue');
    } finally {
      this._filling = false;
    }
  }

  checkAutoStart() {
    if (this._filling) return;
    const redCount = this.getTeamCount('red');
    const blueCount = this.getTeamCount('blue');

    if (this.state === 'WAITING') {
      // Antrenman odası tek kişiyle başlar (yoksa fizik hiç çalışmaz)
      if (this.isTrainingRoom) {
        if (redCount >= 1 || blueCount >= 1) this.startMatch(false);
        return;
      }
      if (redCount >= 1 && blueCount >= 1) {
        this.fillFormatBots();
        this.startMatch();
        return;
      }
      // Toplam 2 kişi odaya girince takımları otomatik dağıt ve maçı başlat
      // (sadece daha önce hiç başlanmamış taze odada; maçtan düşen izleyici zorla alınmaz)
      if (this.neverStarted() && this.players.size >= 2) {
        this.autoBalanceTeams();
        this.fillFormatBots();
        if (this.getTeamCount('red') >= 1 && this.getTeamCount('blue') >= 1) {
          this.startMatch();
        }
      }
    } else if (this.state === 'PLAYING' && (redCount === 0 || blueCount === 0)) {
      this.state = 'WAITING';
      this.resetPositions();
    }
  }

  startMatch(isWalkout = true) {
    // Yeni maç = yeni deterministik seed (loglanırsa tekrar üretilebilir)
    this.reseed((Date.now() ^ (this.tickCount * 2654435761)) >>> 0);
    this.isPaused = false;
    this.scores = { red: 0, blue: 0 };
    this.timeElapsed = 0;
    this.kickoffTeam = 'red';
    this.celebrationTicks = 0;
    this.countdownTicks = 0;
    this.lastCountdownSec = 0;
    this.isGoldenGoalPending = false;
    this.goalEvents = [];
    this.crownedPlayerId = null;
    this.crownedPlayerName = null;
    this.lastGoalTeam = null;
    this.stats = {
      possession: { red: 50, blue: 50 },
      shots: { red: 0, blue: 0 },
      saves: { red: 0, blue: 0 },
      lastTouchTeam: null,
      touchTicks: { red: 0, blue: 0 }
    };

    // Reset bomb state for new match
    this.bombTicks = this.bombMaxTicks;
    this.bombHolderTeam = null;
    this.bombHolderPlayer = null;
    this.bombExploding = false;
    this.isMatchWipeoutPending = false;
    this.lastWipeoutWinner = null;
    if (!this.nextBombTeam) {
      this.nextBombTeam = 'red';
    }

    // Ensure stadium matches current game mode
    const wantNoGoals = (this.gameMode === 'bomb');
    if (this.stadium.noGoals !== wantNoGoals) {
      this.stadium.setNoGoals(wantNoGoals);
      this.broadcastToRoom('stadium_changed', this.getStadiumData());
    }

    if (!this.isTrainingRoom && isWalkout) {
      this.state = 'WALKOUT';
      this.walkoutTicks = 260;
      this.resetPositions(true);
      this.broadcastToRoom('walkout_started', { duration: 260 });
    } else {
      this.resetPositions(false);
      if (!this.isTrainingRoom) {
        this.state = 'COUNTDOWN';
        this.countdownTicks = 180;
        this.lastCountdownSec = 3;
        this.broadcastToRoom('kickoff_countdown', { count: 3 });
      } else {
        this.state = 'PLAYING';
      }
    }

    this.broadcastToRoom('match_started', {
      scores: this.scores,
      timeLimit: this.timeLimit,
      scoreLimit: this.scoreLimit,
      matchConfig: this.matchConfig || null,
      gameMode: this.gameMode
    });
  }

  finishWalkout() {
    this.state = 'COUNTDOWN';
    this.countdownTicks = 180;
    this.lastCountdownSec = 3;
    const allActive = this.getAllActivePlayers();
    for (const p of allActive) {
      if (p.targetX != null && p.targetY != null) {
        p.pos.set(p.targetX, p.targetY);
        p.vel.set(0, 0);
      }
      p.walkoutArrived = true;
    }
    this.ball.pos.set(0, 0);
    this.ball.vel.set(0, 0);

    // If Bomb Mode: Assign bomb to forward starter of starting team
    if (this.gameMode === 'bomb') {
      const targetTeam = this.nextBombTeam || 'red';
      const teamPlayers = allActive.filter(p => p.team === targetTeam && !p.isEliminated);
      if (teamPlayers.length > 0) {
        const starter = teamPlayers[0];
        this.ball.pos.set(starter.pos.x + (targetTeam === 'red' ? 24 : -24), starter.pos.y);
        this.ball.vel.set(0, 0);
        this.bombHolderTeam = targetTeam;
        this.bombHolderPlayer = { id: starter.id, name: starter.name, team: starter.team };
        this.bombTicks = this.bombMaxTicks;
        this.broadcastToRoom('sound_event', { type: 'bomb_tag', player: this.bombHolderPlayer });
      }
      this.nextBombTeam = (targetTeam === 'red') ? 'blue' : 'red';
    }

    this.broadcastToRoom('kickoff_countdown', { count: 3 });
    this.lastBroadcastTick = this.tickCount;
    this.broadcastGameState();
  }

  skipWalkout() {
    if (this.state === 'WALKOUT') {
      this.finishWalkout();
    }
  }

  resetPositions(isWalkout = false) {
    this.ball.pos.set(0, 0);
    this.ball.vel.set(0, 0);

    // Reset bomb round countdown
    this.bombTicks = this.bombMaxTicks;
    this.bombHolderTeam = null;
    this.bombHolderPlayer = null;
    this.bombExploding = false;

    // Un-eliminate all players for the new round / match
    for (const p of this.players.values()) p.isEliminated = false;
    for (const b of this.bots.values()) b.isEliminated = false;

    const redPlayers = [];
    for (const p of this.players.values()) if (p.team === 'red') redPlayers.push(p);
    for (const b of this.bots.values()) if (b.team === 'red') redPlayers.push(b);

    const bluePlayers = [];
    for (const p of this.players.values()) if (p.team === 'blue') bluePlayers.push(p);
    for (const b of this.bots.values()) if (b.team === 'blue') bluePlayers.push(b);

    const halfW = this.stadium.halfW;
    const halfH = this.stadium.halfH;
    const kickoffTeam = this.kickoffTeam || 'red';
    const tunnelX = 0;
    const tunnelY = -halfH - 36;

    redPlayers.forEach((p, idx) => {
      const jitterX = (this.rand() - 0.5) * 10;
      const jitterY = (this.rand() - 0.5) * 12;
      const targetX = -halfW * (kickoffTeam === 'red' && idx === 0 ? 0.28 : 0.52) + jitterX;
      const targetY = (idx - (redPlayers.length - 1) / 2) * 60 + jitterY;
      p.targetX = targetX;
      p.targetY = targetY;

      if (isWalkout) {
        p.walkoutStartTick = this.tickCount + idx * 24;
        p.walkoutArrived = false;
        p.reset(tunnelX - 10, tunnelY);
      } else {
        p.walkoutArrived = true;
        p.reset(targetX, targetY);
      }
      p.damping = this.stadium.playerDamping;
    });

    bluePlayers.forEach((p, idx) => {
      const jitterX = (this.rand() - 0.5) * 10;
      const jitterY = (this.rand() - 0.5) * 12;
      const targetX = halfW * (kickoffTeam === 'blue' && idx === 0 ? 0.28 : 0.52) + jitterX;
      const targetY = (idx - (bluePlayers.length - 1) / 2) * 60 + jitterY;
      p.targetX = targetX;
      p.targetY = targetY;

      if (isWalkout) {
        p.walkoutStartTick = this.tickCount + idx * 24;
        p.walkoutArrived = false;
        p.reset(tunnelX + 10, tunnelY);
      } else {
        p.walkoutArrived = true;
        p.reset(targetX, targetY);
      }
      p.damping = this.stadium.playerDamping;
    });

    // Bomb mode placement when NOT walkout (e.g. next round after goal celebration)
    if (this.gameMode === 'bomb' && !isWalkout) {
      const targetTeam = this.nextBombTeam || 'red';
      const targetList = (targetTeam === 'red') ? redPlayers : bluePlayers;
      if (targetList.length > 0) {
        const starter = targetList[0];
        this.ball.pos.set(starter.pos.x + (targetTeam === 'red' ? 24 : -24), starter.pos.y);
        this.ball.vel.set(0, 0);
        this.bombHolderTeam = targetTeam;
        this.bombHolderPlayer = { id: starter.id, name: starter.name, team: starter.team };
        this.bombTicks = this.bombMaxTicks;
        this.broadcastToRoom('sound_event', { type: 'bomb_tag', player: this.bombHolderPlayer });
      }
      this.nextBombTeam = (targetTeam === 'red') ? 'blue' : 'red';
    }
  }

  resetPlayerPosition(player) {
    const halfW = this.stadium.halfW;
    if (player.team === 'red') player.reset(-halfW * 0.5, 0);
    else if (player.team === 'blue') player.reset(halfW * 0.5, 0);
    else player.reset(0, 0);
  }

  handlePlayerInput(socketId, inputData) {
    const player = this.players.get(socketId);
    if (!player || !player.active || player.isEliminated) return;

    player.inputs.up = !!inputData.up;
    player.inputs.down = !!inputData.down;
    player.inputs.left = !!inputData.left;
    player.inputs.right = !!inputData.right;
    player.inputs.kick = !!inputData.kick;
  }

  setPause(isPaused, socketId = null) {
    this.isPaused = !!isPaused;
    this.broadcastToRoom('match_paused', { isPaused: this.isPaused, pausedBy: socketId });
    this.lastBroadcastTick = this.tickCount;
    this.broadcastGameState();
  }

  tick() {
    if (this.destroyed) return;
    this.tickCount++;

    // Boş oda: fizik çalıştırma, 1Hz heartbeat ile canlı tut (CPU koruması)
    if (this.players.size === 0 && this.bots.size === 0) {
      this.maybeBroadcastGameState(false);
      return;
    }

    // When match is paused: freeze timer, bots, physics, and celebrations
    if (this.isPaused) {
      if (this.tickCount % 30 === 0) {
        this.lastBroadcastTick = this.tickCount;
        this.broadcastGameState();
      }
      return;
    }

    // 0. Walkout Ceremony: Players marching out from locker room tunnel
    if (this.state === 'WALKOUT') {
      this.walkoutTicks--;

      let allArrived = true;
      const allActive = this.getAllActivePlayers();

      for (const p of allActive) {
        if (!p.walkoutArrived) {
          allArrived = false;
          if (this.tickCount >= (p.walkoutStartTick || 0)) {
            const tx = p.targetX != null ? p.targetX : p.pos.x;
            const ty = p.targetY != null ? p.targetY : p.pos.y;
            const dx = tx - p.pos.x;
            const dy = ty - p.pos.y;
            const dist = Math.hypot(dx, dy);
            const walkSpeed = 2.1;

            if (dist <= walkSpeed) {
              p.pos.set(tx, ty);
              p.vel.set(0, 0);
              p.walkoutArrived = true;
            } else {
              p.pos.x += (dx / dist) * walkSpeed;
              p.pos.y += (dy / dist) * walkSpeed;
              p.vel.set((dx / dist) * walkSpeed, (dy / dist) * walkSpeed);
            }
          }
        }
      }

      if (allArrived || this.walkoutTicks <= 0) {
        this.finishWalkout();
        return;
      }

      this.maybeBroadcastGameState(false);
      return;
    }

    // 1. Match Time & Overtime (Golden Goal)
    if (this.state === 'PLAYING' || this.state === 'OVERTIME') {
      if (this.tickCount % 60 === 0) {
        this.timeElapsed++;
        if (this.timeElapsed >= this.timeLimit && this.state === 'PLAYING') {
          if (this.scores.red === this.scores.blue) {
            // Golden goal overtime!
            this.state = 'OVERTIME';
            this.broadcastToRoom('overtime_started');
          } else {
            this.endMatch();
          }
        }
      }

      // 1b. Bomb Mode Timer & Ticking
      if (this.gameMode === 'bomb' && !this.isPaused) {
        if (this.bombHolderTeam) {
          this.bombTicks--;
          // Audio ticks for last 4 seconds
          if (this.bombTicks <= 240 && this.bombTicks > 0) {
            const interval = this.bombTicks < 60 ? 6 : (this.bombTicks < 120 ? 12 : 24);
            if (this.bombTicks % interval === 0) {
              this.broadcastToRoom('sound_event', { type: 'bomb_tick', urgency: (240 - this.bombTicks) / 240 });
            }
          }
          if (this.bombTicks <= 0 && !this.bombExploding) {
            this.bombExploding = true;
            const victimPlayer = this.bombHolderPlayer;
            const victimTeam = this.bombHolderTeam;
            const scorerTeam = victimTeam === 'red' ? 'blue' : 'red';

            let blastPos = this.ball.pos.clone();
            let victimObj = null;
            if (victimPlayer) {
              victimObj = this.players.get(victimPlayer.id) || this.bots.get(victimPlayer.id);
              if (victimObj && victimObj.active) {
                blastPos = victimObj.pos.clone();
              }
            }

            // 1. ELIMINATE VICTIM & SEND TO TEAM DUGOUT BENCH (YEDEK KULÜBESİNE GİTSİN)
            if (victimObj) {
              victimObj.inputs = { up: false, down: false, left: false, right: false, kick: false };
              const currentElimCount = this.getEliminatedCount(victimObj.team);
              const seatPos = this.getDugoutSeatPos(victimObj.team, currentElimCount);
              victimObj.isEliminated = true;
              victimObj.reset(seatPos.x, seatPos.y);
              victimObj.isEliminated = true;
            }

            // Radial blast pushing surviving players
            this.physics.applyExplosionImpulse(blastPos, 340, 26, this.getAllActivePlayers(), this.ball);

            // Check alive count on each team
            const redAlive = this.getAliveCount('red');
            const blueAlive = this.getAliveCount('blue');
            const isTeamWipedOut = (victimTeam === 'red' ? redAlive === 0 : blueAlive === 0);

            if (isTeamWipedOut) {
              // Bütün oyuncular elendi -> Karşı takım OYUNU KAZANIR!
              this.scores[scorerTeam]++;
              this.lastWipeoutWinner = scorerTeam;
              this.isMatchWipeoutPending = true;
              this.nextBombTeam = (victimTeam === 'red') ? 'blue' : 'red';
              this.kickoffTeam = this.nextBombTeam;

              this.broadcastToRoom('bomb_exploded', {
                pos: { x: blastPos.x, y: blastPos.y },
                victimTeam,
                victimPlayer,
                victimEliminated: true,
                isTeamWipedOut: true,
                redAlive,
                blueAlive,
                scorerTeam,
                scores: this.scores,
                reason: 'timer'
              });

              this.celebrationTicks = 160;
              this.state = 'GOAL_CELEBRATION';
            } else {
              // Teammates still alive! Round continues with remaining gladiators
              this.broadcastToRoom('bomb_exploded', {
                pos: { x: blastPos.x, y: blastPos.y },
                victimTeam,
                victimPlayer,
                victimEliminated: true,
                isTeamWipedOut: false,
                redAlive,
                blueAlive,
                scorerTeam,
                scores: this.scores,
                reason: 'timer'
              });

              // Kırmızı patladıysa bomba maviye geçsin (veya tersi - Adalet olsun!)
              const oppTeam = (victimTeam === 'red') ? 'blue' : 'red';
              const oppAlive = [];
              for (const p of this.getAllActivePlayers()) {
                if (p.team === oppTeam && !p.isEliminated) oppAlive.push(p);
              }

              if (oppAlive.length > 0) {
                const starter = oppAlive[0];
                this.ball.pos.set(starter.pos.x + (oppTeam === 'red' ? 24 : -24), starter.pos.y);
                this.ball.vel.set(0, 0);
                this.bombHolderTeam = oppTeam;
                this.bombHolderPlayer = { id: starter.id, name: starter.name, team: starter.team };
                this.bombTicks = this.bombMaxTicks;
                this.bombExploding = false;
                this.broadcastToRoom('sound_event', { type: 'bomb_tag', player: this.bombHolderPlayer });
              } else {
                this.ball.pos.set(0, 0);
                this.ball.vel.set(0, 0);
                this.bombTicks = this.bombMaxTicks;
                this.bombHolderTeam = null;
                this.bombHolderPlayer = null;
                this.bombExploding = false;
              }
            }
          }
        }
      }
    }

    // 2. Goal Celebration
    if (this.state === 'GOAL_CELEBRATION') {
      this.celebrationTicks--;
      this.ball.vel.mult(0.95);
      this.ball.pos.add(this.ball.vel);

      if (this.celebrationTicks <= 0) {
        // If wipeout, golden goal overtime, or reached score limit -> end match immediately!
        if (this.isMatchWipeoutPending || this.isGoldenGoalPending || this.scores.red >= this.scoreLimit || this.scores.blue >= this.scoreLimit) {
          this.isGoldenGoalPending = false;
          this.isMatchWipeoutPending = false;
          this.endMatch();
        } else {
          this.resetPositions();
          this.state = 'COUNTDOWN';
          this.countdownTicks = 180;
          this.lastCountdownSec = 3;
          this.broadcastToRoom('kickoff_countdown', { count: 3 });
        }
      }
    } else if (this.state === 'COUNTDOWN') {
      this.countdownTicks--;
      // Freeze ball and players completely at kickoff spots
      this.ball.vel.set(0, 0);
      for (const p of this.getAllActivePlayers()) {
        p.vel.set(0, 0);
      }
      const currentSec = Math.ceil(this.countdownTicks / 60);
      if (currentSec > 0 && currentSec !== this.lastCountdownSec) {
        this.lastCountdownSec = currentSec;
        this.broadcastToRoom('kickoff_countdown', { count: currentSec });
      }
      if (this.countdownTicks <= 0) {
        this.state = 'PLAYING';
        this.broadcastToRoom('kickoff_countdown', { count: 0, text: 'BAŞLA!' });
        this.broadcastToRoom('match_whistle');
        this.broadcastToRoom('round_resumed');
      }
    } else if (this.state === 'PLAYING' || this.state === 'OVERTIME') {
      // 3. Update Multi-Bot AI
      const botList = Array.from(this.bots.values());
      this.botAI.updateAll(botList);

      // 4. Physics Step (include obstacles such as training dummies)
      const activePlayers = this.getAllActivePlayers();
      const events = this.physics.step(activePlayers, this.ball, this.obstacles);

      // Process touch / kick physics events for accurate ball touch & shot registration
      for (const ev of events) {
        if (ev.type === 'ball_touch' || ev.type === 'kick') {
          const p = this.players.get(ev.playerId) || this.bots.get(ev.playerId);
          if (p) {
            this.stats.lastTouchTeam = p.team;
            this.lastTouchPlayer = { id: p.id, name: p.name, team: p.team };
            this.lastTouchByTeam[p.team] = { id: p.id, name: p.name, team: p.team };
            if (this.gameMode === 'bomb') {
              const prevHolderId = this.bombHolderPlayer ? this.bombHolderPlayer.id : null;
              if (prevHolderId !== p.id) {
                this.bombHolderTeam = p.team;
                this.bombHolderPlayer = { id: p.id, name: p.name, team: p.team };
                this.broadcastToRoom('sound_event', { type: 'bomb_tag', player: this.bombHolderPlayer });
              }
            } else if (ev.type === 'kick') {
              const targetGoalX = p.team === 'red' ? this.stadium.halfW : -this.stadium.halfW;
              if (Math.abs(this.ball.pos.x - targetGoalX) < 280) {
                this.stats.shots[p.team]++;
              }
            }
          }
        }
        this.broadcastToRoom('sound_event', ev);
      }

      if (this.stats.lastTouchTeam) {
        this.stats.touchTicks[this.stats.lastTouchTeam]++;
        const total = this.stats.touchTicks.red + this.stats.touchTicks.blue;
        if (total > 0) {
          this.stats.possession.red = Math.round((this.stats.touchTicks.red / total) * 100);
          this.stats.possession.blue = 100 - this.stats.possession.red;
        }
      }

      // 6. Check Goal (Completely disabled in Bomb Tag arena)
      const goalScored = (this.gameMode === 'bomb') ? null : this.stadium.checkGoal(this.ball);
      if (goalScored) {
        this.scores[goalScored]++;
        this.lastGoalTeam = goalScored;
        // Team that conceded the goal takes the next kickoff!
        this.kickoffTeam = goalScored === 'red' ? 'blue' : 'red';

        if (this.isTrainingRoom) {
          // Training mode: brief audio-visual reward without freezing gameplay or ending session
          this.broadcastToRoom('goal_scored', {
            team: goalScored,
            scores: this.scores,
            isGoldenGoal: false,
            stats: this.stats,
            scorerId: null,
            scorerName: 'Antrenman',
            scorerTotalGoals: 0,
            scorerRank: null,
            isOwnGoal: false,
            timeFormatted: '00:00',
            goalEvent: null
          });
          return;
        }

        // 380 ticks @ 60fps = 6.3 seconds for complete cinematic goal replay & celebration banner sync
        this.celebrationTicks = 380;

        // Determine Goal Scorer & Own Goal (K.K.)
        const lastTouch = this.lastTouchPlayer;
        let isOwnGoal = false;
        let scorerName = '';
        let scorerTeam = goalScored;

        if (lastTouch) {
          scorerName = lastTouch.name;
          scorerTeam = lastTouch.team;
          if (lastTouch.team !== goalScored) {
            isOwnGoal = true;
          }
        } else {
          scorerName = goalScored === 'red' ? 'Kırmızı Takım' : 'Mavi Takım';
          scorerTeam = goalScored;
        }

        let scorerTotalGoals = 0;
        let scorerRank = null;
        let scorerMatchGoals = 1;

        // Calculate how many goals this player scored in THIS match so far
        if (!isOwnGoal && scorerName) {
          scorerMatchGoals = 1;
          for (const ev of this.goalEvents) {
            if (ev.scorerName === scorerName && !ev.isOwnGoal) {
              scorerMatchGoals++;
            }
          }
        }

        // Only crown player and record goal if it was NOT an own goal!
        if (!isOwnGoal && lastTouch) {
          this.crownedPlayerId = lastTouch.id;
          this.crownedPlayerName = lastTouch.name;

          if (this.profileManager) {
            const updatedProf = this.profileManager.recordGoal(lastTouch.name);
            if (updatedProf) {
              scorerTotalGoals = updatedProf.goals;
              scorerRank = this.profileManager.getPlayerRank(lastTouch.name);
              const pObj = this.players.get(lastTouch.id) || this.bots.get(lastTouch.id);
              if (pObj) {
                pObj.goals = updatedProf.goals;
              }
            }
          } else {
            const pObj = this.players.get(lastTouch.id) || this.bots.get(lastTouch.id);
            if (pObj) {
              pObj.goals = (pObj.goals || 0) + 1;
              scorerTotalGoals = pObj.goals;
            } else {
              scorerTotalGoals = scorerMatchGoals;
            }
          }
        }

        // Format milestone text (Örnek: "Bu maçtaki 2., kariyerindeki 46. golü!")
        let milestoneText = '';
        if (!isOwnGoal && scorerName) {
          const hatTrickSuffix = scorerMatchGoals >= 3 ? (scorerMatchGoals === 3 ? ' (Hat-trick!)' : ` (${scorerMatchGoals}. Gol!)`) : '';
          milestoneText = `Bu maçtaki ${scorerMatchGoals}.${hatTrickSuffix}, kariyerindeki ${scorerTotalGoals}. golü!`;
        }

        // Format goal time mm:ss
        const m = Math.floor(this.timeElapsed / 60);
        const s = Math.floor(this.timeElapsed % 60);
        const timeFormatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

        // Save to goal history
        const goalEvent = {
          team: goalScored, // Team that received the point
          scorerName: scorerName,
          scorerTeam: scorerTeam, // Team the player actually plays for
          isOwnGoal: isOwnGoal,
          timeFormatted: timeFormatted,
          matchGoals: scorerMatchGoals,
          careerGoals: scorerTotalGoals,
          milestoneText: milestoneText,
          scores: { ...this.scores }
        };
        this.goalEvents.push(goalEvent);

        const isGoldenGoal = (this.state === 'OVERTIME');
        if (isGoldenGoal) {
          this.isGoldenGoalPending = true;
        }
        this.state = 'GOAL_CELEBRATION';

        this.broadcastToRoom('goal_scored', {
          team: goalScored,
          scores: this.scores,
          isGoldenGoal,
          stats: this.stats,
          scorerId: isOwnGoal ? null : this.crownedPlayerId,
          scorerName: scorerName,
          scorerTotalGoals: scorerTotalGoals,
          scorerMatchGoals: scorerMatchGoals,
          scorerRank: scorerRank,
          milestoneText: milestoneText,
          isOwnGoal: isOwnGoal,
          timeFormatted: timeFormatted,
          goalEvent: goalEvent
        });

        if (this.gameMode === 'bomb') {
          const blastPos = this.ball.pos.clone();
          this.physics.applyExplosionImpulse(blastPos, 320, 26, this.getAllActivePlayers(), this.ball);
          this.broadcastToRoom('bomb_exploded', {
            pos: { x: blastPos.x, y: blastPos.y },
            victimTeam: goalScored === 'red' ? 'blue' : 'red',
            scorerTeam: goalScored,
            scores: this.scores,
            reason: 'goal'
          });
        }

        if (this.profileManager) {
          this.io.emit('leaderboard_update', this.profileManager.getLeaderboard());
        }

        this.broadcastLobby();
      }
    }

    // 7. Adaptive broadcast: aktif oyunda 30Hz, lobide 4Hz (ölçeklenebilirlik)
    this.maybeBroadcastGameState(false);
  }

  endMatch() {
    this.state = 'GAME_OVER';
    this.isGoldenGoalPending = false;
    this.isMatchWipeoutPending = false;
    let winner = this.scores.red > this.scores.blue ? 'red' : (this.scores.blue > this.scores.red ? 'blue' : 'draw');
    if (this.gameMode === 'bomb' && this.lastWipeoutWinner) {
      winner = this.lastWipeoutWinner;
    }

    if (this.profileManager) {
      const redHumanNames = [];
      for (const p of this.players.values()) {
        if (p.team === 'red') redHumanNames.push(p.name);
      }
      const blueHumanNames = [];
      for (const p of this.players.values()) {
        if (p.team === 'blue') blueHumanNames.push(p.name);
      }
      this.profileManager.recordMatchResult(redHumanNames, blueHumanNames, winner);
      this.io.emit('leaderboard_update', this.profileManager.getLeaderboard());

      // Send updated profile to each connected player
      for (const [sId, p] of this.players.entries()) {
        const prof = this.profileManager.getProfile(p.name);
        if (prof) {
          const rank = this.profileManager.getPlayerRank(p.name);
          this.io.to(sId).emit('profile_data', { profile: prof, rank: rank });
        }
      }
    }

    this.broadcastToRoom('match_ended', {
      winner,
      scores: this.scores,
      stats: this.stats,
      goalEvents: this.goalEvents,
      crownedPlayerId: this.crownedPlayerId,
      crownedPlayerName: this.crownedPlayerName,
      tournamentMatch: (this.tournament && this.tournament.state === 'PLAYING')
        ? (this.tournament.currentMatch() ? this.tournament.currentMatch().id : null)
        : null
    });

    // Online turnuva maçıysa braketi ilerlet (sonraki maç 5sn sonra otomatik kurulur)
    if (this.tournament && this.tournament.state === 'PLAYING') {
      this.handleTournamentMatchEnd(winner, { ...this.scores });
    }

    // Match remains in GAME_OVER state with stats modal visible until user triggers restart
    this.resetPositions();
  }

  broadcastGameState() {
    const playersData = [];
    for (const p of this.players.values()) {
      if (p.active) {
        p.hasCrown = (p.id === this.crownedPlayerId);
        playersData.push(p.serialize());
      }
    }
    for (const b of this.bots.values()) {
      if (b.active) {
        b.hasCrown = (b.id === this.crownedPlayerId);
        playersData.push(b.serialize());
      }
    }

    const payload = {
      state: this.state,
      countdown: this.state === 'COUNTDOWN' ? Math.max(1, Math.ceil(this.countdownTicks / 60)) : 0,
      isPaused: this.isPaused,
      hostId: this.hostId,
      tick: this.tickCount,
      rngSeed: this.rngSeed,
      scores: this.scores,
      timeElapsed: this.timeElapsed,
      timeLimit: this.timeLimit,
      scoreLimit: this.scoreLimit,
      matchConfig: this.matchConfig || null,
      gameMode: this.gameMode || 'classic',
      bomb: this.gameMode === 'bomb' ? {
        timer: Math.max(0, Math.ceil(this.bombTicks / 60)),
        ticks: this.bombTicks,
        maxTicks: this.bombMaxTicks,
        holderTeam: this.bombHolderTeam,
        holderPlayer: this.bombHolderPlayer,
        exploding: this.bombExploding
      } : null,
      stats: this.stats,
      crownedPlayerId: this.crownedPlayerId,
      crownedPlayerName: this.crownedPlayerName,
      ball: {
        x: Math.round(this.ball.pos.x * 10) / 10,
        y: Math.round(this.ball.pos.y * 10) / 10,
        vx: Math.round(this.ball.vel.x * 100) / 100,
        vy: Math.round(this.ball.vel.y * 100) / 100
      },
      players: playersData
    };

    this.broadcastToRoom('game_state', payload);
  }

  broadcastLobby() {
    const lobbyPlayers = [];
    for (const p of this.players.values()) {
      lobbyPlayers.push({
        id: p.id,
        name: p.name,
        team: p.team,
        avatar: p.avatar,
        isBot: p.isBot,
        goals: p.goals || 0,
        hasCrown: (p.id === this.crownedPlayerId)
      });
    }
    for (const b of this.bots.values()) {
      lobbyPlayers.push({
        id: b.id,
        name: b.name,
        team: b.team,
        avatar: b.avatar,
        isBot: true,
        hasCrown: (b.id === this.crownedPlayerId)
      });
    }

    this.broadcastToRoom('lobby_update', {
      players: lobbyPlayers,
      hostId: this.hostId,
      tournament: this.getTournamentData(),
      crownedPlayerId: this.crownedPlayerId,
      crownedPlayerName: this.crownedPlayerName,
      botCount: this.bots.size,
      botDifficulty: this.botDifficulty,
      stadium: this.getStadiumData(),
      scores: this.scores,
      state: this.state
    });
  }

  // ============ ONLINE TURNUVA (gerçek oyuncular) ============
  getTournamentData() {
    return this.tournament ? this.tournament.getState() : null;
  }

  broadcastTournament() {
    if (this.destroyed) return;
    this.broadcastToRoom('online_tournament_update', this.getTournamentData());
    this.broadcastLobby();
  }

  createOnlineTournament(size, socketId) {
    if (this.tournament && this.tournament.isActive()) {
      return { ok: false, reason: 'Bu odada zaten aktif bir turnuva var.' };
    }
    const cleanSize = (Number(size) === 8) ? 8 : 4;
    this.tournament = new OnlineTournament(this, cleanSize);
    const player = this.players.get(socketId);
    if (player) {
      this.tournament.addParticipant(socketId, player.name);
    }
    this.broadcastTournament();
    return { ok: true };
  }

  joinOnlineTournament(socketId) {
    if (!this.tournament || !this.tournament.isActive()) {
      return { ok: false, reason: 'Aktif turnuva yok. Önce turnuva oluşturun.' };
    }
    const player = this.players.get(socketId);
    if (!player) return { ok: false, reason: 'Önce oyuna katılmalısın.' };
    const res = this.tournament.addParticipant(socketId, player.name);
    if (res.ok) this.broadcastTournament();
    return res;
  }

  leaveOnlineTournament(socketId) {
    if (!this.tournament) return { ok: true };
    this.tournament.removeParticipant(socketId);
    if (!this.tournament.isActive() && this.tournament.state === 'DONE') {
      // Turnuva hükmen bitişlerle tamamlandıysa şampiyonu duyur
      this.broadcastToRoom('online_tournament_end', { champion: this.tournament.champion });
    }
    this.broadcastTournament();
    return { ok: true };
  }

  cancelOnlineTournament() {
    this.tournament = null;
    this.broadcastTournament();
    return { ok: true };
  }

  startOnlineTournament() {
    if (!this.tournament) return { ok: false, reason: 'Aktif turnuva yok.' };
    const res = this.tournament.start();
    if (!res.ok) {
      this.broadcastTournament();
      return res;
    }
    this.setupTournamentMatch();
    this.broadcastTournament();
    return { ok: true };
  }

  setupTournamentMatch() {
    if (!this.tournament || this.tournament.state !== 'PLAYING') return;
    const m = this.tournament.currentMatch();
    if (!m || !m.p1 || !m.p2) {
      this.broadcastTournament();
      return;
    }
    // Turnuva maçları: botsuz, klasik, 2dk / ilk 3 gol, seremonisiz hızlı başla
    this.bots.clear();
    this.gameMode = 'classic';
    if (this.stadium.noGoals) {
      this.stadium.setNoGoals(false);
      this.broadcastToRoom('stadium_changed', this.getStadiumData());
    }
    this.timeLimit = 120;
    this.scoreLimit = 3;
    this.matchConfig = { format: '1v1', tournamentMatch: m.id, tournamentLabel: m.label };
    for (const [sId, p] of this.players.entries()) {
      if (sId === m.p1.id) p.team = 'red';
      else if (sId === m.p2.id) p.team = 'blue';
      else p.team = 'spec';
    }
    this.ensureHost();
    this.startMatch(false);
    this.broadcastToRoom('tournament_match_started', {
      matchId: m.id,
      label: m.label,
      p1: m.p1,
      p2: m.p2
    });
    this.broadcastTournament();
  }

  handleTournamentMatchEnd(winnerTeam, scores) {
    if (!this.tournament || this.tournament.state !== 'PLAYING') return;
    const res = this.tournament.onMatchEnd(winnerTeam, scores);
    if (this.tournament.state === 'DONE') {
      this.broadcastToRoom('online_tournament_end', { champion: this.tournament.champion });
      this.broadcastTournament();
      return;
    }
    this.broadcastTournament();
    // Sıradaki maça 5sn sonra geç (skor tablosu okunsun)
    setTimeout(() => {
      if (this.destroyed || !this.tournament || this.tournament.state !== 'PLAYING') return;
      if (res === 'replay') {
        this.broadcastToRoom('chat_message', {
          sender: '🏆 TURNUVA',
          team: 'spec',
          message: 'Beraberlik! Aynı eşleşme tekrar oynanacak.',
          roomId: this.roomId,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
      this.setupTournamentMatch();
      this.broadcastTournament();
    }, 5000);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

module.exports = Room;
