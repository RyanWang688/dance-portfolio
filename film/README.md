# D.A.N.C.E. motion film — source

The 15-second hero film (1920×1080, 30 fps) is generated entirely in code: every frame is drawn on a Skia canvas and every sound is synthesized sample by sample. No footage, stock audio or samples are used.

- `motion.mjs`: picture. 120 BPM grid (1 beat = 15 frames). A forward-kinematics skeleton with keyframed poses, a 3D camera, the Dance Ghost overlays, and a time-freeze orbit through a 14-exposure chronophotograph. Ends with a morph into the logo.
- `audio.mjs`: score and sound design. Kick, clap and hats; an Am9–Fmaj7–Cadd9–G6 pad and bass with sidechain ducking; UI blips, error and success tones; the freeze impact, heartbeat and shimmer; a Freeverb-style reverb.
- `fonts.mjs`: fetches static instances of Archivo and JetBrains Mono from Google Fonts into `fonts/`.

```
npm i @napi-rs/canvas
node fonts.mjs fonts
node audio.mjs dance.wav
node motion.mjs video path/to/ffmpeg dance.wav dance-15s.mp4
```
