
(function() {
  const errBox = document.getElementById("audioState");
  function showErr(e){
    const msg = (e && (e.stack || e.message)) ? (e.stack || e.message) : String(e);
    if (errBox) errBox.textContent = "Error: " + msg;
  }
  window.addEventListener("error", (ev)=>{
    // Try to surface something better than Script error.
    if (ev && ev.error) showErr(ev.error);
    else if (errBox) errBox.textContent = "Error: " + (ev.message || "Unknown");
  });
  window.addEventListener("unhandledrejection", (ev)=>{ showErr(ev.reason); });

  try {
window.onerror = function(msg, src, line, col){
  try{ const el=document.getElementById('audioState'); if(el) el.textContent = 'Error: ' + msg + ' @' + line + ':' + col; }catch(_){ }
};


function buildLimiterChain(ctx, source){
  // Compressor -> soft clipper
  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 20;
  comp.ratio.value = 10;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  shaper = ctx.createWaveShaper();
  const curve = new Float32Array(65536);
  for (let i=0;i<curve.length;i++){
    const x = (i / 32768) - 1;
    // softer than before
    curve[i] = Math.tanh(1.8 * x);
  }
  shaper.curve = curve;
  shaper.oversample = "4x";

  // analysers (spectrum + level)
  analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.86;

  meterAnalyser = ctx.createAnalyser();
  meterAnalyser.fftSize = 1024;
  meterAnalyser.smoothingTimeConstant = 0.4;

  source.connect(comp);
  comp.connect(shaper);
  shaper.connect(analyser);
  analyser.connect(meterAnalyser);
  meterAnalyser.connect(ctx.destination);
}


function addSoftLimiter(ctx, input){
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(65536);
  for (let i=0;i<curve.length;i++){
    const x = (i / 32768) - 1;
    curve[i] = Math.tanh(2.5 * x);
  }
  shaper.curve = curve;
  shaper.oversample = "4x";
  input.connect(shaper);
  shaper.connect(ctx.destination);
  return shaper;
}

// sMV PowerChord — MVP v2.3
// Fixes:
// - Removes "weird flavor" caused by duplicate scheduling and mismatched monitor vs playback
// - Live monitor uses armed track role + volume (matches playback/export)
// - Playback scheduling: schedule each event once per loop occurrence

const DEGREE_QUAL = ["maj","min","min","maj","maj","min","dim","maj"];
const NOTE_NAMES  = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const MAJOR_SCALE = [0,2,4,5,7,9,11];
const TRIADS = { maj:[0,4,7], min:[0,3,7], dim:[0,3,6] };

function prettyAccidentals(s){ return (s||"").split("#").join("♯"); }
function chordSymbol(rootName, qual){
  const r = prettyAccidentals(rootName);
  if (qual === "min") return r + "m";
  if (qual === "dim") return r + "°";
  return r; // maj
}


const KBD_KEYS = ["A","S","D","F","G","H","J","K","Q","W","E","R","T","Y","U","I","Z","X","C","V","B","N","M",","];
const DRUM_PAD_MAP = ["kick","snare","hat","openhat","clap","tom","rim","crash"];
const PAD_COLORS = [
  "linear-gradient(135deg, rgba(59,130,246,.45), rgba(59,130,246,.14))",
  "linear-gradient(135deg, rgba(16,185,129,.45), rgba(16,185,129,.14))",
  "linear-gradient(135deg, rgba(34,197,94,.45), rgba(34,197,94,.14))",
  "linear-gradient(135deg, rgba(234,179,8,.45), rgba(234,179,8,.14))",
  "linear-gradient(135deg, rgba(249,115,22,.48), rgba(249,115,22,.14))",
  "linear-gradient(135deg, rgba(236,72,153,.40), rgba(236,72,153,.14))",
  "linear-gradient(135deg, rgba(168,85,247,.45), rgba(168,85,247,.14))",
  "linear-gradient(135deg, rgba(59,130,246,.40), rgba(59,130,246,.12))",
];

// UI
const padsEl = document.getElementById("pads");
const padModeLabel = document.getElementById("padModeLabel");
const tracksEl = document.getElementById("tracks");
const addTrackBtn = document.getElementById("addTrackBtn");
const clearAllBtn = document.getElementById("clearAllBtn");

const keySel = document.getElementById("keySel");
const soundSel = document.getElementById("soundSel");
const bpmEl  = document.getElementById("bpm");
const barsSel= document.getElementById("barsSel");
const revEl  = document.getElementById("rev");
const learnChordEl = document.getElementById("learnChord");
const meterEl = document.getElementById("meter");
const analyzerEl = document.getElementById("analyzer") || document.getElementById("spectrum");
const circleSvg = document.getElementById("circleSvg");

const playBtn= document.getElementById("playBtn");
const stopBtn= document.getElementById("stopBtn");
const recBtn = document.getElementById("recBtn");
const exportBtn = document.getElementById("exportBtn");
const panicBtn = document.getElementById("panicBtn");
const rockBtn = document.getElementById("rockBtn");
const hiphopBtn = document.getElementById("hiphopBtn");
const safeModeEl = document.getElementById("safeMode");
const micMonitorEl = document.getElementById("micMonitor");
const meterCv = document.getElementById("meter");
const spectrumCv = document.getElementById("spectrum");

const audioState = document.getElementById("audioState");
const modePill   = document.getElementById("modePill");
const armedPill  = document.getElementById("armedPill");
const lastChord  = document.getElementById("lastChord");
const loopBadge  = document.getElementById("loopBadge");
const loopInfo   = document.getElementById("loopInfo");
const playhead   = document.getElementById("playhead");
const blocks     = document.getElementById("blocks");

const ticksEl   = document.getElementById("ticks");

function renderTicks(){
  if (!ticksEl || !blocks) return;
  const b = bars();
  // show at most 32 labels, but ticks for each bar and major for each 4
  ticksEl.innerHTML = "";
  for (let i=0;i<=b;i++){
    const x = (i / b) * 100;
    const t = document.createElement("div");
    t.className = "tick" + ((i % 4 === 0) ? " major" : "");
    t.style.left = x + "%";
    ticksEl.appendChild(t);
    if (i < b && (i % 4 === 0)){
      const lab = document.createElement("div");
      lab.className = "tickLabel";
      lab.style.left = x + "%";
      lab.textContent = String(i+1);
      ticksEl.appendChild(lab);
    }
  }
}
window.addEventListener("resize", () => { renderTicks(); });


// Audio
let ac = null;
let safeMode = true;
let limiterIn = null;
let comp = null;
let shaper = null;
let analyser = null;
let meterAnalyser = null;
let vizTimer = null;
let master = null;
let wet = null, dry = null;
let convolver = null;
let activeVoiceStops = new Set();
let micInputSource = null;
let micInputStream = null;
let micMonitorOn = true;
let rafViz = null;
const meterData = new Uint8Array(1024);
const analyserData = new Uint8Array(1024);

function safeOn(el, evt, handler){
  if (el) el.addEventListener(evt, handler);
}

// Transport
let isPlaying = false;
let isRecording = false;
let loopStartTime = 0;
let playTimer = null;
let rafId = null;

// Tracks
let tracks = []; // {id,name,color,role,events:[], muted:false, armed:false, vol:0..1}
let armedTrackId = null;

// Pads
let padButtons = [];
let activeHolds = new Map(); // pointerId -> { stopFn, recEventId?, trackId?, startBeat? }
let nextEventId = 1;
let padIndexByChord = new Map();
const drumPadRates = Array(8).fill(1.0);

// helpers
function clamp(v,a,b){ return Math.min(b, Math.max(a,v)); }


function drumHit(ctx, outDry, outWet, type, when, vol=1.0, revSend=0.15){
  const t0 = when ?? ctx.currentTime;
  const v = clamp(vol, 0, 1);

  // simple send split
  const dryG = ctx.createGain();
  const wetG = ctx.createGain();
  dryG.gain.value = v;
  wetG.gain.value = v * revSend;
  dryG.connect(outDry);
  wetG.connect(outWet);

  if (type === "kick"){
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t0);
    o.frequency.exponentialRampToValueAtTime(48, t0 + 0.09);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.95, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    o.connect(g);
    g.connect(dryG);
    g.connect(wetG);
    o.start(t0); o.stop(t0 + 0.25);
    return;
  }

  if (type === "snare"){
    const n = ctx.createBufferSource();
    n.buffer = makeNoiseBuffer(ctx, 0.18);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.setValueAtTime(900, t0);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.setValueAtTime(1800, t0); bp.Q.setValueAtTime(0.9, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    n.connect(hp); hp.connect(bp); bp.connect(g);
    g.connect(dryG); g.connect(wetG);
    n.start(t0); n.stop(t0 + 0.20);

    // little body tone
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(220, t0);
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(0.35, t0 + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    o.connect(og); og.connect(dryG);
    o.start(t0); o.stop(t0 + 0.14);
    return;
  }

  if (type === "hat"){
    const n = ctx.createBufferSource();
    n.buffer = makeNoiseBuffer(ctx, 0.06);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.setValueAtTime(7000, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
    n.connect(hp); hp.connect(g);
    g.connect(dryG);
    n.start(t0); n.stop(t0 + 0.07);
    return;
  }

  if (type === "clap"){
    const n = ctx.createBufferSource();
    n.buffer = makeNoiseBuffer(ctx, 0.12);
    const bp = ctx.createBiquadFilter();
    bp.type="bandpass"; bp.frequency.setValueAtTime(1900, t0); bp.Q.setValueAtTime(1.2, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.85, t0 + 0.003);
    // multi-hit feel
    g.gain.setValueAtTime(0.35, t0 + 0.020);
    g.gain.setValueAtTime(0.60, t0 + 0.032);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    n.connect(bp); bp.connect(g);
    g.connect(dryG); g.connect(wetG);
    n.start(t0); n.stop(t0 + 0.14);
    return;
  }

  if (type === "openhat"){
    const n = ctx.createBufferSource();
    n.buffer = makeNoiseBuffer(ctx, 0.22);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.setValueAtTime(5200, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.40, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
    n.connect(hp); hp.connect(g);
    g.connect(dryG); g.connect(wetG);
    n.start(t0); n.stop(t0 + 0.25);
    return;
  }

  if (type === "tom"){
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(220, t0);
    o.frequency.exponentialRampToValueAtTime(120, t0 + 0.12);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.75, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.20);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.setValueAtTime(1200, t0);
    o.connect(g); g.connect(lp);
    lp.connect(dryG); lp.connect(wetG);
    o.start(t0); o.stop(t0 + 0.22);
    return;
  }

  if (type === "rim"){
    const n = ctx.createBufferSource();
    n.buffer = makeNoiseBuffer(ctx, 0.03);
    const bp = ctx.createBiquadFilter();
    bp.type="bandpass"; bp.frequency.setValueAtTime(3200, t0); bp.Q.setValueAtTime(2.0, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);
    n.connect(bp); bp.connect(g);
    g.connect(dryG);
    n.start(t0); n.stop(t0 + 0.05);
    return;
  }

  if (type === "crash"){
    const n = ctx.createBufferSource();
    n.buffer = makeNoiseBuffer(ctx, 0.55);
    const hp = ctx.createBiquadFilter();
    hp.type="highpass"; hp.frequency.setValueAtTime(2500, t0);
    const lp = ctx.createBiquadFilter();
    lp.type="lowpass"; lp.frequency.setValueAtTime(12000, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.40, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
    n.connect(hp); hp.connect(lp); lp.connect(g);
    g.connect(dryG); g.connect(wetG);
    n.start(t0); n.stop(t0 + 0.60);
    return;
  }

}

function makeNoiseBuffer(ctx, durationSec=0.03){
  const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i=0;i<len;i++){
    const t = i/len;
    d[i] = (Math.random()*2-1) * (1 - t) * (1 - t);
  }
  return buf;
}

function makeWaveshaper(ctx, drive=1.2){
  const sh = ctx.createWaveShaper();
  const n = 65536;
  const curve = new Float32Array(n);
  for (let i=0;i<n;i++){
    const x = (i/(n/2)) - 1;
    curve[i] = Math.tanh(drive * x);
  }
  sh.curve = curve;
  sh.oversample = "4x";
  return sh;
}

// Additive harmonic voice with envelope + optional resonator + optional transient noise
function harmonicVoice(ctx, outDry, outWet, freq, when, durSec, vol, p){
  const t0 = when ?? ctx.currentTime;
  const v = clamp(vol ?? 1, 0, 1);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, (p.peak ?? 0.9) * v), t0 + (p.attack ?? 0.006));
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, (p.sustain ?? 0.35) * v), t0 + (p.attack ?? 0.006) + (p.decay ?? 0.20));

  // shared filter
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(p.cutoff ?? 2200, t0);
  lp.Q.setValueAtTime(p.lpQ ?? 0.7, t0);

  // optional body resonator chain (peaking filters)
  let last = lp;
  if (p.res && p.res.length){
    p.res.forEach((r)=>{
      const b = ctx.createBiquadFilter();
      b.type = "peaking";
      b.frequency.setValueAtTime(r.f, t0);
      b.Q.setValueAtTime(r.q ?? 1.2, t0);
      b.gain.setValueAtTime(r.g, t0);
      last.connect(b);
      last = b;
    });
  }

  // optional drive
  if (p.drive && p.drive > 0){
    const sh = makeWaveshaper(ctx, 1.0 + 2.0*p.drive);
    last.connect(sh);
    last = sh;
  }

  // per-note reverb send already handled outside; here just connect
  env.connect(lp);
  last.connect(outDry);
  last.connect(outWet);

  const harmonics = p.harm ?? [1,0.4,0.25,0.15,0.08];
  const types = p.types ?? ["triangle","triangle","triangle","triangle","sine"];
  const det = p.detune ?? 0;
  const oscs = [];
  for (let i=0;i<harmonics.length;i++){
    const amp = harmonics[i];
    if (amp <= 0) continue;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = types[Math.min(i, types.length-1)];
    osc.frequency.setValueAtTime(freq * (i+1), t0);
    osc.detune.setValueAtTime((i-2)*det, t0);
    g.gain.setValueAtTime((p.voiceGain ?? 0.20) * amp, t0);
    osc.connect(g);
    g.connect(env);
    osc.start(t0);
    oscs.push(osc);
  }

  // transient noise (hammer/pick)
  if (p.noise && p.noise > 0){
    const n = ctx.createBufferSource();
    n.buffer = makeNoiseBuffer(ctx, p.noiseDur ?? 0.015);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(p.noiseF ?? 2500, t0);
    bp.Q.setValueAtTime(p.noiseQ ?? 1.8, t0);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(p.noise * v, t0);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + (p.noiseDur ?? 0.015));
    n.connect(bp); bp.connect(ng); ng.connect(env);
    n.start(t0);
    n.stop(t0 + (p.noiseDur ?? 0.015) + 0.02);
  }

  const stopAt = t0 + (durSec ?? 1.2);
  env.gain.exponentialRampToValueAtTime(0.0001, stopAt + (p.release ?? 0.50));
  oscs.forEach(o=>{ try{o.stop(stopAt + (p.release ?? 0.50) + 0.05);}catch(_){ } });
}


