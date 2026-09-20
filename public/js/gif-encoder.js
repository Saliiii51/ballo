// Ultra High-Quality GIF89a Encoder (Sports Master Palette, Edge-Aware Dithering, 15-bit Cache, LZW)
// 100% offline, zero external dependencies, optimized for crystal-clear game replays.
(function () {
  'use strict';

  // 1. Build Comprehensive 256-Color Sports Master Palette
  // Engineered specifically for football/haxball: preserves vibrant team reds, bright blues,
  // rich turf greens, golden crowns, crisp white lines, and pitch lighting gradients.
  function buildMasterPalette(customSamples = []) {
    const pal = new Uint8Array(256 * 3);
    let idx = 0;

    const setCol = (r, g, b) => {
      if (idx >= 256 * 3) return;
      pal[idx++] = Math.max(0, Math.min(255, Math.round(r)));
      pal[idx++] = Math.max(0, Math.min(255, Math.round(g)));
      pal[idx++] = Math.max(0, Math.min(255, Math.round(b)));
    };

    // A. Grayscale & Stadium Neutral Tones (28 colors: deep blacks to pure whites)
    const grays = [
      [0, 0, 0], [6, 8, 14], [10, 14, 24], [15, 23, 42], [22, 30, 48],
      [30, 41, 59], [40, 53, 72], [51, 65, 85], [71, 85, 105], [100, 116, 139],
      [125, 138, 155], [148, 163, 184], [170, 180, 195], [190, 200, 212], [203, 213, 225],
      [215, 222, 232], [226, 232, 240], [235, 239, 245], [241, 245, 249], [248, 250, 252],
      [255, 255, 255], [18, 26, 40], [25, 35, 55], [35, 48, 70], [45, 60, 85],
      [60, 78, 105], [80, 100, 130], [110, 130, 160]
    ];
    for (const [r, g, b] of grays) setCol(r, g, b);

    // B. Pitch Turf & Field Greens (48 colors: lush turf gradients, grass cuts, shadows)
    for (let r = 0; r < 4; r++) {
      for (let g = 0; g < 12; g++) {
        const rv = 10 + r * 16;
        const gv = 30 + g * 19;
        const bv = 15 + r * 14 + (g % 3) * 6;
        setCol(rv, gv, bv);
      }
    }

    // C. Red Team & Hazard Auras (44 colors: crimson to vivid pink-red highlights)
    for (let i = 0; i < 44; i++) {
      const t = i / 43;
      if (t < 0.3) {
        // Deep crimson to pure red
        const u = t / 0.3;
        setCol(90 + u * 155, 8 + u * 15, 15 + u * 20);
      } else if (t < 0.7) {
        // Vibrant bright reds & flame orange
        const u = (t - 0.3) / 0.4;
        setCol(245 + u * 10, 30 + u * 60, 35 + u * 40);
      } else {
        // High-gloss player highlights & pink accents
        const u = (t - 0.7) / 0.3;
        setCol(255, 95 + u * 105, 105 + u * 105);
      }
    }

    // D. Blue Team & Cyan Auras (44 colors: deep navy to electric blue and cyan highlights)
    for (let i = 0; i < 44; i++) {
      const t = i / 43;
      if (t < 0.3) {
        // Deep navy to electric blue
        const u = t / 0.3;
        setCol(6 + u * 14, 30 + u * 90, 80 + u * 170);
      } else if (t < 0.7) {
        // Pure vibrant team blues & ice rinks
        const u = (t - 0.3) / 0.4;
        setCol(20 + u * 60, 120 + u * 80, 245 + u * 10);
      } else {
        // Light sky blue player disc highlights & neon cyan
        const u = (t - 0.7) / 0.3;
        setCol(80 + u * 120, 195 + u * 55, 255);
      }
    }

    // E. Gold, Yellow, Amber & Springs (36 colors: crowns, hazard indicators, bumpers)
    for (let i = 0; i < 36; i++) {
      const t = i / 35;
      if (t < 0.4) {
        // Amber & dark gold
        const u = t / 0.4;
        setCol(150 + u * 95, 85 + u * 90, 0 + u * 15);
      } else if (t < 0.8) {
        // Radiant golden yellow & neon yellow
        const u = (t - 0.4) / 0.4;
        setCol(245 + u * 10, 180 + u * 65, 10 + u * 20);
      } else {
        // Pale yellow highlights
        const u = (t - 0.8) / 0.2;
        setCol(255, 245 + u * 10, 100 + u * 120);
      }
    }

    // F. Purple, Violet & Chroma Auras (16 colors)
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      setCol(120 + t * 120, 20 + t * 40, 160 + t * 90);
    }

    // G. Custom Adaptive Slots (Remaining 40 slots filled with match-specific colors)
    const remainingSlots = 256 - (idx / 3);
    if (customSamples && customSamples.length > 0 && remainingSlots > 0) {
      const sampled = quantizeColorSamples(customSamples, remainingSlots);
      for (let i = 0; i < remainingSlots; i++) {
        if (i * 3 + 2 < sampled.length) {
          setCol(sampled[i * 3], sampled[i * 3 + 1], sampled[i * 3 + 2]);
        }
      }
    }

    // Fill any lingering slot up to 256
    while (idx < 256 * 3) {
      pal[idx] = (idx % 3 === 0) ? 255 : (idx % 3 === 1 ? 255 : 255);
      idx++;
    }

    return pal;
  }

  // Fast popularity-weighted clustering for custom match colors
  function quantizeColorSamples(pixels, count) {
    if (!pixels || pixels.length === 0) return new Uint8Array(0);
    const colorMap = new Map();
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      // 15-bit quantization to aggregate similar colors
      const key = ((p[0] >> 3) << 10) | ((p[1] >> 3) << 5) | (p[2] >> 3);
      colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }

    const sorted = [...colorMap.entries()].sort((a, b) => b[1] - a[1]);
    const out = new Uint8Array(count * 3);
    for (let i = 0; i < count; i++) {
      if (i < sorted.length) {
        const key = sorted[i][0];
        out[i * 3]     = ((key >> 10) & 0x1f) * 8 + 4;
        out[i * 3 + 1] = ((key >> 5) & 0x1f) * 8 + 4;
        out[i * 3 + 2] = (key & 0x1f) * 8 + 4;
      }
    }
    return out;
  }

  // Standard GIF LZW compression algorithm
  function lzwCompress(indices, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let dict = new Map();
    for (let i = 0; i < clearCode; i++) dict.set(String.fromCharCode(i), i);

    const out = [];
    let curByte = 0;
    let curBits = 0;
    const emit = (code) => {
      curByte |= code << curBits;
      curBits += codeSize;
      while (curBits >= 8) {
        out.push(curByte & 0xff);
        curByte >>= 8;
        curBits -= 8;
      }
    };

    let nextCode = eoiCode + 1;
    emit(clearCode);
    let prefix = String.fromCharCode(indices[0]);
    for (let i = 1; i < indices.length; i++) {
      const c = String.fromCharCode(indices[i]);
      const combined = prefix + c;
      if (dict.has(combined)) {
        prefix = combined;
      } else {
        emit(dict.get(prefix));
        if (nextCode < 4096) {
          dict.set(combined, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          emit(clearCode);
          dict = new Map();
          for (let k = 0; k < clearCode; k++) dict.set(String.fromCharCode(k), k);
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }
        prefix = c;
      }
    }
    emit(dict.get(prefix));
    emit(eoiCode);
    if (curBits > 0) out.push(curByte & 0xff);
    return out;
  }

  class GifEncoder {
    constructor(width, height, opts = {}) {
      this.width = width;
      this.height = height;
      this.delayMs = opts.delayMs != null ? opts.delayMs : 50; // default 20 FPS (50ms)
      this.loop = opts.loop != null ? opts.loop : 0;
      this.palette = opts.palette || buildMasterPalette(opts.samplePixels || []);
      this.dither = opts.dither !== false;
      this.bytes = [];
      this.frameCount = 0;

      // 15-bit RGB Lookup Cache (32,768 entries) for instant O(1) matching
      this.colorCache = new Int16Array(32768);
      this.colorCache.fill(-1);

      this._writeHeader();
    }

    findNearestColor(r, g, b) {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const cached = this.colorCache[key];
      if (cached !== -1) return cached;

      let bestIdx = 0;
      let minDst = Infinity;
      const pal = this.palette;

      // Perceptually weighted Euclidean color distance (R=2, G=4, B=3)
      for (let i = 0; i < 256; i++) {
        const pr = pal[i * 3];
        const pg = pal[i * 3 + 1];
        const pb = pal[i * 3 + 2];
        const dr = r - pr;
        const dg = g - pg;
        const db = b - pb;
        const dst = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (dst < minDst) {
          minDst = dst;
          bestIdx = i;
          if (dst === 0) break;
        }
      }

      this.colorCache[key] = bestIdx;
      return bestIdx;
    }

    _writeHeader() {
      const b = this.bytes;
      const pushStr = (s) => { for (let i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); };
      pushStr('GIF89a');

      // Logical Screen Descriptor
      b.push(this.width & 0xff, (this.width >> 8) & 0xff);
      b.push(this.height & 0xff, (this.height >> 8) & 0xff);
      b.push(0xf7); // GCT flag + 8-bit resolution + 256 colors
      b.push(0x00); // background index
      b.push(0x00); // pixel aspect ratio

      // Global Color Table (256 RGB entries = 768 bytes)
      for (let i = 0; i < 256 * 3; i++) {
        b.push(this.palette[i] || 0);
      }

      // Netscape Looping Application Extension
      if (this.loop !== null) {
        b.push(0x21, 0xff, 0x0b);
        pushStr('NETSCAPE2.0');
        b.push(0x03, 0x01, this.loop & 0xff, (this.loop >> 8) & 0xff, 0x00);
      }
    }

    addFrame(rgba) {
      const w = this.width;
      const h = this.height;
      const indices = new Uint8Array(w * h);

      if (this.dither) {
        // High-Precision Edge-Aware Floyd-Steinberg Dithering
        // Smooths grass & lighting gradients while keeping player discs, numbers, and text razor-sharp
        const rBuf = new Int16Array(w * h);
        const gBuf = new Int16Array(w * h);
        const bBuf = new Int16Array(w * h);

        for (let i = 0, p = 0; i < w * h; i++, p += 4) {
          rBuf[i] = rgba[p];
          gBuf[i] = rgba[p + 1];
          bBuf[i] = rgba[p + 2];
        }

        const pal = this.palette;
        for (let y = 0; y < h; y++) {
          const rowOffset = y * w;
          const nextRowOffset = (y + 1) * w;
          const hasNextRow = (y + 1 < h);

          for (let x = 0; x < w; x++) {
            const idx = rowOffset + x;
            let r = rBuf[idx];
            let g = gBuf[idx];
            let b = bBuf[idx];

            if (r < 0) r = 0; else if (r > 255) r = 255;
            if (g < 0) g = 0; else if (g > 255) g = 255;
            if (b < 0) b = 0; else if (b > 255) b = 255;

            const colorIdx = this.findNearestColor(r, g, b);
            indices[idx] = colorIdx;

            const pr = pal[colorIdx * 3];
            const pg = pal[colorIdx * 3 + 1];
            const pb = pal[colorIdx * 3 + 2];

            const errR = r - pr;
            const errG = g - pg;
            const errB = b - pb;
            const errMag = Math.abs(errR) + Math.abs(errG) + Math.abs(errB);

            // Edge-Aware Dithering:
            // Only diffuse across smooth gradients (errMag < 95); preserve sharp edges on lines/text/balls
            if (errMag < 95) {
              const dR = (errR * 7 * 0.7) >> 4;
              const dG = (errG * 7 * 0.7) >> 4;
              const dB = (errB * 7 * 0.7) >> 4;

              if (x + 1 < w) {
                rBuf[idx + 1] += dR;
                gBuf[idx + 1] += dG;
                bBuf[idx + 1] += dB;
              }
              if (hasNextRow) {
                const f3R = (errR * 3 * 0.7) >> 4;
                const f3G = (errG * 3 * 0.7) >> 4;
                const f3B = (errB * 3 * 0.7) >> 4;
                const f5R = (errR * 5 * 0.7) >> 4;
                const f5G = (errG * 5 * 0.7) >> 4;
                const f5B = (errB * 5 * 0.7) >> 4;
                const f1R = (errR * 1 * 0.7) >> 4;
                const f1G = (errG * 1 * 0.7) >> 4;
                const f1B = (errB * 1 * 0.7) >> 4;

                if (x > 0) {
                  rBuf[nextRowOffset + x - 1] += f3R;
                  gBuf[nextRowOffset + x - 1] += f3G;
                  bBuf[nextRowOffset + x - 1] += f3B;
                }
                rBuf[nextRowOffset + x] += f5R;
                gBuf[nextRowOffset + x] += f5G;
                bBuf[nextRowOffset + x] += f5B;
                if (x + 1 < w) {
                  rBuf[nextRowOffset + x + 1] += f1R;
                  gBuf[nextRowOffset + x + 1] += f1G;
                  bBuf[nextRowOffset + x + 1] += f1B;
                }
              }
            }
          }
        }
      } else {
        // Direct Fast Quantization
        for (let i = 0, p = 0; i < w * h; i++, p += 4) {
          indices[i] = this.findNearestColor(rgba[p], rgba[p + 1], rgba[p + 2]);
        }
      }

      const b = this.bytes;
      // Graphic Control Extension (Disposal=1: do not dispose)
      const delayCs = Math.max(1, Math.round(this.delayMs / 10));
      b.push(0x21, 0xf9, 0x04, 0x04, delayCs & 0xff, (delayCs >> 8) & 0xff, 0x00, 0x00);

      // Image Descriptor
      b.push(0x2c);
      b.push(0x00, 0x00, 0x00, 0x00); // x=0, y=0
      b.push(w & 0xff, (w >> 8) & 0xff);
      b.push(h & 0xff, (h >> 8) & 0xff);
      b.push(0x00); // no local color table

      // LZW Raster Data
      const minCodeSize = 8;
      b.push(minCodeSize);
      const compressed = lzwCompress(indices, minCodeSize);
      for (let i = 0; i < compressed.length; i += 255) {
        const chunk = Math.min(255, compressed.length - i);
        b.push(chunk);
        for (let j = 0; j < chunk; j++) b.push(compressed[i + j]);
      }
      b.push(0x00); // block terminator
      this.frameCount++;
    }

    finish() {
      this.bytes.push(0x3b); // GIF file trailer
      return new Uint8Array(this.bytes);
    }
  }

  GifEncoder.buildMasterPalette = buildMasterPalette;

  window.GifEncoder = GifEncoder;
})();
