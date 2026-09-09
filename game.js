/* MWP Casino — Pump
 * A Stake-style balloon pump game.
 * Each pump multiplies your bet but carries a pop risk. Cash out before it bursts.
 * Multiplier curve derived from cumulative survival probability minus a house edge,
 * so expected value stays consistent across difficulties.
 */
(() => {
  "use strict";

  const HOUSE_EDGE = 0.99; // 1% edge baked into every step's fair multiplier

  // Per-pump pop probability. Higher risk => steeper reward.
  const DIFFICULTY = {
    easy:   { pop: 0.03, label: "Easy" },
    medium: { pop: 0.08, label: "Medium" },
    hard:   { pop: 0.16, label: "Hard" },
    expert: { pop: 0.28, label: "Expert" },
  };

  const MAX_PUMPS = 25;

  const state = {
    balance: 1000,
    bet: 10,
    diff: "medium",
    playing: false,
    pumps: 0,
    multiplier: 1,
  };

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const el = {
    balance: $("balance"),
    balanceWrap: $("balanceWrap"),
    multiValue: $("multiValue"),
    multiLabel: $("multiLabel"),
    balloon: $("balloon"),
    balloonFace: $("balloonFace"),
    arena: $("arena"),
    particles: $("particles"),
    popFlash: $("popFlash"),
    potValue: $("potValue"),
    betInput: $("betInput"),
    difficulty: $("difficulty"),
    pumpBtn: $("pumpBtn"),
    cashBtn: $("cashBtn"),
    nextMulti: $("nextMulti"),
    popChance: $("popChance"),
    pumpCount: $("pumpCount"),
    historyTrack: $("historyTrack"),
    toast: $("toast"),
  };

  // ---- Math ----
  // Fair multiplier after n survived pumps = edge / survivalProbability(n).
  const survival = (pop, n) => Math.pow(1 - pop, n);
  const multiplierAfter = (pop, n) =>
    n === 0 ? 1 : HOUSE_EDGE / survival(pop, n);

  const fmt = (v) =>
    v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Cryptographically-seeded fairness where available.
  const rand = () => {
    if (window.crypto && crypto.getRandomValues) {
      const u = new Uint32Array(1);
      crypto.getRandomValues(u);
      return u[0] / 0xffffffff;
    }
    return Math.random();
  };

  // ---- Rendering ----
  function renderBalance() {
    el.balance.textContent = fmt(state.balance);
  }

  function bumpBalance() {
    el.balanceWrap.classList.add("bump");
    setTimeout(() => el.balanceWrap.classList.remove("bump"), 200);
  }

  function renderStats() {
    const pop = DIFFICULTY[state.diff].pop;
    el.pumpCount.textContent = state.pumps;
    el.popChance.textContent = (pop * 100).toFixed(0) + "%";
    if (state.playing) {
      const next = multiplierAfter(pop, state.pumps + 1);
      el.nextMulti.textContent = next.toFixed(2) + "×";
    } else {
      el.nextMulti.textContent = multiplierAfter(pop, 1).toFixed(2) + "×";
    }
  }

  function renderMultiplier(tick) {
    el.multiValue.textContent = state.multiplier.toFixed(2) + "×";
    if (tick) {
      el.multiValue.classList.remove("tick");
      void el.multiValue.offsetWidth; // reflow to restart animation
      el.multiValue.classList.add("tick");
    }
    el.potValue.textContent = fmt(state.bet * state.multiplier);
  }

  function scaleBalloon() {
    // Grow from 0.5 up to ~1.35 across the pump range.
    const t = Math.min(state.pumps / MAX_PUMPS, 1);
    const scale = 0.5 + t * 0.9;
    el.balloon.style.transform = `scale(${scale.toFixed(3)})`;
    el.balloon.classList.remove("wobble");
    void el.balloon.offsetWidth;
    el.balloon.classList.add("wobble");
    // Nervous face as risk climbs.
    el.balloonFace.textContent = t > 0.66 ? "≧д≦" : t > 0.33 ? "◉_◉" : "◕‿◕";
  }

  function resetBalloon() {
    el.balloon.classList.remove("hidden", "wobble");
    el.balloon.style.transform = "scale(0.5)";
    el.balloonFace.textContent = "◕‿◕";
  }

  function popBalloon() {
    el.popFlash.classList.remove("fire");
    void el.popFlash.offsetWidth;
    el.popFlash.classList.add("fire");
    el.balloon.classList.add("hidden");
    spawnShards();
    if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
  }

  function spawnShards() {
    const cx = el.arena.clientWidth / 2;
    const cy = el.arena.clientHeight / 2;
    for (let i = 0; i < 16; i++) {
      const s = document.createElement("div");
      s.className = "shard";
      s.style.left = cx + "px";
      s.style.top = cy + "px";
      el.particles.appendChild(s);
      const angle = (Math.PI * 2 * i) / 16 + rand() * 0.4;
      const dist = 80 + rand() * 90;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      s.animate(
        [
          { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) rotate(${rand() * 540}deg)`, opacity: 0 },
        ],
        { duration: 520 + rand() * 200, easing: "cubic-bezier(.2,.6,.3,1)" }
      ).onfinish = () => s.remove();
    }
  }

  function addHistory(win, value) {
    const chip = document.createElement("div");
    chip.className = "chip " + (win ? "win" : "loss");
    chip.textContent = win ? value.toFixed(2) + "×" : "POP";
    el.historyTrack.prepend(chip);
    while (el.historyTrack.children.length > 20) {
      el.historyTrack.lastChild.remove();
    }
  }

  let toastTimer;
  function toast(msg, kind) {
    el.toast.textContent = msg;
    el.toast.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.toast.className = "toast"), 1800);
  }

  // ---- Controls state ----
  function setControls() {
    el.pumpBtn.disabled = false;
    el.pumpBtn.textContent = state.playing ? "PUMP" : "PUMP";
    el.cashBtn.disabled = !state.playing || state.pumps === 0;
    el.betInput.disabled = state.playing;
    el.difficulty.disabled = state.playing;
    document.querySelectorAll(".step-btn").forEach((b) => (b.disabled = state.playing));
  }

  function readBet() {
    let v = parseFloat(el.betInput.value);
    if (!isFinite(v) || v <= 0) v = 1;
    v = Math.min(v, state.balance);
    v = Math.round(v * 100) / 100;
    state.bet = v;
    el.betInput.value = fmt(v);
    el.potValue.textContent = fmt(v);
    return v;
  }

  // ---- Game flow ----
  function startRound() {
    readBet();
    if (state.bet > state.balance) return toast("Not enough balance", "loss");
    if (state.bet <= 0) return toast("Enter a bet", "loss");

    state.balance -= state.bet;
    state.playing = true;
    state.pumps = 0;
    state.multiplier = 1;
    state.diff = el.difficulty.value;

    renderBalance();
    resetBalloon();
    renderMultiplier(false);
    renderStats();
    el.multiValue.classList.remove("lose");
    el.multiLabel.textContent = "Pump to grow — cash out anytime";
    setControls();
    pump(); // first pump is the commit
  }

  function pump() {
    if (!state.playing) return startRound();

    const pop = DIFFICULTY[state.diff].pop;

    if (rand() < pop) {
      // Burst.
      state.playing = false;
      popBalloon();
      el.multiValue.textContent = "0.00×";
      el.multiValue.classList.add("lose");
      el.multiLabel.textContent = "Burst! Better luck next pump";
      addHistory(false, 0);
      toast(`Popped at ${state.multiplier.toFixed(2)}× — lost ${fmt(state.bet)}`, "loss");
      state.pumps = 0;
      state.multiplier = 1;
      setControls();
      renderStats();
      return;
    }

    state.pumps++;
    state.multiplier = multiplierAfter(pop, state.pumps);
    scaleBalloon();
    renderMultiplier(true);
    renderStats();
    if (navigator.vibrate) navigator.vibrate(12);

    if (state.pumps >= MAX_PUMPS) {
      cashOut(true);
      return;
    }
    setControls();
  }

  function cashOut(auto) {
    if (!state.playing || state.pumps === 0) return;
    const won = state.bet * state.multiplier;
    state.balance += won;
    state.playing = false;
    renderBalance();
    bumpBalance();
    addHistory(true, state.multiplier);
    el.multiLabel.textContent = auto ? "Max pumps — auto cashed out!" : "Cashed out!";
    toast(`Cashed out ${state.multiplier.toFixed(2)}× — won ${fmt(won)}`, "win");
    state.pumps = 0;
    state.multiplier = 1;
    setControls();
    renderStats();
  }

  // ---- Wiring ----
  el.pumpBtn.addEventListener("click", pump);
  el.cashBtn.addEventListener("click", () => cashOut(false));

  el.betInput.addEventListener("change", readBet);
  el.betInput.addEventListener("blur", readBet);

  el.difficulty.addEventListener("change", () => {
    state.diff = el.difficulty.value;
    renderStats();
  });

  document.querySelectorAll(".step-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      let v = parseFloat(el.betInput.value) || 0;
      v = btn.dataset.bet === "double" ? v * 2 : v / 2;
      v = Math.max(0.01, Math.min(v, state.balance));
      el.betInput.value = fmt(Math.round(v * 100) / 100);
      readBet();
    });
  });

  // Keyboard: space = pump, enter = cash out (desktop convenience)
  window.addEventListener("keydown", (e) => {
    if (e.target === el.betInput) return;
    if (e.code === "Space") { e.preventDefault(); pump(); }
    if (e.code === "Enter") { e.preventDefault(); cashOut(false); }
  });

  // ---- Init ----
  renderBalance();
  readBet();
  renderStats();
  renderMultiplier(false);
})();
