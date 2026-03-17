# PowerChord Studio — Chord-First Product Architecture Proposal

## Product thesis
PowerChord should be a **chord-first guitar songwriting instrument**, not a generic browser DAW.

### Target users
- Non-guitarist songwriters
- Producers who can write chords but not realistic guitar performance
- Creators who need “finished guitar energy” quickly

### Product promise
Given a progression + section intent, generate believable electric guitar parts with musical strumming, voicing intelligence, and mix-ready tone presets in seconds.

---

## 1) Product architecture

Use a layered architecture with strict separation between:
1. **Musical intent** (chords, sections, style)
2. **Guitar performance generation** (voicings + strum/articulation events)
3. **Audio rendering** (source + amp/cab/fx DSP)
4. **UX orchestration** (beginner presets vs advanced editing)

### Recommended high-level pipeline

1. User enters progression and section map (Verse/Chorus/Bridge)
2. Arrangement engine selects section pattern “feel templates”
3. Guitar behavior engine creates note/performance events
4. Tone preset engine binds to a playable chain
5. Playback engine renders in AudioWorklet graph
6. Optional advanced mode exposes event and tone edits

### Runtime components
- **Main thread**: UI, project state, preset browser
- **AudioWorklet thread**: timing-critical event scheduler + DSP nodes
- **Worker thread**: heavier precomputation (voicing search, humanization variants, preset loading)

---

## 2) Source engine (sound generation)

Because your goal is believable electric guitar quickly (not full DAW synthesis), prioritize a hybrid source strategy:

### MVP source approach
- **Multi-sample/round-robin guitar source**
  - Velocity layers (soft/medium/hard)
  - Pick-direction variants (down/up)
  - Palm-mute variants
  - Choke/stop noises
- Per-string trigger awareness when possible

This yields faster realism than a purely synthesized string model at MVP scope.

### Mid-term enhancement
- Add **physical-model-inspired post shaping** (pick transient and string/body resonance filters) to glue sample switching and improve continuity.

### Event format
Define a normalized event schema:
- `noteOn`, `noteOff`
- `stringIndex`, `fret`, `pitch`
- `pickDirection`
- `articulation` (`ring`, `mute`, `stop`, `accent`)
- `timingOffsetMs`, `velocity`

That allows the behavior engine to be independent of source implementation.

---

## 3) Guitar behavior engine

This is your core differentiator.

### A. Voicing engine
Input: chord symbol + key context + section role + target register

Output: playable guitar voicing candidates scored by:
- Playability constraints (fret span, string skips)
- Register suitability (avoid muddy low stacking)
- Voice-leading distance from previous chord
- Style profile (indie open strings vs tight funk triads)

Use weighted scoring, then choose top candidate with controlled variation.

### B. Strum engine
Generate strum as ordered per-string note events, not block chords.

Parameters:
- Direction pattern (down/up probability map)
- Spread time (e.g. 8–35ms depending on intensity)
- Swing/push-pull microtiming
- Ghost/missed string logic

### C. Articulation engine
Per hit or per bar:
- `ring` (let sustain)
- `palmMute` (short decay + darker attack)
- `stop`/choke (forced cutoff)
- `accent` (velocity + transient boost)

Section templates should control articulation density (e.g., Chorus = more accents, Verse = tighter mute pattern).

### D. Section-aware feel templates
Each section chooses a “guitar role recipe”:
- **Verse**: sparser, muted, mid-register
- **Chorus**: wider strums, stronger accents, fuller voicings
- **Bridge**: contrast mode (arpeggio or syncopated chops)

Engine should keep chord progression constant while swapping rhythmic/voicing behavior by section.

---

## 4) Preset-first tone system

### Product principle
“Great by default” > “infinite tweakability.”

### Preset model
Each preset is a structured chain descriptor:
- Input conditioning (gate/comp optional)
- Drive/amp stage
- Cabinet/speaker stage
- Mod/time FX (optional)
- Macro controls (`Tone`, `Drive`, `Space`, `Tightness`)

### Preset categories (launch)
- Pop Clean
- Alt Pop Crunch
- Indie Rock Wide
- Dream Pop Shimmer
- Funk Tight
- Blues Edge
- Lead Sing

