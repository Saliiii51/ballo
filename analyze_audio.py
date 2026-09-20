import wave
import numpy as np

with wave.open('public/sounds/cheer.wav', 'rb') as w:
    frames = w.readframes(w.getnframes())
    rate = w.getframerate()
    samples = np.frombuffer(frames, dtype=np.int16)
    left = samples[0::2].astype(np.float32)

# Analyze frequency bands
# Band 1: 0-500 Hz
# Band 2: 500-1500 Hz
# Band 3: 1500-4000 Hz
# Band 4: 4000+ Hz
window_len = int(rate * 0.25)
num_windows = len(left) // window_len

print("Time(s) | 0-500Hz | 500-1500Hz | 1500-4000Hz | 4000+Hz")
for i in range(num_windows):
    chunk = left[i*window_len : (i+1)*window_len]
    fft = np.abs(np.fft.rfft(chunk))
    freqs = np.fft.rfftfreq(len(chunk), 1/rate)
    
    b1 = np.sum(fft[(freqs >= 0) & (freqs < 500)])
    b2 = np.sum(fft[(freqs >= 500) & (freqs < 1500)])
    b3 = np.sum(fft[(freqs >= 1500) & (freqs < 4000)])
    b4 = np.sum(fft[(freqs >= 4000)])
    
    t = i * 0.25
    print(f"{t:4.2f}s   | {b1:7.0f} | {b2:9.0f} | {b3:10.0f} | {b4:8.0f}")
