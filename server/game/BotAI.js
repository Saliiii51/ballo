const Vector2D = require('../physics/Vector2D');

const DIFFICULTY_PROFILES = {
  easy: {
    accel: 0.14,
    kickStrength: 5.8,
    damping: 0.96,
    predictionFrames: 10,
    kickRangeBonus: 4,
    reactionCooldown: 4,
    aimNoise: 25,
    wallBankShot: false
  },
  medium: {
    accel: 0.14,
    kickStrength: 5.8,
    damping: 0.96,
    predictionFrames: 20,
    kickRangeBonus: 4,
    reactionCooldown: 2,
    aimNoise: 10,
    wallBankShot: false
  },
  hard: {
    accel: 0.14,
    kickStrength: 5.8,
    damping: 0.96,
    predictionFrames: 32,
    kickRangeBonus: 4,
    reactionCooldown: 0,
    aimNoise: 0,
    wallBankShot: true
  },
  extreme: {
    accel: 0.14,
    kickStrength: 5.8,
    damping: 0.96,
    predictionFrames: 45,
    kickRangeBonus: 4,
    reactionCooldown: 0,
    aimNoise: 0,
    wallBankShot: true
  }
};

class BotAI {
  constructor(room) {
    this.room = room;
    this.difficulty = 'extreme'; // Default: Çok Zor
    this.profile = DIFFICULTY_PROFILES.extreme;
  }

  applyDifficulty(bot, difficulty) {
    this.difficulty = difficulty || 'extreme';
    this.profile = DIFFICULTY_PROFILES[this.difficulty] || DIFFICULTY_PROFILES.extreme;

    if (bot) {
      bot.accel = 0.14;
      bot.kickStrength = 5.8;
      bot.damping = this.room.stadium.playerDamping || 0.96;
    }
  }

  updateAll(bots) {
    if (!bots || bots.length === 0 || this.room.state !== 'PLAYING' && this.room.state !== 'OVERTIME') return;
    for (const bot of bots) {
      if (bot.active && !bot.isEliminated) {
        this.updateBot(bot);
      }
    }
  }

