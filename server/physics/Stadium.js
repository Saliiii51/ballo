const Vector2D = require('./Vector2D');

const STADIUM_PRESETS = {
  classic: {
    name: 'Classic Turf',
    theme: 'turf',
    width: 800,
    height: 400,
    goalWidth: 150,
    goalDepth: 70,
    postRadius: 8,
    centerCircleRadius: 80,
    ballDamping: 0.99,
    playerDamping: 0.96,
    wallBounciness: 0.95,
    ballBounciness: 0.8
  },
  big: {
    name: 'Big Stadium',
    theme: 'turf',
    width: 1000,
    height: 520,
    goalWidth: 170,
    goalDepth: 80,
    postRadius: 9,
    centerCircleRadius: 100,
    ballDamping: 0.99,
    playerDamping: 0.96,
    wallBounciness: 0.95,
    ballBounciness: 0.8
  },
  futsal: {
    name: 'Futsal Hall',
    theme: 'futsal',
    width: 820,
    height: 420,
    goalWidth: 140,
    goalDepth: 60,
    postRadius: 8,
    centerCircleRadius: 75,
    ballDamping: 0.985,
    playerDamping: 0.955,
    wallBounciness: 0.92,
    ballBounciness: 0.72
  },
  hockey: {
    name: 'Ice Hockey',
    theme: 'hockey',
    width: 840,
    height: 420,
    goalWidth: 150,
    goalDepth: 70,
    postRadius: 8,
    centerCircleRadius: 80,
    ballDamping: 0.997,
    playerDamping: 0.982, // Extra slippery ice physics!
    wallBounciness: 0.98,
    ballBounciness: 0.85,
    isRounded: true
  },
  street: {
    name: 'Sokak & Halı Saha',
    theme: 'street',
    width: 760,
    height: 380,
    goalWidth: 130,
    goalDepth: 55,
    postRadius: 7,
    centerCircleRadius: 70,
    ballDamping: 0.985,
    playerDamping: 0.965, // Fast-paced street football
    wallBounciness: 0.99, // Super lively metal fences!
    ballBounciness: 0.88
  }
};

class Stadium {
  constructor(presetKey = 'classic') {
    this.currentPresetKey = 'classic';
    this.loadPreset(presetKey);
  }

  loadPreset(presetKey, noGoals = false) {
    const config = STADIUM_PRESETS[presetKey] || STADIUM_PRESETS.classic;
    this.currentPresetKey = presetKey in STADIUM_PRESETS ? presetKey : 'classic';
    this.name = config.name;
    this.theme = config.theme;
    this.width = config.width;
    this.height = config.height;
    this.halfW = this.width / 2;
    this.halfH = this.height / 2;
    this.goalWidth = config.goalWidth;
    this.goalHalfW = this.goalWidth / 2;
    this.goalDepth = config.goalDepth;
    this.postRadius = config.postRadius;
    this.centerCircleRadius = config.centerCircleRadius;
    this.ballDamping = config.ballDamping;
    this.playerDamping = config.playerDamping;
    this.wallBounciness = config.wallBounciness;
    this.ballBounciness = config.ballBounciness;
    this.isRounded = !!config.isRounded;
    this.bumpers = [];
    this.noGoals = !!noGoals;

    this.rebuildSegments();
  }

  setNoGoals(noGoals) {
    this.noGoals = !!noGoals;
    this.rebuildSegments();
  }

