class InputManager {
  constructor(socket) {
    this.socket = socket;
    this.keys = {
      up: false,
      down: false,
      left: false,
      right: false,
      kick: false
    };

    this.lastSentKeys = null;
    this.chatInput = document.getElementById('chatInput');
    this.nicknameInput = document.getElementById('nicknameInput');

    // Virtual Touch Controls
    this.touchControls = document.getElementById('touchControls');
    this.joystickZone = document.getElementById('joystickZone');
    this.joystickBase = document.getElementById('joystickBase');
    this.joystickKnob = document.getElementById('joystickKnob');
    this.touchKickBtn = document.getElementById('touchKickBtn');

    this.joystickTouchId = null;
    this.maxJoystickRadius = 35;
    this.deadzone = 7;

    this.initListeners();
    this.initTouchControls();
  }

  isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable;
  }

  initListeners() {
    window.addEventListener('keydown', (e) => this.handleKey(e, true));
    window.addEventListener('keyup', (e) => this.handleKey(e, false));
    window.addEventListener('blur', () => this.reset());

    // Disable Safari / WebKit gesture pinch zoom
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('gestureend', (e) => e.preventDefault());

    // Disable multi-touch pinch zoom on document
    document.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    }, { passive: false });

    // Disable double-tap to zoom
    let lastTouchEnd = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        if (!['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(e.target.tagName)) {
          e.preventDefault();
        }
      }
      lastTouchEnd = now;
    }, false);

    // Disable Ctrl + Wheel / trackpad pinch zoom
    document.addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  initTouchControls() {
    const isTouchSupported = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (isTouchSupported || window.innerWidth <= 1024) {
      document.body.classList.add('touch-device');
      document.documentElement.classList.add('touch-device');
    }

    window.addEventListener('touchstart', () => {
      document.body.classList.add('touch-device');
      document.documentElement.classList.add('touch-device');
    }, { once: true, passive: true });

    if (!this.joystickZone || !this.touchKickBtn) return;

    // --- 1. Virtual Joystick Listeners ---
    const handleJoystickStart = (e) => {
      if (this.joystickTouchId !== null) return;
      const touch = e.changedTouches[0];
      this.joystickTouchId = touch.identifier;
      if (this.joystickBase) this.joystickBase.classList.add('active');
      this.updateJoystick(touch.clientX, touch.clientY);
      e.preventDefault();
    };

    const handleJoystickMove = (e) => {
      if (this.joystickTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.joystickTouchId) {
          this.updateJoystick(touch.clientX, touch.clientY);
          e.preventDefault();
          break;
        }
      }
    };

    const handleJoystickEnd = (e) => {
      if (this.joystickTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === this.joystickTouchId) {
          this.joystickTouchId = null;
          if (this.joystickBase) this.joystickBase.classList.remove('active');
          this.resetJoystick();
          e.preventDefault();
          break;
        }
      }
    };

    this.joystickZone.addEventListener('touchstart', handleJoystickStart, { passive: false });
    window.addEventListener('touchmove', handleJoystickMove, { passive: false });
    window.addEventListener('touchend', handleJoystickEnd, { passive: false });
    window.addEventListener('touchcancel', handleJoystickEnd, { passive: false });

    // --- 2. Touch Kick Button Listeners ---
    const handleKickStart = (e) => {
      e.preventDefault();
      this.keys.kick = true;
      this.touchKickBtn.classList.add('active');
      if (navigator.vibrate) {
        try { navigator.vibrate(25); } catch (err) {}
      }
      this.sendInputs();
    };

    const handleKickEnd = (e) => {
      e.preventDefault();
      this.keys.kick = false;
      this.touchKickBtn.classList.remove('active');
      this.sendInputs();
    };

    this.touchKickBtn.addEventListener('touchstart', handleKickStart, { passive: false });
    this.touchKickBtn.addEventListener('touchend', handleKickEnd, { passive: false });
    this.touchKickBtn.addEventListener('touchcancel', handleKickEnd, { passive: false });

    // Mouse fallback for testing touch controls on desktop
    this.touchKickBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.keys.kick = true;
      this.touchKickBtn.classList.add('active');
      this.sendInputs();
    });
    window.addEventListener('mouseup', () => {
      if (this.keys.kick && !this.isTyping()) {
        this.keys.kick = false;
        this.touchKickBtn.classList.remove('active');
        this.sendInputs();
      }
    });
  }

  updateJoystick(touchX, touchY) {
    if (!this.joystickBase || !this.joystickKnob) return;
    const rect = this.joystickBase.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = touchX - centerX;
    let dy = touchY - centerY;
    const dist = Math.hypot(dx, dy);

    if (dist > this.maxJoystickRadius) {
      const angle = Math.atan2(dy, dx);
      dx = Math.cos(angle) * this.maxJoystickRadius;
      dy = Math.sin(angle) * this.maxJoystickRadius;
    }

    this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

    // Directional deadzone mapping (8 directions)
    let up = false, down = false, left = false, right = false;
    if (dist > this.deadzone) {
      const angle = Math.atan2(dy, dx);
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);

      // 45-degree sector thresholds
      if (dy < -this.deadzone * 0.6) up = true;
      if (dy > this.deadzone * 0.6) down = true;
      if (dx < -this.deadzone * 0.6) left = true;
      if (dx > this.deadzone * 0.6) right = true;
    }

    const changed = (
      this.keys.up !== up ||
      this.keys.down !== down ||
      this.keys.left !== left ||
      this.keys.right !== right
    );

    if (changed) {
      this.keys.up = up;
      this.keys.down = down;
      this.keys.left = left;
      this.keys.right = right;
      this.sendInputs();
    }
  }

  resetJoystick() {
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = 'translate(0px, 0px)';
    }
    const changed = (this.keys.up || this.keys.down || this.keys.left || this.keys.right);
    this.keys.up = false;
    this.keys.down = false;
    this.keys.left = false;
    this.keys.right = false;

    if (changed) {
      this.sendInputs();
    }
  }

  handleKey(e, isDown) {
    const code = e.code;

    // Handle Escape even if typing in chat
    if (code === 'Escape' && isDown) {
      if (window.toggleInGamePause) {
        window.toggleInGamePause();
        e.preventDefault();
        return;
      }
    }

    if (this.isTyping()) {
      return;
    }

    let changed = false;

    // Up: W, ArrowUp
    if (code === 'KeyW' || code === 'ArrowUp') {
      if (this.keys.up !== isDown) {
        this.keys.up = isDown;
        changed = true;
      }
      e.preventDefault();
    }
    // Down: S, ArrowDown
    else if (code === 'KeyS' || code === 'ArrowDown') {
      if (this.keys.down !== isDown) {
        this.keys.down = isDown;
        changed = true;
      }
      e.preventDefault();
    }
    // Left: A, ArrowLeft
    else if (code === 'KeyA' || code === 'ArrowLeft') {
      if (this.keys.left !== isDown) {
        this.keys.left = isDown;
        changed = true;
      }
      e.preventDefault();
    }
    // Right: D, ArrowRight
    else if (code === 'KeyD' || code === 'ArrowRight') {
      if (this.keys.right !== isDown) {
        this.keys.right = isDown;
        changed = true;
      }
      e.preventDefault();
    }
    // Kick: Space, KeyX
    else if (code === 'Space' || code === 'KeyX') {
      if (isDown && window.skipWalkoutIfActive && window.skipWalkoutIfActive()) {
        e.preventDefault();
        return;
      }
      if (this.keys.kick !== isDown) {
        this.keys.kick = isDown;
        changed = true;
      }
      e.preventDefault();
    }
    // In-Game Floating Chat focus/toggle: Enter
    else if (code === 'Enter' && isDown) {
      if (window.toggleInGameChat) {
        window.toggleInGameChat();
        e.preventDefault();
      } else if (this.chatInput) {
        this.chatInput.focus();
        e.preventDefault();
      }
    }

    if (changed) {
      this.sendInputs();
    }
  }

  sendInputs() {
    this.socket.emit('player_input', {
      up: this.keys.up,
      down: this.keys.down,
      left: this.keys.left,
      right: this.keys.right,
      kick: this.keys.kick
    });
  }

  reset() {
    this.keys = { up: false, down: false, left: false, right: false, kick: false };
    this.resetJoystick();
    this.sendInputs();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = InputManager;
} else if (typeof window !== 'undefined') {
  window.InputManager = InputManager;
}