### Preset UX
- Beginner mode: select one preset + one intensity control
- Advanced mode: open chain and tweak module-level parameters

---

## 5) Browser DSP quality architecture

### Audio engine design
- Use **AudioWorklet** for stable low-latency scheduling and DSP execution
- Avoid ScriptProcessorNode
- Keep sample-accurate event timing in worklet clock domain

### DSP chain architecture
Use modular processing blocks with clear interfaces:
1. Pre-filter / gate
2. Drive/amp block
3. Cab block (lightweight convolution or multi-filter approximation)
4. Post FX (chorus, delay, reverb)
5. Output limiter

### Cabinet stage recommendation
For MVP, implement lightweight cabinet tone using:
- short IR convolution (small footprint) or
- tuned multi-band filter profile per cabinet

Make cab profiles a key part of preset identity.

---

## 6) UI flow: beginner vs advanced

### Beginner mode (default)
1. Enter chord progression
2. Choose section map (Verse/Chorus/Bridge)
3. Pick style/preset
4. Click “Generate Guitar Part”
5. Adjust 3–4 macros:
   - Energy
   - Tightness
   - Brightness
   - Space

No piano-roll, no mixer complexity upfront.

### Advanced mode (opt-in)
Expose deeper controls:
- Voicing lock/override by bar
- Strum pattern editor
- Articulation lane (mute/stop/accent)
- Full preset chain editor
- Humanization amount and random seed

Keep this behind an explicit “Advanced Edit” transition so core experience stays immediate.

---

## 7) Suggested TypeScript module structure

```text
ts/
  core/
    types/
      music.ts              // Chord, section, arrangement, performance event types
      audio.ts              // DSP chain and preset interfaces
    state/
      projectStore.ts       // Global project state (sections, progression, selected preset)

  music/
    harmony/
      chordParser.ts
      chordNormalizer.ts
    voicing/
      voicingRules.ts
      voicingSearch.ts
      voicingScorer.ts
    rhythm/
      strumPatternLib.ts
      strumGenerator.ts
      timingHumanizer.ts
    articulation/
      articulationPlanner.ts
    arrangement/
      sectionTemplateLib.ts
      arrangementPlanner.ts

  audio/
    engine/
      audioEngine.ts        // main-thread audio orchestration
      workletBridge.ts
    worklets/
      scheduler.worklet.ts
      guitarVoice.worklet.ts
      ampCab.worklet.ts
      fxChain.worklet.ts
    dsp/
      ampModels.ts
      cabProfiles.ts
      dynamics.ts
      modulation.ts
      delayReverb.ts

  presets/
    presetSchema.ts
    presetLibrary.ts
    presetMacros.ts

  ui/
    beginner/
      GeneratePanel.tsx
      QuickControls.tsx
    advanced/
      PatternEditor.tsx
      ArticulationLane.tsx
      ToneChainEditor.tsx
    shared/
      SectionTimeline.tsx
      ChordProgressionInput.tsx

  app/
    bootstrap.ts
```

---

## 8) MVP build order

### Phase 1 — Musical core (highest leverage)
1. Chord parser + normalization
2. Voicing search/scoring (basic style profiles)
3. Strum generator (down/up + spread + accents)
4. Section template swapping (Verse/Chorus behavior)

### Phase 2 — Listenable tone fast
5. Sample-based guitar source with round-robin variants
6. Basic amp + cab + space FX preset chain
7. 7 launch presets tuned for target genres

### Phase 3 — Product UX polish
8. Beginner Generate flow with macro controls
9. “Regenerate variation” + random seed persistence
10. Export/render audio

### Phase 4 — Advanced depth
11. Advanced edit mode (voicing/pattern/articulation lanes)
12. Optional guitar input mode (monitor + tone chain)

---

## 9) Success metrics (to validate focus)

- **Time-to-first-usable-part** under 30s
- **Regeneration satisfaction** (user keeps generated part without major edits)
- **Preset adoption** (high usage of defaults without deep tweaking)
- **Section contrast quality** (users perceive clear verse/chorus differentiation)
- **Bounce/export rate** (finished output per project)

If these improve, you are winning the chord-first workflow rather than competing as another generic DAW.