  updateBot(bot) {
    const ball = this.room.ball;
    if (!bot || !bot.active || (this.room.state !== 'PLAYING' && this.room.state !== 'OVERTIME')) return;

    if (this.room.gameMode === 'bomb') {
      this.updateBotBombMode(bot);
      return;
    }

    // Initialize per-bot tracking
    if (bot.unstuckTicks === undefined) bot.unstuckTicks = 0;
    if (bot.stuckCounter === undefined) bot.stuckCounter = 0;
    if (bot.cornerStepBackTicks === undefined) bot.cornerStepBackTicks = 0;
    if (!bot.lastPos) bot.lastPos = bot.pos.clone();

    // Reset inputs
    bot.inputs = { up: false, down: false, left: false, right: false, kick: false };

    // --- 1. CORNER REBOUND CLEARANCE RELEASE ---
    if (bot.cornerStepBackTicks > 0) {
      bot.cornerStepBackTicks--;
      const cornerSignX = Math.sign(ball.pos.x || 1);
      const cornerSignY = Math.sign(ball.pos.y || 1);
      this.steerTowards(bot, bot.pos.x - cornerSignX * 60, bot.pos.y - cornerSignY * 60);
      return;
    }

    const isBlue = bot.team === 'blue';
    const ownGoalX = isBlue ? this.room.stadium.halfW : -this.room.stadium.halfW;
    const targetGoalX = isBlue ? -this.room.stadium.halfW : this.room.stadium.halfW;
    const distToBall = bot.pos.dist(ball.pos);

    // --- 2. ANTI-STUCK TRACKING ---
    const movedDist = bot.pos.dist(bot.lastPos);
    bot.lastPos = bot.pos.clone();
    const isNearWall = Math.abs(bot.pos.x) > (this.room.stadium.halfW - 50) || Math.abs(bot.pos.y) > (this.room.stadium.halfH - 50);

    if (movedDist < 0.12 && distToBall > 45 && isNearWall) {
      bot.stuckCounter++;
    } else {
      bot.stuckCounter = Math.max(0, bot.stuckCounter - 1);
    }

    if (bot.stuckCounter > 25) {
      bot.unstuckTicks = 12;
      bot.stuckCounter = 0;
    }

    if (bot.unstuckTicks > 0) {
      bot.unstuckTicks--;
      this.steerTowards(bot, bot.pos.x * 0.85, bot.pos.y * 0.85);
      return;
    }

    // --- BOT INDIVIDUAL PERSONALITY & STYLE VARIATION (seeded: tekrarlanabilir) ---
    const roomRand = () => (this.room && typeof this.room.rand === 'function') ? this.room.rand() : Math.random();
    if (bot.preferredFlank === undefined) {
      // Different bots favor different sides of the pitch or playing tendencies
      bot.preferredFlank = (roomRand() > 0.5 ? 1 : -1);
      bot.aggression = 0.85 + roomRand() * 0.3; // 0.85 to 1.15
      bot.shotStyleTimer = Math.floor(roomRand() * 60);
      bot.currentAimOffset = (roomRand() - 0.5) * 20;
    }

    bot.shotStyleTimer = (bot.shotStyleTimer + 1) % 180;
    if (bot.shotStyleTimer === 0) {
      // Dynamic shift in preferred aim: corner post, center blast, or opposite corner
      const aimChoices = [-48, -25, 0, 25, 48];
      bot.currentAimOffset = aimChoices[Math.floor(roomRand() * aimChoices.length)];
    }

    // --- 3. TEAM ROLE & SPACING COORDINATION (MEVKİ DAĞILIMI) ---
    // Gather all active teammates (human players and other bots)
    const teammates = [];
    for (const p of this.room.players.values()) {
      if (p.active && p.team === bot.team && p.id !== bot.id) teammates.push(p);
    }
    for (const b of this.room.bots.values()) {
      if (b.active && b.team === bot.team && b.id !== bot.id) teammates.push(b);
    }

    // Identify who on our team is closest to the ball
    let closestTeammate = null;
    let minTeammateDistToBall = Infinity;
    for (const tm of teammates) {
      const d = tm.pos.dist(ball.pos);
      if (d < minTeammateDistToBall) {
        minTeammateDistToBall = d;
        closestTeammate = tm;
      }
    }

    // Am I the primary ball handler / presser on my team?
    const isBallHandler = (distToBall <= minTeammateDistToBall);

    // Identify closest opponent
    let closestOpponent = null;
    let minOpponentDist = Infinity;
    for (const p of this.room.players.values()) {
      if (p.active && p.team !== bot.team) {
        const d = p.pos.dist(ball.pos);
        if (d < minOpponentDist) {
          minOpponentDist = d;
          closestOpponent = p;
        }
      }
    }
    for (const b of this.room.bots.values()) {
      if (b.active && b.team !== bot.team) {
        const d = b.pos.dist(ball.pos);
        if (d < minOpponentDist) {
          minOpponentDist = d;
          closestOpponent = b;
        }
      }
    }

    // --- 4. OFF-THE-BALL TACTICAL BEHAVIOR (TOP BENDE DEĞİLKEN MEVKİ ALMA) ---
    // If a teammate is already closer to the ball, DO NOT CROWD / CLUMP! Take positions!
    if (!isBallHandler && closestTeammate) {
      // Are we the furthest back player on the team?
      let isFurthestBack = true;
      const myDistToOwnGoal = Math.abs(bot.pos.x - ownGoalX);
      for (const tm of teammates) {
        if (Math.abs(tm.pos.x - ownGoalX) < myDistToOwnGoal) {
          isFurthestBack = false;
          break;
        }
      }

      // If ball is traveling fast on target, emergency dive applies to everyone
      const ballFastToOwnGoal = isBlue ? ball.vel.x > 0.8 : ball.vel.x < -0.8;
      const isShotOnOwnGoal = ballFastToOwnGoal && Math.abs(ball.pos.y) < 85;

      if (!isShotOnOwnGoal) {
        if (isFurthestBack) {
          // --- ROLE: ANCHOR DEFENDER (STOPER / EMNİYET SÜPÜRÜCÜSÜ) ---
          const anchorPos = this.calculateAnchorPosition(ball, ownGoalX);
          this.steerTowardsClamped(bot, anchorPos.x, anchorPos.y);
          return;
        } else {
          // --- ROLE: SUPPORT WINGER / STRIKER ---
          const supportPos = this.calculateSupportPosition(bot, closestTeammate, ball, targetGoalX);
          this.steerTowardsClamped(bot, supportPos.x, supportPos.y);
          return;
        }
      }
    }

    // --- 5. ON-THE-BALL ACTIVE PLAY (TOPA EN YAKIN BOT / OYUN KURUCU) ---
    const interceptPos = this.predictOptimalIntercept(bot, ball, this.profile.predictionFrames);
    const inCorner = Math.abs(ball.pos.x) > (this.room.stadium.halfW - 90) && Math.abs(ball.pos.y) > 80;
    const ballInOwnHalf = isBlue ? ball.pos.x > 0 : ball.pos.x < 0;

    const ballFastToOwnGoal = isBlue ? ball.vel.x > 0.8 : ball.vel.x < -0.8;
    const isShotOnOwnGoal = ballFastToOwnGoal && Math.abs(ball.pos.y) < 85;
    const opponentThreatInGoalMouth = closestOpponent && minOpponentDist < 45 && ballInOwnHalf && Math.abs(ball.pos.y) < 85 && (distToBall > minOpponentDist + 15);

    let targetX = interceptPos.x;
    let targetY = interceptPos.y;
    let shouldKick = false;

    // CASE A: DIVE / REFLEX SAVE ON TARGET
    if (isShotOnOwnGoal && Math.abs(ball.pos.x - ownGoalX) < 450) {
      const timeToNet = (ownGoalX - ball.pos.x) / (ball.vel.x || 0.001);
      if (timeToNet > 0 && timeToNet < 60) {
        const predictedY = ball.pos.y + ball.vel.y * timeToNet;
        const saveY = Math.max(-65, Math.min(65, predictedY));
        const keeperLineX = isBlue ? (this.room.stadium.halfW - 40) : (-this.room.stadium.halfW + 40);

        targetX = keeperLineX;
        targetY = saveY;

        if (distToBall < bot.radius + ball.radius + this.profile.kickRangeBonus) {
          if (this.isSafeKick(bot, ball)) {
            shouldKick = true;
          }
        }
      }
    }
    // CASE B: GOALKEEPING STANDBY
    else if (opponentThreatInGoalMouth && distToBall > 65) {
      const keeperLineX = isBlue ? (this.room.stadium.halfW - 60) : (-this.room.stadium.halfW + 60);
      const angleY = Math.max(-55, Math.min(55, ball.pos.y * 0.7));

      targetX = keeperLineX;
      targetY = angleY;
    }
    // CASE C: BALL IN CORNER / FLANK (SMASH IT OUT)
    else if (inCorner) {
      targetX = ball.pos.x;
      targetY = ball.pos.y;

      const kickReach = bot.radius + ball.radius + this.profile.kickRangeBonus;
      if (distToBall <= kickReach && this.isSafeKick(bot, ball)) {
        shouldKick = true;
        bot.cornerStepBackTicks = 12;
      }
    }
    // CASE D: ATTACK, DRIBBLE & PASSING
    else {
      // Find open teammate for a pass
      let passTargetTeammate = null;
      if (teammates.length > 0 && distToBall <= 35) {
        for (const tm of teammates) {
          const tmIsAhead = isBlue ? (tm.pos.x < ball.pos.x + 20) : (tm.pos.x > ball.pos.x - 20);
          if (tmIsAhead && tm.pos.dist(ball.pos) > 80 && tm.pos.dist(ball.pos) < 320) {
            let laneBlocked = false;
            if (closestOpponent) {
              const toTm = Vector2D.sub(tm.pos, ball.pos);
              const toOpp = Vector2D.sub(closestOpponent.pos, ball.pos);
              const proj = toOpp.dot(toTm.clone().normalize());
              if (proj > 0 && proj < toTm.mag()) {
                const perpDist = Math.abs(toOpp.x * toTm.y - toOpp.y * toTm.x) / toTm.mag();
                if (perpDist < 30) laneBlocked = true;
              }
            }
            if (!laneBlocked) {
              passTargetTeammate = tm;
              break;
            }
          }
        }
      }

      // Varied goal target post: incorporates personality aim offset
      let targetPostY = bot.currentAimOffset || 0;
      if (closestOpponent && Math.abs(closestOpponent.pos.x - targetGoalX) < 220) {
        // Aim at the open corner opposite to keeper
        targetPostY = closestOpponent.pos.y > 0 ? -52 : 52;
      } else {
        // Naturally alternate top and bottom corners or center
        targetPostY = (bot.preferredFlank > 0 ? 46 : -46) + (Math.sin(Date.now() / 900) * 15);
      }

      let shotAngleTarget = new Vector2D(targetGoalX, targetPostY);

      // If passing opportunity exists and opponent is pressing, PASS TO TEAMMATE!
      if (passTargetTeammate && minOpponentDist < 60) {
        shotAngleTarget = passTargetTeammate.pos.clone();
      } else if (this.profile.wallBankShot && closestOpponent && Math.abs(closestOpponent.pos.x - ball.pos.x) < 90) {
        const bankWallY = ball.pos.y > 0 ? (this.room.stadium.halfH - 10) : (-this.room.stadium.halfH + 10);
        shotAngleTarget = new Vector2D((ball.pos.x + targetGoalX) / 2, bankWallY);
      }

      const shotVec = Vector2D.sub(shotAngleTarget, ball.pos).normalize();
      // For Blue (attacking left, towards -X), bot must be on +X side of ball to shoot forward.
      // If bot is on -X side, it is in front of the ball and must circle around behind it!
      const needsToGetBehindBall = isBlue ? (bot.pos.x < ball.pos.x + 12) : (bot.pos.x > ball.pos.x - 12);

      if (needsToGetBehindBall) {
        // Circle around behind the ball to position for forward shot
        const sideY = (bot.pos.y >= ball.pos.y) ? (28 + bot.preferredFlank * 4) : (-28 + bot.preferredFlank * 4);
        targetX = isBlue ? Math.min(this.room.stadium.halfW - 35, ball.pos.x + 32) : Math.max(-this.room.stadium.halfW + 35, ball.pos.x - 32);
        targetY = ball.pos.y + sideY;
      } else {
        const distToTargetGoal = Math.abs(ball.pos.x - targetGoalX);
        const inShootingRange = distToTargetGoal < (260 * (bot.aggression || 1.0));
        const underPressure = minOpponentDist < 50;
        const nearOwnGoal = Math.abs(ball.pos.x - ownGoalX) < 160;

        const kickReach = bot.radius + ball.radius + this.profile.kickRangeBonus;
        const toBall = Vector2D.sub(ball.pos, bot.pos).normalize();
        const alignment = toBall.dot(shotVec);

        // ONLY kick if the kick is 100% safe and will NOT travel into own goal!
        if (distToBall <= kickReach && this.isSafeKick(bot, ball)) {
          if (passTargetTeammate && alignment > 0.45) {
            shouldKick = true;
          } else if (inShootingRange && alignment > 0.48) {
            shouldKick = true;
          } else if (underPressure && alignment > 0.2) {
            shouldKick = true;
          } else if (nearOwnGoal && alignment > 0.1) {
            // Safe forward clearance upfield away from own net!
            shouldKick = true;
          }
        }

        if (shouldKick) {
          targetX = ball.pos.x - shotVec.x * 18;
          targetY = ball.pos.y - shotVec.y * 18;
        } else {
          // Dribbling forward with variable speed/offset
          targetX = ball.pos.x + shotVec.x * 12;
          targetY = ball.pos.y + shotVec.y * 12;
        }
      }
    }

    if (shouldKick) {
      bot.inputs.kick = true;
    }

    this.steerTowardsClamped(bot, targetX, targetY);
  }

