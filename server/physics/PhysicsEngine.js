const Vector2D = require('./Vector2D');

class PhysicsEngine {
  constructor(stadium, rngFn = null) {
    this.stadium = stadium;
    this.events = []; // For sound/event triggering (kick, post_hit, etc.)
    // Deterministik RNG; verilmezse Math.random fallback (geriye uyumluluk)
    this.rngFn = (typeof rngFn === 'function') ? rngFn : Math.random;
  }

  setRngFn(fn) {
    if (typeof fn === 'function') this.rngFn = fn;
  }

  step(players, ball, obstacles = []) {
    this.events = [];

    // 1. Process Player Inputs & Movement
    for (const player of players) {
      if (!player.active) continue;

      // Handle kick state & animation timer
      if (player.kickCooldown > 0) {
        player.kickCooldown--;
      }
      if (player.kickAnimationTimer > 0) {
        player.kickAnimationTimer--;
      }

      // Input movement direction
      const inputDir = new Vector2D(0, 0);
      if (player.inputs.left) inputDir.x -= 1;
      if (player.inputs.right) inputDir.x += 1;
      if (player.inputs.up) inputDir.y -= 1;
      if (player.inputs.down) inputDir.y += 1;

      if (inputDir.magSq() > 0) {
        inputDir.normalize();
        player.vel.x += inputDir.x * player.accel;
        player.vel.y += inputDir.y * player.accel;
      }

      // Apply damping (friction)
      player.vel.mult(player.damping);
      // Clamp player velocity to prevent tunneling
      if (player.vel.magSq() > 56.25) {
        player.vel.normalize().mult(7.5);
      }
      // Update position
      player.pos.add(player.vel);

      // Check kick attempt
      if (player.inputs.kick && player.kickCooldown === 0) {
        player.kickAnimationTimer = 10; // ~160ms visible kick ring
        const dist = player.pos.dist(ball.pos);
        const kickRange = player.radius + ball.radius + 4;

        if (dist <= kickRange) {
          // Ball is in kick reach!
          let kickDir = Vector2D.sub(ball.pos, player.pos);
          if (kickDir.magSq() < 0.001) {
            kickDir = player.vel.magSq() > 0.01 ? player.vel.clone().normalize() : new Vector2D(1, 0);
          } else {
            kickDir.normalize();
          }

          // Apply kick impulse to ball with organic realistic variance (seeded RNG -> tekrarlanabilir)
          const rnd1 = this.rngFn();
          const rnd2 = this.rngFn();
          const kickSpeed = player.kickStrength * (0.97 + rnd1 * 0.06);
          // Very slight natural slice/spin variation (+-1.5 degrees)
          const spinAngle = (rnd2 - 0.5) * 0.05;
          const cosA = Math.cos(spinAngle);
          const sinA = Math.sin(spinAngle);
          const rotDirX = kickDir.x * cosA - kickDir.y * sinA;
          const rotDirY = kickDir.x * sinA + kickDir.y * cosA;

          ball.vel.x = rotDirX * kickSpeed + player.vel.x * 0.4;
          ball.vel.y = rotDirY * kickSpeed + player.vel.y * 0.4;

          player.kickCooldown = 15; // small debounce between kicks
          this.events.push({ type: 'kick', pos: ball.pos.clone(), playerId: player.id, team: player.team });
        }
      }
    }

    // 2. Move Ball
    ball.vel.mult(ball.damping);
    // Clamp ball velocity to prevent tunneling
    if (ball.vel.magSq() > 256.0) {
      ball.vel.normalize().mult(16.0);
    }
    ball.pos.add(ball.vel);

    // 3. Collisions: Disc with Disc (Player vs Ball)
    for (const player of players) {
      if (!player.active) continue;
      const hit = this.resolveDiscCollision(player, ball);
      if (hit) {
        this.events.push({ type: 'ball_touch', pos: ball.pos.clone(), playerId: player.id, team: player.team });
      }
    }

    // 4. Collisions: Disc with Disc (Player vs Player)
    for (let i = 0; i < players.length; i++) {
      if (!players[i].active) continue;
      for (let j = i + 1; j < players.length; j++) {
        if (!players[j].active) continue;
        this.resolveDiscCollision(players[i], players[j]);
      }
    }

    // 5. Collisions: Ball with Posts
    for (const post of this.stadium.posts) {
      const hit = this.resolveStaticDiscCollision(ball, post);
      if (hit && ball.vel.magSq() > 1.0) {
        this.events.push({ type: 'post_hit', pos: post.pos.clone() });
      }
    }

    // 6. Collisions: Players with Posts
    for (const player of players) {
      if (!player.active) continue;
      for (const post of this.stadium.posts) {
        this.resolveStaticDiscCollision(player, post);
      }
    }

    // 6b. Collisions: Ball and Players with Static Obstacles (Training Dummies)
    if (obstacles && obstacles.length > 0) {
      for (const obs of obstacles) {
        const hit = this.resolveStaticDiscCollision(ball, obs);
        if (hit && ball.vel.magSq() > 1.0) {
          const posX = obs.x != null ? obs.x : (obs.pos ? obs.pos.x : 0);
          const posY = obs.y != null ? obs.y : (obs.pos ? obs.pos.y : 0);
          this.events.push({ type: 'post_hit', pos: new Vector2D(posX, posY) });
        }
      }
      for (const player of players) {
        if (!player.active) continue;
        for (const obs of obstacles) {
          this.resolveStaticDiscCollision(player, obs);
        }
      }
    }

    // 6c. Collisions: Ball and Players with Pinball Bumpers (Custom Stadium Bouncers)
    const bumpers = (this.stadium && this.stadium.bumpers) ? this.stadium.bumpers : [];
    if (bumpers.length > 0) {
      for (const b of bumpers) {
        const hit = this.resolveBumperCollision(ball, b);
        if (hit) {
          this.events.push({ type: 'bumper_hit', pos: b.pos.clone(), color: b.color });
        }
      }
      for (const player of players) {
        if (!player.active) continue;
        for (const b of bumpers) {
          const hit = this.resolveBumperCollision(player, b);
          if (hit) {
            this.events.push({ type: 'bumper_hit', pos: b.pos.clone(), color: b.color });
          }
        }
      }
    }

    // 7. Collisions: Ball with Segments
    for (const seg of this.stadium.segments) {
      this.resolveSegmentCollision(ball, seg);
    }

    // 8. Collisions: Players with Segments
    for (const player of players) {
      if (!player.active) continue;
      for (const seg of this.stadium.segments) {
        this.resolveSegmentCollision(player, seg);
      }
    }

    // 9. Hard safety boundary clamp to guarantee entities stay in bounds
    if (this.stadium) {
      if (this.stadium.noGoals) {
        const maxBX = Math.max(10, this.stadium.halfW - ball.radius);
        const maxBY = Math.max(10, this.stadium.halfH - ball.radius);
        if (ball.pos.x < -maxBX) { ball.pos.x = -maxBX; if (ball.vel.x < 0) ball.vel.x = -ball.vel.x * 0.5; }
        if (ball.pos.x > maxBX) { ball.pos.x = maxBX; if (ball.vel.x > 0) ball.vel.x = -ball.vel.x * 0.5; }
        if (ball.pos.y < -maxBY) { ball.pos.y = -maxBY; if (ball.vel.y < 0) ball.vel.y = -ball.vel.y * 0.5; }
        if (ball.pos.y > maxBY) { ball.pos.y = maxBY; if (ball.vel.y > 0) ball.vel.y = -ball.vel.y * 0.5; }

        for (const player of players) {
          if (!player.active) continue;
          const maxPX = Math.max(10, this.stadium.halfW - player.radius);
          const maxPY = Math.max(10, this.stadium.halfH - player.radius);
          if (player.pos.x < -maxPX) { player.pos.x = -maxPX; if (player.vel.x < 0) player.vel.x = 0; }
          if (player.pos.x > maxPX) { player.pos.x = maxPX; if (player.vel.x > 0) player.vel.x = 0; }
          if (player.pos.y < -maxPY) { player.pos.y = -maxPY; if (player.vel.y < 0) player.vel.y = 0; }
          if (player.pos.y > maxPY) { player.pos.y = maxPY; if (player.vel.y > 0) player.vel.y = 0; }
        }
      } else {
        const boundX = this.stadium.halfW + this.stadium.goalDepth + 30;
        const boundY = this.stadium.halfH + 30;
        if (ball.pos.x < -boundX) { ball.pos.x = -boundX; ball.vel.x = 0; }
        if (ball.pos.x > boundX) { ball.pos.x = boundX; ball.vel.x = 0; }
        if (ball.pos.y < -boundY) { ball.pos.y = -boundY; ball.vel.y = 0; }
        if (ball.pos.y > boundY) { ball.pos.y = boundY; ball.vel.y = 0; }

        for (const player of players) {
          if (!player.active) continue;
          const boundPX = this.stadium.halfW + this.stadium.goalDepth + 15;
          const boundPY = this.stadium.halfH + 15;
          if (player.pos.x < -boundPX) { player.pos.x = -boundPX; player.vel.x = 0; }
          if (player.pos.x > boundPX) { player.pos.x = boundPX; player.vel.x = 0; }
          if (player.pos.y < -boundPY) { player.pos.y = -boundPY; player.vel.y = 0; }
          if (player.pos.y > boundPY) { player.pos.y = boundPY; player.vel.y = 0; }
        }
      }
    }

    return this.events;
  }

