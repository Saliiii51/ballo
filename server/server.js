const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const Room = require('./game/Room');
const ProfileManager = require('./data/ProfileManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection]:', reason);
});

const RoomManager = require('./game/RoomManager');

// Initialize persistent profile and leaderboard manager
const profileManager = new ProfileManager();
const roomManager = new RoomManager(io, profileManager);

// Smart caching: HTML her zaman taze (no-cache + ETag), version'lı statik dosyalar 1 saat cache'lenir.
// ?v= query'si değişince tarayıcı zaten yeni dosyayı indirir, bu yüzden ölçeklenebilir.
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath, {
  etag: true,
  lastModified: true,
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      // index.html her zaman sunucuya sorulsun ama ETag tutarsa 304 dönsün (bant genişliği kurtarır)
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      // JS/CSS/ses: 1 saat public cache + immutable değil (v= değişince yenilenir)
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);
  socket.join('main');

  // Send initial leaderboard and room list
  socket.emit('leaderboard_update', profileManager.getLeaderboard());
  socket.emit('room_list_update', roomManager.getRoomList());

  // Helper to get socket's current active room
  const getRoom = () => roomManager.getRoomForSocket(socket.id);

  // Spam koruması: soket başına basit cooldown haritası
  const lastChatAt = { t: 0 };
  const lastPauseAt = { t: 0 };
  const denyCritical = (room, actionName) => {
    const check = room.checkCriticalAction(socket.id);
    if (!check.ok) {
      socket.emit('room_error', { message: check.reason || `${actionName} için yetkin yok.` });
      return true;
    }
    return false;
  };

  // Send stadium info for current room
  const sendStadiumInfo = (room) => {
    const data = room.getStadiumData();
    socket.emit('init_stadium', {
      roomId: room.roomId,
      roomName: room.displayName,
      preset: data.preset,
      name: data.name,
      theme: data.theme,
      width: data.width,
      height: data.height,
      goalWidth: data.goalWidth,
      goalDepth: data.goalDepth,
      postRadius: data.postRadius,
      centerCircleRadius: data.centerCircleRadius,
      bumpers: data.bumpers || [],
      posts: data.posts,
      segments: data.segments
    });
  };

  // Initial stadium send for default room
  sendStadiumInfo(getRoom());

  // Room Listing & Creation Handlers
  socket.on('get_room_list', () => {
    socket.emit('room_list_update', roomManager.getRoomList());
  });

  socket.on('create_room', (data) => {
    const roomId = data ? data.roomId : null;
    const name = (data && data.name) ? String(data.name).slice(0, 20) : null;
    const password = (data && data.password) ? String(data.password).slice(0, 32) : null;
    const preset = (data && data.preset) ? data.preset : 'classic';

    // Oda kurarken seçilen maç özellikleri (doğrulamalı)
    const numOr = (v, fb) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fb;
    };
    const matchConfig = {
      format: (data && data.format) || '1v1',
      duration: numOr(data && data.duration, 180),
      scoreLimit: numOr(data && data.scoreLimit, 3),
      difficulty: (data && data.difficulty) || 'extreme',
      gameMode: (data && data.gameMode) || 'classic',
      bombTimer: numOr(data && data.bombTimer, 20),
      autoFillBots: !data || data.autoFillBots !== false
    };

    const room = roomManager.createRoom(roomId, name, password, preset, socket.id, matchConfig);
    io.emit('room_list_update', roomManager.getRoomList());
    socket.emit('room_created', { roomId: room.roomId, name: room.displayName, config: room.getRoomConfig(), preset: room.stadium.currentPresetKey });
  });

  socket.on('switch_room', (data) => {
    const targetRoomId = (data && data.roomId) ? data.roomId : 'main';
    let targetRoom = roomManager.getRoom(targetRoomId);
    if (!targetRoom) {
      targetRoom = roomManager.createRoom(targetRoomId, `Oda ${targetRoomId}`, (data && data.password) || null, 'classic', socket.id);
    }

    if (roomManager.isRoomLocked(targetRoom) && !roomManager.verifyRoomPassword(targetRoom, data && data.password)) {
      socket.emit('room_error', { message: 'Oda şifresi hatalı!' });
      socket.emit('room_password_required', { roomId: targetRoom.roomId, name: targetRoom.displayName });
      return;
    }

    const prevRoom = getRoom();
    const existingPlayer = prevRoom ? prevRoom.players.get(socket.id) : null;
    const playerName = existingPlayer ? existingPlayer.name : null;
    const playerAvatar = existingPlayer ? existingPlayer.avatar : null;
    const playerTeam = (data && data.team) ? data.team : (existingPlayer ? existingPlayer.team : 'spec');

    // Eski odadan tam temizlik (klon kalmaması için removeSocket tek kaynaktır)
    if (prevRoom && prevRoom.roomId !== targetRoom.roomId) {
      socket.leave(prevRoom.roomId);
    }
    roomManager.removeSocket(socket.id);
    roomManager.assignSocketToRoom(socket.id, targetRoom.roomId);
    socket.join(targetRoom.roomId);

    // If player was already in game, transfer their presence into the new room!
    if (playerName) {
      const player = targetRoom.addPlayer(socket.id, playerName, playerAvatar, playerTeam);
      socket.emit('player_joined', { id: socket.id, player: player.serialize(), roomId: targetRoom.roomId });
    }

    sendStadiumInfo(targetRoom);
    targetRoom.broadcastLobby();
    io.emit('room_list_update', roomManager.getRoomList());
  });

  // Player joins with nickname and profile
  socket.on('join_game', (data) => {
    const rawName = (data && data.name) ? String(data.name).trim().slice(0, 15) : 'Player';
    const avatar = (data && data.avatar) ? String(data.avatar).trim().slice(0, 3) : '10';
    const requestedTeam = (data && data.team) ? data.team : null;
    const targetRoomId = (data && data.roomId) ? data.roomId : null;

    if (targetRoomId) {
      const prevRoom = getRoom();
      const room = roomManager.getRoom(targetRoomId) || roomManager.createRoom(targetRoomId, `Oda ${targetRoomId}`, null, 'classic', socket.id);
      if (roomManager.isRoomLocked(room) && !roomManager.verifyRoomPassword(room, data && data.password)) {
        socket.emit('room_error', { message: 'Oda şifresi hatalı!' });
        socket.emit('room_password_required', { roomId: room.roomId, name: room.displayName });
        return;
      }
      if (prevRoom && prevRoom.roomId !== room.roomId) {
        socket.leave(prevRoom.roomId);
        // Eski odada klon kalmasın + boş oda temizlensin
        prevRoom.removePlayer(socket.id);
        roomManager.cleanupRoomIfEmpty(prevRoom.roomId);
        roomManager.assignSocketToRoom(socket.id, room.roomId);
        socket.join(room.roomId);
      } else {
        roomManager.assignSocketToRoom(socket.id, room.roomId);
        socket.join(room.roomId);
      }
    } else {
      socket.join(getRoom().roomId);
    }

    const currentRoom = getRoom();
    const profile = profileManager.getOrCreateProfile(rawName, avatar);
    const player = currentRoom.addPlayer(socket.id, profile.name, profile.avatar, requestedTeam);
    const rank = profileManager.getPlayerRank(profile.name);

    sendStadiumInfo(currentRoom);
    socket.emit('player_joined', { id: socket.id, player: player.serialize(), roomId: currentRoom.roomId });
    socket.emit('profile_data', { profile: profile, rank: rank });
    io.emit('leaderboard_update', profileManager.getLeaderboard());
    io.emit('room_list_update', roomManager.getRoomList());
    console.log(`[Player Joined] ${profile.name} (${socket.id}) -> Room: ${currentRoom.roomId}, Team: ${player.team}`);
  });

  // Real-time keyboard inputs (doğrulamalı: bozuk paket server'ı çökertmesin)
  socket.on('player_input', (inputData) => {
    if (!inputData || typeof inputData !== 'object') return;
    const clean = {
      up: !!inputData.up,
      down: !!inputData.down,
      left: !!inputData.left,
      right: !!inputData.right,
      kick: !!inputData.kick
    };
    try {
      getRoom().handlePlayerInput(socket.id, clean);
    } catch (e) {
      console.warn('[player_input] handle error:', e.message);
    }
  });

  // Switch team request (Red, Blue, Spec)
  socket.on('switch_team', (data) => {
    if (data && data.team) {
      getRoom().setPlayerTeam(socket.id, data.team);
    }
  });

  // Toggle Bot AI (host + rate-limit korumalı)
  socket.on('toggle_bot', () => {
    const room = getRoom();
    if (denyCritical(room, 'Bot işlemi')) return;
    room.toggleBot();
  });

  // Add specific Bot to team ('red', 'blue')
  socket.on('add_bot', (data) => {
    const room = getRoom();
    if (denyCritical(room, 'Bot ekleme')) return;
    const team = (data && (data.team === 'red' || data.team === 'blue')) ? data.team : null;
    room.addBot(team);
  });

  // Remove Bot
  socket.on('remove_bot', (data) => {
    const room = getRoom();
    if (denyCritical(room, 'Bot çıkarma')) return;
    room.removeBot(data ? data.botId : null);
  });

  // Set Bot Difficulty ('easy', 'medium', 'hard', 'extreme')
  socket.on('set_bot_difficulty', (data) => {
    if (data && data.difficulty) {
      const room = getRoom();
      if (denyCritical(room, 'Bot seviyesi')) return;
      room.setBotDifficulty(data.difficulty);
    }
  });

  // Change Stadium Map ('classic', 'big', 'futsal', 'hockey', 'street')
  socket.on('change_map', (data) => {
    if (data && data.preset) {
      const room = getRoom();
      if (denyCritical(room, 'Harita değiştirme')) return;
      const allowed = ['classic', 'big', 'futsal', 'hockey', 'street'];
      if (!allowed.includes(data.preset)) return;
      room.setMap(data.preset);
    }
  });

  // Update Player Avatar / Jersey Number
  socket.on('update_avatar', (data) => {
    if (data && data.avatar) {
      const room = getRoom();
      const player = room.players.get(socket.id);
      if (player) {
        room.setPlayerAvatar(socket.id, data.avatar);
        const updated = profileManager.updateAvatar(player.name, data.avatar);
        if (updated) {
          const rank = profileManager.getPlayerRank(player.name);
          socket.emit('profile_data', { profile: updated, rank: rank });
          io.emit('leaderboard_update', profileManager.getLeaderboard());
        }
      }
    }
  });

  // Update Player Nickname
  socket.on('update_nickname', (data) => {
    if (data && data.name) {
      const room = getRoom();
      const player = room.players.get(socket.id);
      if (player) {
        const cleanName = String(data.name).trim().slice(0, 15) || 'Player';
        player.name = cleanName;
        const profile = profileManager.getOrCreateProfile(cleanName, player.avatar);
        player.goals = profile.goals;
        player.aura = profile.aura || 'none';
        player.title = profile.title || 'Çaylak Forvet';
        const rank = profileManager.getPlayerRank(cleanName);
        socket.emit('profile_data', { profile, rank });
        room.broadcastLobby();
        io.emit('leaderboard_update', profileManager.getLeaderboard());
      }
    }
  });

  // Update Player Cosmetics (Aura & Title)
  socket.on('update_cosmetics', (data) => {
    if (data) {
      const room = getRoom();
      const player = room.players.get(socket.id);
      if (player) {
        if (data.aura) player.aura = data.aura;
        if (data.title) player.title = data.title;
        const updated = profileManager.updateCosmetics(player.name, data.aura, data.title);
        if (updated) {
          const rank = profileManager.getPlayerRank(player.name);
          socket.emit('profile_data', { profile: updated, rank: rank });
        }
      }
    }
  });

  // Request fresh leaderboard data
  socket.on('get_leaderboard', () => {
    socket.emit('leaderboard_update', profileManager.getLeaderboard());
  });

  // Default assign to main room
  roomManager.assignSocketToRoom(socket.id, 'main');

  // Start / Restart Match (host + rate-limit)
  socket.on('restart_match', () => {
    const room = getRoom();
    if (denyCritical(room, 'Maçı yeniden başlatma')) return;
    if (room.tournament && room.tournament.state === 'PLAYING') {
      socket.emit('room_error', { message: 'Turnuva sürerken manuel başlatma kapalı. Turnuvayı bitirin veya iptal edin.' });
      return;
    }
    room.restartMatch(socket.id);
  });

  // Toggle Match Pause (herkes duraklatabilir ama 1sn cooldown ile spam koruması)
  socket.on('toggle_pause', (data) => {
    const room = getRoom();
    if (room) {
      const now = Date.now();
      if (now - lastPauseAt.t < 1000) return;
      lastPauseAt.t = now;
      const isPaused = (data && typeof data.isPaused === 'boolean') ? data.isPaused : !room.isPaused;
      room.setPause(isPaused, socket.id);
    }
  });

  // Skip Walkout Ceremony
  socket.on('skip_walkout', () => {
    const room = getRoom();
    if (room) room.skipWalkout();
  });

  // Setup and Start Custom Configured Match (1v1, 2v2, 3v3, 4v4, time, goals, bots)
  socket.on('setup_and_start_match', (config) => {
    const room = getRoom();
    if (denyCritical(room, 'Maç kurma')) return;
    if (room.tournament && room.tournament.state === 'PLAYING') {
      socket.emit('room_error', { message: 'Turnuva sürerken manuel maç kurulamaz.' });
      return;
    }
    // Config doğrulama: bozuk paketle server çökmesin
    const safe = (config && typeof config === 'object') ? config : {};
    if (safe.format && !['1v1', '2v2', '3v3', '4v4'].includes(safe.format)) safe.format = '1v1';
    if (safe.team && !['red', 'blue'].includes(safe.team)) safe.team = 'red';
    if (safe.map && !['classic', 'big', 'futsal', 'hockey', 'street', 'custom'].includes(safe.map)) safe.map = 'classic';
    if (safe.difficulty && !['easy', 'medium', 'hard', 'extreme'].includes(safe.difficulty)) safe.difficulty = 'extreme';
    room.setupAndStartMatch(safe, socket.id);
  });

  // Set Custom Stadium configuration from Stadium Maker (host + limit)
  socket.on('set_custom_stadium', (customConfig) => {
    if (customConfig) {
      const room = getRoom();
      if (denyCritical(room, 'Özel saha')) return;
      if (customConfig.bumpers && customConfig.bumpers.length > 10) {
        socket.emit('room_error', { message: 'En fazla 10 tampon koyabilirsin.' });
        return;
      }
      room.setCustomStadium(customConfig);
    }
  });

  // Start Solo Match (Fresh 1v1 vs Bot, resets score & timer)
  socket.on('start_solo_match', () => {
    const room = getRoom();
    if (denyCritical(room, 'Solo maç')) return;
    room.setupAndStartMatch({ format: '1v1', team: 'red', duration: 180, scoreLimit: 3 }, socket.id);
  });

  // ============ ONLINE TURNUVA (gerçek oyuncular) ============
  socket.on('create_online_tournament', (data) => {
    const room = getRoom();
    if (denyCritical(room, 'Turnuva kurma')) return;
    const size = (data && Number(data.size) === 8) ? 8 : 4;
    const res = room.createOnlineTournament(size, socket.id);
    if (!res.ok) socket.emit('room_error', { message: res.reason });
  });

  socket.on('join_online_tournament', () => {
    const room = getRoom();
    const res = room.joinOnlineTournament(socket.id);
    if (!res.ok) socket.emit('room_error', { message: res.reason });
  });

  socket.on('leave_online_tournament', () => {
    getRoom().leaveOnlineTournament(socket.id);
  });

  socket.on('cancel_online_tournament', () => {
    const room = getRoom();
    if (denyCritical(room, 'Turnuva iptali')) return;
    room.cancelOnlineTournament();
  });

  socket.on('start_online_tournament', () => {
    const room = getRoom();
    if (denyCritical(room, 'Turnuva başlatma')) return;
    const res = room.startOnlineTournament(socket.id);
    if (!res.ok) socket.emit('room_error', { message: res.reason });
  });

  socket.on('get_online_tournament', () => {
    const room = getRoom();
    socket.emit('online_tournament_update', room.getTournamentData());
  });

  // Training Mode Obstacles (Baraj / Dummies) - solo odada serbest, normal odada host
  socket.on('set_obstacles', (data) => {
    const room = getRoom();
    if (!room.isSoloRoom() && denyCritical(room, 'Engel koyma')) return;
    const raw = (data && data.obstacles) ? data.obstacles : [];
    if (!Array.isArray(raw) || raw.length > 20) return;
    const obstacles = raw
      .filter(o => o && Number.isFinite(Number(o.x)) && Number.isFinite(Number(o.y)))
      .slice(0, 20)
      .map(o => ({
        x: Math.max(-600, Math.min(600, Number(o.x))),
        y: Math.max(-400, Math.min(400, Number(o.y))),
        radius: Math.max(5, Math.min(30, Number(o.radius) || 15))
      }));
    room.setObstacles(obstacles);
  });

  // Set Ball Position (Training spot placement)
  socket.on('set_ball_position', (data) => {
    const room = getRoom();
    if (!room.isSoloRoom() && denyCritical(room, 'Top taşıma')) return;
    if (data && Number.isFinite(Number(data.x)) && Number.isFinite(Number(data.y))) {
      const x = Math.max(-600, Math.min(600, Number(data.x)));
      const y = Math.max(-400, Math.min(400, Number(data.y)));
      room.setBallPosition(x, y);
    }
  });

  // In-game chat message (partitioned per room, 700ms cooldown)
  socket.on('send_chat', (data) => {
    const now = Date.now();
    if (now - lastChatAt.t < 700) return;
    lastChatAt.t = now;
    const text = (data && data.message) ? String(data.message).trim().slice(0, 100) : '';
    if (!text) return;

    const room = getRoom();
    const player = room.players.get(socket.id);
    const senderName = player ? player.name : 'Unknown';
    const senderTeam = player ? player.team : 'spec';

    io.to(room.roomId).emit('chat_message', {
      sender: senderName,
      team: senderTeam,
      message: text,
      roomId: room.roomId,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Disconnection
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    roomManager.removeSocket(socket.id);
    io.emit('room_list_update', roomManager.getRoomList());
  });
});

const os = require('os');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`=========================================`);
  console.log(`⚽ Ballo Server Running!`);
  console.log(`💻 Bilgisayardan: http://localhost:${PORT}`);
  console.log(`📱 Aynı Wi-Fi (Telefon/Tablet): http://${localIp}:${PORT}`);
  console.log(`=========================================`);
});