function drawViz(){
  if (!analyser || !meterAnalyser || !meterCv || !spectrumCv) return;

  const mctx = meterCv.getContext("2d");
  const sctx = spectrumCv.getContext("2d");

  // Meter RMS from time domain
  const tbuf = new Float32Array(meterAnalyser.fftSize);
  meterAnalyser.getFloatTimeDomainData(tbuf);
  let sum = 0;
  for (let i=0;i<tbuf.length;i++){ sum += tbuf[i]*tbuf[i]; }
  const rms = Math.sqrt(sum / tbuf.length);
  const db = 20 * Math.log10(rms + 1e-8);
  const norm = clamp((db + 60) / 60, 0, 1);

  mctx.clearRect(0,0,meterCv.width,meterCv.height);
  mctx.fillStyle = "rgba(255,255,255,0.10)";
  mctx.fillRect(0,0,meterCv.width,meterCv.height);
  mctx.fillStyle = "rgba(52,211,153,0.55)";
  mctx.fillRect(0,0,meterCv.width*norm,meterCv.height);
  mctx.fillStyle = "rgba(255,255,255,0.8)";
  mctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  mctx.fillText(`Level: ${db.toFixed(1)} dB`, 10, 14);

  // AUTO-SAFETY: if it gets too hot, duck master a bit
  if (db > -6 && master && ac){
    const t = ac.currentTime;
    const g = Math.max(0.15, master.gain.value * 0.85);
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(g, t + 0.04);
  }


  // Spectrum
  const fbuf = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(fbuf);
  sctx.clearRect(0,0,spectrumCv.width,spectrumCv.height);
  sctx.fillStyle = "rgba(255,255,255,0.08)";
  sctx.fillRect(0,0,spectrumCv.width,spectrumCv.height);

  const w = spectrumCv.width;
  const h = spectrumCv.height;
  const bins = fbuf.length;
  // draw 256 bars max
  const bars = 256;
  for (let i=0;i<bars;i++){
    const idx = Math.floor(i * bins / bars);
    const v = fbuf[idx] / 255;
    const bh = v * (h-10);
    const x = (i / bars) * w;
    const bw = w / bars;
    sctx.fillStyle = `rgba(255,255,255,${0.10 + 0.55*v})`;
    sctx.fillRect(x, h-bh, bw, bh);
  }
}

function bpm(){ return clamp(parseFloat(bpmEl.value || "100"), 60, 180); }
function bars(){ return parseInt(barsSel.value, 10); }
function beatsPerBar(){ return 4; }
function loopBeats(){ return bars() * beatsPerBar(); }
function mtof(m){ return 440 * Math.pow(2, (m - 69) / 12); }
function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }

function ensureMasterAudible(){
  if (master && ac){
    if (master.gain.value < 0.15) master.gain.value = 0.78;
  }
}


function setAudioStateText(txt){
  try{
    const a = document.getElementById("audioState");
    if (a) a.textContent = txt;
    const b = document.getElementById("audioStateMini");
    if (b) b.textContent = txt;
  }catch(_){}
}

