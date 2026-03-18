# PowerChord Studio — Chord-First Guitar Product Plan (Revised)

## Product position (explicit)
PowerChord should be the fastest way for non-guitarists to create **believable electric guitar parts from chords**.

It should **not** feel like a generic browser DAW.

---

## Priority stack (must-have order)

### 1) Most important: Guitar behavior engine
This is the #1 differentiator vs GarageBand/BandLab for this workflow.

Required behaviors:
- Downstroke/upstroke realism
- Strum timing spread (string-to-string offset)
- Chord inversions/voicings that sit naturally on guitar
- Fret-range logic (register + playability constraints)
- Humanized accents
- Palm mute / stop / ring articulation

### 2) Second: Preset-first great tone
No “100 knobs” first. Start with excellent instant tones:
- Clean Sparkle
- Dream Chorus
- Indie Crunch
- Blues Edge
- Arena Lead
- Muted Pop Funk

Tone benchmark note:
- Use the current bass guitar quality/behavior as an internal baseline.
- Electric rhythm and lead guitars should feel similarly “finished” and playable at default settings.

### 3) Third: Section-aware rhythm generation
Same chords should become musically different per section:
- Verse
- Pre-Chorus
- Chorus
- Bridge

### 4) Fourth: Browser-grade low-latency DSP foundation
- AudioWorklet scheduling/rendering
- WebAssembly path for heavier DSP blocks
- Modular amp/cab/effects chain

### 5) Fifth: Real guitar input mode (later)
Important expansion, but not MVP-critical.

---

## Core product architecture

### A. Musical intent layer (what the user means)
- Chord progression + tempo + key
- Section map (Verse / Pre-Chorus / Chorus / Bridge)
- Style intent (e.g., indie, dream, funk)

### B. Guitar behavior layer (how a guitarist would perform it)
- Voicing/inversion selector
- Strum direction + spread generator
- Accent + articulation planner
- Section variation planner

### C. Tone/rendering layer (how it sounds)
- Guitar source playback engine (sample/round-robin first)
- Amp/cab/effects chain
- Performance macro mapping (energy/tightness/brightness/space)

### D. Interaction layer (how users control it)
- Beginner “Generate + tweak” flow
- Advanced edit flow
- Live chord-pad performance surface (new, detailed below)
- Compact guitar FX panel (quick on/off shaping without DAW complexity)

---

## Guitar behavior engine spec (most important)

### 1. Voicing and inversion engine
Input:
- Chord symbol
- Key context
- Prior voicing (for voice-leading)
- Section role (Verse/Pre/Chorus/Bridge)
- Target register

Scoring constraints:
- Fret span playability
- Realistic string-set usage
- Voice-leading smoothness
- Register clarity (avoid low-end mud)
- Style profile preferences

Output:
- Selected voicing with optional alternates for variation/regeneration

### 2. Strum engine
Represent strums as per-string events, not block chords.

Per-strum parameters:
- `direction`: `down` or `up`
- `spreadMs`: string traversal time
- `swingOffsetMs` / groove bias
- `velocityCurve`
- `stringSkipMask` (optional missed strings)

### 3. Articulation engine
Per-event or per-bar articulation tags:
- `ring`
- `palmMute`
- `stop`
- `accent`

Behavior:
- Verse: tighter, lighter accents
- Pre-Chorus: rising energy, more directional drive
- Chorus: wider strums, stronger accents, longer ring
- Bridge: contrast pattern (e.g., muted chops or arpeggiated motion)

### 4. Humanization model
- Deterministic random seed per take (reproducible)
- Microtiming ± (bounded)
- Velocity jitter by role (accented vs non-accented)
- Subtle pick inconsistency model for realism

---

## New performance feature: chord pad strum + sustain control

You requested direct performance control by strumming up/down on chord pads with sustain and expressive wobble control.

### Chord Pad Performance Surface
Each chord pad acts like a playable guitar trigger:

#### Gestures
- **Vertical drag down** on pad → downstroke trigger
- **Vertical drag up** on pad → upstroke trigger
- **Tap** → default strum based on current section pattern
- **Press-hold** → sustain latch while held
- **Release** → stop/ring according to articulation mode

#### Performance controls
- **Sustain mode toggle**
  - Hold-to-sustain (momentary)
  - Latch sustain (toggle)
- **Mute/Stop button** for immediate choke
- **Accent pressure/speed mapping**
  - Faster drag = stronger accent/attack

#### “String wobble” / vibrato-like feel
Add a macro called **Wobble**:
- Modulates subtle pitch + amplitude + filter movement
- Depth limited to musical ranges (avoid cheesy detune)
- Can be mapped to horizontal micro-drag on held pad

This gives more “gritty electric” expression without exposing full synth complexity.

### Why this matters
- Makes chord entry feel performative, not static block playback
- Gives non-guitarists intuitive control similar to strumming behavior
- Helps produce more animated takes quickly

---

## Preset-first tone system (simplified)

### Preset design principle
- Instant polished tone
- Few macro controls
- No deep chain editing in default mode

### Launch preset list (requested)
1. Clean Sparkle
2. Dream Chorus
3. Indie Crunch
4. Blues Edge
5. Arena Lead
6. Muted Pop Funk

### Macro controls (beginner)
- **Energy** (attack + gain staging)
- **Tone** (brightness contour)
- **Tightness** (gate/mute feel + low-end control)
- **Space** (delay/reverb amount)
- **Wobble** (expressive modulation depth)

### Advanced tone mode
- Unlock per-module controls (amp/cab/FX)
- Keep optional; default flow stays simple