  rebuildSegments() {
    this.segments = [];
    const b = this.wallBounciness;

    const useBevel = this.isRounded || this.noGoals;
    if (useBevel) {
      const cornerBevel = this.noGoals ? 45 : 60;
      // Top wall
      this.segments.push({ p1: new Vector2D(-this.halfW + cornerBevel, -this.halfH), p2: new Vector2D(this.halfW - cornerBevel, -this.halfH), bounciness: b, type: 'wall' });
      // Bottom wall
      this.segments.push({ p1: new Vector2D(-this.halfW + cornerBevel, this.halfH), p2: new Vector2D(this.halfW - cornerBevel, this.halfH), bounciness: b, type: 'wall' });
      // 4 Spring-Loaded Corner Bevels (Yaylı Köşe Tamponları)
      const cornerBounciness = this.noGoals ? 1.8 : b;
      const cornerType = this.noGoals ? 'spring' : 'wall';
      const isSpring = !!this.noGoals;

      this.segments.push({ p1: new Vector2D(-this.halfW + cornerBevel, -this.halfH), p2: new Vector2D(-this.halfW, -this.halfH + cornerBevel), bounciness: cornerBounciness, type: cornerType, isSpring });
      this.segments.push({ p1: new Vector2D(this.halfW - cornerBevel, -this.halfH), p2: new Vector2D(this.halfW, -this.halfH + cornerBevel), bounciness: cornerBounciness, type: cornerType, isSpring });
      this.segments.push({ p1: new Vector2D(-this.halfW + cornerBevel, this.halfH), p2: new Vector2D(-this.halfW, this.halfH - cornerBevel), bounciness: cornerBounciness, type: cornerType, isSpring });
      this.segments.push({ p1: new Vector2D(this.halfW - cornerBevel, this.halfH), p2: new Vector2D(this.halfW, this.halfH - cornerBevel), bounciness: cornerBounciness, type: cornerType, isSpring });

      if (this.noGoals) {
        // Enclosed arena: continuous side walls
        this.segments.push({ p1: new Vector2D(-this.halfW, -this.halfH + cornerBevel), p2: new Vector2D(-this.halfW, this.halfH - cornerBevel), bounciness: b, type: 'wall' });
        this.segments.push({ p1: new Vector2D(this.halfW, -this.halfH + cornerBevel), p2: new Vector2D(this.halfW, this.halfH - cornerBevel), bounciness: b, type: 'wall' });
        this.posts = [];
        this.goals = { left: null, right: null };
      } else {
        // Left walls
        this.segments.push({ p1: new Vector2D(-this.halfW, -this.halfH + cornerBevel), p2: new Vector2D(-this.halfW, -this.goalHalfW), bounciness: b, type: 'wall' });
        this.segments.push({ p1: new Vector2D(-this.halfW, this.goalHalfW), p2: new Vector2D(-this.halfW, this.halfH - cornerBevel), bounciness: b, type: 'wall' });
        // Right walls
        this.segments.push({ p1: new Vector2D(this.halfW, -this.halfH + cornerBevel), p2: new Vector2D(this.halfW, -this.goalHalfW), bounciness: b, type: 'wall' });
        this.segments.push({ p1: new Vector2D(this.halfW, this.goalHalfW), p2: new Vector2D(this.halfW, this.halfH - cornerBevel), bounciness: b, type: 'wall' });

        // Goal Nets
        this.segments.push({ p1: new Vector2D(-this.halfW, -this.goalHalfW), p2: new Vector2D(-this.halfW - this.goalDepth, -this.goalHalfW), bounciness: 0.4, type: 'net' });
        this.segments.push({ p1: new Vector2D(-this.halfW - this.goalDepth, -this.goalHalfW), p2: new Vector2D(-this.halfW - this.goalDepth, this.goalHalfW), bounciness: 0.4, type: 'net' });
        this.segments.push({ p1: new Vector2D(-this.halfW - this.goalDepth, this.goalHalfW), p2: new Vector2D(-this.halfW, this.goalHalfW), bounciness: 0.4, type: 'net' });

        this.segments.push({ p1: new Vector2D(this.halfW, -this.goalHalfW), p2: new Vector2D(this.halfW + this.goalDepth, -this.goalHalfW), bounciness: 0.4, type: 'net' });
        this.segments.push({ p1: new Vector2D(this.halfW + this.goalDepth, -this.goalHalfW), p2: new Vector2D(this.halfW + this.goalDepth, this.goalHalfW), bounciness: 0.4, type: 'net' });
        this.segments.push({ p1: new Vector2D(this.halfW + this.goalDepth, this.goalHalfW), p2: new Vector2D(this.halfW, this.goalHalfW), bounciness: 0.4, type: 'net' });

        this.posts = [
          { id: 'left-top', pos: new Vector2D(-this.halfW, -this.goalHalfW), radius: this.postRadius, bounciness: 0.6, color: '#ffffff' },
          { id: 'left-bottom', pos: new Vector2D(-this.halfW, this.goalHalfW), radius: this.postRadius, bounciness: 0.6, color: '#ffffff' },
          { id: 'right-top', pos: new Vector2D(this.halfW, -this.goalHalfW), radius: this.postRadius, bounciness: 0.6, color: '#ffffff' },
          { id: 'right-bottom', pos: new Vector2D(this.halfW, this.goalHalfW), radius: this.postRadius, bounciness: 0.6, color: '#ffffff' }
        ];
        this.goals = {
          left: { x: -this.halfW, minY: -this.goalHalfW, maxY: this.goalHalfW, team: 'blue' },
          right: { x: this.halfW, minY: -this.goalHalfW, maxY: this.goalHalfW, team: 'red' }
        };
      }
    } else {
      // Standard rectangular stadium
      this.segments.push({ p1: new Vector2D(-this.halfW, -this.halfH), p2: new Vector2D(this.halfW, -this.halfH), bounciness: b, type: 'wall' });
      this.segments.push({ p1: new Vector2D(-this.halfW, this.halfH), p2: new Vector2D(this.halfW, this.halfH), bounciness: b, type: 'wall' });

      if (this.noGoals) {
        // Enclosed arena: continuous solid left and right walls (no goal openings)
        this.segments.push({ p1: new Vector2D(-this.halfW, -this.halfH), p2: new Vector2D(-this.halfW, this.halfH), bounciness: b, type: 'wall' });
        this.segments.push({ p1: new Vector2D(this.halfW, -this.halfH), p2: new Vector2D(this.halfW, this.halfH), bounciness: b, type: 'wall' });
        this.posts = [];
        this.goals = { left: null, right: null };
      } else {
        this.segments.push({ p1: new Vector2D(-this.halfW, -this.halfH), p2: new Vector2D(-this.halfW, -this.goalHalfW), bounciness: b, type: 'wall' });
        this.segments.push({ p1: new Vector2D(-this.halfW, this.goalHalfW), p2: new Vector2D(-this.halfW, this.halfH), bounciness: b, type: 'wall' });
        this.segments.push({ p1: new Vector2D(this.halfW, -this.halfH), p2: new Vector2D(this.halfW, -this.goalHalfW), bounciness: b, type: 'wall' });
        this.segments.push({ p1: new Vector2D(this.halfW, this.goalHalfW), p2: new Vector2D(this.halfW, this.halfH), bounciness: b, type: 'wall' });

        // Goal Nets
        this.segments.push({ p1: new Vector2D(-this.halfW, -this.goalHalfW), p2: new Vector2D(-this.halfW - this.goalDepth, -this.goalHalfW), bounciness: 0.4, type: 'net' });
        this.segments.push({ p1: new Vector2D(-this.halfW - this.goalDepth, -this.goalHalfW), p2: new Vector2D(-this.halfW - this.goalDepth, this.goalHalfW), bounciness: 0.4, type: 'net' });
        this.segments.push({ p1: new Vector2D(-this.halfW - this.goalDepth, this.goalHalfW), p2: new Vector2D(-this.halfW, this.goalHalfW), bounciness: 0.4, type: 'net' });

        this.segments.push({ p1: new Vector2D(this.halfW, -this.goalHalfW), p2: new Vector2D(this.halfW + this.goalDepth, -this.goalHalfW), bounciness: 0.4, type: 'net' });
        this.segments.push({ p1: new Vector2D(this.halfW + this.goalDepth, -this.goalHalfW), p2: new Vector2D(this.halfW + this.goalDepth, this.goalHalfW), bounciness: 0.4, type: 'net' });
        this.segments.push({ p1: new Vector2D(this.halfW + this.goalDepth, this.goalHalfW), p2: new Vector2D(this.halfW, this.goalHalfW), bounciness: 0.4, type: 'net' });

        this.posts = [
          { id: 'left-top', pos: new Vector2D(-this.halfW, -this.goalHalfW), radius: this.postRadius, bounciness: 0.6, color: '#ffffff' },
          { id: 'left-bottom', pos: new Vector2D(-this.halfW, this.goalHalfW), radius: this.postRadius, bounciness: 0.6, color: '#ffffff' },
          { id: 'right-top', pos: new Vector2D(this.halfW, -this.goalHalfW), radius: this.postRadius, bounciness: 0.6, color: '#ffffff' },
          { id: 'right-bottom', pos: new Vector2D(this.halfW, this.goalHalfW), radius: this.postRadius, bounciness: 0.6, color: '#ffffff' }
        ];
        this.goals = {
          left: { x: -this.halfW, minY: -this.goalHalfW, maxY: this.goalHalfW, team: 'blue' },
          right: { x: this.halfW, minY: -this.goalHalfW, maxY: this.goalHalfW, team: 'red' }
        };
      }
    }
  }