  // --- OWN GOAL PREVENTION SYSTEM ---
  // Calculates exact trajectory of the ball if kicked by bot and rejects dangerous kicks
  isSafeKick(bot, ball) {
    const isBlue = bot.team === 'blue';
    const ownGoalX = isBlue ? this.room.stadium.halfW : -this.room.stadium.halfW;
    const goalHalfW = (this.room.stadium.goalWidth || 150) / 2 + 25; // with safety margin

    // Direction the ball will travel when kicked (from bot center to ball center)
    const kickDir = Vector2D.sub(ball.pos, bot.pos);
    if (kickDir.magSq() < 0.0001) return false;
    kickDir.normalize();

    // Blue's own goal is on +X side (right). If kickDir.x > 0, ball travels towards own goal!
    // Red's own goal is on -X side (left). If kickDir.x < 0, ball travels towards own goal!
    const headingTowardsOwnGoalSide = isBlue ? (kickDir.x > -0.05) : (kickDir.x < 0.05);

    if (headingTowardsOwnGoalSide) {
      const inDefensiveHalf = isBlue ? (ball.pos.x > -60) : (ball.pos.x < 60);

      if (inDefensiveHalf) {
        // Calculate intersection of kick trajectory with the own goal line
        const dx = ownGoalX - ball.pos.x;
        const movingTowardsGoalLine = (isBlue && kickDir.x > 0.02) || (!isBlue && kickDir.x < -0.02);

        if (movingTowardsGoalLine) {
          const t = dx / kickDir.x;
          if (t > 0) {
            const hitY = ball.pos.y + kickDir.y * t;
            // If trajectory intersects own goal mouth or near posts:
            if (Math.abs(hitY) < goalHalfW + 35) {
              return false; // DANGEROUS! Block kick to prevent own goal!
            }
          }
        }

        // If near own penalty box/goal area:
        const nearOwnBox = Math.abs(ball.pos.x - ownGoalX) < 220;
        if (nearOwnBox) {
          const movingBackwards = isBlue ? (kickDir.x > 0) : (kickDir.x < 0);
          if (movingBackwards) {
            // Only allow if clearing hard towards wide touchline far away from goal mouth
            const isWideClearance = Math.abs(kickDir.y) > 0.85 && Math.abs(ball.pos.y) > 90;
            if (!isWideClearance) {
              return false; // Reject backwards kick near own net
            }
          }
        }
      }
    }

    return true;
  }