## Compact guitar FX panel (new)

Add a small always-visible panel for electric/lead guitar shaping so users can quickly match bass-like readiness while staying simple.

### Beginner FX panel (small, fast)
- 5 compact switches/knobs:
  - Drive
  - Chorus
  - Delay
  - Reverb
  - Tight Gate
- Single **FX Amount** macro for global intensity.
- Preset-linked defaults so it sounds good without manual setup.

### Advanced FX panel (expanded)
- Module-level parameters per effect (rate/depth/mix/feedback/tone).
- Effect order options (limited presets + optional custom order).
- Per-section FX scene overrides (e.g., dryer verse, wider chorus).

### Behavior goals
- Beginner: “small panel, instant improvement, no confusion.”
- Advanced: deeper control without forcing DAW-style mixer workflows.

---

## Section-aware rhythm generation

For the same progression, generate distinct section feels:

- **Verse template:** restrained rhythm, tighter mute behavior
- **Pre-Chorus template:** lift with denser upstrokes and rising accents
- **Chorus template:** fuller voicings, bigger spread, longer sustain
- **Bridge template:** contrast rhythm (syncopated or arpeggiated)

Add `Regenerate Section` so users can iterate one section without changing the whole song.

---

## Browser DSP technical foundation

### Audio architecture
- AudioWorklet for event scheduler + timing-critical DSP
- Main thread for UI/state only
- Worker for non-real-time prep (preset decode, voicing search)
- WASM hooks for heavier amp/cab stages as quality increases

### Chain topology (MVP)
1. Input conditioning
2. Amp/drive stage
3. Cabinet stage (light IR or efficient filter model)
4. Mod/time FX
5. Output limiter

### Latency targets
- Keep monitoring/playable interaction low enough for pad strumming feel
- Prioritize stable timing over oversized FX complexity in MVP

---

## Beginner vs Advanced UX

### Beginner (default)
1. Enter chords
2. Define sections (Verse / Pre / Chorus / Bridge)
3. Pick one preset
4. Play/strum chords on chord pads
5. Adjust macros (Energy, Tone, Tightness, Space, Wobble)
6. Optionally use compact FX panel (Drive/Chorus/Delay/Reverb/Gate + FX Amount)
7. Export

No mixer-first workflow, no dense DAW paneling.

### Advanced (opt-in)
- Voicing override per chord/bar
- Strum pattern editor
- Articulation lane (mute/stop/ring/accent)
- Tone chain editor
- Expanded FX controls + per-section FX scenes
- Humanization seed/amount

---

## TypeScript module structure

```text
ts/
  core/
    types/
      music.ts
      performance.ts
      audio.ts
    state/
      projectStore.ts
      performanceStore.ts

  music/
    harmony/
      chordParser.ts
      chordNormalizer.ts
    voicing/
      voicingRules.ts
      voicingSearch.ts
      voicingScorer.ts
    rhythm/
      strumGenerator.ts
      timingHumanizer.ts
      sectionRhythmTemplates.ts
    articulation/
      articulationPlanner.ts

  interaction/
    chordPad/
      chordPadGestureEngine.ts      // up/down drag to strum mapping
      sustainController.ts          // hold/latch sustain behavior
      wobbleController.ts           // expressive wobble macro mapping

  presets/
    presetSchema.ts
    presetLibrary.ts               // Clean Sparkle, Dream Chorus, etc.
    macroMapper.ts

  audio/
    engine/
      audioEngine.ts
      workletBridge.ts
    worklets/
      scheduler.worklet.ts
      guitarSource.worklet.ts
      ampCab.worklet.ts
      fx.worklet.ts
    dsp/
      ampModel.ts
      cabModel.ts
      modulation.ts
      delayReverb.ts
      limiter.ts

  ui/
    beginner/
      ChordPadGrid.tsx
      QuickTonePanel.tsx
      CompactFxPanel.tsx
      SectionBuilder.tsx
    advanced/
      StrumEditor.tsx
      ArticulationLane.tsx
      ToneChainEditor.tsx
      AdvancedFxPanel.tsx
```

---

## MVP build order (re-ranked to your priorities)

### Phase 1 — Guitar behavior core (must win here)
1. Chord parser + normalization
2. Voicing/inversion engine with fret-range logic
3. Strum direction/spread/accent generation
4. Palm mute / stop / ring articulation system
5. Humanization seed model

### Phase 2 — Chord-pad performance experience
6. Chord pad up/down gesture strumming
7. Hold/latch sustain logic
8. Wobble macro performance control
9. Per-section rhythm template application (Verse/Pre/Chorus/Bridge)

### Phase 3 — Preset-first tone
10. Implement 6 core presets (Clean Sparkle, Dream Chorus, Indie Crunch, Blues Edge, Arena Lead, Muted Pop Funk)
11. Add macro layer (Energy/Tone/Tightness/Space/Wobble)
12. Add compact beginner FX panel (Drive/Chorus/Delay/Reverb/Gate + FX Amount)
13. Lock default UX to simple preset + macros + compact FX

### Phase 4 — DSP quality scaling
14. AudioWorklet hardening + latency optimization
15. Add WASM acceleration path for heavier amp/cab quality

### Phase 5 — Advanced mode + future expansion
16. Advanced editing panels + expanded FX controls
17. Optional real guitar input mode

---

## Success criteria
- Users can get a believable guitar part from chords in <30 seconds.
- Section contrast is clearly audible for same progression.
- High usage of default presets/macros without deep tweaking.
- Chord-pad strum feature feels performative (not static trigger).
- Export completion rate increases for first-session users.