  loadCustom(customConfig = {}, noGoals = false) {
    this.currentPresetKey = 'custom';
    this.name = customConfig.name || 'Özel Arena';
    this.theme = customConfig.theme || 'turf';
    this.width = Math.max(600, Math.min(1200, Number(customConfig.width) || 800));
    this.height = Math.max(340, Math.min(600, Number(customConfig.height) || 400));
    this.halfW = this.width / 2;
    this.halfH = this.height / 2;
    this.goalWidth = Math.max(100, Math.min(220, Number(customConfig.goalWidth) || 150));
    this.goalHalfW = this.goalWidth / 2;
    this.goalDepth = Math.max(50, Math.min(90, Number(customConfig.goalDepth) || 70));
    this.postRadius = Math.max(6, Math.min(12, Number(customConfig.postRadius) || 8));
    this.centerCircleRadius = Math.max(60, Math.min(120, Number(customConfig.centerCircleRadius) || 80));

    this.ballDamping = Number(customConfig.ballDamping) || 0.99;
    this.playerDamping = Number(customConfig.playerDamping) || 0.96;
    this.wallBounciness = Number(customConfig.wallBounciness) || 0.95;
    this.ballBounciness = Number(customConfig.ballBounciness) || 0.8;
    this.isRounded = false;
    this.noGoals = !!noGoals;

    // Pinball Bumpers / Custom Obstacles
    this.bumpers = Array.isArray(customConfig.bumpers) ? customConfig.bumpers.map((bp, i) => ({
      id: `bumper_${i}`,
      pos: new Vector2D(Number(bp.x) || 0, Number(bp.y) || 0),
      radius: Math.max(12, Math.min(35, Number(bp.radius) || 20)),
      bounciness: Number(bp.bounciness) || 1.6,
      color: bp.color || '#ff007f'
    })) : [];

    this.rebuildSegments();
  }

  checkGoal(ball) {
    if (this.noGoals) return null;
    if (ball.pos.x < -this.halfW && ball.pos.y > -this.goalHalfW && ball.pos.y < this.goalHalfW) {
      return 'blue';
    }
    if (ball.pos.x > this.halfW && ball.pos.y > -this.goalHalfW && ball.pos.y < this.goalHalfW) {
      return 'red';
    }
    return null;
  }
}

Stadium.PRESETS = STADIUM_PRESETS;
module.exports = Stadium;
