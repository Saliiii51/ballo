const fs = require('fs');
const path = require('path');

class ProfileManager {
  constructor(filePath) {
    this.filePath = filePath || path.join(__dirname, 'profiles.json');
    this.backupPath = `${this.filePath}.bak`;
    this.profiles = new Map(); // key (lowercase) -> profile object
    // Kuyruklu kayıt: art arda gol/maçlarda diski yormamak için 250ms debounce
    this._saveTimer = null;
    this._savePending = false;
    this._saving = false;
    this.load();
    // Kapanışta bekleyen kaydı kaçırma
    process.on('beforeExit', () => this.flush());
  }

  _parseProfileArray(data) {
    if (!Array.isArray(data)) return;
    for (const item of data) {
      if (item && item.name) {
        const key = this.normalizeKey(item.name);
        this.profiles.set(key, {
          key: key,
          name: String(item.name).trim().slice(0, 15),
          avatar: String(item.avatar || '10').trim().slice(0, 3),
          aura: item.aura || 'none',
          title: item.title || 'Çaylak Forvet',
          goals: Math.max(0, parseInt(item.goals, 10) || 0),
          matches: Math.max(0, parseInt(item.matches, 10) || 0),
          wins: Math.max(0, parseInt(item.wins, 10) || 0),
          createdAt: item.createdAt || Date.now(),
          lastActiveAt: item.lastActiveAt || Date.now()
        });
      }
    }
  }

