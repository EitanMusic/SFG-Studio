/* FL Web Studio - Full Browser DAW
Features:
- Step sequencer (Kick, Snare, HiHat)
- Piano roll editor (basic, notes grid)
- Mixer with volume control
- Basic synth with envelopes
- Simple delay effect
- Transport controls + tempo
- WAV export
- Project save/load JSON
*/

const ctx = new (window.AudioContext || window.webkitAudioContext)();

const instruments = [
  {name: "Kick", baseFreq: 150, type: "kick"},
  {name: "Snare", baseFreq: 100, type: "snare"},
  {name: "HiHat", baseFreq: 6000, type: "hihat"},
  {name: "Synth", baseFreq: 440, type: "synth"},
];

const stepsCount = 16;
const notesCount = 12; // one octave for piano roll (C4 to B4)

const stepSequencerGrid = document.getElementById("sequencer-grid");
const bpmInput = document.getElementById("bpm");
const playBtn = document.getElementById("play");
const stopBtn = document.getElementById("stop");
const exportBtn = document.getElementById("export");
const saveBtn = document.getElementById("save");
const loadBtn = document.getElementById("load");
const fileInput = document.getElementById("file-input");

const mixerDiv = document.getElementById("mixer");
const pianoRollCanvas = document.getElementById("piano-roll");
const pianoCtx = pianoRollCanvas.getContext("2d");

let isPlaying = false;
let currentStep = 0;
let intervalId = null;
let tempo = 120;

// Data structures
let sequence = []; // step sequencer active steps [inst][step]
let pianoNotes = []; // piano roll notes [{step, noteIndex, length}]
let volumes = [];  // volume per instrument 0-1
let delayWet = 0.3; // delay wetness for synth

// Initialize step sequencer data
function initSequence() {
  sequence = [];
  for(let i = 0; i < instruments.length; i++) {
    sequence[i] = new Array(stepsCount).fill(false);
  }
}

// Initialize volume controls
function initVolumes() {
  volumes = [];
  for(let i=0; i < instruments.length; i++) {
    volumes[i] = 0.7;
  }
}

// Build step sequencer UI grid
function buildSequencerGrid() {
  stepSequencerGrid.innerHTML = "";
  for(let i=0; i < instruments.length; i++) {
    for(let j=0; j < stepsCount; j++) {
      const stepDiv = document.createElement("div");
      stepDiv.classList.add("step");
      stepDiv.dataset.inst = i;
      stepDiv.dataset.step = j;

      stepDiv.addEventListener("click", () => {
        sequence[i][j] = !sequence[i][j];
        stepDiv.classList.toggle("active");
      });

      stepSequencerGrid.appendChild(stepDiv);
    }
  }
}

// Build mixer UI with volume sliders
function buildMixer() {
  mixerDiv.innerHTML = "";
  for(let i = 0; i < instruments.length; i++) {
    const ch = document.createElement("div");
    ch.classList.add("channel");

    ch.innerHTML = `
      <h3>${instruments[i].name}</h3>
      <label>Volume
        <input type="range" min="0" max="1" step="0.01" value="${volumes[i]}" data-inst="${i}" />
      </label>
    `;

    const slider = ch.querySelector("input[type=range]");
    slider.addEventListener("input", e => {
      const idx = parseInt(e.target.dataset.inst);
      volumes[idx] = parseFloat(e.target.value);
    });

    mixerDiv.appendChild(ch);
  }
}

// === Synth Sound Generators ===

function playKick(time, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(0.001, time + 0.2);

  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.2);
}