  // Calculate Anchor Defender position (between ball and own goal mouth)
  calculateAnchorPosition(ball, ownGoalX) {
    const anchorX = ownGoalX * 0.55 + ball.pos.x * 0.35;
    const anchorY = Math.max(-75, Math.min(75, ball.pos.y * 0.5));
    return new Vector2D(anchorX, anchorY);
  }

  // Calculate Off-the-ball Support position (opposite flank to receive pass / cross)
  calculateSupportPosition(bot, ballHandler, ball, targetGoalX) {
    const isBlue = bot.team === 'blue';
    const forwardDir = isBlue ? -1 : 1;

    // Opposite flank from the ball
    const oppositeFlankY = ball.pos.y >= 0 ? -100 : 100;

    // Positioned forward into attacking space
    let supX = ball.pos.x + forwardDir * 95;
    const maxForward = (this.room.stadium.halfW - 55) * forwardDir;
    if (forwardDir > 0) {
      supX = Math.min(maxForward, supX);
    } else {
      supX = Math.max(maxForward, supX);
    }

    // Enforce spacing: keep at least 75px distance from teammate
    const targetPos = new Vector2D(supX, oppositeFlankY);
    const distToHandler = targetPos.dist(ballHandler.pos);
    if (distToHandler < 75) {
      const away = Vector2D.sub(targetPos, ballHandler.pos).normalize();
      targetPos.add(away.mult(75 - distToHandler));
    }

    return targetPos;
  }