  // Elastic collision between two dynamic discs
  resolveDiscCollision(a, b) {
    const delta = Vector2D.sub(a.pos, b.pos);
    const dist = delta.mag();
    const minDist = a.radius + b.radius;

    if (dist < minDist && dist > 0.0001) {
      const normal = Vector2D.mult(delta, 1 / dist);
      const overlap = minDist - dist;

      // Position separation based on inverse mass
      const totalInvMass = a.invMass + b.invMass;
      if (totalInvMass > 0) {
        const aRatio = a.invMass / totalInvMass;
        const bRatio = b.invMass / totalInvMass;

        a.pos.add(Vector2D.mult(normal, overlap * aRatio));
        b.pos.sub(Vector2D.mult(normal, overlap * bRatio));

        // Velocity resolution
        const relVel = Vector2D.sub(a.vel, b.vel);
        const velAlongNormal = relVel.dot(normal);

        if (velAlongNormal < 0) {
          const restitution = a.bounciness * b.bounciness;
          const impulseMag = -(1 + restitution) * velAlongNormal / totalInvMass;
          const impulse = Vector2D.mult(normal, impulseMag);

          a.vel.add(Vector2D.mult(impulse, a.invMass));
          b.vel.sub(Vector2D.mult(impulse, b.invMass));
        }
      }
      return true;
    }
    return false;
  }

