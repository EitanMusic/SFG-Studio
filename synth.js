const ctx = new (window.AudioContext || window.webkitAudioContext)();

function playDrum(type) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  if (type === "Kick") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  } else if (type === "Snare") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(100, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
  } else if (type === "HiHat") {
    osc.type = "square";
    osc.frequency.setValueAtTime(6000, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
  }

  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}
