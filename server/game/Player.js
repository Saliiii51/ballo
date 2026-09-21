const Vector2D = require('../physics/Vector2D');

class Player {
  constructor(id, name, isBot = false) {
    this.id = id;
    this.name = name || (isBot ? 'Bot' : 'Player');
    this.isBot = isBot;
    this.team = 'spec'; // 'spec', 'red', 'blue'

    this.pos = new Vector2D(0, 0);
    this.vel = new Vector2D(0, 0);

    // Physical attributes (Classic Haxball defaults)
    this.radius = 15;
    this.mass = 1.0;
    this.invMass = 1.0;
    this.bounciness = 0.5;
    this.damping = 0.95;
    this.accel = 0.08;
    this.kickStrength = 4.0;

    this.kickCooldown = 0;
    this.kickAnimationTimer = 0;
    this.avatar = this.name.charAt(0).toUpperCase() || 'P';
    this.aura = 'none'; // 'none', 'flame', 'lightning', 'chroma', 'gold'
    this.title = 'Çaylak Forvet';
    this.hasCrown = false;
    this.isEliminated = false;
    this.profileName = this.name;
    this.goals = 0;

    this.inputs = {
      up: false,
      down: false,
      left: false,
      right: false,
      kick: false
    };
  }

  get active() {
    return this.team === 'red' || this.team === 'blue';
  }

  reset(x, y) {
    this.pos.set(x, y);
    this.vel.set(0, 0);
    this.kickCooldown = 0;
    this.kickAnimationTimer = 0;
    this.inputs = { up: false, down: false, left: false, right: false, kick: false };
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      team: this.team,
      avatar: this.avatar,
      aura: this.aura || 'none',
      title: this.title || 'Çaylak Forvet',
      isBot: this.isBot,
      hasCrown: !!this.hasCrown,
      isEliminated: !!this.isEliminated,
      goals: this.goals || 0,
      x: Math.round(this.pos.x * 10) / 10,
      y: Math.round(this.pos.y * 10) / 10,
      vx: Math.round(this.vel.x * 100) / 100,
      vy: Math.round(this.vel.y * 100) / 100,
      kicking: this.kickAnimationTimer > 0
    };
  }
}

module.exports = Player;