  // Collision with fixed post or static obstacle (infinite mass)
  resolveStaticDiscCollision(disc, post) {
    const postPos = post.pos ? post.pos : post;
    const postBounciness = (post.bounciness != null) ? post.bounciness : 0.6;
    const delta = new Vector2D(disc.pos.x - postPos.x, disc.pos.y - postPos.y);
    const dist = delta.mag();
    const minDist = disc.radius + (post.radius || 15);

    if (dist < minDist && dist > 0.0001) {
      const normal = Vector2D.mult(delta, 1 / dist);
      const overlap = minDist - dist;

      // Push dynamic disc completely out
      disc.pos.add(Vector2D.mult(normal, overlap));

      const velAlongNormal = disc.vel.dot(normal);
      if (velAlongNormal < 0) {
        const restitution = (disc.bounciness != null ? disc.bounciness : 0.5) * postBounciness;
        const impulseMag = -(1 + restitution) * velAlongNormal;
        disc.vel.add(Vector2D.mult(normal, impulseMag));
        return true;
      }
    }
    return false;
  }

  // Collision between dynamic disc and line segment
  resolveSegmentCollision(disc, seg) {
    const ab = Vector2D.sub(seg.p2, seg.p1);
    const ap = Vector2D.sub(disc.pos, seg.p1);

    const abLenSq = ab.magSq();
    if (abLenSq === 0) return false;

    // Project ap onto ab, clamped between 0 and 1
    let t = ap.dot(ab) / abLenSq;
    t = Math.max(0, Math.min(1, t));

    // Nearest point on segment
    const nearest = Vector2D.add(seg.p1, Vector2D.mult(ab, t));
    const delta = Vector2D.sub(disc.pos, nearest);
    const dist = delta.mag();

    if (dist < disc.radius) {
      let normal;
      if (dist > 0.0001) {
        normal = Vector2D.mult(delta, 1 / dist);
      } else {
        // In the rare case the disc center is exactly on the segment, pick a perpendicular normal
        normal = new Vector2D(-ab.y, ab.x).normalize();
      }

      // Ensure normal points inwards towards the pitch center (0,0) for arena perimeter/springs
      if (seg.isSpring || seg.type === 'spring' || (this.stadium && this.stadium.noGoals)) {
        const toCenter = new Vector2D(-nearest.x, -nearest.y);
        if (normal.dot(toCenter) < 0) {
          normal.mult(-1);
        }
      }

      const overlap = disc.radius - dist;
      disc.pos.add(Vector2D.mult(normal, overlap));

      const velAlongNormal = disc.vel.dot(normal);
      if (velAlongNormal < 0) {
        if (seg.isSpring || seg.type === 'spring') {
          // Extra elastic spring bumper ejection!
          const currentSpeed = disc.vel.mag();
          const boostedSpeed = Math.min(Math.max(currentSpeed * 1.65, 9.8), 14.5);
          disc.vel.x = normal.x * boostedSpeed;
          disc.vel.y = normal.y * boostedSpeed;
          this.events.push({ type: 'bumper_hit', pos: nearest.clone() });
          return true;
        }

        const restitution = disc.bounciness * seg.bounciness;
        const impulseMag = -(1 + restitution) * velAlongNormal;
        disc.vel.add(Vector2D.mult(normal, impulseMag));
        return true;
      }
    }
    return false;
  }

