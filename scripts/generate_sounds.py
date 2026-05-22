"""Generate placeholder notification sounds for Android raw resources.

Each file is a short, valid PCM WAV at 44.1kHz mono with a tone that won't
upset Apple/Google review. Replace with proper sound design before launch.
Names use underscores so they're valid Android raw-resource identifiers.
"""
import math
import os
import struct
import wave

OUT = os.path.join(os.path.dirname(__file__), "assets", "sounds")
os.makedirs(OUT, exist_ok=True)

SR = 44100  # standard rate

def write_wav(path, samples):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)        # 16-bit PCM
        w.setframerate(SR)
        frames = b"".join(struct.pack("<h", max(-32767, min(32767, int(s)))) for s in samples)
        w.writeframes(frames)


def beep(freq, secs, fade=0.05, gain=0.35):
    n = int(SR * secs)
    fade_n = int(SR * fade)
    out = []
    for i in range(n):
        # smooth envelope to avoid clicks
        if i < fade_n:
            env = i / fade_n
        elif i > n - fade_n:
            env = (n - i) / fade_n
        else:
            env = 1.0
        out.append(env * gain * 32767 * math.sin(2 * math.pi * freq * i / SR))
    return out


def silence(secs):
    return [0] * int(SR * secs)


def absent_alert():
    # two-tone descending alert
    return beep(880, 0.18) + silence(0.06) + beep(660, 0.22)


def emergency_alarm():
    # urgent rising sweep × 2
    out = []
    for _ in range(2):
        for f in (700, 900, 1100, 900, 700):
            out += beep(f, 0.10)
        out += silence(0.06)
    return out


def holiday_chime():
    # gentle two-note major third
    return beep(523, 0.30) + silence(0.04) + beep(659, 0.45)


def order_received():
    # short "ding-dong"
    return beep(988, 0.12) + silence(0.04) + beep(784, 0.20)


SOUNDS = {
    "absent_alert.wav":     absent_alert(),
    "emergency_alarm.wav":  emergency_alarm(),
    "holiday_chime.wav":    holiday_chime(),
    "order_received.wav":   order_received(),
}

if __name__ == "__main__":
    for name, samples in SOUNDS.items():
        write_wav(os.path.join(OUT, name), samples)
    print("Wrote:", sorted(os.listdir(OUT)))
