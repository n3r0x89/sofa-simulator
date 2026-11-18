const BANKS = {
  gulp: ["gulp1.mp3","gulp2.mp3","gulp3.mp3","gulp4.mp3","gulp5.mp3"],
  burp: ["burp1.mp3","burp2.mp3","burp3.mp3","burp4.mp3"],
  clink: ["clink1.mp3","clink2.mp3","clink3.mp3"],
  fart: ["fart1.mp3","fart2.mp3","fart3.mp3","fart4.mp3","fart5.mp3","fart6.mp3","fart7.mp3"],
  cough: ["cough1.mp3","cough2.mp3"],
  retch: ["retch1.mp3","retch2.mp3","retch3.mp3"],
  puff: ["puff1.mp3","puff2.mp3"],
  plop: ["plop1.mp3","plop2.mp3"],
  knock: ["knock1.mp3"],
  lighter: ["lighter1.mp3"],
  smash: ["smash1.mp3","smash2.mp3","smash3.mp3","smash4.mp3"],
  bell: ["bell1.mp3"]
};
let enabled = localStorage.getItem("sofasim_v3_sound") !== "off";
let unlocked = false;
let last = {};
const pools = new Map();
function unlock() {
  if (unlocked) return;
  unlocked = true;
}
function choose(bank) {
  const list = BANKS[bank];
  if (!list) return null;
  let pool = pools.get(bank) || [];
  if (!pool.length) {
    pool = list.map((_, i) => i).sort(() => Math.random() - .5);
    if (pool.length > 1 && pool[0] === last[bank]) pool.push(pool.shift());
  }
  const index = pool.shift();
  pools.set(bank, pool);
  last[bank] = index;
  return list[index];
}
export function soundEnabled() { return enabled; }
export function toggleSound() {
  enabled = !enabled;
  localStorage.setItem("sofasim_v3_sound", enabled ? "on" : "off");
  return enabled;
}
export function playSound(bank, volume = 0.78) {
  if (!enabled || !unlocked || !BANKS[bank]) return;
  const file = choose(bank);
  if (!file) return;
  const audio = new Audio("./assets/audio/" + file);
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.preload = "auto";
  audio.play().catch(() => {});
}
export function unlockAudio() { unlock(); }