function ensureAudio(){
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();

  master = ac.createGain();
  master.gain.value = 0.78;

  dry = ac.createGain();
  wet = ac.createGain();
  dry.gain.value = 1.0;
  wet.gain.value = parseFloat(revEl.value);

  convolver = ac.createConvolver();
  convolver.buffer = makeImpulse(ac, 1.8, 2.0);

  dry.connect(master);
  wet.connect(convolver);
  convolver.connect(master);
  buildLimiterChain(ac, master);

  setAudioStateText("Audio: on");
  if (!vizTimer){ vizTimer = setInterval(drawViz, 50); }
}

function makeImpulse(ctx, seconds, decay){
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const ch = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return impulse;
}

function makeNoiseBuffer(ctx, durationSec=0.03){
  const len = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i=0;i<len;i++){
    d[i] = (Math.random()*2-1) * (1 - (i/len)); // quick fade
  }
  return buf;
}

function pluckNote(ctx, outDry, outWet, freq, when, durSec, vol, preset){
  const t0 = when ?? ctx.currentTime;
  const v = clamp(vol ?? 1, 0, 1);
  const p = preset || { brightness:0.5, decay:0.5, damp:0.25 };

  // Exciter: short noise burst through a brightness filter
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoiseBuffer(ctx, 0.028);

  const exciteLP = ctx.createBiquadFilter();
  exciteLP.type = "lowpass";
  exciteLP.frequency.setValueAtTime(800 + 4200 * p.brightness, t0);

  const exciteGain = ctx.createGain();
  exciteGain.gain.setValueAtTime(0.0001, t0);
  exciteGain.gain.exponentialRampToValueAtTime(0.9 * v, t0 + 0.003);
  exciteGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.03);

  // Delay loop (Karplus-Strong)
  const delay = ctx.createDelay();
  delay.delayTime.setValueAtTime(1 / Math.max(40, freq), t0);

  const fb = ctx.createGain();
  // feedback controls decay
  const fbVal = clamp(0.92 - 0.25 * p.damp + 0.02 * (p.decay ?? 0.5), 0.65, 0.93);
  fb.gain.setValueAtTime(fbVal, t0);

  const loopLP = ctx.createBiquadFilter();
  loopLP.type = "lowpass";
  const loopHP = ctx.createBiquadFilter();
  loopHP.type = "highpass";
  loopHP.frequency.setValueAtTime(60, t0);
  loopHP.Q.setValueAtTime(0.7, t0);

  loopLP.frequency.setValueAtTime(1200 + 2600 * p.brightness, t0);
  loopLP.Q.setValueAtTime(0.6, t0);

  // Output gain envelope
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.exponentialRampToValueAtTime(0.65 * v, t0 + 0.008);

  const stopAt = t0 + (durSec ?? 0.8);
  out.gain.exponentialRampToValueAtTime(0.0001, stopAt + 0.02);

  // Wire: exciter -> delay -> filter -> out -> dry/wet
  noise.connect(exciteLP);
  exciteLP.connect(exciteGain);
  exciteGain.connect(delay);

  delay.connect(loopLP);
  loopLP.connect(loopHP);
  loopHP.connect(out);
  out.connect(outDry);
  out.connect(outWet);

  // Feedback loop
  loopHP.connect(fb);
  fb.connect(delay);

  noise.start(t0);
  noise.stop(t0 + 0.06);

  return () => {
    // Let envelope handle the fade; no hard stop needed
  };
}

function pianoNote(ctx, outDry, outWet, freq, when, durSec, vol, preset){
  const t0 = when ?? ctx.currentTime;
  const v = clamp(vol ?? 1, 0, 1);
  const p = preset;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.85 * v, t0 + p.attack);
  env.gain.exponentialRampToValueAtTime(Math.max(0.001, p.sustain) * v, t0 + p.attack + p.decay);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(p.cutoff ?? 1800, t0);
  lp.Q.setValueAtTime(0.7, t0);

  env.connect(lp);
  lp.connect(outDry);
  lp.connect(outWet);

  // Additive-ish stack for piano body
  const partials = [1, 2, 3, 4];
  const gains = [1.0, 0.45, 0.22, 0.12];

  const oscs = [];
  partials.forEach((m, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq * m, t0);
    osc.detune.value = (i - 1.5) * 2; // tiny detune for width
    g.gain.value = (p.voiceGain ?? 0.26) * gains[i];
    osc.connect(g);
    g.connect(env);
    osc.start(t0);
    oscs.push(osc);
  });

  // Hammer noise click
  if ((p.hammer ?? 0) > 0.001){
    const n = ctx.createBufferSource();
    n.buffer = makeNoiseBuffer(ctx, 0.012);
    const nBP = ctx.createBiquadFilter();
    nBP.type = "bandpass";
    nBP.frequency.setValueAtTime(2600, t0);
    nBP.Q.setValueAtTime(2.2, t0);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime((p.hammer * 0.8) * v, t0);
    n.connect(nBP); nBP.connect(ng); ng.connect(env);
    n.start(t0);
    n.stop(t0 + 0.02);
  }

  const stopAt = t0 + (durSec ?? 0.9);
  env.gain.exponentialRampToValueAtTime(0.0001, stopAt + (p.release ?? 0.6));

  oscs.forEach(o => { try{ o.stop(stopAt + (p.release ?? 0.6) + 0.05); } catch(_){} });

  return () => {};
}


function getPreset(instrumentId){
  const id = instrumentId || "classic_piano";

  if (id === "classic_piano"){
    return {
      engine:"harm",
      harm:[1.00,0.55,0.28,0.16,0.10,0.06],
      types:["triangle","triangle","triangle","sine","sine","sine"],
      detune:2,
      voiceGain:0.22,
      attack:0.004, decay:0.22, sustain:0.38, release:0.75,
      cutoff:2400, lpQ:0.75,
      noise:0.10, noiseDur:0.012, noiseF:2800, noiseQ:2.0,
      res:[{f:520,q:1.1,g:2.0},{f:1150,q:1.4,g:1.4}],
      drive:0.0
    };
  }
  if (id === "soft_piano"){
    return {
      engine:"harm",
      harm:[1.00,0.42,0.20,0.10,0.05],
      types:["triangle","triangle","sine","sine","sine"],
      detune:1.2,
      voiceGain:0.20,
      attack:0.010, decay:0.35, sustain:0.28, release:0.95,
      cutoff:1800, lpQ:0.7,
      noise:0.05, noiseDur:0.010, noiseF:2400, noiseQ:1.6,
      res:[{f:420,q:1.0,g:1.5},{f:980,q:1.3,g:1.0}],
      drive:0.0
    };
  }

  if (id === "warm_pad"){
    return { engine:"osc", type:"sine", cutoff:950, attack:0.04, decay:0.10, sustain:0.92, release:0.55, voiceGain:0.30 };
  }
  if (id === "bright_synth"){
    return { engine:"osc", type:"sawtooth", cutoff:1700, attack:0.012, decay:0.08, sustain:0.75, release:0.22, voiceGain:0.22 };
  }

  if (id === "acoustic_guitar"){
    return {
      engine:"harm",
      harm:[1.00,0.75,0.55,0.35,0.22,0.14],
      types:["triangle","sawtooth","sawtooth","triangle","sine","sine"],
      detune:0.0,
      voiceGain:0.14,
      attack:0.004, decay:0.18, sustain:0.18, release:0.32,
      cutoff:2600, lpQ:0.6,
      noise:0.12, noiseDur:0.018, noiseF:1900, noiseQ:1.2,
      res:[{f:180,q:1.0,g:5.0},{f:700,q:1.2,g:3.5},{f:2200,q:1.0,g:2.2}],
      drive:0.15
    };
  }
  if (id === "electric_guitar"){
    return {
      engine:"harm",
      harm:[1.00,0.85,0.60,0.40,0.25,0.16,0.10],
      types:["sawtooth","sawtooth","triangle","triangle","sine","sine","sine"],
      detune:0.0,
      voiceGain:0.12,
      attack:0.003, decay:0.14, sustain:0.24, release:0.26,
      cutoff:3200, lpQ:0.55,
      noise:0.08, noiseDur:0.014, noiseF:2400, noiseQ:1.4,
      res:[{f:140,q:0.9,g:4.2},{f:900,q:1.1,g:2.8},{f:2600,q:1.0,g:2.6}],
      drive:0.28
    };
  }

  if (id === "bass_guitar"){
    return {
      engine:"harm",
      harm:[1.00,0.25,0.12,0.05],
      types:["sine","triangle","triangle","sine"],
      detune:0.0,
      voiceGain:0.28,
      attack:0.010, decay:0.20, sustain:0.78, release:0.22,
      cutoff:650, lpQ:0.9,
      noise:0.02, noiseDur:0.010, noiseF:900, noiseQ:1.0,
      res:[{f:90,q:0.9,g:4.5},{f:220,q:1.1,g:2.0}],
      drive:0.08
    };
  }

  return { engine:"osc", type:"triangle", cutoff:1400, attack:0.01, decay:0.08, sustain:0.7, release:0.25, voiceGain:0.22 };
}