  predictOptimalIntercept(bot, ball, maxSteps) {
    const ballSpeed = ball.vel.mag();
    if (ballSpeed < 0.2) return ball.pos.clone();

    let px = ball.pos.x;
    let py = ball.pos.y;
    let vx = ball.vel.x;
    let vy = ball.vel.y;
    const botSpeed = 3.35;

    const limitX = this.room.stadium.halfW - 10;
    const limitY = this.room.stadium.halfH - 10;

    for (let t = 1; t <= maxSteps; t++) {
      vx *= this.room.stadium.ballDamping || 0.99;
      vy *= this.room.stadium.ballDamping || 0.99;
      px += vx;
      py += vy;

      if (py > limitY) { py = limitY; vy = -vy * 0.7; }
      if (py < -limitY) { py = -limitY; vy = -vy * 0.7; }
      if ((px > limitX || px < -limitX) && Math.abs(py) > 70) {
        vx = -vx * 0.7;
      }

      const distToProjected = Math.hypot(px - bot.pos.x, py - bot.pos.y);
      if (distToProjected <= botSpeed * t) {
        return new Vector2D(px, py);
      }
    }

    return new Vector2D(px, py);
  }

  updateBotBombMode(bot) {
    const ball = this.room.ball;
    if (!bot || !bot.active || bot.isEliminated) return;

    // Reset inputs
    bot.inputs = { up: false, down: false, left: false, right: false, kick: false };

    // Anti-stuck tracking
    if (bot.unstuckTicks === undefined) bot.unstuckTicks = 0;
    if (bot.stuckCounter === undefined) bot.stuckCounter = 0;
    if (bot.cornerStepBackTicks === undefined) bot.cornerStepBackTicks = 0;
    if (!bot.lastPos) bot.lastPos = bot.pos.clone();

    // 0. Corner step-back release (gives the rebounding ball space to fly out)
    if (bot.cornerStepBackTicks > 0) {
      bot.cornerStepBackTicks--;
      const signX = Math.sign(ball.pos.x || 1);
      const signY = Math.sign(ball.pos.y || 1);
      this.steerTowardsClamped(bot, bot.pos.x - signX * 90, bot.pos.y - signY * 90);
      return;
    }

    const movedDist = bot.pos.dist(bot.lastPos);
    bot.lastPos = bot.pos.clone();
    const isNearWall = Math.abs(bot.pos.x) > (this.room.stadium.halfW - 45) || Math.abs(bot.pos.y) > (this.room.stadium.halfH - 45);

    if (movedDist < 0.15 && isNearWall) {
      bot.stuckCounter++;
    } else {
      bot.stuckCounter = Math.max(0, bot.stuckCounter - 1);
    }

    if (bot.stuckCounter > 15) {
      bot.unstuckTicks = 12;
      bot.stuckCounter = 0;
    }

    if (bot.unstuckTicks > 0) {
      bot.unstuckTicks--;
      this.steerTowardsClamped(bot, bot.pos.x * 0.7, bot.pos.y * 0.7);
      return;
    }

    const halfW = this.room.stadium.halfW;
    const halfH = this.room.stadium.halfH;
    const distToBall = bot.pos.dist(ball.pos);
    const holder = this.room.bombHolderPlayer;
    const isHolder = (holder && holder.id === bot.id);
    const isOurTeamHolding = (this.room.bombHolderTeam === bot.team);
    const isEnemyHolding = (this.room.bombHolderTeam && this.room.bombHolderTeam !== bot.team);
    const isFreeBall = !holder;

    // Check if ball is in corner zone
    const isBallInCorner = Math.abs(ball.pos.x) > (halfW - 85) && Math.abs(ball.pos.y) > (halfH - 85);
    const cornerSignX = Math.sign(ball.pos.x || 1);
    const cornerSignY = Math.sign(ball.pos.y || 1);

    // Collect alive teammates and alive opponents
    const aliveTeammates = [];
    const aliveOpponents = [];
    for (const p of this.room.getAllActivePlayers()) {
      if (p.team === bot.team) {
        if (p.id !== bot.id) aliveTeammates.push(p);
      } else {
        aliveOpponents.push(p);
      }
    }

    // Find closest alive opponent
    let closestOpponent = null;
    let minOppDist = Infinity;
    for (const opp of aliveOpponents) {
      const d = bot.pos.dist(opp.pos);
      if (d < minOppDist) {
        minOppDist = d;
        closestOpponent = opp;
      }
    }

    // Determine who is the primary chaser on our team:
    // - If our team has the EBE: ONLY the EBE is the chaser!
    // - If the ball is free: ONLY the single closest teammate is the chaser!
    let isPrimaryChaser = false;
    if (isHolder) {
      isPrimaryChaser = true;
    } else if (isFreeBall) {
      let minTmDist = distToBall;
      isPrimaryChaser = true;
      for (const tm of aliveTeammates) {
        const d = tm.pos.dist(ball.pos);
        if (d < minTmDist - 2) {
          isPrimaryChaser = false;
          break;
        }
      }
    }

    // --- CORNER ANTI-CROWDING RULE ---
    // If the ball is in a corner and I am NOT the primary chaser:
    // STRICTLY STAY OUT OF THE CORNER! (Back off to safe standoff distance)
    if (isBallInCorner && !isPrimaryChaser) {
      const cornerCornerX = cornerSignX * halfW;
      const cornerCornerY = cornerSignY * halfH;
      const distToCorner = Math.hypot(bot.pos.x - cornerCornerX, bot.pos.y - cornerCornerY);

      if (distToCorner < 190) {
        const standoffX = cornerSignX * (halfW - 200);
        const standoffY = cornerSignY * (halfH - 180);
        this.steerTowardsClamped(bot, standoffX, standoffY);
        return;
      }
    }

    // ==========================================
    // CASE 1: I AM THE CHASER (EBE or free ball racer)
    // ==========================================
    if (isPrimaryChaser) {
      // 1A. CORNER EXTRACTION MANEUVER
      if (isBallInCorner) {
        this.steerTowards(bot, ball.pos.x, ball.pos.y);

        const kickReach = bot.radius + ball.radius + 10;
        if (distToBall <= kickReach) {
          // Smash bomb out of corner and step back
          bot.inputs.kick = true;
          bot.cornerStepBackTicks = 16;
        }
        return;
      }

      // 1B. REGULAR OPEN FIELD ATTACK (Hit opponent with bomb)
      if (!closestOpponent) {
        this.steerTowardsClamped(bot, 0, 0);
        return;
      }

      const oppVel = closestOpponent.vel || new Vector2D(0, 0);
      const targetAimPos = Vector2D.add(closestOpponent.pos, Vector2D.mult(oppVel, 8));

      // Aim vector from ball to target opponent
      const aimDir = Vector2D.sub(targetAimPos, ball.pos);
      if (aimDir.magSq() > 0.001) aimDir.normalize();

      const desiredApproachPos = Vector2D.sub(ball.pos, Vector2D.mult(aimDir, bot.radius + ball.radius + 6));
      const kickReach = bot.radius + ball.radius + 6;

      if (distToBall <= kickReach) {
        const toTarget = Vector2D.sub(targetAimPos, bot.pos).normalize();
        const toBall = Vector2D.sub(ball.pos, bot.pos).normalize();
        const dot = toTarget.dot(toBall);

        if (dot > 0.55 || distToBall <= kickReach - 2) {
          bot.inputs.kick = true;
        }
        this.steerTowardsClamped(bot, ball.pos.x, ball.pos.y);
      } else {
        this.steerTowardsClamped(bot, desiredApproachPos.x, desiredApproachPos.y);
      }
      return;
    }

    // ==========================================
    // CASE 2: TEAMMATE HOLDS BOMB (I am safe! STAY AWAY FROM BOMB!)
    // ==========================================
    if (isOurTeamHolding && !isHolder) {
      // Do NOT touch the bomb! Stay away from bomb and holder
      if (distToBall < 170) {
        const away = Vector2D.sub(bot.pos, ball.pos).normalize();
        const retreatPos = Vector2D.add(bot.pos, Vector2D.mult(away, 80));
        this.steerTowardsClamped(bot, retreatPos.x, retreatPos.y);
        return;
      }

      // Spread out into open space away from ball and corners
      const safeX = -Math.sign(ball.pos.x || 1) * (halfW * 0.35);
      const safeY = (bot.pos.y > 0 ? 1 : -1) * (halfH * 0.3);
      this.steerTowardsClamped(bot, safeX, safeY);
      return;
    }

    // ==========================================
    // CASE 3: FREE BALL (Teammate is racing for it)
    // ==========================================
    if (isFreeBall && !isPrimaryChaser) {
      if (distToBall < 150) {
        const away = Vector2D.sub(bot.pos, ball.pos).normalize();
        this.steerTowardsClamped(bot, bot.pos.x + away.x * 60, bot.pos.y + away.y * 60);
      } else {
        const flankY = (bot.pos.y >= 0 ? 1 : -1) * (halfH * 0.35);
        this.steerTowardsClamped(bot, bot.pos.x * 0.8, flankY);
      }
      return;
    }

    // ==========================================
    // CASE 4: ENEMY HOLDS BOMB (DODGEBALL SURVIVAL MODE)
    // ==========================================
    if (isEnemyHolding) {
      const ballSpeed = ball.vel.mag();
      const toBot = Vector2D.sub(bot.pos, ball.pos);
      const dist = toBot.mag();

      // Never get trapped in a corner when enemy has bomb!
      const inAnyCorner = Math.abs(bot.pos.x) > (halfW - 80) && Math.abs(bot.pos.y) > (halfH - 80);
      if (inAnyCorner) {
        this.steerTowardsClamped(bot, 0, 0); // Flee corner to center!
        return;
      }

      if (dist < 230) {
        if (ballSpeed > 1.0) {
          // Dodge perpendicular to incoming trajectory
          const ballNorm = ball.vel.clone().normalize();
          const perp1 = new Vector2D(-ballNorm.y, ballNorm.x);
          const perp2 = new Vector2D(ballNorm.y, -ballNorm.x);

          const pos1 = Vector2D.add(bot.pos, Vector2D.mult(perp1, 80));
          const pos2 = Vector2D.add(bot.pos, Vector2D.mult(perp2, 80));
          const distFromWall1 = Math.min(halfW - Math.abs(pos1.x), halfH - Math.abs(pos1.y));
          const distFromWall2 = Math.min(halfW - Math.abs(pos2.x), halfH - Math.abs(pos2.y));

          const bestPerp = (distFromWall1 > distFromWall2) ? perp1 : perp2;
          const dodgeTarget = Vector2D.add(bot.pos, Vector2D.mult(bestPerp, 70));
          this.steerTowardsClamped(bot, dodgeTarget.x, dodgeTarget.y);
        } else {
          // Keep distance from opponent EBE
          const awayDir = toBot.normalize();
          const retreatTarget = Vector2D.add(bot.pos, Vector2D.mult(awayDir, 80));
          this.steerTowardsClamped(bot, retreatTarget.x, retreatTarget.y);
        }
      } else {
        // Dynamic safe spacing in open field
        const safeX = Math.sign(bot.pos.x || 1) * (halfW * 0.45);
        const safeY = (bot.pos.y > 0 ? 1 : -1) * (halfH * 0.35);
        this.steerTowardsClamped(bot, safeX, safeY);
      }
    }
  }

  steerTowardsClamped(bot, targetX, targetY) {
    const boundX = this.room.stadium.halfW - 30;
    const boundY = this.room.stadium.halfH - 25;
    const clX = Math.max(-boundX, Math.min(boundX, targetX));
    const clY = Math.max(-boundY, Math.min(boundY, targetY));
    this.steerTowards(bot, clX, clY);
  }

  steerTowards(bot, targetX, targetY) {
    const dx = targetX - bot.pos.x;
    const dy = targetY - bot.pos.y;
    const deadzone = 2.5;

    if (dx > deadzone) bot.inputs.right = true;
    else if (dx < -deadzone) bot.inputs.left = true;

    if (dy > deadzone) bot.inputs.down = true;
    else if (dy < -deadzone) bot.inputs.up = true;
  }
}

module.exports = BotAI;
