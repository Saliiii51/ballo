const crypto = require('crypto');
const Room = require('./Room');

function hashPassword(pw) {
  if (pw == null) return null;
  const s = String(pw).trim();
  if (!s) return null;
  return crypto.createHash('sha256').update(s).digest('hex');
}

class RoomManager {
  constructor(io, profileManager) {
    this.io = io;
    this.profileManager = profileManager;
    this.rooms = new Map(); // roomId -> Room
    this.socketToRoom = new Map(); // socketId -> roomId

    // Create persistent default main room
    this.mainRoom = this.createRoom('main', '🏟️ Ana Stadyum', null, 'classic');
  }

  createRoom(roomId, name, password = null, preset = 'classic', creatorSocketId = null, matchConfig = null) {
    const cleanId = String(roomId).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 48) || `room_${Date.now()}`;
    if (this.rooms.has(cleanId)) {
      return this.rooms.get(cleanId);
    }

    const roomNamespace = this.io; // Socket.io rooms will partition broadcasts
    const room = new Room(name || `Oda ${cleanId}`, roomNamespace, this.profileManager, cleanId);
    room.roomId = cleanId;
    room.displayName = name || `Oda #${cleanId}`;
    // Şifre düz metin saklanmaz, SHA-256 hash tutulur (eski odalar için fallback aşağıda)
    room.passwordHash = hashPassword(password);
    room.password = null; // legacy alan bilerek boş bırakılır
    room.createdAt = Date.now();
    room.isPermanent = (cleanId === 'main');
    if (creatorSocketId) {
      room.hostId = creatorSocketId;
    }
    // Oda kurarken seçilen maç özellikleri (haritadan önce: bomba modu kapasız arena ister)
    if (matchConfig && typeof matchConfig === 'object') {
      room.applyRoomConfig(matchConfig);
    }

    if (preset) {
      room.setMap(preset);
    }

    this.rooms.set(cleanId, room);
    console.log(`[Room Created] ID: ${cleanId}, Name: ${room.displayName}`);
    return room;
  }

  getRoom(roomId) {
    if (!roomId) return this.mainRoom;
    const cleanId = String(roomId).trim().toLowerCase();
    return this.rooms.get(cleanId) || null;
  }

  getRoomForSocket(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return this.mainRoom;
    return this.rooms.get(roomId) || this.mainRoom;
  }

  assignSocketToRoom(socketId, roomId) {
    this.socketToRoom.set(socketId, roomId);
  }

  removeSocket(socketId) {
    let roomId = this.socketToRoom.get(socketId);
    this.socketToRoom.delete(socketId);

    // If socket was not mapped, search across all rooms to ensure complete cleanup
    // (join_game/switch_room eski odada klon bırakmasın diye)
    if (!roomId) {
      for (const [id, room] of this.rooms.entries()) {
        if (room.players && room.players.has(socketId)) {
          roomId = id;
          break;
        }
      }
    } else {
      // Mapping olsa bile başka odada klon kalmış olabilir (refresh/reconnect) -> hepsini temizle
      for (const [id, room] of this.rooms.entries()) {
        if (id !== roomId && room.players && room.players.has(socketId)) {
          room.removePlayer(socketId);
          this.cleanupRoomIfEmpty(id);
        }
      }
    }

    if (roomId && this.rooms.has(roomId)) {
      const room = this.rooms.get(roomId);
      room.removePlayer(socketId);
      this.cleanupRoomIfEmpty(roomId);
    }
  }

  cleanupRoomIfEmpty(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.isPermanent) return false;
    if (room.players.size === 0) {
      room.destroy();
      this.rooms.delete(roomId);
      console.log(`[Room Deleted] Empty room ${roomId} cleaned up.`);
      return true;
    }
    return false;
  }

  verifyRoomPassword(room, inputPassword) {
    if (!room) return false;
    // Yeni sistem: hash karşılaştır
    if (room.passwordHash) {
      if (!inputPassword) return false;
      return hashPassword(inputPassword) === room.passwordHash;
    }
    // Eski sistemden kalan düz-metin oda varsa kabul et (geriye uyumluluk)
    if (room.password) {
      return String(inputPassword || '').trim() === String(room.password).trim();
    }
    return true; // şifresiz oda
  }

  isRoomLocked(room) {
    if (!room) return false;
    return !!(room.passwordHash || room.password);
  }

  getRoomList() {
    const list = [];
    for (const [id, room] of this.rooms.entries()) {
      list.push({
        id: id,
        name: room.displayName || `Oda #${id}`,
        hasPassword: this.isRoomLocked(room),
        format: room.matchFormat || '1v1',
        gameMode: room.gameMode || 'classic',
        playersCount: (room.players ? room.players.size : 0) + (room.bots ? room.bots.size : 0),
        state: room.state || 'WAITING',
        scoreRed: (room.scores && room.scores.red != null) ? room.scores.red : 0,
        scoreBlue: (room.scores && room.scores.blue != null) ? room.scores.blue : 0,
        stadium: room.stadium ? room.stadium.name : 'Classic'
      });
    }
    return list;
  }
}

module.exports = RoomManager;