function startChord(ctx, outDry, outWet, freqs, when, volumeMul, instrumentId, strumOn, revSend){
  const t0 = when ?? ctx.currentTime;
  const vol = clamp(volumeMul ?? 1, 0, 1);
  let preset = getPreset(instrumentId);
  const meta = instrumentMeta(instrumentId || (soundSel ? soundSel.value : "classic_piano"));
  const doStrum = !!strumOn && meta.supportsStrum && freqs.length > 1;
  const strumStep = 0.018; // seconds between notes
  const rs = clamp((revSend ?? 0.22), 0, 1);
  const drySend = ctx.createGain();
  drySend.gain.setValueAtTime(1.0, t0);
  const wetSend = ctx.createGain();
  wetSend.gain.setValueAtTime(rs, t0);
  drySend.connect(outDry);
  wetSend.connect(outWet);

  if (safeMode && preset.engine === "pluck"){
    // Safety mode: keep pluck character but force heavy damping.
    preset = { ...preset, damp: Math.max(0.55, preset.damp ?? 0.35), brightness: Math.min(0.55, preset.brightness ?? 0.45) };
  }

  // Pluck engine (guitar/bass)
  if (preset.engine === "pluck"){
    freqs.forEach((f, idx) => {
      const w = t0 + (doStrum ? idx * strumStep : 0);
      pluckNote(ctx, drySend, wetSend, f, w, 1.2, vol, preset);
    });
    return () => {};
  }

  // Piano engine
  if (preset.engine === "piano"){
    freqs.forEach((f, idx) => {
      const w = t0 + (doStrum ? idx * strumStep : 0);
      pianoNote(ctx, drySend, wetSend, f, w, 1.4, vol, preset);
    });
    return () => {};
  }

  // Fallback osc engine
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.78 * vol, t0 + (preset.attack ?? 0.01));

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(preset.cutoff ?? 1400, t0);
  lp.Q.setValueAtTime(0.6, t0);

  env.connect(lp);
  lp.connect(outDry);
  lp.connect(outWet);

  const oscs = [];
  freqs.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = preset.type ?? "triangle";
    osc.detune.value = (idx - 1) * 4;
    g.gain.value = preset.voiceGain ?? 0.28;
    osc.frequency.setValueAtTime(f, t0);
    osc.connect(g);
    g.connect(env);
    osc.start(t0 + (doStrum ? (idx * strumStep) : 0));
    oscs.push(osc);
  });

  const stop = (atTime) => {
    const t1 = atTime ?? ctx.currentTime;
    env.gain.cancelScheduledValues(t1);
    env.gain.setValueAtTime(Math.max(env.gain.value, 0.0001), t1);
    env.gain.exponentialRampToValueAtTime(0.0001, t1 + (preset.release ?? 0.25));
    const stopAt = t1 + (preset.release ?? 0.25) + 0.05;
    oscs.forEach(o => { try { o.stop(stopAt); } catch(_){} });
  };

  activeVoiceStops.add(stop);
  return (atTime)=>{ try{ stop(atTime); } finally { activeVoiceStops.delete(stop); } };
}

function playScheduled(ctx, outDry, outWet, freqs, when, durSec, volumeMul, instrumentId, strumOn, revSend){
  const stop = startChord(ctx, outDry, outWet, freqs, when, volumeMul, instrumentId, strumOn, revSend);
  stop((when ?? ctx.currentTime) + (durSec ?? 0.9));
}

function formatChordLabel(root, qual){
  if (qual === "maj") return root;
  if (qual === "min") return root + "m";
  if (qual === "dim") return root + "dim";
  return root;
}

function chordForPad(padIndex, keyName){
  // padIndex: 0-7 = Major row, 8-15 = Minor row
  const tonicIdx = NOTE_NAMES.indexOf(keyName);
  const DEGREE_STEPS = [0,2,4,5,7,9,11,12]; // 1..8 (octave)
  const isMinorRow = padIndex >= 8;
  const degree = isMinorRow ? (padIndex - 8) : padIndex;
  const step = DEGREE_STEPS[clamp(degree,0,7)];
  const rootSemis = (tonicIdx + (step % 12) + 12) % 12;
  const rootName = NOTE_NAMES[rootSemis];
  const qual = isMinorRow ? "min" : "maj";
  const tri = TRIADS[qual] || TRIADS.maj;

  // put the tonic at C3-ish and build upward (stable, no wrap)
  const baseMidi = 48 + tonicIdx; // ~C3
  const rootMidi = baseMidi + step;

  const midis = tri.map(x => rootMidi + x);
  const freqs = midis.map(mtof);

  const label = qual === "min" ? (rootName + "m") : rootName;
  const notes = midis.map(m => NOTE_NAMES[m % 12]).join(" - ");
  const symbol = chordSymbol(rootName, qual);
  return { label, symbol, notes, freqs, rootMidi, rootName, qual, degree, keyName };
}

function freqsForRole(role, chordObj){
  if (role === "bass"){
    const bassMidi = chordObj.rootMidi - 12;
    return [mtof(bassMidi)];
  }
  if (role === "lead"){
    return [chordObj.freqs[chordObj.freqs.length - 1]];
  }
  return chordObj.freqs;
}

// pads

const C5_KEYS = ["C","G","D","A","E","B","F#","C#","G#","D#","A#","F"].map(prettyAccidentals);
const C5_MAP_RAW = {"C":"C","G":"G","D":"D","A":"A","E":"E","B":"B","F#":"F♯","C#":"C♯","G#":"G♯","D#":"D♯","A#":"A♯","F":"F"};
let c5SegByKey = { maj:{}, min:{} };

function polar(cx, cy, r, ang){
  return [cx + r*Math.cos(ang), cy + r*Math.sin(ang)];
}

