// Online Turnuva: aynı odadaki GERÇEK oyuncularla eleme kupası.
// Tüm maçlar aynı sahada sırayla oynanır: sıradaki 2 oyuncu kırmızı/mavi,
// diğerleri otomatik izleyiciye alınır. Kazanan bir üst tura çıkar.
class OnlineTournament {
  constructor(room, size = 4) {
    this.room = room;
    this.size = (size === 8) ? 8 : 4;
    this.state = 'LOBBY'; // LOBBY, PLAYING, DONE
    this.participants = []; // [{ id, name }]
    this.matches = []; // [{ id, label, p1, p2, winner, score }]
    this.currentMatchIdx = -1;
    this.champion = null;
    this.createdAt = Date.now();
  }

  isActive() {
    return this.state === 'LOBBY' || this.state === 'PLAYING';
  }

  findParticipant(socketId) {
    return this.participants.find(p => p.id === socketId) || null;
  }

  addParticipant(socketId, name) {
    if (this.state !== 'LOBBY') return { ok: false, reason: 'Turnuva başlamış, katılım kapalı.' };
    if (this.findParticipant(socketId)) return { ok: true };
    if (this.participants.length >= this.size) return { ok: false, reason: 'Turnuva dolu.' };
    const clean = String(name || 'Oyuncu').trim().slice(0, 15) || 'Oyuncu';
    this.participants.push({ id: socketId, name: clean });
    return { ok: true };
  }

  removeParticipant(socketId) {
    const i = this.participants.findIndex(p => p.id === socketId);
    if (i === -1) return;
    const [gone] = this.participants.splice(i, 1);
    if (this.state === 'LOBBY') return;
    // Turnuva ortasında ayrılma: sıradaki/aktif maçtaki rakibi hükmen geçir
    for (const m of this.matches) {
      if (!m.winner && (this.samePlayer(m.p1, gone) || this.samePlayer(m.p2, gone))) {
        const other = this.samePlayer(m.p1, gone) ? m.p2 : m.p1;
        if (other) {
          m.winner = { ...other, walkover: true };
        } else {
          m.winner = null;
        }
      }
    }
    // Bekleyen eşleşmelerdeki boşlukları doldur
    this.fillPendingMatches();
    // Aktif maçtaki oyuncu gittiyse maçı bitir, sonrakine geç
    const cur = this.matches[this.currentMatchIdx];
    if (cur && !cur.winner) {
      const p1gone = cur.p1 && gone.id === cur.p1.id;
      const p2gone = cur.p2 && gone.id === cur.p2.id;
      if (p1gone || p2gone) {
        const other = p1gone ? cur.p2 : cur.p1;
        cur.winner = other ? { ...other, walkover: true } : null;
        cur.score = { red: 0, blue: 0 };
        this.advance();
      }
    }
  }

  samePlayer(a, b) {
    return !!(a && b && a.id === b.id);
  }

  start() {
    if (this.state !== 'LOBBY') return { ok: false, reason: 'Turnuva zaten başladı.' };
    if (this.participants.length < this.size) {
      return { ok: false, reason: `Turnuva için ${this.size} oyuncu lazım (${this.participants.length}/${this.size}).` };
    }
    // Kura: karıştır (oda RNG'si ile deterministik)
    const shuffled = [...this.participants];
    const rnd = () => (this.room && typeof this.room.rand === 'function') ? this.room.rand() : Math.random();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    this.buildBracket(shuffled);
    this.state = 'PLAYING';
    this.currentMatchIdx = 0;
    return { ok: true };
  }

