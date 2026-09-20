// Training & Freekick Practice Mode Controller
class TrainingManager {
  constructor(socket, renderer, enterGameCallback) {
    this.socket = socket;
    this.renderer = renderer;
    this.enterGame = enterGameCallback;

    this.isActive = false;
    this.score = 0;
    this.currentSpotIndex = 0;

    // Freekick spots (x, y) relative to pitch center
    this.spots = [
      { name: 'Merkez Yay (20m)', x: 140, y: 0, playerX: 110, playerY: 0 },
      { name: 'Sol Çapraz (Falso)', x: 150, y: -90, playerX: 120, playerY: -95 },
      { name: 'Sağ Çapraz (Muz Orta)', x: 150, y: 90, playerX: 120, playerY: 95 }
    ];

    this.initDOM();
  }

  initDOM() {
    this.btnOpenTraining = document.getElementById('btnOpenTraining');
    this.trainingHud = document.getElementById('trainingHud');
    this.btnTrainingResetBall = document.getElementById('btnTrainingResetBall');
    this.btnTrainingNextSpot = document.getElementById('btnTrainingNextSpot');
    this.btnExitTraining = document.getElementById('btnExitTraining');
    this.trainingScoreText = document.getElementById('trainingScoreText');
    this.trainingSpotName = document.getElementById('trainingSpotName');

    if (this.btnOpenTraining) {
      this.btnOpenTraining.addEventListener('click', () => this.startTraining());
    }
    if (this.btnTrainingResetBall) {
      this.btnTrainingResetBall.addEventListener('click', () => this.resetBallToSpot());
    }
    if (this.btnTrainingNextSpot) {
      this.btnTrainingNextSpot.addEventListener('click', () => this.nextSpot());
    }
    if (this.btnExitTraining) {
      this.btnExitTraining.addEventListener('click', () => this.exitTraining());
    }
  }

  startTraining() {
    this.isActive = true;
    this.score = 0;
    this.currentSpotIndex = 0;

    // Switch to isolated training room so main pitch is never disrupted
    const trainingRoomId = 'training_' + (this.socket.id || 'solo');
    this.socket.emit('switch_room', { roomId: trainingRoomId });

    // Enter game arena
    this.enterGame('red');

    // Switch map to classic and setup objects
    this.socket.emit('change_map', { preset: 'classic' });

    // Enable renderer training mode
    this.renderer.trainingMode = true;
    this.setupTargetsAndDummies();

    if (this.trainingHud) this.trainingHud.classList.remove('hidden');
    this.updateHUD();

    // Reposition ball and obstacles after brief delay
    setTimeout(() => {
      this.resetBallToSpot();
    }, 400);
  }

  setupTargetsAndDummies() {
    const halfW = 400; // standard classic goal x = 400
    const goalHalfW = 75;

    // 90 Targets (Top Left & Top Right of Right Goal)
    this.renderer.trainingTargets = [
      { id: 'top_left', x: halfW - 12, y: -goalHalfW + 18, radius: 15, hit: false, label: '90' },
      { id: 'top_right', x: halfW - 12, y: goalHalfW - 18, radius: 15, hit: false, label: '90' }
    ];

    // Defensive Dummies (Baraj) placed between spot and goal
    this.setupDummiesForSpot();
  }

  setupDummiesForSpot() {
    const spot = this.spots[this.currentSpotIndex];
    const dummyX = (spot.x + 400) / 2 + 30; // Between ball spot and goal line
    const dummyBaseY = spot.y * 0.7;

    this.renderer.trainingDummies = [
      { x: dummyX, y: dummyBaseY - 32, radius: 13 },
      { x: dummyX, y: dummyBaseY, radius: 13 },
      { x: dummyX, y: dummyBaseY + 32, radius: 13 }
    ];

    if (this.isActive) {
      this.socket.emit('set_obstacles', { obstacles: this.renderer.trainingDummies });
    }
  }

  resetBallToSpot() {
    const spot = this.spots[this.currentSpotIndex];
    this.socket.emit('set_ball_position', { x: spot.x, y: spot.y });
    this.socket.emit('set_obstacles', { obstacles: this.renderer.trainingDummies });
    this.renderer.trainingTargets.forEach(t => t.hit = false);
    this.updateHUD();
  }

  nextSpot() {
    this.currentSpotIndex = (this.currentSpotIndex + 1) % this.spots.length;
    this.setupDummiesForSpot();
    this.resetBallToSpot();
  }

  checkTargetHit(ball) {
    if (!this.isActive || !ball) return;
    for (const target of this.renderer.trainingTargets) {
      if (!target.hit) {
        const dist = Math.hypot(ball.x - target.x, ball.y - target.y);
        if (dist < target.radius + (ball.radius || 10)) {
          target.hit = true;
          this.score += 100;
          this.updateHUD();
          this.renderer.triggerScreenShake(7, 10);
          this.renderer.spawnConfetti('red');
          if (window.soundManager) window.soundManager.playGoal();
        }
      }
    }
  }

  updateHUD() {
    if (this.trainingScoreText) {
      this.trainingScoreText.textContent = `${this.score} Puan`;
    }
    if (this.trainingSpotName) {
      this.trainingSpotName.textContent = this.spots[this.currentSpotIndex].name;
    }
  }

  exitTraining() {
    this.isActive = false;
    this.renderer.trainingMode = false;
    this.renderer.trainingDummies = [];
    this.renderer.trainingTargets = [];
    if (this.trainingHud) this.trainingHud.classList.add('hidden');
    // Clear obstacles and switch back to main stadium
    this.socket.emit('set_obstacles', { obstacles: [] });
    this.socket.emit('switch_room', { roomId: 'main' });
  }
}

window.TrainingManager = TrainingManager;