function arcPath(cx, cy, r0, r1, a0, a1){
  const [x0,y0] = polar(cx,cy,r1,a0);
  const [x1,y1] = polar(cx,cy,r1,a1);
  const [x2,y2] = polar(cx,cy,r0,a1);
  const [x3,y3] = polar(cx,cy,r0,a0);
  const large = (a1-a0) > Math.PI ? 1 : 0;
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

function chordLookupKey(rootName, qual){
  return `${prettyAccidentals(rootName)}|${qual === "min" ? "min" : "maj"}`;
}

function triggerPadFromCircle(rootNamePretty, qual){
  const idx = padIndexByChord.get(`${rootNamePretty}|${qual}`);
  if (idx == null) return;
  const pid = `c5-${rootNamePretty}-${qual}-${Date.now()}`;
  setPadActive(idx, true);
  padHoldStart(idx, pid);
  setTimeout(() => padHoldEnd(pid), 220);
}

function initCircleOfFifths(){
  if (!circleSvg) return;
  circleSvg.innerHTML = "";
  c5SegByKey = { maj:{}, min:{} };

  const cx=110, cy=110;
  const outerIn=72, outerOut=102;
  const innerIn=46, innerOut=70;
  const segN=12;
  const start = -Math.PI/2; // top
  const step = (Math.PI*2)/segN;

  // segments
  for (let i=0;i<segN;i++){
    const a0 = start + i*step;
    const a1 = start + (i+1)*step;

    const key = C5_KEYS[i];

    const pMaj = document.createElementNS("http://www.w3.org/2000/svg","path");
    pMaj.setAttribute("d", arcPath(cx,cy,outerIn,outerOut,a0,a1));
    pMaj.setAttribute("class","c5-seg c5-maj");
    pMaj.style.cursor = "pointer";
    pMaj.addEventListener("click", ()=> triggerPadFromCircle(key, "maj"));
    circleSvg.appendChild(pMaj);
    c5SegByKey.maj[key] = pMaj;

    const pMin = document.createElementNS("http://www.w3.org/2000/svg","path");
    pMin.setAttribute("d", arcPath(cx,cy,innerIn,innerOut,a0,a1));
    pMin.setAttribute("class","c5-seg c5-min");
    pMin.style.cursor = "pointer";
    pMin.addEventListener("click", ()=> triggerPadFromCircle(key, "min"));
    circleSvg.appendChild(pMin);
    c5SegByKey.min[key] = pMin;

    // outer text (major)
    const mid = (a0+a1)/2;
    const [tx,ty] = polar(cx,cy,(outerIn+outerOut)/2, mid);
    const t = document.createElementNS("http://www.w3.org/2000/svg","text");
    t.setAttribute("x", tx.toFixed(2));
    t.setAttribute("y", ty.toFixed(2));
    t.setAttribute("text-anchor","middle");
    t.setAttribute("dominant-baseline","middle");
    t.setAttribute("class","c5-text");
    t.textContent = key;
    circleSvg.appendChild(t);
  }

  // center chord symbol + label
  const center = document.createElementNS("http://www.w3.org/2000/svg","text");
  center.setAttribute("x","110"); center.setAttribute("y","113");
  center.setAttribute("text-anchor","middle");
  center.setAttribute("class","c5-center");
  center.setAttribute("id","c5Center");
  center.textContent = "—";
  circleSvg.appendChild(center);

  const sub = document.createElementNS("http://www.w3.org/2000/svg","text");
  sub.setAttribute("x","110"); sub.setAttribute("y","136");
  sub.setAttribute("text-anchor","middle");
  sub.setAttribute("class","c5-sub");
  sub.setAttribute("id","c5Sub");
  sub.textContent = "";
  circleSvg.appendChild(sub);
}

function highlightChordOnCircle(chordObj){
  const rootPretty = prettyAccidentals(chordObj?.rootName || keySel?.value || "C");
  const qual = chordObj?.qual === "min" ? "min" : "maj";
  ["maj","min"].forEach(mode => {
    Object.values(c5SegByKey[mode] || {}).forEach(el => el.classList.remove("active"));
  });
  const seg = c5SegByKey[qual] ? c5SegByKey[qual][rootPretty] : null;
  if (seg) seg.classList.add("active");
}

function highlightKeyOnCircle(keyName){
  highlightChordOnCircle({ rootName:keyName, qual:"maj" });
}

function setChordDisplay(chordObj){
  const sym = chordObj?.symbol || chordObj?.label || "—";
  if (learnChordEl) learnChordEl.textContent = sym;
  const c = document.getElementById("c5Center");
  if (c) c.textContent = sym;
  const s = document.getElementById("c5Sub");
  if (s) s.textContent = prettyAccidentals(chordObj?.keyName || keySel?.value || "");
}

function renderPadsFallback(){
  if (!padsEl) return;
  padsEl.innerHTML = "";
  const labels = ["C","D","E","F","G","A","B","C","Cm","Dm","Em","Fm","Gm","Am","Bm","Cm","Kick","Snare","Hat","Open Hat","Clap","Tom","Rim","Crash"];
  for (let i=0;i<24;i++){
    const btn = document.createElement("div");
    btn.className = "pad";
    btn.innerHTML = `<div class="kbd">${KBD_KEYS[i] || ""}</div><div class="name">${labels[i]}</div><div class="notes">Fallback</div>`;
    padsEl.appendChild(btn);
  }
}

function renderPadsSafe(){
  try { renderPads(); }
  catch(err){
    console.error("renderPads failed", err);
    setAudioStateText("UI fallback active");
    renderPadsFallback();
  }
}

function renderPads(){
  if (!padsEl) return;
  padsEl.innerHTML = "";
  padButtons = [];
  padIndexByChord.clear();

  const tonic = keySel.value;
  // Build 16 chord pads (8 major + 8 minor) + 8 drum pads
  const drumNames = ["Kick","Snare","Hat","Open Hat","Clap","Tom","Rim","Crash"];
  const drumSubs  = DRUM_PAD_MAP;

  const makePad = (i, kbd, name, sub, bg, notesText) => {
    const btn = document.createElement("div");
    btn.className = "pad";
    btn.style.background = bg;
    btn.innerHTML = `
      <div class="kbd">${kbd}</div>
      <div class="name">${name}</div>
      <div class="notes">${notesText || ""}</div>
    `;
    btn.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      btn.setPointerCapture(ev.pointerId);
      padHoldStart(i, ev.pointerId);
    });
    btn.addEventListener("pointerup", (ev) => { ev.preventDefault(); padHoldEnd(ev.pointerId); });
    btn.addEventListener("pointercancel", (ev) => padHoldEnd(ev.pointerId));
    padsEl.appendChild(btn);
    padButtons.push(btn);
  };

  // Row 1: Majors (0..7)
  for (let i=0;i<8;i++){
    const c = chordForPad(i, tonic);
    padIndexByChord.set(chordLookupKey(c.rootName, c.qual), i);
    makePad(i, KBD_KEYS[i], c.label, null, PAD_COLORS[i], c.notes);
  }
  // Row 2: Minors (8..15)
  for (let i=0;i<8;i++){
    const idx = 8+i;
    const c = chordForPad(idx, tonic);
    padIndexByChord.set(chordLookupKey(c.rootName, c.qual), idx);
    const bg = "linear-gradient(135deg, rgba(16,185,129,.42), rgba(16,185,129,.12))";
    makePad(idx, KBD_KEYS[8+i], c.label, null, bg, c.notes);
  }
  // Row 3: Drums (16..23)
  for (let i=0;i<8;i++){
    const idx = 16+i;
    const bg = "linear-gradient(135deg, rgba(249,115,22,.44), rgba(236,72,153,.12))";
    makePad(idx, KBD_KEYS[16+i], drumNames[i], drumSubs[i], bg, "Percussion");
    const btn = padButtons[padButtons.length-1];
    if (btn){
      const wrap = document.createElement("div");
      wrap.className = "drumRateWrap";
      wrap.innerHTML = '<span>Speed</span>';
      const rt = document.createElement("input");
      rt.type = "range"; rt.min="0.5"; rt.max="4"; rt.step="0.1"; rt.value=String(drumPadRates[i]||1);
      rt.className = "drumRate";
      rt.addEventListener("pointerdown", ev => ev.stopPropagation());
      rt.addEventListener("click", ev => ev.stopPropagation());
      rt.addEventListener("input", () => { drumPadRates[i] = parseFloat(rt.value); });
      wrap.appendChild(rt);
      btn.appendChild(wrap);
    }
  }

  // sanity check: always 24
  if (padButtons.length !== 24){
    console.error("Pad render sanity check failed:", padButtons.length);
  }
}

function setPadActive(i, on){
  const el = padButtons[i];
  if (!el) return;
  el.classList.toggle("active", !!on);
  if (on) setTimeout(() => el.classList.remove("active"), 170);
}

// tracks
const TRACK_COLORS = ["#60a5fa","#34d399","#fbbf24","#fb7185","#a78bfa","#f97316","#22c55e","#e879f9"];

const INSTRUMENTS = [
  { value:"classic_piano",   label:"Classic Piano",   supportsStrum:false },
  { value:"soft_piano",      label:"Soft Piano",      supportsStrum:false },
  { value:"warm_pad",        label:"Warm Pad",        supportsStrum:false },
  { value:"bright_synth",    label:"Bright Synth",    supportsStrum:false },
  { value:"acoustic_guitar", label:"Acoustic Guitar", supportsStrum:true  },
  { value:"electric_guitar", label:"Electric Guitar", supportsStrum:true  },
  { value:"bass_guitar",     label:"Bass Guitar",     supportsStrum:false },
  { value:"drum_kit", label:"Drum Kit", supportsStrum:false },
  { value:"microphone", label:"Microphone", supportsStrum:false },
];

function instrumentMeta(id){
  return INSTRUMENTS.find(x => x.value === id) || INSTRUMENTS[0];
}

const ROLES = [
  { value:"chord", label:"Chord" },
  { value:"bass",  label:"Bass" },
  { value:"lead",  label:"Lead" },
  { value:"drums", label:"Drums" },
  { value:"mic",   label:"Mic" },
];


async function ensureMicSource(){
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    throw new Error("Microphone input not supported in this browser.");
  }
  ensureAudio();
  if (ac.state === "suspended") ac.resume();
  if (micInputSource) return micInputSource;
  micInputStream = await navigator.mediaDevices.getUserMedia({ audio:true });
  micInputSource = ac.createMediaStreamSource(micInputStream);
  return micInputSource;
}

function clearMicNodes(t){
  if (!t || !t.micNodes) return;
  try{ Object.values(t.micNodes).forEach(n => n && n.disconnect && n.disconnect()); }catch(_){ }
  t.micNodes = null;
}

function rebuildMicRouting(){
  tracks.forEach(t => clearMicNodes(t));
  if (!ac || !dry || !wet || !micMonitorOn) return;

  tracks.forEach(t => {
    if (t.role !== "mic" || t.muted) return;
    ensureMicSource().then(src => {
      if (!ac || t.role !== "mic" || t.muted) return;

      const inG = ac.createGain();
      const compN = ac.createDynamicsCompressor();
      const tuneN = ac.createBiquadFilter();
      const dly = ac.createDelay(1.0);
      const dlyFb = ac.createGain();
      const outDry = ac.createGain();
      const outWet = ac.createGain();

      const fx = t.micFx || { rev:0.25, delay:0.12, comp:0.30, tune:0.15, autoTune:true, tuneKey:"C" };

      inG.gain.value = Math.max(0, t.vol ?? 1.0);
      compN.threshold.value = -34 + (fx.comp * 22);
      compN.ratio.value = 2 + (fx.comp * 8);
      compN.attack.value = 0.01;
      compN.release.value = 0.16;

      tuneN.type = "peaking";
      const tuneKey = NOTE_NAMES.indexOf((fx.tuneKey || keySel?.value || "C").replace("♯", "#"));
      tuneN.frequency.value = 220 + ((tuneKey < 0 ? 0 : tuneKey) * 40) + (fx.tune * 800);
      tuneN.Q.value = fx.autoTune ? (1.8 + (fx.tune * 4)) : 0.7;
      tuneN.gain.value = fx.autoTune ? (fx.tune * 12) : 0;

      dly.delayTime.value = 0.03 + (fx.delay * 0.28);
      dlyFb.gain.value = fx.delay * 0.35;

      outDry.gain.value = 1.0;
      outWet.gain.value = fx.rev;

      src.connect(inG);
      inG.connect(compN);
      compN.connect(tuneN);
      tuneN.connect(outDry);
      tuneN.connect(dly);
      dly.connect(dlyFb);
      dlyFb.connect(dly);
      dly.connect(outDry);
      tuneN.connect(outWet);
      outDry.connect(dry);
      outWet.connect(wet);

      t.micNodes = { inG, compN, tuneN, dly, dlyFb, outDry, outWet };
    }).catch(err => {
      setAudioStateText("Mic unavailable");
      console.warn(err);
    });
  });
}



