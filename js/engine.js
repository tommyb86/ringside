/* Ringside — fight engine.
 *
 * Simulates a bout in 3-second "moments" (60 per 3-minute round). Each moment:
 *   1. range battle   - footwork / IQ / speed decide whose preferred distance the fight is at,
 *                       and pressure pushes the other fighter toward the ropes
 *   2. exchanges      - each fighter may throw a combination; misses invite counters
 *   3. damage         - landed shots reduce head / body condition, build "stun",
 *                       which can turn into a hurt state, knockdown or stoppage
 * Between rounds fighters recover part of their condition, corners/doctors may stop it,
 * and three judges with different scoring tendencies score each round 10-point-must.
 *
 * Deterministic for a given seed. Runs in the browser or in Node (globalThis.BX).
 */
(function (root) {
  const BX = (root.BX = root.BX || {});

  // ── helpers ─────────────────────────────────────────────────────
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const TICK = 3;
  const TICKS = 60;
  const HEAD_K = +(globalThis.HEAD_K || 0.24);
  const STUN_T = +(globalThis.STUN_T || 20);
  const PERFECT = +(globalThis.PERFECT || 0.004);
  const LOGSIG = +(globalThis.LOGSIG || 0.5);
  const CHIN_X = +(globalThis.CHIN_X || 0.9);
  const CHIN_T = +(globalThis.CHIN_T || 0.9);
  const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  BX.fmtClock = fmtClock;

  // ── weight ──────────────────────────────────────────────────────
  const divIndex = (key) => BX.DIVISIONS.findIndex((d) => d.key === key);
  BX.divIndex = divIndex;
  const naturalLbs = (f) => f.lbs || Math.round(BX.divByKey(f.div).lb * 1.08);
  BX.naturalLbs = naturalLbs;
  BX.defaultDivision = (a, b) => (divIndex(a.div) <= divIndex(b.div) ? a.div : b.div);

  /** Weigh-in and fight-night weight for fighter f competing at division divKey. */
  BX.fightNight = function (f, divKey) {
    const nat = naturalLbs(f);
    const d = BX.divByKey(divKey);
    if (!d.lb) {
      const lbs = f.div === 'HW' ? nat : Math.round(nat * 1.06);
      return { weighIn: f.div === 'HW' ? Math.round(nat * 0.98) : Math.round(lbs * 0.97), lbs, drain: 0, up: lbs / nat - 1 };
    }
    const cap = d.lb * 1.08;
    if (nat > cap + 0.5) {
      return { weighIn: d.lb, lbs: Math.round(cap), drain: Math.min(0.22, (nat - cap) / nat), up: 0 };
    }
    const lbs = Math.round(nat + Math.min((cap - nat) * 0.5, nat * 0.1));
    return { weighIn: Math.min(d.lb, Math.round(lbs / 1.06)), lbs, drain: 0, up: lbs / nat - 1 };
  };

  // ── fighter model ──────────────────────────────────────────────
  const PREF = { boxer: 2.75, 'boxer-puncher': 2.15, counter: 2.25, slugger: 1.55, swarmer: 0.95 };
  const BODY_PREF = { swarmer: 0.38, slugger: 0.26, 'boxer-puncher': 0.24, counter: 0.2, boxer: 0.15 };
  const PUNCH = {
    jab: { base: 0.27, dmg: 0.95, cost: 0.1 },
    cross: { base: 0.3, dmg: 3.0, cost: 0.3 },
    hook: { base: 0.27, dmg: 3.2, cost: 0.32 },
    upper: { base: 0.24, dmg: 3.4, cost: 0.34 },
  };
  const BAND_WEIGHTS = {
    long: { jab: 72, cross: 22, hook: 5, upper: 1 },
    mid: { jab: 38, cross: 30, hook: 22, upper: 10 },
    inside: { jab: 10, cross: 22, hook: 40, upper: 28 },
    clinch: { jab: 0, cross: 12, hook: 48, upper: 40 },
  };

  // Corner instructions. `call` is what the commentary reports; the rest tweak the fight model.
  const TACTICS = {
    auto: { label: 'Fight your fight', call: 'fight your fight', rate: 1, ctrl: 0, def: 0, pow: 0, body: 0, jab: 1, power: 1, cost: 1, counter: 0, flush: 0 },
    body: { label: 'Go to the body', call: '"Go to the body! Kill the body and the head will fall!"', rate: 1.05, rangeShift: -0.4, ctrl: 0, def: -2, pow: 0, body: 0.28, jab: 0.8, power: 1.1, cost: 1.05, counter: 0, flush: 0 },
    pressure: { label: 'Turn up the pressure', call: '"Walk them down! Cut off the ring, make it ugly!"', rate: 1.22, rangeMax: 1.0, ctrl: 7, def: -4, pow: 0, body: 0.08, jab: 0.7, power: 1.15, cost: 1.18, counter: 0, flush: 0 },
    box: { label: 'Box and move', call: '"Stick and move! Jab, jab, and get out of there."', rate: 0.95, rangeMin: 2.8, ctrl: 5, def: 5, pow: -2, body: -0.05, jab: 1.9, power: 0.8, cost: 0.95, counter: 0.05, flush: 0 },
    counter: { label: 'Make them miss', call: '"Let them come to you. Make them miss and make them pay."', rate: 0.72, ctrl: 2, def: 7, pow: 0, body: 0, jab: 1, power: 1, cost: 0.85, counter: 0.22, flush: 0.02 },
    survive: { label: 'Survive the round', call: '"Hold, move, tie up. Just get through this round!"', rate: 0.5, survive: true, ctrl: 3, def: 9, pow: -4, body: 0, jab: 1.6, power: 0.6, cost: 0.75, counter: 0.04, flush: 0 },
    ko: { label: 'Go for the knockout', call: '"Forget the cards — you need the knockout. Let your hands go!"', rate: 1.18, rangeMax: 1.6, ctrl: 3, def: -9, pow: 5, body: -0.05, jab: 0.4, power: 1.45, cost: 1.32, counter: 0, flush: 0.03 },
  };
  BX.TACTICS = TACTICS;
  const NO_TAC = TACTICS.auto;

  const newStats = () => ({ th: 0, la: 0, jth: 0, jla: 0, pth: 0, pla: 0, body: 0, dmg: 0, kd: 0 });

  /** Years past prime as of 2026, for "current form" sims: prime is taken as the era decade's 7th year. */
  const TODAY = new Date('2026-11-14');
  /** Age in whole years today, or null when the birth date is unknown. */
  BX.age = (f) => {
    if (!f.born) return null;
    const b = new Date(f.born.length === 4 ? f.born + '-07-01' : f.born);
    return Math.floor((TODAY - b) / (365.25 * 864e5));
  };
  /** Years of decline for "current form": past 33 by age, or past the prime decade when the age is unknown. */
  BX.yearsPastPrime = (f) => {
    const age = BX.age(f);
    if (age != null) return Math.max(0, age - 33);
    return Math.max(0, 2026 - (parseInt(f.era, 10) + 7));
  };
  const DECLINE = { spd: 0.9, foot: 0.9, chin: 0.8, sta: 0.8, work: 0.8, def: 0.5, acc: 0.3, pow: 0.4, heart: 0.3, iq: 0 };

  function makeCorner(f, divKey, side, current) {
    const fn = BX.fightNight(f, divKey);
    const a = Object.assign({}, f.attr);
    if (current) {
      // decline accelerates with age: gentle through the late 30s, steep past ~45, never below 15% of prime
      const yrs = BX.yearsPastPrime(f);
      const d = yrs + 0.05 * yrs * yrs;
      for (const k in DECLINE) a[k] *= Math.max(0.15, 1 - (DECLINE[k] * d) / 100);
      if (yrs > 15) a.iq *= Math.max(0.4, 1 - (yrs - 15) * 0.03); // even ring IQ can't cash cheques the body can't
    }
    if (fn.drain > 0.005) {
      a.sta *= 1 - fn.drain * 2.2;
      a.chin *= 1 - fn.drain * 1.5;
      a.heart *= 1 - fn.drain * 0.8;
      a.pow *= 1 - fn.drain * 0.5;
    }
    if (fn.up > 0.02) a.pow *= 1 - fn.up * 0.6;
    if (fn.up > 0.06) { a.spd *= 1 - (fn.up - 0.06) * 0.4; a.foot *= 1 - (fn.up - 0.06) * 0.3; }
    // an aged fighter starts the fight with less in the tank (and a lower ceiling), not just a lower rating
    const tank = current ? Math.round(100 * Math.max(0.25, a.sta / f.attr.sta)) : 100;
    return {
      f, side, a, name: f.short, lbs: fn.lbs, weighIn: fn.weighIn, drain: fn.drain,
      head: 100, headMax: 100, body: 100, stam: tank, stamMax: tank,
      stun: 0, hurt: 0, punish: 0, down: false,
      cut: 0, cutAccidental: false, cutEye: null,
      kd: 0, kdRound: 0, warnings: 0, deduct: {},
      tot: newStats(), rs: null, rounds: [],
    };
  }

  function eff(s, k) {
    let v = s.a[k];
    if (s.tac) { if (k === 'def') v += s.tac.def; else if (k === 'pow') v += s.tac.pow; }
    const fat = s.stam / 100;
    const hp = s.head / 100;
    if (k === 'spd' || k === 'acc' || k === 'foot') v *= (0.72 + 0.28 * fat) * (0.86 + 0.14 * hp);
    else if (k === 'def') v *= (0.7 + 0.3 * fat) * (0.82 + 0.18 * hp) * (s.cut > 5 ? 0.95 : 1);
    else if (k === 'pow') v *= 0.84 + 0.16 * fat;
    else if (k === 'work') v *= 0.55 + 0.45 * fat;
    if (s.hurt > 0) {
      if (k === 'def') v *= 0.62;
      else if (k === 'foot') v *= 0.6;
      else if (k === 'spd' || k === 'acc') v *= 0.85;
    }
    return v;
  }

  // ── commentary vocabulary ──────────────────────────────────────
  function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

  function punchName(rand, s, type, target) {
    const lead = s.f.stance === 'S' ? 'right' : 'left';
    const rear = s.f.stance === 'S' ? 'left' : 'right';
    if (type === 'jab') return target === 'body' ? pick(rand, ['jab to the body', 'jab downstairs']) : pick(rand, ['jab', 'stiff jab', 'sharp jab', 'snapping jab', 'double jab']);
    if (type === 'cross') {
      if (target === 'body') return pick(rand, [`${rear} hand to the body`, `straight ${rear} to the stomach`]);
      return pick(rand, [`straight ${rear}`, `${rear} hand`, `overhand ${rear}`, `chopping ${rear}`, `${rear} cross`]);
    }
    if (type === 'hook') {
      if (target === 'body') return pick(rand, lead === 'left' ? ['left hook to the liver', 'left hook to the body', 'digging left hook to the ribs'] : ['right hook to the body', 'right hook to the ribs', 'digging right hook downstairs']);
      return pick(rand, [`${lead} hook`, `looping ${lead} hook`, `short ${lead} hook`, `${lead} hook`, `${rear} hook`]);
    }
    if (target === 'body') return pick(rand, [`${rear} uppercut to the body`, `${lead} uppercut to the solar plexus`]);
    return pick(rand, [`${rear} uppercut`, `${lead} uppercut`, `short ${rear} uppercut`]);
  }

  const JUDGE_POOL = ['Dave Moretti', 'Glenn Feldman', 'Steve Weisfeld', 'Max DeLuca', 'Tim Cheatham', 'Benoit Roussel', 'Pawel Kardyni', 'Carlos Sucre', 'Ellis Johnson', 'Mike Fitzgerald', 'Nobuaki Uratani', 'Adalaide Byrd'];
  const REFEREES = ['Harvey Dock', 'Mark Nelson', 'Kenny Bayless', 'Thomas Taylor', 'Michael Alexander', 'Steve Gray', 'Ricky Gonzalez', 'Luis Pabon', 'Victor Loughlin', 'Jerry Cantu'];
  // Judge/referee names are fictional labels chosen to sound like a broadcast; surnames are scrambled
  // on purpose so they don't map to real officials.
  for (let i = 0; i < JUDGE_POOL.length; i++) JUDGE_POOL[i] = JUDGE_POOL[i].split(' ')[0] + ' ' + ['Harlow', 'Brennan', 'Okafor', 'Lindqvist', 'Castell', 'Yamada', 'Ferreira', 'Doyle', 'Sato', 'Whitfield', 'Marquez', 'Novak'][i];
  for (let i = 0; i < REFEREES.length; i++) REFEREES[i] = REFEREES[i].split(' ')[0] + ' ' + ['Rourke', 'Daley', 'Vance', 'Holloway', 'Pryce', 'Ashby', 'Tellez', 'Mercer', 'Quinlan', 'Barros'][i];

  // ── simulation ─────────────────────────────────────────────────
  /**
   * opts: { a, b, div, rounds, seed, quick }
   * returns { A, B, result, judges, frames, rounds, referee, ... }
   */
  BX.createFight = function (opts) {
    const seed = (opts.seed >>> 0) || 1;
    const rand = mulberry32(seed);
    const gauss = () => {
      let u = 0;
      while (!u) u = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
    };
    const quick = !!opts.quick;
    const nRounds = opts.rounds || 12;
    const div = opts.div || BX.defaultDivision(opts.a, opts.b);

    const A = makeCorner(opts.a, div, 'A', opts.current);
    const B = makeCorner(opts.b, div, 'B', opts.current);
    A.opp = B; B.opp = A;
    // brothers / namesakes: "Charlo lands on Charlo" is unreadable, so fall back to full names
    if (A.name === B.name) { A.name = A.f.name.replace(/\s*\(.*\)$/, ''); B.name = B.f.name.replace(/\s*\(.*\)$/, ''); }
    // night-to-night form: nobody fights at exactly their rating every time
    for (const s of [A, B]) {
      s.form = gauss() * 3.5;
      for (const k of ['pow', 'spd', 'acc', 'def', 'foot', 'iq', 'work']) s.a[k] += s.form;
    }
    const effLbs = (l) => (l > 200 ? 200 + (l - 200) * 0.3 : l);
    const size = { A: Math.pow(effLbs(A.lbs) / effLbs(B.lbs), 1.0), B: Math.pow(effLbs(B.lbs) / effLbs(A.lbs), 1.0) };
    const divPow = 1 + (0.16 * (16 - divIndex(div))) / 16;
    const oppStance = A.f.stance !== B.f.stance;

    const pool = JUDGE_POOL.slice();
    const judges = [0, 1, 2].map(() => {
      const name = pool.splice(Math.floor(rand() * pool.length), 1)[0];
      return {
        name,
        wDmg: 0.85 + rand() * 0.45, wCnt: 0.25 + rand() * 0.45, wAgg: 0.05 + rand() * 0.35,
        wDef: rand() * 0.25, noise: 0.06 + rand() * 0.1, cards: [],
      };
    });
    const referee = pick(rand, REFEREES);

    const frames = [];
    let frame = null;
    let dist = 3.0, pos = 0, clinchTicks = 0;
    let result = null;
    let round = 1, tick = 0, extraSecs = 0;
    let quietTicks = 0;
    const recentTactical = [];

    const sec = () => Math.min(179, tick * TICK + extraSecs);
    const say = (kind, text, side) => { if (!quick && frame) frame.say.push({ kind, text, side: side || null, r: round, clock: fmtClock(sec()) }); };
    const bandOf = (d) => (d < 0.45 ? 'clinch' : d < 1.4 ? 'inside' : d < 2.3 ? 'mid' : 'long');
    const onRopes = (s) => (s === A ? pos < -0.78 : pos > 0.78);

    function snapshot(s) {
      return {
        head: Math.round(s.head), headMax: Math.round(s.headMax), stam: Math.round(s.stam), body: Math.round(s.body),
        hurt: s.hurt > 0, down: s.down, cut: Math.round(s.cut), kd: s.kd,
        th: s.tot.th, la: s.tot.la, pth: s.tot.pth, pla: s.tot.pla, jth: s.tot.jth, jla: s.tot.jla,
      };
    }
    function newFrame(type) {
      if (quick) { frame = null; return; }
      frame = { type, r: round, sec: sec(), dist, pos, band: bandOf(dist), acts: [], say: [], ev: [] };
      frames.push(frame);
    }
    function closeFrame() {
      if (!frame) return;
      frame.A = snapshot(A); frame.B = snapshot(B); frame.dist = dist; frame.pos = pos; frame.band = bandOf(dist);
    }

    function finish(winner, method, detail) {
      result = { winner: winner ? winner.side : null, method, round, clock: fmtClock(sec()), detail: detail || '' };
    }

    // ── range battle ──
    function prefRange(s) {
      let p = PREF[s.f.style];
      p += clamp((s.f.reach - s.opp.f.reach) / 30, -0.35, 0.35);
      const t = s.tac || NO_TAC;
      if (t.rangeShift) p += t.rangeShift;
      if (t.rangeMax !== undefined) p = Math.min(p, t.rangeMax);
      if (t.rangeMin !== undefined) p = Math.max(p, t.rangeMin);
      if (t.survive) p = eff(s, 'foot') > 72 ? 3.1 : 0.2;
      if (s.opp.hurt > 0 && !t.survive) p = Math.min(p, 1.0);
      if (s.hurt > 0) p = eff(s, 'foot') > 72 ? 3.1 : 0.15;
      return clamp(p, 0, 3.2);
    }
    function ctrlScore(s) {
      return eff(s, 'foot') * 0.55 + eff(s, 'iq') * 0.25 + eff(s, 'spd') * 0.2 + (s.f.style === 'swarmer' ? 4 : 0) + (s.tac || NO_TAC).ctrl + gauss() * 10;
    }
    function rangeBattle() {
      const pA = prefRange(A), pB = prefRange(B);
      const cA = ctrlScore(A), cB = ctrlScore(B);
      const win = cA >= cB ? A : B;
      const lose = win.opp;
      const margin = Math.abs(cA - cB);
      const pw = win === A ? pA : pB, pl = win === A ? pB : pA;
      const w = 0.5 + Math.min(0.45, margin / 35);
      const target = pw * w + pl * (1 - w);
      dist = clamp(dist + (target - dist) * 0.55 + gauss() * 0.22, 0, 3.2);
      if (clinchTicks > 0) { dist = 1.3; clinchTicks = 0; }
      win.rs.ctrl++;
      const presser = pA < pB - 0.3 ? A : pB < pA - 0.3 ? B : null;
      if (presser && win === presser) {
        pos = clamp(pos + (presser === A ? 1 : -1) * (0.12 + margin / 300), -1, 1);
        presser.rs.aggr++;
      } else {
        pos *= 0.82;
      }
      pos = clamp(pos + gauss() * 0.05, -1, 1);
      void lose;
    }

    // ── punching ──
    function throwRate(s, band) {
      const base = { clinch: 0.22, inside: 0.62, mid: 0.58, long: 0.42 }[band];
      let r = base * (eff(s, 'work') / 80);
      const comfort = Math.abs(prefRange(s) - dist);
      if (comfort > 1.0) r *= 0.82;
      if (s.f.style === 'counter') r *= 0.8;
      if (s.opp.hurt > 0) r *= 1.25 + s.a.iq / 300 + s.a.pow / 450;
      if (s.hurt > 0) r *= 0.45;
      r *= (s.tac || NO_TAC).rate;
      return clamp(r, 0.03, 0.95);
    }

    function pickPunch(s, band, prev, counterLead) {
      const w = Object.assign({}, BAND_WEIGHTS[band]);
      if (s.f.style === 'boxer') w.jab *= 1.4;
      if (s.f.style === 'swarmer' || s.f.style === 'slugger') { w.jab *= 0.7; w.hook *= 1.2; }
      if (prev === 'jab') { w.cross *= 2.2; }
      if (prev === 'cross') { w.hook *= 2.0; w.jab *= 0.6; }
      if (prev === 'hook') { w.cross *= 1.5; w.upper *= 1.3; }
      if (counterLead) { w.jab *= 0.3; w.cross *= 1.6; w.hook *= 1.4; }
      const t = s.tac || NO_TAC;
      w.jab *= t.jab; w.cross *= t.power; w.hook *= t.power; w.upper *= t.power;
      let total = 0;
      for (const k in w) total += w[k];
      let x = rand() * total;
      for (const k in w) { x -= w[k]; if (x <= 0) return k; }
      return 'jab';
    }

    function landProb(s, type, target, band, isCounter, idx, prevLanded) {
      const o = s.opp;
      let p = PUNCH[type].base * (target === 'body' ? 1.18 : 1);
      p *= Math.exp((eff(s, 'acc') - eff(o, 'def')) / 60);
      p *= Math.exp((eff(s, 'spd') - eff(o, 'spd')) / 120);
      if (band === 'long') {
        if (type === 'jab' || type === 'cross') p *= Math.exp((s.f.reach - o.f.reach) / 45);
        else p *= 0.6;
      }
      if (oppStance) { if (type === 'jab') p *= 0.88; if (type === 'cross') p *= 1.08; }
      if (isCounter) p *= 1.12 + (s.f.style === 'counter' ? 0.2 : 0) + (eff(s, 'iq') - 80) / 200;
      if (o.hurt > 0) p *= 1.3;
      if (onRopes(o)) p *= 1.12;
      if (idx > 0) p *= prevLanded ? 1.08 : 0.94;
      return clamp(p, 0.04, 0.82);
    }

    function knockdown(s, o, how, detail) {
      // s scored a knockdown on o
      o.kd++; o.kdRound++; o.down = true;
      s.tot.kd++; s.rs.kd++;
      if (frame) frame.ev.push({ type: 'kd', by: s.side, who: o.side });
      say('kd', pick(rand, [
        `DOWN GOES ${o.name.toUpperCase()}! ${how}`,
        `${o.name.toUpperCase()} IS DOWN! ${how}`,
        `KNOCKDOWN! ${how}`,
      ]), s.side);
      const T = stunThreshold(o);
      const over = Math.max(0, (o.stun - T) / T);
      const getUp = clamp(
        0.97 - (1 - o.head / 100) * 0.5 - over * 0.22 - (o.kdRound - 1) * 0.17 + (o.a.heart - 85) / 140 - (o.kd - 1) * 0.04,
        0.04, 0.99,
      );
      extraSecs += 9;
      if (rand() > getUp) {
        say('kd', pick(rand, [
          `${referee} reaches ten — ${o.name} can't beat the count. IT'S ALL OVER!`,
          `${o.name} tries to rise but the legs aren't there. Counted out!`,
          `${o.name} is flat on the canvas. ${referee} waves it off at ten!`,
        ]), s.side);
        if (frame) frame.ev.push({ type: 'ko', by: s.side, who: o.side });
        finish(s, 'KO', detail);
        return;
      }
      const count = 5 + Math.floor(rand() * 4);
      say('info', `${o.name} beats the count at ${count === 8 ? 'eight' : ['five', 'six', 'seven'][count - 5] + ', takes the mandatory eight'}.`, o.side);
      if (frame) frame.ev.push({ type: 'up', who: o.side, count });
      if ((o.head < 22 && rand() < 0.4) || (o.kdRound >= 3 && rand() < 0.65)) {
        say('kd', `${referee} looks into ${o.name}'s eyes... and waves it off! ${s.name} wins by stoppage!`, s.side);
        if (frame) frame.ev.push({ type: 'stop', by: s.side, who: o.side });
        finish(s, 'TKO', detail);
        return;
      }
      o.down = false;
      o.head -= 4;
      o.hurt = 4 + Math.floor(rand() * 4);
      o.stun = T * 0.2;
      o.punish = 0;
      say('info', pick(rand, [
        `${s.name} goes looking for the finish!`,
        `${o.name} is on unsteady legs. Can ${o.name} survive?`,
        `The crowd is on its feet!`,
      ]));
    }

    function stunThreshold(o) {
      return STUN_T * Math.pow(o.a.chin / 85, CHIN_T) * (0.55 + 0.45 * o.head / 100);
    }

    function throwPunch(s, type, target, band, isCounter, idx, prevLanded, log) {
      const o = s.opp;
      const P = PUNCH[type];
      const p = landProb(s, type, target, band, isCounter, idx, prevLanded);
      const landed = rand() < p;
      const res = landed ? 'land' : rand() < 0.55 ? 'block' : 'miss';
      s.tot.th++; s.rs.th++;
      if (type === 'jab') { s.tot.jth++; s.rs.jth++; } else { s.tot.pth++; s.rs.pth++; }
      s.stam = Math.max(5, s.stam - P.cost * (1.7 - s.a.sta / 100) * (landed ? 1 : 1.2) * (s.tac || NO_TAC).cost);
      const act = { by: s.side, type, target, res, counter: isCounter, flush: false, impact: 0 };
      if (frame) frame.acts.push(act);
      if (!landed) { o.rs.forced++; return act; }

      s.tot.la++; s.rs.la++;
      if (type === 'jab') { s.tot.jla++; s.rs.jla++; } else { s.tot.pla++; s.rs.pla++; }
      let dmg = P.dmg * Math.pow(eff(s, 'pow') / 80, 1.8) * size[s.side] * divPow * Math.exp(gauss() * LOGSIG - LOGSIG * LOGSIG / 2);
      const flushChance = (type === 'jab' ? 0.02 : 0.05) + (isCounter ? 0.06 : 0) + (o.hurt > 0 ? 0.05 : 0) + (eff(s, 'acc') - 80) / 800 + (s.tac || NO_TAC).flush;
      if (rand() < flushChance) { dmg *= 1.7 + rand() * 0.6; act.flush = true; }
      if (type !== 'jab' && rand() < PERFECT * Math.pow(eff(s, 'pow') / 80, 5) * (isCounter ? 2 : 1)) { dmg *= 3.2 + rand() * 1.2; act.flush = true; act.perfect = true; }
      s.tot.dmg += dmg; s.rs.dmg += dmg;

      if (target === 'body') {
        s.tot.body++; s.rs.body++;
        o.body = Math.max(0, o.body - dmg * 0.2 * (90 / (o.a.sta + 5)));
        o.stam = Math.max(5, o.stam - dmg * 0.35);
        act.impact = dmg;
        log.push(act);
        if (type !== 'jab' && o.body < 30 && rand() < ((30 - o.body) / 60) * (dmg / 4) * 0.35) {
          knockdown(s, o, `A ${punchName(rand, s, type, 'body')} folds ${o.name} in half!`, punchName(rand, s, type, 'body'));
        }
        return act;
      }

      const impact = dmg * Math.pow(85 / o.a.chin, CHIN_X);
      act.impact = impact;
      o.head = Math.max(0, o.head - impact * HEAD_K);
      o.stun += impact;
      log.push(act);
      if (o.hurt > 0) o.punish += impact;
      s.punish = Math.max(0, s.punish - impact * 1.5);

      // cuts
      if (type !== 'jab' && o.cut === 0 && rand() < 0.0006 * impact) {
        o.cut = 2 + rand() * 2.5; o.cutAccidental = false; o.cutEye = rand() < 0.5 ? 'left' : 'right';
        say('info', `${o.name} is cut over the ${o.cutEye} eye from that ${punchName(rand, s, type, 'head')}!`, s.side);
        if (frame) frame.ev.push({ type: 'cut', who: o.side });
      } else if (o.cut > 0) {
        if (type !== 'jab') o.cut += impact * 0.01;
      }

      // stun -> hurt / knockdown
      const T = stunThreshold(o);
      if (o.stun > T) {
        const over = (o.stun - T) / T;
        const pKD = clamp(0.22 + over * 0.7 + (act.flush ? 0.12 : 0), 0, 0.95);
        if (rand() < pKD) {
          const pn = punchName(rand, s, type, 'head');
          knockdown(s, o, pick(rand, [`A ${pn} sends ${o.name} crashing to the canvas!`, `${s.name} drops ${o.name} with a ${pn}!`, `The ${pn} landed flush and ${o.name} goes down hard!`]), pn);
          return act;
        }
        if (o.hurt <= 0) {
          o.hurt = 3 + Math.floor(rand() * 4);
          o.punish = 0;
          o.stun *= 0.5;
          if (frame) frame.ev.push({ type: 'hurt', who: o.side });
          say('hurt', pick(rand, [
            `${o.name} IS HURT! That ${punchName(rand, s, type, 'head')} buckled the knees!`,
            `${s.name} has ${o.name} in BIG trouble!`,
            `${o.name} is wobbled — holding on, trying to survive!`,
          ]), s.side);
        }
      }
      // referee stoppage on a fighter taking unanswered punishment
      if (o.hurt > 0) {
        const thr = 30 * (o.a.chin / 85) * (0.7 + (0.3 * o.a.heart) / 90);
        if (o.punish > thr && rand() < 0.12 + (o.punish - thr) / thr + (o.kdRound >= 2 ? 0.2 : 0)) {
          say('kd', `${referee} jumps in and STOPS IT! ${o.name} was taking unanswered shots. ${s.name} wins by TKO!`, s.side);
          if (frame) frame.ev.push({ type: 'stop', by: s.side, who: o.side });
          finish(s, 'TKO', punchName(rand, s, type, 'head'));
        }
      }
      if (!result && o.head <= 4) {
        say('kd', `${o.name} has nothing left — the referee waves it off!`, s.side);
        if (frame) frame.ev.push({ type: 'stop', by: s.side, who: o.side });
        finish(s, 'TKO', 'punches');
      }
      return act;
    }

    function combo(s, band, isCounter) {
      const o = s.opp;
      let n = 1;
      if (isCounter) n = rand() < 0.45 ? 2 : 1;
      else {
        const pc = clamp((0.1 + s.a.work / 340 + eff(s, 'spd') / 900) * (0.6 + (0.4 * s.stam) / 100), 0.1, 0.78);
        while (n < 6 && rand() < pc) n++;
      }
      let prev = null, prevLanded = false;
      const out = { n, landed: 0, missed: 0, power: 0, log: [] };
      for (let i = 0; i < n && !result && !o.down; i++) {
        const type = pickPunch(s, band, prev, isCounter && i === 0);
        let target = 'head';
        if (rand() < (type === 'jab' ? 0.1 : BODY_PREF[s.f.style] + (o.body < 60 ? 0.08 : 0) + (s.tac || NO_TAC).body)) target = 'body';
        const act = throwPunch(s, type, target, band, isCounter && i === 0, i, prevLanded, out.log);
        prevLanded = act.res === 'land';
        if (prevLanded) { out.landed++; if (type !== 'jab') out.power++; } else out.missed++;
        prev = type;
      }
      return out;
    }

    // ── per-moment commentary ──
    function narrate(s, c, isCounter) {
      if (quick || result || s.opp.down) return false;
      const o = s.opp;
      const best = c.log.reduce((m, a) => (!m || a.impact > m.impact ? a : m), null);
      if (!best) {
        if (c.n >= 3 && rand() < 0.12) { say('normal', pick(rand, [`${s.name} lets go a ${c.n}-punch flurry but ${o.name} blocks it all.`, `${o.name} picks off a busy combination from ${s.name} on the gloves.`, `${s.name} whiffs on a ${c.n}-punch combination — nothing landing clean.`]), o.side); return true; }
        return false;
      }
      const pn = punchName(rand, s, best.type, best.target);
      if (isCounter && best.type !== 'jab' && (best.impact > 2 || rand() < 0.5)) {
        say(best.flush ? 'big' : 'normal', pick(rand, [`${o.name} misses and ${s.name} makes it pay — a counter ${pn}!`, `Beautiful counter from ${s.name}! A ${pn} right over the top.`, `${s.name} slips and fires back with a ${pn}.`]), s.side);
        return true;
      }
      if (best.flush && best.type !== 'jab' && best.target === 'body') {
        say('big', pick(rand, [`${s.name} buries a ${pn}! ${o.name} winces.`, `Vicious ${pn} from ${s.name} — that one hurt!`, `${s.name} sinks in a ${pn}. ${o.name} doubles over for a second.`]), s.side);
        return true;
      }
      if (best.flush && best.type !== 'jab') {
        say('big', pick(rand, [`${s.name} lands a crunching ${pn} flush!`, `BIG ${pn.toUpperCase()} from ${s.name}! ${o.name}'s head snaps back.`, `${s.name} rocks ${o.name} with a ${pn}!`, `What a shot! ${s.name} detonates a ${pn}.`]), s.side);
        return true;
      }
      if (c.power >= 2) {
        say('normal', pick(rand, [`${s.name} puts together a ${c.n}-punch combination, ${c.landed} land — finishing with a ${pn}.`, `Nice combination from ${s.name}, capped with a ${pn}.`, `${s.name} unloads: ${c.landed} clean shots, the ${pn} the pick of them.`]), s.side);
        return true;
      }
      if (best.target === 'body' && best.type !== 'jab' && rand() < 0.55) {
        say('normal', pick(rand, [`${s.name} digs a ${pn}.`, `Good work downstairs — ${s.name} with a ${pn}.`, `${s.name} invests to the body with a ${pn}.`]), s.side);
        return true;
      }
      if (best.type !== 'jab' && rand() < 0.4) {
        say('normal', pick(rand, [`${s.name} connects with a ${pn}.`, `Clean ${pn} from ${s.name}.`, `${s.name} lands the ${pn}.`, `${s.name} sneaks a ${pn} through the guard.`]), s.side);
        return true;
      }
      return false;
    }

    function tactical() {
      if (quick) return;
      const band = bandOf(dist);
      const opts = [];
      const lead = A.rs.ctrl >= B.rs.ctrl ? A : B;
      if (band === 'long') opts.push(`${lead.name} working behind the jab, keeping ${lead.opp.name} at the end of it.`, `Lots of feinting at range; ${lead.name} controlling the distance.`);
      if (band === 'inside') opts.push(`They're trading in the pocket now!`, `Phone-booth fighting — heads together, short shots on the inside.`);
      if (band === 'mid') opts.push(`${lead.name} stalking, looking for an opening.`, `Both fighters measuring each other at mid-range.`);
      if (onRopes(A)) opts.push(`${B.name} has ${A.name} pinned on the ropes!`);
      if (onRopes(B)) opts.push(`${A.name} has ${B.name} pinned on the ropes!`);
      for (const s of [A, B]) {
        if (s.stam < 38) opts.push(`${s.name} is breathing heavily — the punches have lost their snap.`, `Fatigue setting in for ${s.name}; the hands are dropping.`);
        if (s.body < 55) opts.push(`Those body shots are adding up — ${s.name} is wincing.`);
        if (s.cut > 4) opts.push(`Blood is streaming from the cut over ${s.name}'s ${s.cutEye} eye.`);
        if (s.head < 55) opts.push(`${s.name}'s face is badly marked up now.`);
        if (s.rs.aggr > 12 && s.rs.aggr > s.opp.rs.aggr * 2) opts.push(`${s.name} pushing forward relentlessly, cutting off the ring.`);
      }
      opts.push(`${lead.opp.name} needs to find a way to get off first.`, `Feints and probes — ${A.name} and ${B.name} searching for an opening.`, `The crowd getting restless, wanting more exchanges.`);
      const fresh = opts.filter((o) => !recentTactical.includes(o));
      const line = pick(rand, fresh.length ? fresh : opts);
      recentTactical.push(line);
      if (recentTactical.length > 5) recentTactical.shift();
      say('info', line);
    }

    // ── one 3-second moment ──
    function moment() {
      newFrame('tick');
      A.rs.ticks++; B.rs.ticks++;
      rangeBattle();
      let band = bandOf(dist);
      if (frame) frame.band = band;

      // clinch
      if (band === 'clinch' && rand() < 0.6) {
        clinchTicks = 1;
        if (frame) frame.ev.push({ type: 'clinch' });
        const holder = A.hurt > 0 ? A : B.hurt > 0 ? B : rand() < 0.5 ? A : B;
        if (rand() < 0.3) say('info', pick(rand, [`${holder.name} ties up. ${referee} calls for a break.`, `Clinch. ${referee} separates them.`, `${holder.name} grabs and holds — smart, buying time.`]));
        if (rand() < 0.04) {
          holder.warnings++;
          say('info', `${referee} warns ${holder.name} for holding.`);
        }
      }
      // accidental head clash
      if ((band === 'inside' || band === 'clinch') && rand() < (oppStance ? 0.0004 : 0.0002)) {
        const v = rand() < 0.5 ? A : B;
        if (v.cut === 0) {
          v.cut = 3 + rand() * 3; v.cutAccidental = true; v.cutEye = rand() < 0.5 ? 'left' : 'right';
          say('info', `Clash of heads! ${v.name} is cut over the ${v.cutEye} eye. ${referee} rules it accidental.`);
          if (frame) frame.ev.push({ type: 'cut', who: v.side });
        }
      }
      // low blow
      if (band === 'inside' && rand() < 0.0025) {
        const v = rand() < 0.5 ? A : B;
        v.warnings++;
        if (v.warnings >= 3 && rand() < 0.5) {
          v.deduct[round] = (v.deduct[round] || 0) + 1;
          v.warnings = 0;
          say('info', `${referee} has seen enough — ONE POINT DEDUCTED from ${v.name} for a low blow!`);
        } else say('info', `Low blow from ${v.name}. ${referee} gives a warning.`);
      }

      const sA = eff(A, 'spd') + gauss() * 15 + (A.f.style === 'swarmer' ? 5 : 0);
      const sB = eff(B, 'spd') + gauss() * 15 + (B.f.style === 'swarmer' ? 5 : 0);
      const order = sA >= sB ? [A, B] : [B, A];
      const acted = { A: false, B: false };
      let talked = false;
      for (const s of order) {
        if (result || acted[s.side] || s.down || s.opp.down) continue;
        if (rand() < throwRate(s, clinchTicks ? 'clinch' : band)) {
          acted[s.side] = true;
          const c = combo(s, clinchTicks ? 'clinch' : band, false);
          if (!talked) talked = narrate(s, c, false);
          const o = s.opp;
          if (!result && !o.down && !acted[o.side] && c.missed > 0) {
            const cp = ((o.f.style === 'counter' ? 0.38 : 0.13) + (eff(o, 'iq') - 80) / 220 + (o.tac || NO_TAC).counter) * (o.hurt > 0 ? 0.3 : 1) * (c.missed / c.n);
            if (rand() < cp) {
              acted[o.side] = true;
              const cc = combo(o, band, true);
              if (!talked) talked = narrate(o, cc, true);
            }
          }
        }
      }

      // passive recovery, stun decay, hurt countdown
      for (const s of [A, B]) {
        if (!acted[s.side]) s.stam = Math.min(s.stamMax, s.stam + 0.35);
        s.stun *= 0.45;
        if (s.hurt > 0) {
          s.hurt--;
          if (s.hurt === 0 && !result) { s.punish = 0; if (rand() < 0.4) say('info', pick(rand, [`${s.name} seems to have cleared the cobwebs.`, `${s.name} has weathered the storm.`])); }
        }
      }
      if (talked) quietTicks = 0; else quietTicks++;
      if (!result && quietTicks >= 6 + Math.floor(rand() * 5)) { tactical(); quietTicks = 0; }
      closeFrame();
    }

    // ── scoring ──
    function perfScore(j, s) {
      const r = s.rs;
      return j.wDmg * r.dmg * 0.3 + j.wCnt * 1.6 * (r.pla + r.jla * 0.4) + j.wAgg * r.aggr * 0.12 + j.wDef * r.forced * 0.06 + r.ctrl * 0.03 + 0.5;
    }
    function scoreRound(partial) {
      for (const j of judges) {
        const a = perfScore(j, A) * (1 + gauss() * j.noise);
        const b = perfScore(j, B) * (1 + gauss() * j.noise);
        let sa, sb;
        const rel = Math.abs(a - b) / (a + b);
        if (rel < 0.025 && rand() < 0.3) { sa = 10; sb = 10; }
        else if (a > b) { sa = 10; sb = a / b > 2.8 && a - b > 12 && rand() < 0.35 ? 8 : 9; }
        else { sb = 10; sa = b / a > 2.8 && b - a > 12 && rand() < 0.35 ? 8 : 9; }
        const net = A.rs.kd - B.rs.kd; // rs.kd = knockdowns that fighter SCORED, so positive favours A
        if (net !== 0) {
          const w = net > 0 ? 'A' : 'B';
          const k = Math.abs(net);
          const perfWinner = sa > sb ? 'A' : sb > sa ? 'B' : null;
          const loserPts = perfWinner === w ? (w === 'A' ? sb : sa) - k : 10 - k;
          if (w === 'A') { sa = 10; sb = Math.max(6, perfWinner === 'A' ? loserPts : 9 - (k - 1)); }
          else { sb = 10; sa = Math.max(6, perfWinner === 'B' ? loserPts : 9 - (k - 1)); }
        }
        sa -= A.deduct[round] || 0;
        sb -= B.deduct[round] || 0;
        j.cards.push([sa, sb, !!partial]);
      }
    }
    function cardTotals() {
      return judges.map((j) => j.cards.reduce((t, c) => [t[0] + c[0], t[1] + c[1]], [0, 0]));
    }
    function decide(technical) {
      const tots = cardTotals();
      let a = 0, b = 0, d = 0;
      tots.forEach(([x, y]) => (x > y ? a++ : y > x ? b++ : d++));
      let winner = null, method;
      if (a >= 2) { winner = A; method = a === 3 ? 'UD' : b === 1 ? 'SD' : 'MD'; }
      else if (b >= 2) { winner = B; method = b === 3 ? 'UD' : a === 1 ? 'SD' : 'MD'; }
      else method = 'Draw';
      if (method === 'Draw') method = d === 3 ? 'Draw (unanimous)' : d === 2 ? 'Draw (majority)' : 'Draw (split)';
      if (technical) method = winner ? 'TD' : 'Technical Draw';
      result = { winner: winner ? winner.side : null, method, round, clock: fmtClock(technical ? sec() : 180), detail: '', totals: tots };
    }

    // ── corner instructions (AI corner logic when not player-controlled) ──
    function autoTactic(s) {
      if (s.head < 38 || (s.kd >= 2 && s.head < 55)) return 'survive';
      const tots = cardTotals();
      const lead = tots.reduce((m, t) => m + Math.sign(s === A ? t[0] - t[1] : t[1] - t[0]), 0);
      const left = nRounds - round + 1;
      if (left <= 3 && lead < 0 && nRounds >= 6) return 'ko';
      if (s.opp.body < 55 && s.a.iq > 80) return 'body';
      if (s.opp.head < 45) return 'pressure';
      return 'auto';
    }
    function applyTactic(s, key) {
      s.tacKey = TACTICS[key] ? key : 'auto';
      s.tac = TACTICS[s.tacKey];
    }

    // ── fight loop ──
    newFrame('intro');
    say('round', `${A.f.name} (${A.f.record.w}-${A.f.record.l}-${A.f.record.d}, ${A.f.record.ko} KOs) vs ${B.f.name} (${B.f.record.w}-${B.f.record.l}-${B.f.record.d}, ${B.f.record.ko} KOs) — ${nRounds} rounds at ${BX.divByKey(div).name.toLowerCase()}.`);
    for (const s of [A, B]) {
      if (s.drain > 0.03) say('info', `${s.name} had to boil down to make ${BX.divByKey(div).lb} lbs — could the weight cut be a factor late?`);
      else if (s.lbs - naturalLbs(s.f) > 8) say('info', `${s.name} is moving up in weight and gives away size tonight.`);
    }
    say('info', `Referee: ${referee}. Judges: ${judges.map((j) => j.name).join(', ')}.`);
    closeFrame();

    round = 0;
    let emitted = 0;
    const control = opts.control || {}; // { A: true } = player sets A's instructions
    const pending = { A: null, B: null };

    function runRound() {
      round++;
      tick = 0; extraSecs = 0;
      for (const s of [A, B]) {
        const key = control[s.side] ? pending[s.side] || 'auto' : autoTactic(s);
        applyTactic(s, key);
        pending[s.side] = null;
      }
      A.rs = Object.assign(newStats(), { aggr: 0, ctrl: 0, forced: 0, ticks: 0 });
      B.rs = Object.assign(newStats(), { aggr: 0, ctrl: 0, forced: 0, ticks: 0 });
      A.kdRound = 0; B.kdRound = 0;
      dist = 3.0; pos = 0;
      newFrame('roundStart');
      say('round', round === nRounds && nRounds > 1 ? `ROUND ${round} — the final round!` : `ROUND ${round}`);
      for (const s of [A, B]) {
        if (s.tacKey !== 'auto' && (control[s.side] || rand() < 0.5)) say('info', `${s.name}'s instructions: ${TACTICS[s.tacKey].call}`, s.side);
      }
      if (frame) frame.tactics = { A: A.tacKey, B: B.tacKey };
      closeFrame();
      for (tick = 0; tick * TICK + extraSecs < 180 && !result; tick++) moment();
      if (result) return;

      // end of round
      newFrame('roundEnd');
      scoreRound(false);
      const ra = A.rs, rb = B.rs;
      // the round summary follows the judges' actual cards
      const votes = judges.map((j) => { const c = j.cards[j.cards.length - 1]; return Math.sign(c[0] - c[1]); });
      const forA = votes.filter((v) => v > 0).length, forB = votes.filter((v) => v < 0).length;
      const verdict = forA === 3 ? `All three judges give it to ${A.name}.` : forB === 3 ? `All three judges give it to ${B.name}.` : forA > forB ? `A close one, edged by ${A.name} on most cards.` : forB > forA ? `A close one, edged by ${B.name} on most cards.` : 'Too close to call.';
      const kdNote = [[A, ra], [B, rb]].filter(([, r]) => r.kd).map(([f, r]) => ` ${f.name} scored ${r.kd > 1 ? r.kd + ' knockdowns' : 'a knockdown'}.`).join('');
      say('round', `END OF ROUND ${round}. ${A.name} landed ${ra.la}/${ra.th}, ${B.name} ${rb.la}/${rb.th}. ${verdict}${kdNote}`);
      A.rounds.push({ ...A.rs }); B.rounds.push({ ...B.rs });

      // recovery + corner / doctor decisions
      for (const s of [A, B]) {
        const taken = 100 - s.head;
        s.headMax = Math.max(25, s.headMax - (s.headMax - s.head) * 0.32 - 0.6);
        s.head = Math.min(s.headMax, s.head + 7 + (s.a.heart / 100) * 7);
        s.stamMax = Math.max(35, s.stamMax - (1.7 - s.a.sta / 100) * 2.2 - (100 - s.body) * 0.04);
        s.stam = Math.min(s.stamMax, s.stam + 20 * (s.a.sta / 90));
        s.body = Math.min(100, s.body + 8);
        s.hurt = 0; s.stun = 0; s.punish = 0;
        void taken;
      }
      if (round < nRounds) {
        for (const s of [A, B]) {
          if (result) break;
          if (s.cut >= 8 && rand() < 0.35 + (s.cut - 8) * 0.2) {
            say('kd', `The ringside doctor takes a look at ${s.name}'s ${s.cutEye} eye... and the fight is STOPPED on the doctor's advice!`);
            if (frame) frame.ev.push({ type: 'stop', who: s.side, by: s.opp.side });
            if (s.cutAccidental) {
              if (round >= 4) { say('info', `The cut came from an accidental clash of heads — we go to the scorecards for a technical decision.`); decide(true); }
              else { say('info', `Accidental cut before four completed rounds — it's a technical draw (no decision).`); result = { winner: null, method: 'Technical Draw', round, clock: '3:00', detail: 'accidental cut' }; }
            } else finish(s.opp, 'TKO', `doctor stoppage (cut)`), (result.clock = '3:00');
          } else if (s.head < 24 && round >= 3) {
            const behind = s.tot.dmg < s.opp.tot.dmg;
            const p = ((24 - s.head) / 24) * 0.8 + (s.kd >= 2 ? 0.2 : 0) - (behind ? 0 : 0.3);
            if (rand() < p) {
              say('kd', `${s.name}'s corner has seen enough — they're pulling their fighter out! ${s.opp.name} wins by retirement!`);
              if (frame) frame.ev.push({ type: 'stop', who: s.side, by: s.opp.side });
              finish(s.opp, 'RTD', 'corner retirement');
              result.clock = '3:00';
            }
          }
        }
        if (!result && !quick) {
          const tips = [];
          for (const s of [A, B]) {
            if (s.head < 50) tips.push(`${s.name}'s corner working on the swelling. "You gotta tie up when you're hurt!"`);
            else if (s.rs.ctrl < s.opp.rs.ctrl * 0.6) tips.push(`In ${s.name}'s corner: "Cut off the ring! Make the fight!"`);
            else if (s.stam < 50) tips.push(`${s.name} slumps on the stool, breathing hard.`);
            else tips.push(`In ${s.name}'s corner: "${pick(rand, ['Keep that jab working!', 'Go to the body!', 'Hands up, chin down!', 'You\'re winning this, stay focused!', 'Double up the jab, then come with the right hand!', 'Feint, then fire!'])}"`);
          }
          if (!control.A && !control.B) say('info', pick(rand, tips));
        }
      }
      closeFrame();
    }

    let finished = false;
    function finalize() {
      if (finished) return;
      finished = true;
      if (result && ['KO', 'TKO', 'RTD'].includes(result.method)) {
        // stoppages: record the partial round in the stats arrays
        if (A.rounds.length < result.round) { A.rounds.push({ ...A.rs }); B.rounds.push({ ...B.rs }); }
      }
      if (!result) { round = nRounds; decide(false); }
      if (!result.totals) result.totals = cardTotals();
      finalNarration();
    }
    function takeFrames() {
      const out = frames.slice(emitted);
      emitted = frames.length;
      return out;
    }
    function summary() {
      return {
        seed, div, rounds: nRounds, referee, judges, result, frames,
        A: { f: A.f, lbs: A.lbs, weighIn: A.weighIn, drain: A.drain, form: A.form, tot: A.tot, rounds: A.rounds, kd: A.kd, final: snapshot(A) },
        B: { f: B.f, lbs: B.lbs, weighIn: B.weighIn, drain: B.drain, form: B.form, tot: B.tot, rounds: B.rounds, kd: B.kd, final: snapshot(B) },
      };
    }
    /** What a corner can see between rounds: condition, last-round numbers, unofficial card, and advice. */
    function cornerView(side) {
      const s = side === 'A' ? A : B, o = s.opp;
      const last = s.rounds[s.rounds.length - 1] || newStats();
      const olast = o.rounds[o.rounds.length - 1] || newStats();
      const tots = cardTotals();
      let mine = 0, theirs = 0;
      tots.forEach((t) => { mine += side === 'A' ? t[0] : t[1]; theirs += side === 'A' ? t[1] : t[0]; });
      const advice = [];
      if (s.head < 45) advice.push(['survive', `${s.name} is badly hurt. Think about survival.`]);
      if (s.stam < 45) advice.push(['counter', `The gas tank is low. Slow it down and pick your shots.`]);
      if (o.body < 65) advice.push(['body', `${o.name}'s body is softening up. Keep investing downstairs.`]);
      if (o.head < 50) advice.push(['ko', `${o.name} is there to be taken. Go get the stoppage!`]);
      if (olast.la > last.la * 1.4) advice.push(['box', `You're getting outworked. Use the jab and move.`]);
      if (s.f.reach > o.f.reach + 6) advice.push(['box', `You've got the reach. Keep it long and jab.`]);
      if (o.f.style === 'boxer' || o.f.style === 'counter') advice.push(['pressure', `Don't let ${o.name} settle. Cut off the ring!`]);
      if (mine < theirs && nRounds - round <= 3) advice.push(['ko', `You're behind on the cards. You need a knockout.`]);
      return {
        side, round, rounds: nRounds, name: s.name, oppName: o.name,
        me: snapshot(s), opp: snapshot(o), cutEye: s.cutEye, oppCutEye: o.cutEye,
        last: { la: last.la, th: last.th, pla: last.pla, opla: olast.pla, ola: olast.la, oth: olast.th },
        card: { mine, theirs, judges: tots.map((t) => (side === 'A' ? t : [t[1], t[0]])) },
        advice: advice.slice(0, 3), current: s.tacKey,
      };
    }

    // final narration
    function finalNarration() {
    newFrame('end');
    const W = result.winner === 'A' ? A : result.winner === 'B' ? B : null;
    if (['UD', 'SD', 'MD', 'TD'].includes(result.method) || result.method.startsWith('Draw') || result.method === 'Technical Draw') {
      if (result.method !== 'Technical Draw' || result.totals.some((t) => t[0] + t[1] > 0)) {
        say('round', `We go to the scorecards: ${judges.map((j, i) => `${j.name} ${result.totals[i][0]}-${result.totals[i][1]}`).join(', ')}.`);
      }
    }
    const methodLong = { KO: 'knockout', TKO: 'technical knockout', RTD: 'corner retirement', UD: 'unanimous decision', SD: 'split decision', MD: 'majority decision', TD: 'technical decision' }[result.method];
    if (W) say('end', `${W.f.name.toUpperCase()} WINS by ${methodLong}${['KO', 'TKO', 'RTD'].includes(result.method) ? ` in round ${result.round}` : ''}!`, W.side);
    else say('end', `It's a ${result.method.toLowerCase()}!`);
    closeFrame();
    }

    return {
      /** Play the next round (including the between-round interval). Returns the new frames. */
      playRound() {
        if (finished) return [];
        for (const s of [A, B]) {
          if (!result && pending[s.side] === 'towel') {
            newFrame('roundEnd');
            say('kd', `${s.name}'s corner THROWS IN THE TOWEL! It's over — ${s.opp.name} wins by retirement.`, s.opp.side);
            if (frame) frame.ev.push({ type: 'stop', who: s.side, by: s.opp.side });
            finish(s.opp, 'RTD', 'towel thrown in');
            result.clock = '3:00';
            closeFrame();
          }
        }
        if (!result && round < nRounds) runRound();
        if (result || round >= nRounds) finalize();
        return takeFrames();
      },
      setTactic(side, key) { pending[side] = key; },
      get done() { return finished; },
      get round() { return round; },
      takeFrames, cornerView, summary,
      runToEnd() { while (!finished) this.playRound(); return summary(); },
    };
  };

  BX.simulate = function (opts) {
    return BX.createFight(opts).runToEnd();
  };

  /** Run many quick sims and aggregate win / method probabilities. */
  BX.odds = function (a, b, div, rounds, n, seed0) {
    const out = { n, A: { win: 0, ko: 0, dec: 0 }, B: { win: 0, ko: 0, dec: 0 }, draw: 0, avgRound: 0, stoppages: 0, byRound: new Array(rounds + 1).fill(0) };
    for (let i = 0; i < n; i++) {
      const r = BX.simulate({ a, b, div, rounds, seed: (seed0 + i * 7919) >>> 0, quick: true }).result;
      const stop = ['KO', 'TKO', 'RTD'].includes(r.method);
      if (r.winner) {
        const s = out[r.winner];
        s.win++;
        if (stop) s.ko++; else s.dec++;
      } else out.draw++;
      if (stop) { out.stoppages++; out.avgRound += r.round; out.byRound[r.round]++; }
    }
    out.avgRound = out.stoppages ? out.avgRound / out.stoppages : 0;
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