  // Explosive repulsion collision for pinball bumpers
  resolveBumperCollision(disc, bumper) {
    const bumperPos = bumper.pos ? bumper.pos : bumper;
    const delta = new Vector2D(disc.pos.x - bumperPos.x, disc.pos.y - bumperPos.y);
    const dist = delta.mag();
    const minDist = disc.radius + (bumper.radius || 20);

    if (dist < minDist && dist > 0.0001) {
      const normal = Vector2D.mult(delta, 1 / dist);
      const overlap = minDist - dist;
      disc.pos.add(Vector2D.mult(normal, overlap));

      const bounceMult = (bumper.bounciness != null) ? bumper.bounciness : 1.6;
      const currentSpeed = disc.vel.mag();
      const boostedSpeed = Math.max(currentSpeed * bounceMult, 8.5);

      disc.vel.x = normal.x * boostedSpeed;
      disc.vel.y = normal.y * boostedSpeed;
      return true;
    }
    return false;
  }

  // Radial shockwave blast for Bomb Explosion
  applyExplosionImpulse(center, radius, maxForce, players, ball) {
    const blastPos = center ? (center.pos || center) : { x: 0, y: 0 };
    // Blast against players
    for (const p of players) {
      if (!p.active) continue;
      const d = p.pos.dist(blastPos);
      if (d < radius && d > 0.001) {
        const factor = (1 - d / radius);
        const impulseDir = Vector2D.sub(p.pos, blastPos).normalize();
        const force = maxForce * factor;
        p.vel.add(Vector2D.mult(impulseDir, force));
      }
    }
    // Blast against ball
    const ballDist = ball.pos.dist(blastPos);
    if (ballDist < radius && ballDist > 0.001) {
      const factor = (1 - ballDist / radius);
      const impulseDir = Vector2D.sub(ball.pos, blastPos).normalize();
      ball.vel.add(Vector2D.mult(impulseDir, maxForce * factor * 1.4));
    }
  }
}

module.exports = PhysicsEngine;
