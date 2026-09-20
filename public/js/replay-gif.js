// Gol tekrarını Ultra HD kalitede GIF olarak dışa aktarır (800x450 nHD, 20 FPS, Spor Master Paleti & Kenar Korumalı Dithering).
// Kullanım: ReplayGifExporter.exportReplay(replayObj, { onProgress }) -> Promise<Blob>
(function () {
  'use strict';

  // Ultra HD 16:9 GIF Çözünürlüğü (Büyük, net ve keskin)
  const GIF_W = 800;
  const GIF_H = 450;
  const FPS = 20;          // 20 FPS yüksek akıcılık
  const MAX_FRAMES = 90;   // 4.5 saniye tam aksiyon

  function sampleFrames(frames) {
    if (!frames || frames.length === 0) return [];
    if (frames.length <= MAX_FRAMES) return frames;
    const step = frames.length / MAX_FRAMES;
    const out = [];
    for (let i = 0; i < MAX_FRAMES; i++) {
      out.push(frames[Math.floor(i * step)]);
    }
    return out;
  }

  function makeOffRenderer(sourceRenderer) {
    const canvas = document.createElement('canvas');
    canvas.width = GIF_W;
    canvas.height = GIF_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    }

    const r = new GameRenderer(canvas);
    r.dpr = 1;
    r.width = GIF_W;
    r.height = GIF_H;
    r.originX = GIF_W / 2;
    r.originY = GIF_H / 2;

    // Sahayı ana renderer'dan kopyala
    if (sourceRenderer && sourceRenderer.stadium) {
      r.stadium = JSON.parse(JSON.stringify(sourceRenderer.stadium));
    }
    r.gameMode = (sourceRenderer && sourceRenderer.gameMode) ? sourceRenderer.gameMode : 'classic';
    r.trainingMode = false;
    r.cameraZoom = 1;
    r.targetZoom = 1;
    r.goalZoomDuration = 0;
    r.shakeDuration = 0;
    r.confetti = [];
    r.explosionShockwaves = [];
    r.explosionSparks = [];
    r.ballTrail = [];
    return r;
  }

  function drawStill(r, frame) {
    const ctx = r.canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const scale = r.calculateBaseScale();
    ctx.fillStyle = '#080b13';
    ctx.fillRect(0, 0, GIF_W, GIF_H);
    ctx.save();
    ctx.translate(r.originX, r.originY);
    ctx.scale(scale, scale);
    try {
      r.drawGround(ctx);
      r.drawMarkings(ctx);
      r.drawTeamDugouts(ctx);

      if (r.gameMode === 'bomb' || (r.stadium && r.stadium.noGoals)) {
        r.drawBombArenaWalls(ctx);
      } else {
        r.drawGoalNets(ctx);
        r.drawPosts(ctx);
      }
      r.drawBumpers(ctx);

      if (frame.ball) {
        const ball = { x: frame.ball.x, y: frame.ball.y, vx: frame.ball.vx || 0, vy: frame.ball.vy || 0, radius: 10 };
        r.drawBallTrail(ctx, ball);
        if (r.gameMode === 'bomb') {
          r.drawBombBall(ctx, ball, frame.bomb);
        } else {
          r.drawBall(ctx, ball);
        }
      }

      if (frame.players) {
        for (const p of frame.players) {
          try {
            r.drawPlayer(ctx, p, false);
          } catch (e) { /* tek oyuncu hatası GIF'i bozmasın */ }
        }
      }
    } finally {
      ctx.restore();
    }
    return ctx.getImageData(0, 0, GIF_W, GIF_H);
  }

  // TV Yayını Formatında Şık Gol Bilgisi Rozeti (Score Bug)
  function drawCaption(ctx, text, isOwnGoal = false) {
    ctx.save();
    ctx.font = 'bold 15px "Chakra Petch", sans-serif';
    ctx.textBaseline = 'middle';
    const textMetrics = ctx.measureText(text);
    const boxW = Math.max(160, textMetrics.width + 44);
    const boxH = 36;
    const boxX = 14;
    const boxY = 14;

    // Arka Plan Yumuşak Gölge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(boxX + 2, boxY + 2, boxW, boxH, 8);
    ctx.fill();

    // Koyu Cam Efektli Kapsül
    ctx.fillStyle = 'rgba(10, 14, 24, 0.94)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();

    // Altın Sarısı / Kırmızı Çerçeve
    ctx.strokeStyle = isOwnGoal ? '#ff4757' : '#ffd700';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Yanıp Sönen Kayıt / Canlı Noktası
    ctx.fillStyle = isOwnGoal ? '#ff4757' : '#4ade80';
    ctx.beginPath();
    ctx.arc(boxX + 16, boxY + boxH / 2, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Gol Bilgisi Yazısı
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, boxX + 28, boxY + boxH / 2);
    ctx.restore();
  }

  async function exportReplay(replay, sourceRenderer, opts = {}) {
    const onProgress = opts.onProgress || (() => {});
    if (!replay || !replay.frames || replay.frames.length === 0) {
      throw new Error('Tekrar karesi yok');
    }
    if (typeof GifEncoder === 'undefined') {
      throw new Error('GIF encoder yüklenemedi');
    }

    const frames = sampleFrames(replay.frames);
    const r = makeOffRenderer(sourceRenderer);
    const ctx = r.canvas.getContext('2d', { willReadFrequently: true });

    // 1. Maç içi renkleri örnekleyerek Master Palette'i kişiselleştir
    const samplePixels = [];
    const sampleIndices = [0, Math.floor(frames.length * 0.3), Math.floor(frames.length * 0.65), frames.length - 1];
    for (const sIdx of sampleIndices) {
      if (sIdx >= 0 && sIdx < frames.length) {
        const still = drawStill(r, frames[sIdx]);
        const d = still.data;
        for (let p = 0; p < d.length; p += 4 * 40) {
          samplePixels.push([d[p], d[p + 1], d[p + 2]]);
        }
      }
    }

    const masterPalette = GifEncoder.buildMasterPalette(samplePixels);
    const encoder = new GifEncoder(GIF_W, GIF_H, {
      delayMs: Math.round(1000 / FPS), // 50ms per frame
      loop: 0,
      palette: masterPalette,
      dither: true // Kenar korumalı akıllı dithering
    });

    const isOwn = !!replay.isOwnGoal;
    const prefix = isOwn ? '🤦‍♂️ K.K.' : '⚽ GOL';
    const sub = replay.milestoneText ? ` (${replay.milestoneText})` : (replay.timeFormatted ? ` (${replay.timeFormatted})` : '');
    const caption = `${prefix} • ${replay.scorerName || 'Oyuncu'}${sub}`;

    for (let i = 0; i < frames.length; i++) {
      const img = drawStill(r, frames[i]);

      // İlk 8 ve son 8 kareye şık TV skor rozeti bas
      if (i < 8 || i >= frames.length - 8) {
        ctx.putImageData(img, 0, 0);
        drawCaption(ctx, caption, isOwn);
        const withCap = ctx.getImageData(0, 0, GIF_W, GIF_H);
        encoder.addFrame(withCap.data);
      } else {
        encoder.addFrame(img.data);
      }

      onProgress(Math.round(((i + 1) / frames.length) * 100));

      // UI akıcılığı: her 5 karede bir tarayıcıya nefes ver
      if (i % 5 === 4) {
        await new Promise(res => setTimeout(res, 0));
      }
    }

    const bytes = encoder.finish();
    return new Blob([bytes], { type: 'image/gif' });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);
  }

  window.ReplayGifExporter = {
    exportReplay,
    downloadBlob
  };
})();