  buildBracket(order) {
    this.matches = [];
    if (this.size === 4) {
      this.matches.push({ id: 'SF1', label: 'Yarı Final 1', p1: order[0], p2: order[1], winner: null, score: null });
      this.matches.push({ id: 'SF2', label: 'Yarı Final 2', p1: order[2], p2: order[3], winner: null, score: null });
      this.matches.push({ id: 'F', label: 'Büyük Final', p1: null, p2: null, winner: null, score: null });
    } else {
      for (let i = 0; i < 4; i++) {
        this.matches.push({ id: `QF${i + 1}`, label: `Çeyrek Final ${i + 1}`, p1: order[i * 2], p2: order[i * 2 + 1], winner: null, score: null });
      }
      this.matches.push({ id: 'SF1', label: 'Yarı Final 1', p1: null, p2: null, winner: null, score: null });
      this.matches.push({ id: 'SF2', label: 'Yarı Final 2', p1: null, p2: null, winner: null, score: null });
      this.matches.push({ id: 'F', label: 'Büyük Final', p1: null, p2: null, winner: null, score: null });
    }
  }

  fillPendingMatches() {
    if (this.size === 4) {
      const [sf1, sf2, f] = this.matches;
      if (f && !f.winner) {
        if (sf1 && sf1.winner && !f.p1) f.p1 = { ...sf1.winner };
        if (sf2 && sf2.winner && !f.p2) f.p2 = { ...sf2.winner };
      }
    } else {
      const [qf1, qf2, qf3, qf4, sf1, sf2, f] = this.matches;
      if (qf1 && qf1.winner && sf1 && !sf1.p1) sf1.p1 = { ...qf1.winner };
      if (qf2 && qf2.winner && sf1 && !sf1.p2) sf1.p2 = { ...qf2.winner };
      if (qf3 && qf3.winner && sf2 && !sf2.p1) sf2.p1 = { ...qf3.winner };
      if (qf4 && qf4.winner && sf2 && !sf2.p2) sf2.p2 = { ...qf4.winner };
      if (sf1 && sf1.winner && f && !f.p1) f.p1 = { ...sf1.winner };
      if (sf2 && sf2.winner && f && !f.p2) f.p2 = { ...sf2.winner };
    }
  }

  currentMatch() {
    if (this.currentMatchIdx < 0 || this.currentMatchIdx >= this.matches.length) return null;
    return this.matches[this.currentMatchIdx];
  }

  // Maç sonu: winnerTeam 'red'|'blue'|'draw', scores {red,blue}
  onMatchEnd(winnerTeam, scores) {
    if (this.state !== 'PLAYING') return;
    const m = this.currentMatch();
    if (!m || m.winner) return;
    if (winnerTeam === 'draw') {
      // Beraberlik: aynı eşleşme tekrar oynanır (altın gol ile hızlıca biter genelde)
      m.score = { ...scores, replay: true };
      return 'replay';
    }
    // Kırmızı = p1, Mavi = p2 (setupNextMatch böyle dizer)
    const winner = winnerTeam === 'red' ? m.p1 : m.p2;
    m.winner = winner ? { ...winner } : null;
    m.score = { ...scores };
    this.fillPendingMatches();
    this.advance();
    return 'advanced';
  }

  advance() {
    // Sonraki oynanmamış ve iki oyuncusu belli maça geç
    let next = -1;
    for (let i = 0; i < this.matches.length; i++) {
      const m = this.matches[i];
      if (!m.winner && m.p1 && m.p2) {
        // Hükmen galibiyet zaten işlendiyse atla
        next = i;
        break;
      }
    }
    if (next === -1) {
      // Tüm maçlar bitti: şampiyon finalin galibi
      const f = this.matches[this.matches.length - 1];
      this.champion = (f && f.winner) ? { ...f.winner } : null;
      this.state = 'DONE';
      this.currentMatchIdx = this.matches.length;
      return;
    }
    this.currentMatchIdx = next;
  }

  getState() {
    return {
      active: this.isActive(),
      size: this.size,
      state: this.state,
      participants: this.participants.map(p => ({ id: p.id, name: p.name })),
      matches: this.matches.map(m => ({
        id: m.id,
        label: m.label,
        p1: m.p1,
        p2: m.p2,
        winner: m.winner,
        score: m.score
      })),
      currentMatchIdx: this.currentMatchIdx,
      champion: this.champion
    };
  }
}

module.exports = OnlineTournament;