function playSnare(time, vol) {
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseBuffer.length; i++) {
    output[i] = (Math.random() * 2 - 1) * vol;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(vol, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(1000, time);

  noise.connect(bandpass).connect(noiseGain).connect(ctx.destination);
  noise.start(time);
  noise.stop(time + 0.2);
}

function playHiHat(time, vol) {
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseBuffer.length; i++) {
    output[i] = (Math.random() * 2 - 1) * vol;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(vol * 0.5, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(7000, time);

  noise.connect(highpass).connect(noiseGain).connect(ctx.destination);
  noise.start(time);
  noise.stop(time + 0.05);
}

// Basic synth note with delay effect
function playSynthNote(time, freq, vol) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const delay = ctx.createDelay(0.5);
  const feedback = ctx.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(0, time);

  // Envelope: attack=0.01, decay=0.2, sustain=0.3, release=0.3
  gain.gain.linearRampToValueAtTime(vol, time + 0.01);
  gain.gain.linearRampToValueAtTime(vol * 0.3, time + 0.2);
  gain.gain.setTargetAtTime(0, time + 0.5, 0.3);

  // Delay Feedback setup
  feedback.gain.value = 0.4;
  delay.delayTime.value = 0.25;

  osc.connect(gain).connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(ctx.destination);

  osc.start(time);
  osc.stop(time + 1);
}

// === Playback Loop ===

function playStepSequencerStep(step) {
  const time = ctx.currentTime;
  for(let i=0; i < instruments.length; i++) {
    if(sequence[i][step]) {
      const vol = volumes[i];
      switch(instruments[i].type) {
        case "kick": playKick(time, vol); break;
        case "snare": playSnare(time, vol); break;
        case "hihat": playHiHat(time, vol); break;
      }
    }
  }
}

// === Piano Roll Logic ===

function drawPianoRoll() {
  const w = pianoRollCanvas.width;
  const h = pianoRollCanvas.height;
  const noteHeight = h / notesCount;
  const stepWidth = w / stepsCount;

  // Clear
  pianoCtx.fillStyle = "#222";
  pianoCtx.fillRect(0, 0, w, h);

  // Draw horizontal note rows
  for(let i = 0; i < notesCount; i++) {
    pianoCtx.fillStyle = (i % 2 === 0) ? "#333" : "#444";
    pianoCtx.fillRect(0, i * noteHeight, w, noteHeight);
  }

  // Draw vertical steps grid
  pianoCtx.strokeStyle = "#555";
  for(let s=0; s <= stepsCount; s++) {
    const x = s * stepWidth;
    pianoCtx.beginPath();
    pianoCtx.moveTo(x, 0);
    pianoCtx.lineTo(x, h);
    pianoCtx.stroke();
  }

  // Draw notes
  pianoCtx.fillStyle = "#1db954";
  for(const note of pianoNotes) {
    const x = note.step * stepWidth;
    const y = note.noteIndex * noteHeight;
    const width = note.length * stepWidth;
    pianoCtx.fillRect(x, y, width, noteHeight);
  }
}

function toggleNoteOnPianoRoll(step, noteIndex) {
  const index = pianoNotes.findIndex(n => n.step === step && n.noteIndex === noteIndex);
  if (index >= 0) {
    pianoNotes.splice(index, 1); // Remove existing note
  } else {
    pianoNotes.push({step, noteIndex, length: 1}); // Add new note
  }
  drawPianoRoll();
}


// Piano roll click handler
pianoRollCanvas.addEventListener("click", e => {
  const rect = pianoRollCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const step = Math.floor(x / (pianoRollCanvas.width / stepsCount));
  const noteIndex = Math.floor(y / (pianoRollCanvas.height / notesCount));
  toggleNoteOnPianoRoll(step, noteIndex);
});


// === Playback of piano roll notes ===

function playPianoRollStep(step) {
  const time = ctx.currentTime;
  const freqBase = 261.63; // C4 frequency (middle C)
  const semitoneRatio = Math.pow(2, 1/12);

  for(const note of pianoNotes) {
    if(note.step === step) {
      const freq = freqBase * Math.pow(semitoneRatio, notesCount - note.noteIndex - 1);
      playSynthNote(time, freq, volumes[3]);
    }
  }
}

// === Playback main loop ===

function playbackLoop() {
  const time = ctx.currentTime;
  playStepSequencerStep(currentStep);
  playPianoRollStep(currentStep);
  highlightStep(currentStep);
  currentStep = (currentStep + 1) % stepsCount;
}

// UI highlight current step in step sequencer
function highlightStep(step) {
  const stepsElems = document.querySelectorAll("#sequencer-grid .step");
  stepsElems.forEach(s => {
    s.classList.remove("playing");
  });
  const playingSteps = document.querySelectorAll(`#sequencer-grid .step[data-step='${step}']`);
  playingSteps.forEach(s => s.classList.add("playing"));
}

// Play/Stop buttons logic

function startPlayback() {
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  if(isPlaying) return;
  isPlaying = true;
  currentStep = 0;

  const intervalMs = (60 / bpmInput.value) * 1000 / 4;

  intervalId = setInterval(playbackLoop, intervalMs);
}

function stopPlayback() {
  if(!isPlaying) return;
  isPlaying = false;
  currentStep = 0;
  clearInterval(intervalId);
  highlightStep(-1);
}

// === Export WAV logic ===

function exportWAV() {
  alert("Exporting WAV is experimental and may take a moment.");

  // Simple offline rendering for 4 bars (stepsCount * 4)
  const offlineCtx = new OfflineAudioContext(2, ctx.sampleRate * 4 * (60/bpmInput.value) * 4, ctx.sampleRate);

  // Schedule playback into offline context
  const offlineInstruments = instruments;
  const offlineVolumes = volumes;
  const offlinePianoNotes = pianoNotes;

  const renderSteps = stepsCount * 4;
  const stepDuration = (60 / bpmInput.value) / 4;

  for(let barStep=0; barStep < renderSteps; barStep++) {
    const time = barStep * stepDuration;

    // Step Sequencer
    for(let i=0; i < offlineInstruments.length; i++) {
      if(sequence[i][barStep % stepsCount]) {
        const vol = offlineVolumes[i];
        switch(offlineInstruments[i].type) {
          case "kick": playKickOffline(offlineCtx, time, vol); break;
          case "snare": playSnareOffline(offlineCtx, time, vol); break;
          case "hihat": playHiHatOffline(offlineCtx, time, vol); break;
        }
      }
    }

    // Piano Roll
    for(const note of offlinePianoNotes) {
      if(note.step === (barStep % stepsCount)) {
        const freqBase = 261.63; // C4
        const semitoneRatio = Math.pow(2, 1/12);
        const freq = freqBase * Math.pow(semitoneRatio, notesCount - note.noteIndex - 1);
        playSynthNoteOffline(offlineCtx, time, freq, offlineVolumes[3]);
      }
    }
  }

  offlineCtx.startRendering().then(buffer => {
    const wavBlob = bufferToWave(buffer, buffer.length);
    const url = URL.createObjectURL(wavBlob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "fl_web_studio_export.wav";
    a.click();
    URL.revokeObjectURL(url);
  });
}

// Offline versions of sounds (same logic, but using offlineCtx)
function playKickOffline(offlineCtx, time, vol) {
  const osc = offlineCtx.createOscillator();
  const gain = offlineCtx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(0.001, time + 0.2);

  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

  osc.connect(gain).connect(offlineCtx.destination);
  osc.start(time);
  osc.stop(time + 0.2);
}

function playSnareOffline(offlineCtx, time, vol) {
  const noiseBuffer = offlineCtx.createBuffer(1, offlineCtx.sampleRate * 0.2, offlineCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseBuffer.length; i++) {
    output[i] = (Math.random() * 2 - 1) * vol;
  }

  const noise = offlineCtx.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseGain = offlineCtx.createGain();
  noiseGain.gain.setValueAtTime(vol, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

  const bandpass = offlineCtx.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(1000, time);

  noise.connect(bandpass).connect(noiseGain).connect(offlineCtx.destination);
  noise.start(time);
  noise.stop(time + 0.2);
}

function playHiHatOffline(offlineCtx, time, vol) {
  const noiseBuffer = offlineCtx.createBuffer(1, offlineCtx.sampleRate * 0.05, offlineCtx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseBuffer.length; i++) {
    output[i] = (Math.random() * 2 - 1) * vol;
  }

  const noise = offlineCtx.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseGain = offlineCtx.createGain();
  noiseGain.gain.setValueAtTime(vol * 0.5, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

  const highpass = offlineCtx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(7000, time);

  noise.connect(highpass).connect(noiseGain).connect(offlineCtx.destination);
  noise.start(time);
  noise.stop(time + 0.05);
}

function playSynthNoteOffline(offlineCtx, time, freq, vol) {
  const osc = offlineCtx.createOscillator();
  const gain = offlineCtx.createGain();
  const delay = offlineCtx.createDelay(0.5);
  const feedback = offlineCtx.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(0, time);

  gain.gain.linearRampToValueAtTime(vol, time + 0.01);
  gain.gain.linearRampToValueAtTime(vol * 0.3, time + 0.2);
  gain.gain.setTargetAtTime(0, time + 0.5, 0.3);

  feedback.gain.value = 0.4;
  delay.delayTime.value = 0.25;

  osc.connect(gain).connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(offlineCtx.destination);

  osc.start(time);
  osc.stop(time + 1);
}

// Utility: Convert AudioBuffer to WAV Blob
function bufferToWave(abuffer, len) {
  const numOfChan = abuffer.numberOfChannels,
    length = len * numOfChan * 2 + 44,
    buffer = new ArrayBuffer(length),
    view = new DataView(buffer),
    channels = [],
    sampleRate = abuffer.sampleRate;

  let offset = 0;
  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, length - 8, true);
  writeString(view, 8, "WAVE");
  // fmt subchunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numOfChan, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2 * numOfChan, true); // ByteRate
  view.setUint16(32, numOfChan * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  // data subchunk
  writeString(view, 36, "data");
  view.setUint32(40, length - 44, true);

  // Write interleaved data
  for (let i = 0; i < numOfChan; i++) {
    channels.push(abuffer.getChannelData(i));
  }

  let pos = 44;
  for (let i = 0; i < len; i++) {
    for (let channel = 0; channel < numOfChan; channel++) {
      let sample = Math.max(-1, Math.min(1, channels[channel][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// === Project Save/Load ===

function saveProject() {
  const project = {
    bpm: bpmInput.value,
    sequence,
    pianoNotes,
    volumes,
  };
  const json = JSON.stringify(project);
  const blob = new Blob([json], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fl_web_studio_project.json";
  a.click();
  URL.revokeObjectURL(url);
}

function loadProject(json) {
  try {
    const project = JSON.parse(json);
    bpmInput.value = project.bpm || 120;
    if(project.sequence && Array.isArray(project.sequence)) {
      sequence = project.sequence;
    }
    if(project.pianoNotes && Array.isArray(project.pianoNotes)) {
      pianoNotes = project.pianoNotes;
    }
    if(project.volumes && Array.isArray(project.volumes)) {
      volumes = project.volumes;
    }
    drawPianoRoll();
    buildMixer();
    updateSequencerUI();
  } catch(e) {
    alert("Error loading project: " + e.message);
  }
}

function updateSequencerUI() {
  const stepsElems = document.querySelectorAll("#sequencer-grid .step");
  stepsElems.forEach(elem => {
    const i = parseInt(elem.dataset.inst);
    const s = parseInt(elem.dataset.step);
    if(sequence[i][s]) {
      elem.classList.add("active");
    } else {
      elem.classList.remove("active");
    }
  });
}

// === Init ===

initSequence();
initVolumes();
buildSequencerGrid();
buildMixer();
drawPianoRoll();

playBtn.addEventListener("click", () => startPlayback());
stopBtn.addEventListener("click", () => stopPlayback());
bpmInput.addEventListener("change", () => {
  if(isPlaying) {
    stopPlayback();
    startPlayback();
  }
});

exportBtn.addEventListener("click", () => exportWAV());
saveBtn.addEventListener("click", () => saveProject());
loadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    loadProject(reader.result);
  };
  reader.readAsText(file);
  fileInput.value = "";
});
