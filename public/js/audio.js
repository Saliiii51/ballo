// Audio Manager for Ballo
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.cheerBuffer = null;
    this.cheerAudio = null;

    this.lastGoalTime = 0;

    // Menu Background Music (Phonk)
    this.bgm = null;
    this.bgmTargetVolume = 0.35;
    this.bgmFadeTimer = null;
    this.bgmWasPlaying = false;
    try {
      this.bgm = new Audio(encodeURI('/sounds/Aylex - This Is Phonk (freetouse.com) (1).mp3'));
      this.bgm.loop = true;
      this.bgm.preload = 'auto';
      this.bgm.volume = 0;
    } catch (e) {
      console.warn('BGM Audio init error:', e);
    }

    // Preload HTML5 audio fallback
    try {
      this.cheerAudio = new Audio('/sounds/cheer.mp3?v=5');
      this.cheerAudio.preload = 'auto';
      this.cheerAudio.volume = 0.8;
    } catch (e) {
      console.warn('HTML5 Audio preload error:', e);
    }

    // Auto-unlock audio and start menu BGM on first interaction
    const unlock = () => {
      this.initContext();
      if (this.isMainMenuActive() && this.enabled) {
        this.playBGM(true);
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });

    // Pause BGM if user switches tab, resume when returning (if still in menu)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.bgm && !this.bgm.paused) {
          this.bgmWasPlaying = true;
          this.bgm.pause();
        }
      } else {
        if (this.bgmWasPlaying && this.enabled && this.isMainMenuActive()) {
          this.bgmWasPlaying = false;
          this.playBGM(true);
        }
      }
    });
  }

  initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.loadAudioBuffer();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  async loadAudioBuffer() {
    if (!this.ctx || this.cheerBuffer) return;
    try {
      const res = await fetch('/sounds/cheer.mp3?v=5');
      const arrayBuffer = await res.arrayBuffer();
      this.ctx.decodeAudioData(arrayBuffer, (decoded) => {
        this.cheerBuffer = decoded;
      }, (err) => {
        console.warn('Decode error, will use HTML5 Audio fallback:', err);
      });
    } catch (e) {
      console.warn('Fetch audio error:', e);
    }
  }

  isMainMenuActive() {
    const menu = document.getElementById('mainMenuModal');
    return !!(menu && !menu.classList.contains('hidden'));
  }

  isGameSoundMuted() {
    if (!this.enabled) return true;
    return this.isMainMenuActive();
  }

  playBGM(fade = true) {
    if (!this.enabled || !this.bgm) return;
    if (this.bgmFadeTimer) {
      clearInterval(this.bgmFadeTimer);
      this.bgmFadeTimer = null;
    }

    if (fade) {
      this.bgm.volume = 0;
    } else {
      this.bgm.volume = this.bgmTargetVolume;
    }

    const playPromise = this.bgm.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        if (fade) {
          let vol = 0;
          const step = this.bgmTargetVolume / 18;
          this.bgmFadeTimer = setInterval(() => {
            vol = Math.min(this.bgmTargetVolume, vol + step);
            if (this.bgm) this.bgm.volume = Number(vol.toFixed(3));
            if (vol >= this.bgmTargetVolume) {
              clearInterval(this.bgmFadeTimer);
              this.bgmFadeTimer = null;
            }
          }, 40);
        }
      }).catch((err) => {
        // Autoplay policy prevented immediate playback until user gesture
        console.debug('BGM play waiting for user gesture:', err.message);
      });
    }
  }

  stopBGM(fade = true) {
    if (!this.bgm) return;
    if (this.bgmFadeTimer) {
      clearInterval(this.bgmFadeTimer);
      this.bgmFadeTimer = null;
    }

    if (!fade || this.bgm.paused) {
      this.bgm.pause();
      this.bgm.currentTime = 0;
      this.bgm.volume = 0;
      return;
    }

    let vol = this.bgm.volume;
    const step = Math.max(0.02, vol / 12);
    this.bgmFadeTimer = setInterval(() => {
      vol = Math.max(0, vol - step);
      if (this.bgm) this.bgm.volume = Number(vol.toFixed(3));
      if (vol <= 0.01) {
        clearInterval(this.bgmFadeTimer);
        this.bgmFadeTimer = null;
        if (this.bgm) {
          this.bgm.pause();
          this.bgm.currentTime = 0;
          this.bgm.volume = 0;
        }
      }
    }, 40);
  }

  toggleSound() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopBGM(false);
    } else {
      if (this.isMainMenuActive()) {
        this.playBGM(true);
      }
    }
    return this.enabled;
  }

  // Realistic football kick: low-frequency thud
  playKick() {
    if (this.isGameSoundMuted()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Realistic goalpost hit: deep resonant thud
  playPost() {
    if (this.isGameSoundMuted()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.12);

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Goal celebration: Real authentic football stadium crowd cheer
  playGoal() {
    if (this.isGameSoundMuted()) return;
    const now = Date.now();
    // Debounce to avoid multiple simultaneous triggers
    if (this.lastGoalTime && now - this.lastGoalTime < 1800) return;
    this.lastGoalTime = now;

    this.initContext();

    try {
      // 1. Preferred method: Web Audio API via decoded buffer
      if (this.ctx && this.cheerBuffer) {
        const source = this.ctx.createBufferSource();
        source.buffer = this.cheerBuffer;

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(0.8, this.ctx.currentTime);

        source.connect(gainNode);
        gainNode.connect(this.ctx.destination);

        source.start(0);
        return;
      }

      // 2. Fallback method: HTML5 Audio
      if (this.cheerAudio) {
        this.cheerAudio.currentTime = 0;
        this.cheerAudio.volume = 0.8;
        const playPromise = this.cheerAudio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('Audio play prevented:', err);
          });
        }
      }
    } catch (e) {
      console.warn('Goal audio play error:', e);
    }
  }

  // High-tech countdown acoustic beep synthesizer (3, 2, 1)
  playCountdownBeep(count = 3) {
    if (this.isGameSoundMuted()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Pitch escalates as countdown nears zero: 3 -> 620Hz, 2 -> 740Hz, 1 -> 880Hz
      let freq = 620;
      let dur = 0.085;
      if (count === 2) {
        freq = 740;
        dur = 0.085;
      } else if (count === 1) {
        freq = 880;
        dur = 0.12;
      }

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.32, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + dur + 0.01);
    } catch (e) {
      console.warn('Countdown beep error:', e);
    }
  }

  // Authentic football referee kickoff whistle (Double chirp: Tweet-Tweeeeet!)
  playWhistle() {
    if (this.isGameSoundMuted()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const playChirp = (startTime, duration) => {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const tremolo = this.ctx.createOscillator();
        const tremGain = this.ctx.createGain();
        const mainGain = this.ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(2600, startTime);

        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(2880, startTime);

        // Pea-whistle vibration effect (trill)
        tremolo.type = 'sine';
        tremolo.frequency.setValueAtTime(32, startTime);
        tremGain.gain.setValueAtTime(140, startTime);

        tremolo.connect(osc1.frequency);
        tremolo.connect(osc2.frequency);

        mainGain.gain.setValueAtTime(0, startTime);
        mainGain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
        mainGain.gain.setValueAtTime(0.35, startTime + duration - 0.04);
        mainGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc1.connect(mainGain);
        osc2.connect(mainGain);
        mainGain.connect(this.ctx.destination);

        tremolo.start(startTime);
        osc1.start(startTime);
        osc2.start(startTime);

        tremolo.stop(startTime + duration);
        osc1.stop(startTime + duration);
        osc2.stop(startTime + duration);
      };

      // Two whistle chirps: Short burst then long authoritative blast
      playChirp(now, 0.12);
      playChirp(now + 0.16, 0.42);
    } catch (e) {
      console.warn('Whistle play error:', e);
    }
  }

  // Bomb countdown ticking sound with urgency pitch scaling
  playBombTick(urgency = 0) {
    if (this.isGameSoundMuted()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      const freq = 650 + Math.min(1, Math.max(0, urgency)) * 950;
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + 0.04);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.04);
    } catch (e) {
      console.warn('Bomb tick audio error:', e);
    }
  }

  // Huge cinematic bomb explosion boom (sub-bass drop + heavy impact)
  playBombExplosion() {
    if (this.isGameSoundMuted()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      // 1. Deep Sub Bass Thud
      const osc = this.ctx.createOscillator();
      const oscGain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.65);

      oscGain.gain.setValueAtTime(0.7, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc.connect(oscGain);
      oscGain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.65);

      // 2. Punchy Mid Shockwave
      const midOsc = this.ctx.createOscillator();
      const midGain = this.ctx.createGain();

      midOsc.type = 'triangle';
      midOsc.frequency.setValueAtTime(220, now);
      midOsc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

      midGain.gain.setValueAtTime(0.5, now);
      midGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      midOsc.connect(midGain);
      midGain.connect(this.ctx.destination);

      midOsc.start(now);
      midOsc.stop(now + 0.35);
    } catch (e) {
      console.warn('Bomb explosion audio error:', e);
    }
  }

  // Pinball Bumper / Bouncer high-energy ping bounce
  playBumperHit() {
    if (this.isGameSoundMuted()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(1100, now + 0.06);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.14);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.14);
    } catch (e) {
      console.warn('Bumper hit audio error:', e);
    }
  }

  // Bomb Tag Transfer audio chirp (bomba birine çarptı / ebelendi)
  playBombTag() {
    if (this.isGameSoundMuted()) return;
    this.initContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.05);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.12);

      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {
      console.warn('Bomb tag audio error:', e);
    }
  }
}

window.soundManager = new SoundManager();