function ensureDrumTrack(){
  const armed = tracks.find(t=>t.id===armedTrackId);
  // prefer armed if already drums
  if (armed && armed.role==="drums") return armed;

  let dt = tracks.find(t=>t.role==="drums");
  if (!dt){
    addTrack("Drums");
    dt = tracks[tracks.length-1];
    dt.role = "drums";
    dt.instrument = "drum_kit";
    dt.rev = 0.12;
    dt.vol = 0.95;
  }
  setArmedTrack(dt.id);
  renderTracks();
  return dt;
}
function applyDrumPattern(kind){
  const t = ensureDrumTrack();
  t.events = [];
  t.lastScheduledAbs = {};
  const lb = loopBeats();
  const step = 0.5; // 1/8 notes
  const ev = (tBeats, padIndex, dBeats=0.25)=>{
    t.events.push({ id: nextEventId++, tBeats, padIndex, dBeats });
  };

  if (kind === "rock"){
    // hats 1/8
    for (let b=0; b<lb; b+=step) ev(b, 2, 0.20);         // hat
    for (let bar=0; bar<bars(); bar++){
      const o = bar*4;
      ev(o+0.0, 0, 0.25); // kick
      ev(o+2.0, 0, 0.25); // kick
      ev(o+1.0, 1, 0.25); // snare
      ev(o+3.0, 1, 0.25); // snare
    }
  } else {
    // hiphop: hats 1/8 + a little off-kick
    for (let b=0; b<lb; b+=step) ev(b, 2, 0.18);
    for (let bar=0; bar<bars(); bar++){
      const o = bar*4;
      ev(o+0.0, 0, 0.25);  // kick
      ev(o+1.5, 0, 0.25);  // kick off-beat
      ev(o+2.5, 0, 0.25);  // kick
      ev(o+1.0, 1, 0.25);  // snare
      ev(o+3.0, 1, 0.25);  // snare
      ev(o+3.5, 4, 0.20);  // clap accent
    }
  }

  renderTicks();
  updateLoopBadge();
  renderTracks();
}

function addTrack(name){
  const id = uid();
  const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length];
  const t = { id, name: name ?? `Track ${tracks.length + 1}`, color, role:"chord", instrument:"classic_piano", strum:false, rev:0.22, micFx:{ rev:0.25, delay:0.12, comp:0.30, tune:0.15, autoTune:true, tuneKey:"C" }, events: [], muted:false, armed:false, vol:1.00, lastScheduledAbs:{} };
  tracks.push(t);
  if (!armedTrackId) setArmedTrack(id);
  renderTracks();
  updateLoopBadge();
}

function getArmedTrack(){
  return tracks.find(t => t.id === armedTrackId) || null;
}

function setArmedTrack(id){
  armedTrackId = id;
  tracks.forEach(t => t.armed = (t.id === id));
  const idx = tracks.findIndex(t => t.id === id);
  armedPill.textContent = `Armed: Track ${idx >= 0 ? (idx+1) : 1}`;
  renderTracks();
}

function clearTrack(id){
  const t = tracks.find(x => x.id === id);
  if (!t) return;
  t.events = [];
  t.lastScheduledAbs = {};
  updateLoopBadge();
  renderTracks();
}

function toggleMute(id){
  const t = tracks.find(x => x.id === id);
  if (!t) return;
  t.muted = !t.muted;
  if (t.muted && t.role === "mic") clearMicNodes(t);
  renderTracks();
  rebuildMicRouting();
}

function clearAll(){
  tracks.forEach(t => { t.events = []; t.lastScheduledAbs = {}; });
  updateLoopBadge();
  renderTracks();
}

function renderTracks(){
  tracksEl.innerHTML = "";
  tracks.forEach((t) => {
    const row = document.createElement("div");
    row.className = "trackRow";

    const left = document.createElement("div");
    left.className = "trackName";
    left.innerHTML = `
      <span class="dot" style="background:${t.color}"></span>
      <div>
        <div style="font-weight:650">${t.name}</div>
        <div class="trackMeta">${t.events.length ? `${t.events.length} hits` : "empty"} ${t.muted ? "• muted" : ""}</div>
      </div>
    `;

    const controls = document.createElement("div");
    controls.className = "trackCtl trackCtlInline";

    const roleSel = document.createElement("select");
    ROLES.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.value;
      opt.textContent = r.label;
      if (t.role === r.value) opt.selected = true;
      roleSel.appendChild(opt);
    });
    roleSel.addEventListener("change", () => {
      t.role = roleSel.value;
      if (t.role === "drums") { t.instrument = "drum_kit"; t.strum = false; }
      if (t.role === "mic") { t.instrument = "microphone"; t.strum = false; }
      renderTracks();
      rebuildMicRouting();
    });
    controls.appendChild(wrapCtl("Role", roleSel));

    const instSel = document.createElement("select");
    INSTRUMENTS.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.value;
      opt.textContent = r.label;
      if (t.instrument === r.value) opt.selected = true;
      instSel.appendChild(opt);
    });
    instSel.disabled = (t.role === "mic");
    instSel.addEventListener("change", () => {
      t.instrument = instSel.value;
      const meta = instrumentMeta(t.instrument);
      if (!meta.supportsStrum) t.strum = false;
      renderTracks();
    });
    controls.appendChild(wrapCtl("Instrument", instSel));

    const vol = document.createElement("input");
    vol.type = "range"; vol.min = "0"; vol.max = "1"; vol.step = "0.01"; vol.value = String(t.vol);
    vol.addEventListener("input", () => { t.vol = parseFloat(vol.value); rebuildMicRouting(); });
    controls.appendChild(wrapCtl("Vol", vol));

    const rv = document.createElement("input");
    rv.type = "range"; rv.min = "0"; rv.max = "1"; rv.step = "0.01"; rv.value = String(t.rev ?? 0.22);
    rv.addEventListener("input", () => { t.rev = parseFloat(rv.value); });
    controls.appendChild(wrapCtl("Rev", rv));

    if (t.role === "mic"){
      const fx = t.micFx || (t.micFx = { rev:0.25, delay:0.12, comp:0.30, tune:0.15, autoTune:true, tuneKey:"C" });

      const micRev = document.createElement("input");
      micRev.type = "range"; micRev.min = "0"; micRev.max = "1"; micRev.step = "0.01"; micRev.value = String(fx.rev);
      micRev.addEventListener("input", () => { fx.rev = parseFloat(micRev.value); rebuildMicRouting(); });
      controls.appendChild(wrapCtl("Mic Rev", micRev));

      const micDly = document.createElement("input");
      micDly.type = "range"; micDly.min = "0"; micDly.max = "1"; micDly.step = "0.01"; micDly.value = String(fx.delay);
      micDly.addEventListener("input", () => { fx.delay = parseFloat(micDly.value); rebuildMicRouting(); });
      controls.appendChild(wrapCtl("Delay", micDly));

      const micComp = document.createElement("input");
      micComp.type = "range"; micComp.min = "0"; micComp.max = "1"; micComp.step = "0.01"; micComp.value = String(fx.comp);
      micComp.addEventListener("input", () => { fx.comp = parseFloat(micComp.value); rebuildMicRouting(); });
      controls.appendChild(wrapCtl("Comp", micComp));

      const tuneOn = document.createElement("input");
      tuneOn.type = "checkbox";
      tuneOn.checked = fx.autoTune !== false;
      tuneOn.addEventListener("change", () => { fx.autoTune = !!tuneOn.checked; rebuildMicRouting(); });
      controls.appendChild(wrapCtl("AutoTune", tuneOn));

      const tuneKeySel = document.createElement("select");
      NOTE_NAMES.forEach(n => {
        const o = document.createElement("option");
        o.value = n; o.textContent = n;
        if ((fx.tuneKey || "C") === n) o.selected = true;
        tuneKeySel.appendChild(o);
      });
      tuneKeySel.addEventListener("change", () => { fx.tuneKey = tuneKeySel.value; rebuildMicRouting(); });
      controls.appendChild(wrapCtl("Tune Key", tuneKeySel));

      const micTune = document.createElement("input");
      micTune.type = "range"; micTune.min = "0"; micTune.max = "1"; micTune.step = "0.01"; micTune.value = String(fx.tune);
      micTune.addEventListener("input", () => { fx.tune = parseFloat(micTune.value); rebuildMicRouting(); });
      controls.appendChild(wrapCtl("Tune Amt", micTune));
    } else {
      const strWrap = document.createElement("div");
      strWrap.style.display = "flex";
      strWrap.style.alignItems = "center";
      strWrap.style.gap = "8px";
      const str = document.createElement("input");
      str.type = "checkbox";
      str.checked = !!t.strum;
      const meta = instrumentMeta(t.instrument);
      str.disabled = !meta.supportsStrum;
      str.addEventListener("change", () => { t.strum = !!str.checked; });
      const strLab = document.createElement("div");
      strLab.className = "smallLabel";
      strLab.textContent = meta.supportsStrum ? "Strum" : "Strum (n/a)";
      strWrap.appendChild(str);
      strWrap.appendChild(strLab);
      controls.appendChild(wrapCtl("Feel", strWrap));
    }

    const btns = document.createElement("div");
    btns.className = "trackBtns";
    btns.innerHTML = `
      <button class="btn small arm ${t.armed ? "on" : ""}">Arm</button>
      <button class="btn small mute ${t.muted ? "on" : ""}">Mute</button>
      <button class="btn small clear">Clear</button>
    `;
    const [armBtn, muteBtn, clearBtn] = btns.querySelectorAll("button");
    armBtn.addEventListener("click", () => setArmedTrack(t.id));
    muteBtn.addEventListener("click", () => { toggleMute(t.id); });
    clearBtn.addEventListener("click", () => clearTrack(t.id));

    row.appendChild(left);
    row.appendChild(controls);
    row.appendChild(btns);
    tracksEl.appendChild(row);
  });

  rebuildMicRouting();
}