  load() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.filePath)) {
        try {
          const raw = fs.readFileSync(this.filePath, 'utf-8');
          this._parseProfileArray(JSON.parse(raw));
        } catch (parseErr) {
          // Ana dosya bozuksa yedekten kurtarmaya çalış
          console.error('[ProfileManager] Ana dosya bozuk, yedekten deneniyor:', parseErr.message);
          if (fs.existsSync(this.backupPath)) {
            try {
              const bakRaw = fs.readFileSync(this.backupPath, 'utf-8');
              this._parseProfileArray(JSON.parse(bakRaw));
              console.log('[ProfileManager] Yedekten kurtarma başarılı.');
            } catch (bakErr) {
              console.error('[ProfileManager] Yedek de bozuk:', bakErr.message);
            }
          }
        }
      } else if (fs.existsSync(this.backupPath)) {
        try {
          const bakRaw = fs.readFileSync(this.backupPath, 'utf-8');
          this._parseProfileArray(JSON.parse(bakRaw));
        } catch (e) {
          console.error('[ProfileManager] Yedek okunamadı:', e.message);
        }
      } else {
        // Initialize empty file
        this.flush();
      }
    } catch (err) {
      console.error('[ProfileManager] Error loading profiles:', err);
    }
  }

  save() {
    // Geriye uyumluluk: save() artık kuyruğa yazar (debounce), veri kaybı olmaz.
    this.scheduleSave();
  }

  scheduleSave(delayMs = 250) {
    this._savePending = true;
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._writeNow();
    }, delayMs);
    // Event loop kapanmadan yazılsın diye unref etme (kısa süre zaten)
  }

  flush() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._savePending || this.profiles.size >= 0) {
      this._writeNow();
    }
  }

  _writeNow() {
    if (this._saving) {
      // Yazma çakışmasın: bir sonrakine bırak
      this._savePending = true;
      this.scheduleSave(100);
      return;
    }
    this._saving = true;
    this._savePending = false;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const list = Array.from(this.profiles.values());
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(list, null, 2), 'utf-8');
      // Önceki sağlam dosyayı yedekle, sonra atomik taşı
      try {
        if (fs.existsSync(this.filePath)) {
          fs.copyFileSync(this.filePath, this.backupPath);
        }
      } catch (bakErr) {
        console.warn('[ProfileManager] Yedek alınamadı:', bakErr.message);
      }
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('[ProfileManager] Error saving profiles:', err);
    } finally {
      this._saving = false;
      // Yazma sırasında yeni istek geldiyse hemen yaz
      if (this._savePending) {
        this.scheduleSave(50);
      }
    }
  }

  normalizeKey(name) {
    return String(name || '').trim().toLowerCase();
  }

  getProfile(name) {
    const key = this.normalizeKey(name);
    return this.profiles.get(key) || null;
  }

  getOrCreateProfile(name, avatar = '10') {
    const cleanName = String(name || '').trim().slice(0, 15) || 'Player';
    const cleanAvatar = String(avatar || '10').trim().slice(0, 3) || '10';
    const key = this.normalizeKey(cleanName);

    let profile = this.profiles.get(key);
    if (!profile) {
      profile = {
        key: key,
        name: cleanName,
        avatar: cleanAvatar,
        aura: 'none', // 'none', 'flame', 'lightning', 'chroma', 'gold'
        title: 'Çaylak Forvet',
        goals: 0,
        matches: 0,
        wins: 0,
        createdAt: Date.now(),
        lastActiveAt: Date.now()
      };
      this.profiles.set(key, profile);
      this.save();
      console.log(`[ProfileManager] Yeni profil oluşturuldu: "${cleanName}"`);
    } else {
      profile.lastActiveAt = Date.now();
      if (!profile.aura) profile.aura = 'none';
      if (!profile.title) profile.title = 'Çaylak Forvet';
      // Update avatar if provided
      if (cleanAvatar) {
        profile.avatar = cleanAvatar;
      }
      this.save();
    }

    return { ...profile };
  }

  recordGoal(name) {
    const key = this.normalizeKey(name);
    let profile = this.profiles.get(key);
    if (!profile) {
      profile = this.getOrCreateProfile(name);
    }

    profile.goals += 1;
    profile.lastActiveAt = Date.now();
    this.save();
    console.log(`[ProfileManager] ⚽ Gol kaydedildi! Oyuncu: "${profile.name}" -> Toplam: ${profile.goals} gol`);
    return { ...profile };
  }

  recordMatchResult(redPlayerNames = [], bluePlayerNames = [], winnerTeam = 'draw') {
    const updatePlayer = (name, isWinner) => {
      const key = this.normalizeKey(name);
      const profile = this.profiles.get(key);
      if (profile) {
        profile.matches += 1;
        if (isWinner) {
          profile.wins += 1;
        }
        profile.lastActiveAt = Date.now();
      }
    };

    for (const name of redPlayerNames) {
      updatePlayer(name, winnerTeam === 'red');
    }
    for (const name of bluePlayerNames) {
      updatePlayer(name, winnerTeam === 'blue');
    }

    this.save();
  }

  updateAvatar(name, avatar) {
    const key = this.normalizeKey(name);
    const profile = this.profiles.get(key);
    if (profile) {
      profile.avatar = String(avatar || '10').trim().slice(0, 3) || '10';
      profile.lastActiveAt = Date.now();
      this.save();
      return { ...profile };
    }
    return null;
  }

  updateCosmetics(name, aura, title) {
    const key = this.normalizeKey(name);
    const profile = this.profiles.get(key);
    if (profile) {
      if (aura) profile.aura = aura;
      if (title) profile.title = title;
      profile.lastActiveAt = Date.now();
      this.save();
      return { ...profile };
    }
    return null;
  }

  getLeaderboard(limit = 50) {
    const list = Array.from(this.profiles.values());

    // Sort by goals DESC, wins DESC, matches ASC, createdAt ASC
    list.sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.matches !== b.matches) return a.matches - b.matches;
      return a.createdAt - b.createdAt;
    });

    return list.slice(0, limit).map((p, index) => ({
      rank: index + 1,
      name: p.name,
      avatar: p.avatar,
      goals: p.goals,
      matches: p.matches,
      wins: p.wins,
      winRate: p.matches > 0 ? Math.round((p.wins / p.matches) * 100) : 0,
      goalsPerMatch: p.matches > 0 ? (p.goals / p.matches).toFixed(2) : (p.goals > 0 ? p.goals.toFixed(2) : '0.00')
    }));
  }

  getPlayerRank(name) {
    const key = this.normalizeKey(name);
    const leaderboard = this.getLeaderboard(1000);
    const found = leaderboard.find(p => this.normalizeKey(p.name) === key);
    return found ? found.rank : null;
  }
}

module.exports = ProfileManager;