function wrapCtl(label, el){
  const box = document.createElement("div");
  box.style.display = "grid";
  box.style.gap = "6px";
  const l = document.createElement("div");
  l.className = "smallLabel";
  l.textContent = label;
  box.appendChild(l);
  box.appendChild(el);
  return box;
}

function updateLoopBadge(){
  const total = tracks.reduce((s,t)=>s+t.events.length,0);
  loopBadge.textContent = total ? "LOOP" : "EMPTY";
}

// timing
function quantizeBeat(beat, grid = 0.25){
  return Math.round(beat / grid) * grid;
}
function beatsToSeconds(beats){
  const bps = bpm() / 60;
  return beats / bps;
}
function nowBeats(){
  if (!ac) return 0;
  const sec = ac.currentTime - loopStartTime;
  const bps = bpm() / 60;
  return sec * bps;
}

// playback (no duplicates)

function getPlayheadElements(){
  const b = blocks || document.getElementById("blocks");
  let p = playhead || document.getElementById("playhead");
  if (b && !p){
    p = document.createElement("div");
    p.id = "playhead";
    p.className = "playhead";
    b.appendChild(p);
  }
  return { blocksEl:b, playheadEl:p };
}

function scheduleLoopPlayback(){
  clearInterval(playTimer);
  if (!ac) return;

  updateLoopBadge();
  if (loopInfo) loopInfo.textContent = `Loop: ${bars()} bars • Quantize: ON`;
renderTicks();

  playTimer = setInterval(() => {
    if (!isPlaying || !ac) return;

    const bps = bpm() / 60;
    const tNow = ac.currentTime;
    const absBeatNow = nowBeats();     // absolute beats since loopStartTime
    const lb = loopBeats();
    const lookaheadSec = 0.14;
    const lookaheadBeats = lookaheadSec * bps;

    tracks.forEach(track => {
      if (track.muted) return;
      if (isRecording && track.id === armedTrackId) return; // monitor fix

      track.events.forEach(ev => {
        const tInLoop = (ev.tBeats % lb + lb) % lb;

        // compute next absolute occurrence
        let base = Math.floor(absBeatNow / lb) * lb;
        let nextAbs = base + tInLoop;
        if (nextAbs < absBeatNow - 0.0001) nextAbs += lb;

        const delta = nextAbs - absBeatNow;
        if (delta <= lookaheadBeats){
          const lastAbs = track.lastScheduledAbs[ev.id];
          if (lastAbs === nextAbs) return; // already scheduled this occurrence
          track.lastScheduledAbs[ev.id] = nextAbs;

          const when = tNow + (delta / bps);
          
          if (track.role === "mic") {
            return;
          }
          if (track.role === "drums") {
            const type = DRUM_PAD_MAP[ev.padIndex % DRUM_PAD_MAP.length] || "hat";
            drumHit(ac, dry, wet, type, when, track.vol, track.rev);
          } else {
            const chordObj = chordForPad(ev.padIndex, keySel.value);
            const freqs = freqsForRole(track.role, chordObj);
            const durSec = beatsToSeconds(ev.dBeats ?? 1.0);
            playScheduled(ac, dry, wet, freqs, when, durSec, track.vol, track.instrument, track.strum, track.rev);
          }

        }
      });
    });
  }, 35);

  cancelAnimationFrame(rafId);
  const tick = () => {
    if (!isPlaying || !ac) return;
    const lb = loopBeats();
    const beatNow = nowBeats();
    const frac = (beatNow % lb) / lb;
    const { blocksEl, playheadEl } = getPlayheadElements();
    if (blocksEl && playheadEl){
      const w = blocksEl.clientWidth || 0;
      playheadEl.style.transform = `translateX(${Math.floor(frac * w)}px)`;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

// record + sustain
function padHoldStart(padIndex, pointerId){
  ensureAudio();
  if (ac.state === "suspended") ac.resume();

  setPadActive(padIndex, true);

  const armed = getArmedTrack();

  // DRUM PADS: indices 16..23 (always drums)
  if (padIndex >= 16){
    const sub = padIndex - 16; // 0..7
    const drumTrack = (armed && armed.role === "drums") ? armed : ensureDrumTrack();
    const type = DRUM_PAD_MAP[sub] || "hat";
    const speed = Math.max(0.25, drumPadRates[sub] || 1.0);
    const hitDur = Math.max(0.06, 0.25 / speed);
    const hitNow = () => {
      drumHit(ac, dry, wet, type, ac.currentTime, drumTrack.vol, drumTrack.rev);
      if (isRecording && isPlaying){
        const b = nowBeats();
        const q = quantizeBeat(b, 0.25) % loopBeats();
        const id = nextEventId++;
        drumTrack.events.push({ id, tBeats: q, padIndex: sub, dBeats: hitDur });
        updateLoopBadge();
        renderTracks();
      }
    };
    hitNow();
    const repMs = Math.max(55, Math.floor((250 / speed)));
    const repTimer = setInterval(hitNow, repMs);
    activeHolds.set(pointerId, { stopFn: ()=>clearInterval(repTimer), padIndex });
    return;
  }

  // CHORD PADS: 0..15
  const chordObj = chordForPad(padIndex, keySel.value);
  lastChord.textContent = `Last: ${chordObj.label}`;
  highlightChordOnCircle(chordObj);
  setChordDisplay(chordObj);

  // If the armed track is drums, auto-arm the first non-drum track (or create one)
  let target = armed;
  if (target && (target.role === "drums" || target.role === "mic")){
    target = tracks.find(t => t.role !== "drums" && t.role !== "mic") || null;
    if (!target){
      addTrack("Track 1");
      target = tracks[tracks.length-1];
    }
    setArmedTrack(target.id);
    renderTracks();
  }

  const role = target ? target.role : "chord";
  const vol  = target ? target.vol : 1.0;
  const inst = target ? target.instrument : (soundSel ? soundSel.value : "soft_piano");
  const strm = target ? target.strum : false;
  const rvs  = target ? (target.rev ?? 0.22) : 0.22;

  const freqs = freqsForRole(role, chordObj);

  const liveStop = startChord(ac, dry, wet, freqs, ac.currentTime, vol, inst, strm, rvs);
  activeHolds.set(pointerId, { stopFn: liveStop, padIndex });

  if (isRecording && isPlaying && target){
    const b = nowBeats();
    const q = quantizeBeat(b, 0.25) % loopBeats();
    const id = nextEventId++;
    target.events.push({ id, tBeats: q, padIndex, dBeats: 1.0 });
    activeHolds.get(pointerId).rec = { id, trackId: target.id, startBeat: q };
    updateLoopBadge();
    renderTracks();
  }
}
function padHoldEnd(pointerId){
  const hold = activeHolds.get(pointerId);
  if (!hold) return;
  try { hold.stopFn(ac ? ac.currentTime : undefined); } catch(_){}
  if (hold.rec && isRecording && isPlaying){
    const lb = loopBeats();
    const nowB = (nowBeats() % lb + lb) % lb;
    let d = nowB - hold.rec.startBeat;
    if (d < 0) d += lb;
    d = clamp(quantizeBeat(d, 0.25), 0.25, lb);
    const track = tracks.find(t => t.id === hold.rec.trackId);
    if (track){
      const ev = track.events.find(e => e.id === hold.rec.id);
      if (ev) ev.dBeats = d;
    }
  }
  activeHolds.delete(pointerId);
}


function killAllVoices(){
  if (!ac) return;
  const tNow = ac.currentTime;
  try{
    activeVoiceStops.forEach(fn => { try{ fn(tNow); }catch(_){} });
    activeVoiceStops.clear();
  }catch(_){}
  try{
    activeHolds.forEach(h => { try{ h.stopFn(tNow); }catch(_){} });
    activeHolds.clear();
  }catch(_){}
}

// transport
function start(){
  ensureAudio();
  if (ac.state === "suspended") ac.resume();

  isPlaying = true;
  loopStartTime = ac.currentTime;

  // reset scheduling guards each start (fresh loopStart)
  tracks.forEach(t => t.lastScheduledAbs = {});

  playBtn.classList.add("on");
  modePill.textContent = isRecording ? "Mode: Record" : "Mode: Play";
  scheduleLoopPlayback();
}

function stop(){
  isPlaying = false;
  isRecording = false;

  playBtn.classList.remove("on");
  recBtn.classList.remove("on");
  modePill.textContent = "Mode: Play";

  clearInterval(playTimer);
  playTimer = null;
  cancelAnimationFrame(rafId);

  const { playheadEl } = getPlayheadElements();
  if (playheadEl) playheadEl.style.transform = `translateX(0px)`;
  [...activeHolds.keys()].forEach(pid => padHoldEnd(pid));
}

function toggleRecord(){
  if (!isPlaying) start();
  if (!playTimer && ac) scheduleLoopPlayback();

  let armed = getArmedTrack();
  if (!armed && tracks.length === 0){
    addTrack("Track 1");
    armed = getArmedTrack();
  }

  // keep drums armed for drum recording; only auto-shift away from mic tracks
  if (armed && armed.role === "mic"){
    const melodic = tracks.find(t => t.role !== "mic");
    if (melodic) setArmedTrack(melodic.id);
  }

  isRecording = !isRecording;
  recBtn.classList.toggle("on", isRecording);
  modePill.textContent = isRecording ? "Mode: Record" : "Mode: Play";
  setAudioStateText(isRecording ? "Audio: on • Recording" : "Audio: on");
  if (isRecording) updateLoopBadge();
}

// Bounce (one loop cycle)
async function bounceWav(){
  const lb = loopBeats();
  const sr = 44100;
  const durationSec = beatsToSeconds(lb);

  const off = new OfflineAudioContext(2, Math.ceil(durationSec * sr), sr);

  const master = off.createGain();
  master.gain.value = 0.95;

  const dry = off.createGain();
  const wet = off.createGain();
  dry.gain.value = 1.0;
  wet.gain.value = parseFloat(revEl.value);

  const convolver = off.createConvolver();
  convolver.buffer = makeImpulse(off, 1.8, 2.0);

  dry.connect(master);
  wet.connect(convolver);
  convolver.connect(master);
  master.connect(off.destination);

  tracks.forEach(track => {
    if (track.muted) return;
    track.events.forEach(ev => {
      const whenSec = beatsToSeconds(ev.tBeats);
      const chordObj = chordForPad(ev.padIndex, keySel.value);
      const freqs = freqsForRole(track.role, chordObj);
      const durSec = beatsToSeconds(ev.dBeats ?? 1.0);
      playScheduled(off, dry, wet, freqs, whenSec, durSec, track.vol, track.instrument, track.strum, track.rev);
    });
  });

  const buf = await off.startRendering();
  const wavBlob = audioBufferToWavBlob(buf);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
  a.download = `powerschord-bounce-${stamp}.wav`;
  a.href = URL.createObjectURL(wavBlob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

function audioBufferToWavBlob(buffer){
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;

  const channels = [];
  for (let c=0;c<numCh;c++) channels.push(buffer.getChannelData(c));
  const interleaved = new Float32Array(length * numCh);
  for (let i=0;i<length;i++){
    for (let c=0;c<numCh;c++){
      interleaved[i*numCh+c] = channels[c][i];
    }
  }

  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = interleaved.length * bytesPerSample;
  const bufferSize = 44 + dataSize;
  const dv = new DataView(new ArrayBuffer(bufferSize));

  let p=0;
  function writeStr(s){ for (let i=0;i<s.length;i++) dv.setUint8(p++, s.charCodeAt(i)); }
  function writeU32(v){ dv.setUint32(p, v, true); p+=4; }
  function writeU16(v){ dv.setUint16(p, v, true); p+=2; }

  writeStr("RIFF");
  writeU32(36 + dataSize);
  writeStr("WAVE");
  writeStr("fmt ");
  writeU32(16);
  writeU16(1);
  writeU16(numCh);
  writeU32(sampleRate);
  writeU32(byteRate);
  writeU16(blockAlign);
  writeU16(16);
  writeStr("data");
  writeU32(dataSize);

  for (let i=0;i<interleaved.length;i++){
    let s = Math.max(-1, Math.min(1, interleaved[i]));
    dv.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    p += 2;
  }
  return new Blob([dv.buffer], { type:"audio/wav" });
}

safeMode = safeModeEl ? !!safeModeEl.checked : true;
if (safeModeEl){
  safeModeEl.addEventListener("change", ()=>{ safeMode = !!safeModeEl.checked; });
}
micMonitorOn = micMonitorEl ? !!micMonitorEl.checked : true;
if (micMonitorEl){
  micMonitorEl.addEventListener("change", ()=>{
    micMonitorOn = !!micMonitorEl.checked;
    rebuildMicRouting();
  });
}

// controls
safeOn(playBtn, "click", () => {
  ensureMasterAudible(); if (!isPlaying) start(); });
safeOn(stopBtn, "click", stop);
safeOn(recBtn, "click", toggleRecord);

safeOn(keySel, "change", () => {
  renderPadsSafe();
  highlightKeyOnCircle(keySel.value);
  setChordDisplay(chordForPad(0, keySel.value));
});
safeOn(bpmEl, "change", () => { bpmEl.value = String(bpm()); if (isPlaying) scheduleLoopPlayback(); });
safeOn(barsSel, "change", () => {
  const lb = loopBeats();
  tracks.forEach(t => { t.events = t.events.map(e => ({...e, tBeats: e.tBeats % lb, dBeats: Math.min(e.dBeats ?? 1.0, lb) })); t.lastScheduledAbs = {}; });
  if (isPlaying) scheduleLoopPlayback();
  if (loopInfo) loopInfo.textContent = `Loop: ${bars()} bars • Quantize: ON`;
  renderTicks();
});
safeOn(revEl, "input", () => { if (wet) wet.gain.value = parseFloat(revEl.value); });

safeOn(addTrackBtn, "click", () => addTrack());
safeOn(clearAllBtn, "click", () => clearAll());
safeOn(exportBtn, "click", () => bounceWav());
if (panicBtn){
  panicBtn.addEventListener("click", ()=>{
    try{ stop(); }catch(_){ }
    try{ killAllVoices(); }catch(_){ }
    if (master && ac){
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      setTimeout(()=>{ if(master) master.gain.value = 0.78; }, 120);
      setAudioStateText("Audio: on");
    }
  });
}

// keyboard shortcuts
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const k = e.key.toUpperCase();
  const idx = KBD_KEYS.indexOf(k);
  if (idx >= 0) {
    const pid = "kbd-"+k;
    padHoldStart(idx, pid);
    setTimeout(() => padHoldEnd(pid), 120);
  }
  if (e.code === "Space"){
    e.preventDefault();
    isPlaying ? stop() : start();
  }
  if (k === "R") toggleRecord();
  if (k === "C") {
    const t = getArmedTrack();
    if (t) clearTrack(t.id);
  }
});

// init
renderPadsSafe();
initCircleOfFifths();
if (keySel){
  highlightKeyOnCircle(keySel.value);
  setChordDisplay(chordForPad(0, keySel.value));
}
addTrack("Track 1");
updateLoopBadge();
if (loopInfo) loopInfo.textContent = `Loop: ${bars()} bars • Quantize: ON`;


document.body.addEventListener('pointerdown', () => { try{ ensureAudio(); if(ac && ac.state==='suspended') ac.resume(); }catch(_){ } }, { once:false });


function startViz(){
  if (rafViz) return;
  const mctx = meterEl ? meterEl.getContext("2d") : null;
  const actx = analyzerEl ? analyzerEl.getContext("2d") : null;

  function frame(){
    rafViz = requestAnimationFrame(frame);
    if (!analyser) return;

    // meter (RMS-ish from time domain)
    if (mctx && meterEl){
      analyser.getByteTimeDomainData(meterData);
      let sum=0;
      for (let i=0;i<meterData.length;i++){
        const x = (meterData[i]-128)/128;
        sum += x*x;
      }
      const rms = Math.sqrt(sum / meterData.length); // 0..~1
      const w = meterEl.width, h = meterEl.height;
      mctx.clearRect(0,0,w,h);
      // background
      mctx.fillStyle = "rgba(255,255,255,.08)";
      mctx.fillRect(0,0,w,h);
      // bar
      mctx.fillStyle = "rgba(59,130,246,.80)";
      mctx.fillRect(0,0,Math.max(2, Math.min(w, rms*w*2.2)),h);
    }

    // spectrum
    if (actx && analyzerEl){
      analyser.getByteFrequencyData(analyserData);
      const w = analyzerEl.width, h = analyzerEl.height;
      actx.clearRect(0,0,w,h);
      actx.fillStyle = "rgba(255,255,255,.08)";
      actx.fillRect(0,0,w,h);
      actx.fillStyle = "rgba(255,255,255,.72)";
      const n = analyserData.length;
      const step = Math.max(1, Math.floor(n / w));
      for (let x=0; x<w; x++){
        const idx = x*step;
        const v = analyserData[idx] / 255;
        const bh = Math.max(1, v*h);
        actx.fillRect(x, h-bh, 1, bh);
      }
    }
  }
  frame();
}
} catch (e) {
    showErr(e);
  }
})();
