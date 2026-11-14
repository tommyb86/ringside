/* Ringside — canvas ring renderer.
 * Side-on broadcast view of the ring with two procedurally-animated fighters.
 * The app feeds it engine frames; it turns punches / reactions / knockdowns into motion.
 */
(function (root) {
  const BX = (root.BX = root.BX || {});
  const W = 960, H = 480;
  const GROUND = 388;
  const CENTER = 480;
  const COLORS = { A: '#e23b43', B: '#2f7be6' };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function ik(sx, sy, tx, ty, l1, l2, bend) {
    let dx = tx - sx, dy = ty - sy;
    let d = Math.hypot(dx, dy);
    const maxd = l1 + l2 - 0.5;
    if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
    if (d < 1) d = 1;
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const ang = Math.atan2(dy, dx) + bend * a;
    return { ex: sx + Math.cos(ang) * l1, ey: sy + Math.sin(ang) * l1, hx: sx + dx, hy: sy + dy };
  }

  function makeFighter(side, f) {
    const Hpx = f.height * 1.04;
    return {
      side, f, color: COLORS[side], face: side === 'A' ? 1 : -1,
      H: Hpx, arm: f.reach * 1.04 * 0.4, x: CENTER + (side === 'A' ? -200 : 200), tx: CENTER + (side === 'A' ? -200 : 200),
      bob: Math.random() * 6, punch: null, reacts: [], slip: null, block: null, lunge: 0,
      down: null, celebrate: false, dejected: false, hurt: false, cut: 0, clinch: false, walk: 0,
      headHp: 100, bodyHp: 100, hitFlash: null,
    };
  }

  BX.Ring = function (canvas) {
    const ctx = canvas.getContext('2d');
    let dpr = 1;
    let fighters = null;
    let tl = []; // timeline of scheduled callbacks {at, fn}
    let effects = [];
    let overlay = null; // {text, sub, color, t0, dur}
    let countText = null;
    let shake = 0;
    let ref = { x: CENTER, tx: CENTER, show: false, count: null, raise: null };
    let crowd = [];
    let flashes = [];
    let excitement = 0.1;
    let raf = 0;
    let last = performance.now();
    let paused = false;

    for (let row = 0; row < 6; row++) {
      for (let i = 0; i < 70; i++) {
        crowd.push({ x: (i / 70) * (W + 40) - 20 + (row % 2) * 7 + Math.random() * 6, y: 110 + row * 30 + Math.random() * 6, r: 7 + row * 1.6 + Math.random() * 2, shade: 0.07 + Math.random() * 0.12 + row * 0.015, ph: Math.random() * 6 });
      }
    }

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth || W;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round((w * H / W) * dpr);
    }
    resize();
    window.addEventListener('resize', resize);

    function at(delay, fn) { tl.push({ at: performance.now() + delay, fn }); }

    // ── public API ──
    const api = {
      setFighters(a, b) {
        fighters = { A: makeFighter('A', a), B: makeFighter('B', b) };
        tl = []; effects = []; overlay = null; countText = null; ref = { x: CENTER, tx: CENTER, show: false, count: null, raise: null };
        api.toCorners(true);
      },
      toCorners(instant) {
        if (!fighters) return;
        for (const s of ['A', 'B']) {
          const F = fighters[s];
          F.tx = CENTER + (s === 'A' ? -330 : 330);
          if (instant) F.x = F.tx;
          F.punch = null; F.down = null; F.clinch = false; F.hurt = false;
        }
        ref.tx = CENTER; ref.show = false;
      },
      flash(text, sub, color, dur) { overlay = { text, sub, color: color || '#fff', t0: performance.now(), dur: dur || 1400 }; },
      setPaused(p) { paused = p; },
      /**
       * Animate one engine frame across `ms` milliseconds. countMs = time per count number.
       * Returns the total ms it actually needs (longer when there's a knockdown).
       */
      playFrame(fr, ms, countMs) {
        if (!fighters) return ms;
        const A = fighters.A, B = fighters.B;
        const syncDamage = () => {
          if (!fr.A) return;
          for (const [F, s] of [[A, fr.A], [B, fr.B]]) { F.headHp = s.head; F.bodyHp = s.body; F.cut = s.cut; }
        };
        if (fr.type !== 'tick') syncDamage();
        if (fr.type === 'roundStart') {
          ref.show = false;
          for (const F of [A, B]) { F.down = null; F.dejected = false; F.celebrate = false; }
          setPositions(fr, true);
          return ms;
        }
        if (fr.type === 'roundEnd' || fr.type === 'intro') {
          // between-round: walk back to corners (unless something dramatic just happened)
          if (!fr.ev.some((e) => e.type === 'stop')) api.toCorners(false);
          handleStops(fr);
          return ms;
        }
        if (fr.type === 'end') return ms;

        setPositions(fr, false);
        A.hurt = fr.A.hurt; B.hurt = fr.B.hurt;
        const clinch = fr.ev.some((e) => e.type === 'clinch');
        A.clinch = B.clinch = clinch;
        excitement = Math.max(0.1, excitement * 0.92);

        // schedule punches
        const acts = fr.acts;
        const kdIdx = fr.ev.findIndex((e) => e.type === 'kd');
        const span = ms * 0.82;
        const slot = acts.length ? Math.min(330, span / acts.length) : 0;
        acts.forEach((a, i) => {
          const dur = clamp(slot * 0.95, 110, 300);
          at(i * slot, () => throwAnim(a, dur));
        });
        let need = acts.length * slot + 60;
        // damage visuals build up shot by shot (in throwAnim); re-sync to the engine's numbers once the moment ends
        at(need, syncDamage);
        // events after punches
        if (kdIdx >= 0) {
          const kd = fr.ev[kdIdx];
          const up = fr.ev.find((e) => e.type === 'up');
          const ko = fr.ev.find((e) => e.type === 'ko');
          const stop = fr.ev.find((e) => e.type === 'stop');
          const tKD = need;
          at(tKD, () => knockDown(kd.who));
          const n = ko ? 10 : up ? Math.max(8, up.count) : 0;
          const tCount0 = tKD + 650;
          for (let c = 1; c <= n; c++) at(tCount0 + (c - 1) * countMs, () => { ref.count = c; });
          let tEnd = tCount0 + n * countMs;
          if (up) {
            at(tCount0 + up.count * countMs - countMs * 0.3, () => rise(up.who));
            at(tEnd + 200, () => { ref.count = null; });
          }
          if (ko) {
            at(tEnd, () => { ref.count = null; api.flash('KO!', `${fighters[ko.by].f.short} wins`, COLORS[ko.by], 2600); celebrate(ko.by); boom(1); });
            tEnd += 700;
          } else if (stop) {
            at(tEnd + 300, () => { ref.count = null; ref.tx = fighters[stop.who].x; api.flash('STOPPED!', `${fighters[stop.by].f.short} wins`, COLORS[stop.by], 2600); celebrate(stop.by); });
            tEnd += 900;
          }
          need = Math.max(need, tEnd + 400);
        } else {
          const stop = fr.ev.find((e) => e.type === 'stop');
          if (stop) {
            at(need + 100, () => {
              ref.show = true; ref.tx = (fighters.A.x + fighters.B.x) / 2;
              fighters[stop.who].dejected = true;
              api.flash('STOPPED!', `${fighters[stop.by].f.short} wins`, COLORS[stop.by], 2600);
              celebrate(stop.by); boom(0.7);
            });
            need += 900;
          }
        }
        if (fr.ev.some((e) => e.type === 'hurt')) excitement = 1;
        return Math.max(ms, need);
      },
      endScene(result) {
        if (!fighters || !result) return;
        if (result.winner) {
          const w = result.winner, l = w === 'A' ? 'B' : 'A';
          celebrate(w);
          if (!fighters[l].down) fighters[l].dejected = true;
          ref.show = true; ref.tx = fighters[w].x + (w === 'A' ? 40 : -40); ref.raise = w;
        } else {
          ref.show = true; ref.raise = 'both';
          fighters.A.tx = CENTER - 60; fighters.B.tx = CENTER + 60;
        }
      },
    };

    function setPositions(fr, reset) {
      const A = fighters.A, B = fighters.B;
      const avgArm = (A.arm + B.arm) / 2;
      const gap = 44 + fr.dist * 0.5 * avgArm + (fr.band === 'clinch' ? -14 : 0);
      const center = CENTER + fr.pos * 230;
      const cx = clamp(center, 120 + gap / 2, W - 120 - gap / 2);
      A.tx = cx - gap / 2; B.tx = cx + gap / 2;
      if (reset) { A.x = CENTER - 70; B.x = CENTER + 70; }
    }

    function handleStops(fr) {
      const stop = fr.ev.find((e) => e.type === 'stop');
      if (stop) {
        ref.show = true;
        fighters[stop.who].dejected = true;
        api.flash('STOPPED!', `${fighters[stop.by].f.short} wins`, COLORS[stop.by], 2600);
        celebrate(stop.by);
      }
    }

    function headPos(F) {
      const p = pose(F, performance.now());
      return { x: p.head.x, y: p.head.y, bx: p.chest.x, by: p.chest.y + F.H * 0.1 };
    }

    function throwAnim(a, dur) {
      const F = fighters[a.by], O = fighters[a.by === 'A' ? 'B' : 'A'];
      if (F.down || O.down) return;
      const hand = a.type === 'jab' || a.type === 'hook' ? 'lead' : 'rear';
      F.punch = { type: a.type, target: a.target, res: a.res, hand, t0: performance.now(), dur, flush: a.flush };
      const hit = dur * 0.45;
      if (a.res === 'miss') O.slip = { t0: performance.now() + dur * 0.15, dur: dur * 0.9, dir: a.type === 'hook' ? 1 : Math.random() < 0.5 ? 1 : -1 };
      if (a.res === 'block') O.block = { t0: performance.now(), dur: dur * 1.1, body: a.target === 'body' };
      at(hit, () => {
        if (a.res === 'land') {
          const amt = clamp(a.impact / 6, 0.15, 1.6);
          const body = a.target === 'body';
          O.reacts.push({ t0: performance.now(), dur: 260 + amt * 160, amt, body });
          O.hitFlash = { t0: performance.now(), body, amt: clamp(amt, 0.35, 1.3) };
          if (body) O.bodyHp = Math.max(0, O.bodyHp - a.impact * 0.2);
          else O.headHp = Math.max(0, O.headHp - a.impact * 0.24);
          const hp = headPos(O);
          const x = body ? hp.bx : hp.x, y = body ? hp.by : hp.y;
          spray(x, y, F.face, a.flush ? 16 : 6 + Math.round(amt * 4), a.flush);
          if (!body && O.cut > 0 && a.type !== 'jab') spray(hp.x + O.face * 6, hp.y - 6, F.face, 3 + Math.round(O.cut / 2), false, false, 'rgba(190,20,30,.95)');
          if (a.flush) { shake = Math.max(shake, 5 + amt * 4); excitement = Math.max(excitement, 0.7); popFlashes(6); }
          if (a.perfect) { shake = 12; }
        } else if (a.res === 'block') {
          const hp = headPos(O);
          spray(hp.x - F.face * 10, hp.y + 8, F.face, 3, false, true);
        }
      });
    }

    function knockDown(who) {
      const F = fighters[who];
      F.punch = null;
      F.down = { t0: performance.now(), rising: null };
      ref.show = true; ref.tx = F.x + F.face * -60;
      shake = 14; excitement = 1; popFlashes(25);
      api.flash('KNOCKDOWN!', '', '#ffd23f', 1200);
    }
    function rise(who) { const F = fighters[who]; if (F.down) F.down.rising = performance.now(); }
    function celebrate(side) {
      const F = fighters[side];
      F.celebrate = true; F.punch = null;
      popFlashes(30); excitement = 1;
    }
    function boom(k) { shake = 10 * k; }

    function spray(x, y, dir, n, big, glove, color) {
      for (let i = 0; i < n; i++) {
        effects.push({
          x, y, vx: dir * (0.6 + Math.random() * 2.6) * (big ? 1.6 : 1), vy: -1.4 + Math.random() * 2.2,
          life: 1, decay: 0.025 + Math.random() * 0.03, r: glove ? 1.5 : 1 + Math.random() * 2, c: color || (glove ? 'rgba(255,255,255,.7)' : 'rgba(225,240,255,.9)'),
        });
      }
      if (big) effects.push({ ring: true, x, y, life: 1, decay: 0.06, r: 6 });
    }
    function popFlashes(n) {
      for (let i = 0; i < n; i++) flashes.push({ x: Math.random() * W, y: 100 + Math.random() * 170, life: 1, delay: Math.random() * 600 });
    }

    // ── pose ──
    function pose(F, now) {
      const f = F.face, h = F.H;
      const t = now / 1000;
      let bob = Math.sin(t * 5 + F.bob) * h * 0.012;
      let lean = 0.04, crouch = 0;
      let bodyX = F.x + F.lunge;
      // punch extension
      let ext = 0, P = F.punch;
      if (P) {
        const p = (now - P.t0) / P.dur;
        if (p >= 1) F.punch = P = null;
        else ext = p < 0.45 ? easeOut(p / 0.45) : 1 - easeInOut((p - 0.45) / 0.55);
      }
      if (P) { lean += ext * (P.type === 'jab' ? 0.06 : 0.14); }
      // reactions
      let snap = 0, fold = 0;
      F.reacts = F.reacts.filter((r) => now - r.t0 < r.dur);
      for (const r of F.reacts) {
        const p = (now - r.t0) / r.dur;
        const k = Math.sin(Math.min(1, p) * Math.PI) * r.amt;
        if (r.body) fold += k; else snap += k;
      }
      lean -= snap * 0.16;
      lean += fold * 0.12;
      crouch += fold * 0.04;
      // slip
      let slipY = 0, slipX = 0;
      if (F.slip) {
        const p = (now - F.slip.t0) / F.slip.dur;
        if (p > 1) F.slip = null;
        else if (p > 0) { const k = Math.sin(p * Math.PI); slipY = k * h * 0.05; slipX = -f * k * h * 0.035 * F.slip.dir; }
      }
      let blockK = 0;
      if (F.block) {
        const p = (now - F.block.t0) / F.block.dur;
        if (p > 1) F.block = null; else blockK = Math.sin(Math.min(1, p) * Math.PI);
      }
      if (F.hurt) { lean += Math.sin(t * 3.1) * 0.06; bob += Math.sin(t * 2.3) * h * 0.02; crouch += 0.03; }
      if (F.dejected) { lean += 0.1; crouch += 0.02; bob *= 0.2; }
      if (F.celebrate) { bob = Math.abs(Math.sin(t * 7)) * -h * 0.04; lean = -0.04; }

      const g = GROUND;
      const hipY = g - h * (0.5 - crouch) + bob;
      const hip = { x: bodyX, y: hipY };
      const shoulder = { x: bodyX + f * lean * h, y: g - h * (0.8 - crouch * 1.4) + bob + slipY };
      shoulder.x += slipX;
      const head = { x: shoulder.x + f * h * 0.03 - f * snap * h * 0.06 + slipX * 0.4, y: shoulder.y - h * 0.11 + slipY * 0.5 + fold * h * 0.02, r: h * 0.068 };
      const chest = { x: lerp(hip.x, shoulder.x, 0.6), y: lerp(hip.y, shoulder.y, 0.6) };
      const sLead = { x: shoulder.x + f * h * 0.035, y: shoulder.y + h * 0.01 };
      const sRear = { x: shoulder.x - f * h * 0.035, y: shoulder.y + h * 0.015 };
      const up = F.arm * 0.5, fore = F.arm * 0.52;

      // guard positions
      let gLead = { x: head.x + f * h * 0.1, y: head.y + h * 0.06 };
      let gRear = { x: head.x + f * h * 0.05, y: head.y + h * 0.075 };
      if (blockK) { gLead = { x: lerp(gLead.x, head.x + f * h * 0.06, blockK), y: lerp(gLead.y, head.y + (F.block.body ? h * 0.22 : h * 0.01), blockK) }; gRear = { x: lerp(gRear.x, head.x + f * h * 0.045, blockK), y: lerp(gRear.y, head.y + (F.block.body ? h * 0.25 : h * 0.02), blockK) }; }
      if (F.hurt && !P) { gLead.y += h * 0.05; gRear.y += h * 0.04; }
      if (F.dejected) { gLead = { x: hip.x + f * h * 0.07, y: hip.y - h * 0.05 }; gRear = { x: hip.x - f * h * 0.02, y: hip.y - h * 0.03 }; }
      if (F.celebrate) {
        const wave = Math.sin(t * 7) * h * 0.03;
        gLead = { x: sLead.x + f * h * 0.08, y: sLead.y - F.arm * 0.95 + wave };
        gRear = { x: sRear.x - f * h * 0.08, y: sRear.y - F.arm * 0.95 - wave };
      }
      if (F.clinch && !P && !F.celebrate) {
        gLead = { x: shoulder.x + f * h * 0.22, y: shoulder.y + h * 0.02 };
        gRear = { x: shoulder.x + f * h * 0.18, y: shoulder.y + h * 0.1 };
      }

      let lead = { tx: gLead.x, ty: gLead.y, bend: f };
      let rear = { tx: gRear.x, ty: gRear.y, bend: f };
      if (P && ext > 0) {
        const O = fighters[F.side === 'A' ? 'B' : 'A'];
        let tgt;
        const oh = O._pose ? O._pose.head : { x: O.x, y: GROUND - O.H * 0.9 };
        const ob = O._pose ? O._pose.chest : { x: O.x, y: GROUND - O.H * 0.6 };
        if (P.target === 'body') tgt = { x: ob.x - f * O.H * 0.05, y: ob.y + O.H * 0.06 };
        else tgt = { x: oh.x - f * oh.r * 0.6, y: oh.y + oh.r * 0.2 };
        if (P.res === 'miss') tgt = { x: tgt.x + f * O.H * 0.08, y: tgt.y - O.H * 0.05 };
        if (P.res === 'block') tgt = { x: tgt.x - f * O.H * 0.06, y: tgt.y + O.H * 0.02 };
        const sh = P.hand === 'lead' ? sLead : sRear;
        const g0 = P.hand === 'lead' ? gLead : gRear;
        // step in when target is out of reach
        const reachNeed = Math.hypot(tgt.x - sh.x, tgt.y - sh.y) - (up + fore) * 0.97;
        const lungeTarget = P.res === 'miss' ? Math.min(30, Math.max(0, reachNeed * 0.6)) : clamp(reachNeed, 0, 55);
        F.lunge = lerp(F.lunge, f * lungeTarget * ext, 0.35);
        let px, py;
        if (P.type === 'hook') {
          const c = { x: g0.x + f * h * 0.02, y: g0.y - h * 0.07 };
          const e = ext;
          px = (1 - e) * (1 - e) * g0.x + 2 * (1 - e) * e * c.x + e * e * tgt.x;
          py = (1 - e) * (1 - e) * g0.y + 2 * (1 - e) * e * c.y + e * e * tgt.y;
        } else if (P.type === 'upper') {
          const c = { x: g0.x + f * h * 0.08, y: g0.y + h * 0.22 };
          const e = ext;
          px = (1 - e) * (1 - e) * g0.x + 2 * (1 - e) * e * c.x + e * e * tgt.x;
          py = (1 - e) * (1 - e) * g0.y + 2 * (1 - e) * e * c.y + e * e * tgt.y;
        } else { px = lerp(g0.x, tgt.x, ext); py = lerp(g0.y, tgt.y, ext); }
        const arm = { tx: px, ty: py, bend: P.type === 'hook' ? -f : f };
        if (P.hand === 'lead') lead = arm; else rear = arm;
      } else {
        F.lunge = lerp(F.lunge, 0, 0.12);
      }
      const L = ik(sLead.x, sLead.y, lead.tx, lead.ty, up, fore, lead.bend);
      const R = ik(sRear.x, sRear.y, rear.tx, rear.ty, up, fore, rear.bend);

      // legs
      const stance = h * 0.15;
      const footF = { x: bodyX + f * stance * 0.9 + F.walk, y: g };
      const footB = { x: bodyX - f * stance * 0.9, y: g };
      const thigh = h * 0.27, shin = h * 0.27;
      const hipF = { x: hip.x + f * h * 0.02, y: hip.y };
      const hipB = { x: hip.x - f * h * 0.02, y: hip.y };
      const KF = ik(hipF.x, hipF.y, footF.x, footF.y, thigh, shin, -f);
      const KB = ik(hipB.x, hipB.y, footB.x, footB.y, thigh, shin, -f);
      const p = { hip, shoulder, head, chest, sLead, sRear, L, R, KF, KB, hipF, hipB };
      F._pose = p;
      return p;
    }

    function drawFighter(F, now) {
      const p = pose(F, now);
      const f = F.face, h = F.H;
      ctx.save();
      // knockdown rotation around the feet
      if (F.down) {
        const fall = clamp((now - F.down.t0) / 550, 0, 1);
        let k = easeOut(fall);
        if (F.down.rising) k *= 1 - clamp((now - F.down.rising) / 700, 0, 1);
        if (F.down.rising && now - F.down.rising > 700) F.down = null;
        const pivotX = F.x - f * h * 0.1, pivotY = GROUND;
        ctx.translate(pivotX, pivotY);
        ctx.rotate(-f * k * 1.42);
        ctx.translate(-pivotX, -pivotY + k * h * 0.04);
      }
      // shadow
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.restore();

      const body = '#232831', far = '#171b22', trunk = F.color;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const limb = (a, b, c, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke(); };
      // far leg & far (rear) arm
      limb(p.hipB, { x: p.KB.ex, y: p.KB.ey }, { x: p.KB.hx, y: p.KB.hy }, h * 0.075, far);
      limb(p.sRear, { x: p.R.ex, y: p.R.ey }, { x: p.R.hx, y: p.R.hy }, h * 0.055, far);
      glove(p.R.hx, p.R.hy, h, shade(F.color, -0.25), f);
      // boots
      boot(p.KB.hx, p.KB.hy, f, h, '#0e1015');
      // near leg
      limb(p.hipF, { x: p.KF.ex, y: p.KF.ey }, { x: p.KF.hx, y: p.KF.hy }, h * 0.08, body);
      boot(p.KF.hx, p.KF.hy, f, h, '#12151b');
      // torso
      ctx.strokeStyle = body; ctx.lineWidth = h * 0.16;
      ctx.beginPath(); ctx.moveTo(p.hip.x, p.hip.y - h * 0.04); ctx.lineTo(p.shoulder.x, p.shoulder.y + h * 0.05); ctx.stroke();
      // body welts (ribs) build up with body damage
      const bd = clamp((100 - F.bodyHp) / 70, 0, 1);
      const ribs = { x: lerp(p.hip.x, p.shoulder.x, 0.5) + f * h * 0.04, y: lerp(p.hip.y, p.shoulder.y, 0.5) };
      if (bd > 0.08) {
        ctx.fillStyle = `rgba(175,55,75,${0.18 + bd * 0.45})`;
        const blot = (dx, dy, rx, ry) => { ctx.beginPath(); ctx.ellipse(ribs.x + f * dx * h, ribs.y + dy * h, rx * h, ry * h, 0.5 * f, 0, Math.PI * 2); ctx.fill(); };
        blot(0, 0, 0.014 + bd * 0.016, 0.011 + bd * 0.012);
        if (bd > 0.3) blot(-0.022, 0.035, 0.012 + bd * 0.01, 0.009 + bd * 0.008);
        if (bd > 0.55) blot(0.006, -0.04, 0.011 + bd * 0.008, 0.008 + bd * 0.007);
      }
      // trunks: a hip block plus one short leg down each thigh
      const short = (hipPt, K, col) => {
        const end = { x: lerp(hipPt.x, K.ex, 0.55), y: lerp(hipPt.y, K.ey, 0.55) };
        ctx.strokeStyle = col; ctx.lineCap = 'butt'; ctx.lineWidth = h * 0.11;
        ctx.beginPath(); ctx.moveTo(hipPt.x, hipPt.y - h * 0.01); ctx.lineTo(end.x, end.y); ctx.stroke();
        // hem trim
        const ang = Math.atan2(end.y - hipPt.y, end.x - hipPt.x);
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = h * 0.012;
        const nx = -Math.sin(ang) * h * 0.055, ny = Math.cos(ang) * h * 0.055;
        ctx.beginPath(); ctx.moveTo(end.x + nx, end.y + ny); ctx.lineTo(end.x - nx, end.y - ny); ctx.stroke();
        ctx.lineCap = 'round';
      };
      short(p.hipB, p.KB, shade(trunk, -0.3));
      short(p.hipF, p.KF, trunk);
      const tw = h * 0.085;
      ctx.fillStyle = trunk;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(p.hip.x - tw, p.hip.y - h * 0.08, tw * 2, h * 0.11, h * 0.025);
      else ctx.rect(p.hip.x - tw, p.hip.y - h * 0.08, tw * 2, h * 0.11);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(p.hip.x - tw, p.hip.y - h * 0.085, tw * 2, h * 0.024);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(p.hip.x + f * tw * 0.55 - h * 0.006, p.hip.y - h * 0.06, h * 0.012, h * 0.085);
      // head
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(p.head.x, p.head.y, p.head.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = body; ctx.lineWidth = h * 0.05;
      ctx.beginPath(); ctx.moveTo(p.head.x - f * p.head.r * 0.2, p.head.y + p.head.r * 0.6); ctx.lineTo(p.shoulder.x, p.shoulder.y + h * 0.02); ctx.stroke();
      // rim light on head
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.head.x, p.head.y, p.head.r - 1, -Math.PI * 0.9, -Math.PI * 0.2); ctx.stroke();
      // facial damage: bruising round the eye, then the cheek, swelling as condition drops
      const r = p.head.r;
      const hd = clamp((100 - F.headHp) / 75, 0, 1);
      if (hd > 0.06) {
        // whole face reddens as the beating mounts
        ctx.fillStyle = `rgba(150,40,60,${hd * 0.32})`;
        ctx.beginPath(); ctx.arc(p.head.x, p.head.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(205,70,95,${0.22 + hd * 0.55})`;
        ctx.beginPath(); ctx.ellipse(p.head.x + f * r * 0.48, p.head.y - r * 0.38, r * (0.22 + hd * 0.3), r * (0.15 + hd * 0.2), 0, 0, Math.PI * 2); ctx.fill();
        if (hd > 0.35) {
          ctx.fillStyle = `rgba(150,60,140,${0.25 + hd * 0.4})`;
          ctx.beginPath(); ctx.ellipse(p.head.x + f * r * 0.45, p.head.y + r * 0.32, r * 0.2 * hd + r * 0.08, r * 0.15 * hd + r * 0.05, 0, 0, Math.PI * 2); ctx.fill();
        }
        if (hd > 0.6) {
          // eye swelling shut: a lump breaking the outline of the head
          ctx.fillStyle = `rgba(185,70,95,${0.6 + hd * 0.3})`;
          ctx.beginPath(); ctx.ellipse(p.head.x + f * r * 0.86, p.head.y - r * 0.38, r * 0.2 * hd, r * 0.17 * hd, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      // cut + blood trickle
      if (F.cut > 0) {
        const cx = p.head.x + f * r * 0.55, cy = p.head.y - r * 0.35;
        ctx.fillStyle = `rgba(210,20,35,${clamp(0.6 + F.cut / 12, 0.6, 1)})`;
        ctx.beginPath(); ctx.ellipse(cx, cy, 2.2 + F.cut * 0.3, 1.6, 0, 0, Math.PI * 2); ctx.fill();
        if (F.cut > 2) {
          ctx.strokeStyle = 'rgba(190,15,30,.85)'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + f * 2, cy + r * 0.5, cx - f * 1, cy + r * clamp(0.4 + F.cut * 0.12, 0.4, 1.4)); ctx.stroke();
        }
        if (F.cut > 4 && Math.random() < 0.025 + F.cut * 0.004) effects.push({ x: cx, y: cy + r, vx: f * 0.2, vy: 0.4, life: 1, decay: 0.03, r: 1.4, c: 'rgba(190,15,30,.9)' });
      }
      // impact flash on the spot that just got hit
      if (F.hitFlash) {
        const fp = clamp((now - F.hitFlash.t0) / 200, 0, 1);
        if (fp >= 1) F.hitFlash = null;
        else {
          const at = F.hitFlash.body ? ribs : { x: p.head.x, y: p.head.y };
          const rad = (F.hitFlash.body ? h * 0.07 : r * 1.25) * (0.8 + fp * 0.5);
          const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, rad);
          g.addColorStop(0, `rgba(255,110,110,${0.7 * F.hitFlash.amt * (1 - fp)})`);
          g.addColorStop(1, 'rgba(255,80,80,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(at.x, at.y, rad, 0, Math.PI * 2); ctx.fill();
        }
      }
      // near (lead) arm
      limb(p.sLead, { x: p.L.ex, y: p.L.ey }, { x: p.L.hx, y: p.L.hy }, h * 0.058, body);
      glove(p.L.hx, p.L.hy, h, F.color, f);
      ctx.restore();
    }

    function glove(x, y, h, col, f) {
      const r = h * 0.05;
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r * 1.1);
      g.addColorStop(0, shade(col, 0.35)); g.addColorStop(1, col);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x + f * r * 0.15, y, r * 1.05, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.fillRect(x - f * r * 1.0 - r * 0.25, y - r * 0.55, r * 0.5, r * 1.1);
    }
    function boot(x, y, f, h, col) {
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(x + f * h * 0.03, y - h * 0.012, h * 0.06, h * 0.022, 0, 0, Math.PI * 2); ctx.fill();
    }
    function shade(hex, k) {
      const n = parseInt(hex.slice(1), 16);
      let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      if (k > 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
      return `rgb(${r | 0},${g | 0},${b | 0})`;
    }

    function drawReferee(now) {
      if (!ref.show) return;
      ref.x = lerp(ref.x, ref.tx, 0.08);
      const x = ref.x, h = 170, g = GROUND - 14;
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#111'; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(x - 10, g); ctx.lineTo(x - 4, g - h * 0.48); ctx.moveTo(x + 10, g); ctx.lineTo(x + 4, g - h * 0.48); ctx.stroke();
      ctx.fillStyle = '#9fc3e8';
      ctx.fillRect(x - 15, g - h * 0.82, 30, h * 0.36);
      ctx.fillStyle = '#111'; ctx.fillRect(x - 3, g - h * 0.8, 6, 9);
      ctx.fillStyle = '#2b2f37';
      ctx.beginPath(); ctx.arc(x, g - h * 0.9, h * 0.062, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#9fc3e8'; ctx.lineWidth = 8;
      ctx.beginPath();
      if (ref.count) {
        // counting arm
        const k = (now / 250) % 2 < 1 ? 0 : 1;
        ctx.moveTo(x - 12, g - h * 0.78); ctx.lineTo(x - 30, g - h * (0.7 - k * 0.15));
      } else if (ref.raise) {
        ctx.moveTo(x - 12, g - h * 0.78); ctx.lineTo(x - 22, g - h * 1.0);
        ctx.moveTo(x + 12, g - h * 0.78); ctx.lineTo(x + 22, g - h * 1.0);
      } else {
        ctx.moveTo(x - 12, g - h * 0.78); ctx.lineTo(x - 20, g - h * 0.55);
        ctx.moveTo(x + 12, g - h * 0.78); ctx.lineTo(x + 20, g - h * 0.55);
      }
      ctx.stroke();
      ctx.restore();
    }

    function drawRing(now) {
      // arena
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#07080b'); bg.addColorStop(0.55, '#121520'); bg.addColorStop(1, '#07080a');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      // spotlight cones
      for (const sx of [250, 480, 710]) {
        const g = ctx.createRadialGradient(sx, -40, 10, sx, 260, 420);
        g.addColorStop(0, 'rgba(255,244,214,.10)'); g.addColorStop(1, 'rgba(255,244,214,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      // crowd
      const t = now / 1000;
      for (const c of crowd) {
        const jump = excitement > 0.5 ? Math.max(0, Math.sin(t * 9 + c.ph)) * excitement * 5 : Math.sin(t * 1.5 + c.ph) * 0.6;
        ctx.fillStyle = `rgba(150,160,190,${c.shade})`;
        ctx.beginPath(); ctx.arc(c.x, c.y - jump, c.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(c.x - c.r * 1.2, c.y - jump + c.r * 0.6, c.r * 2.4, c.r * 2);
      }
      // camera flashes
      flashes = flashes.filter((f) => f.life > 0);
      for (const f of flashes) {
        if (f.delay > 0) { f.delay -= 16; continue; }
        ctx.fillStyle = `rgba(255,255,255,${f.life})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, 2 + f.life * 3, 0, Math.PI * 2); ctx.fill();
        f.life -= 0.08;
      }
      if (Math.random() < 0.02 + excitement * 0.15) flashes.push({ x: Math.random() * W, y: 100 + Math.random() * 170, life: 1, delay: 0 });

      // ring floor
      ctx.fillStyle = '#1b1e26';
      ctx.beginPath(); ctx.moveTo(20, 432); ctx.lineTo(940, 432); ctx.lineTo(940, 476); ctx.lineTo(20, 476); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.font = '700 22px Oswald, Impact, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('R I N G S I D E', CENTER, 462);
      const mat = ctx.createLinearGradient(0, 300, 0, 432);
      mat.addColorStop(0, '#9aa5b4'); mat.addColorStop(1, '#c9d1db');
      ctx.fillStyle = mat;
      ctx.beginPath(); ctx.moveTo(110, 300); ctx.lineTo(850, 300); ctx.lineTo(940, 432); ctx.lineTo(20, 432); ctx.closePath(); ctx.fill();
      // center logo
      ctx.strokeStyle = 'rgba(30,40,60,.18)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(CENTER, 366, 120, 34, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(30,40,60,.14)'; ctx.font = '700 26px Oswald, Impact, sans-serif';
      ctx.fillText('RINGSIDE', CENTER, 376);
      // corner pads tint
      ctx.fillStyle = 'rgba(226,59,67,.20)'; ctx.beginPath(); ctx.moveTo(110, 300); ctx.lineTo(160, 300); ctx.lineTo(80, 340); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(47,123,230,.20)'; ctx.beginPath(); ctx.moveTo(850, 300); ctx.lineTo(800, 300); ctx.lineTo(880, 340); ctx.closePath(); ctx.fill();
      // back posts & ropes
      post(110, 300, 120, '#e23b43');
      post(850, 300, 120, '#2f7be6');
      ropes([[110, 300], [850, 300]], 120, 'rgba(240,240,245,.85)');
      ropes([[110, 300], [20, 432]], 120, 'rgba(240,240,245,.55)', 152);
      ropes([[850, 300], [940, 432]], 120, 'rgba(240,240,245,.55)', 152);
    }
    function post(x, y, h, col) {
      ctx.fillStyle = '#d8dde4'; ctx.fillRect(x - 4, y - h, 8, h);
      ctx.fillStyle = col; ctx.fillRect(x - 7, y - h - 4, 14, h * 0.75);
    }
    function ropes(pts, h0, col, h1) {
      const [[x0, y0], [x1, y1]] = pts;
      h1 = h1 || h0;
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      for (const k of [0.32, 0.6, 0.88]) {
        ctx.beginPath(); ctx.moveTo(x0, y0 - h0 * k); ctx.lineTo(x1, y1 - h1 * k); ctx.stroke();
      }
    }
    function drawFront() {
      ropes([[20, 432], [940, 432]], 152, 'rgba(250,250,255,.55)');
      post(20, 432, 152, '#f0f0f0');
      post(940, 432, 152, '#f0f0f0');
    }

    function drawEffects() {
      effects = effects.filter((e) => e.life > 0);
      for (const e of effects) {
        if (e.ring) {
          ctx.strokeStyle = `rgba(255,240,200,${e.life})`; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.stroke();
          e.r += 3.5; e.life -= e.decay;
          continue;
        }
        ctx.fillStyle = e.c.replace(/[\d.]+\)$/, `${e.life})`);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
        e.x += e.vx; e.y += e.vy; e.vy += 0.12; e.life -= e.decay;
      }
    }

    function drawOverlay(now) {
      if (ref.count) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H);
        ctx.font = '700 150px Oswald, Impact, sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 6;
        ctx.strokeText(String(ref.count), CENTER, 230); ctx.fillText(String(ref.count), CENTER, 230);
        ctx.restore();
      }
      if (!overlay) return;
      const p = (now - overlay.t0) / overlay.dur;
      if (p > 1) { overlay = null; return; }
      const a = p < 0.15 ? p / 0.15 : p > 0.75 ? (1 - p) / 0.25 : 1;
      const s = 0.9 + 0.1 * easeOut(Math.min(1, p * 4));
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(CENTER, 150); ctx.scale(s, s);
      ctx.textAlign = 'center';
      ctx.font = '700 64px Oswald, Impact, sans-serif';
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(overlay.text, 0, 0);
      ctx.fillStyle = overlay.color; ctx.fillText(overlay.text, 0, 0);
      if (overlay.sub) {
        ctx.font = '600 24px Oswald, Impact, sans-serif';
        ctx.strokeText(overlay.sub, 0, 38);
        ctx.fillStyle = '#fff'; ctx.fillText(overlay.sub, 0, 38);
      }
      ctx.restore();
    }

    function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(50, now - last);
      last = now;
      if (!paused) {
        const due = tl.filter((e) => e.at <= now);
        if (due.length) { tl = tl.filter((e) => e.at > now); due.forEach((e) => e.fn()); }
      } else {
        for (const e of tl) e.at += dt;
      }
      ctx.setTransform(dpr * canvas.width / (W * dpr), 0, 0, dpr * canvas.height / (H * dpr), 0, 0);
      ctx.save();
      if (shake > 0.2) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.86; }
      drawRing(now);
      if (fighters) {
        for (const F of [fighters.A, fighters.B]) {
          const k = F.down ? 0.05 : 0.14;
          const prev = F.x;
          F.x = lerp(F.x, F.tx, k);
          F.walk = clamp((F.x - prev) * 2.5, -12, 12);
        }
        // keep fighters from passing through each other
        if (fighters.B.x - fighters.A.x < 30) { const m = (fighters.A.x + fighters.B.x) / 2; fighters.A.x = m - 15; fighters.B.x = m + 15; }
        // shadows
        for (const F of [fighters.A, fighters.B]) {
          ctx.fillStyle = 'rgba(0,0,0,.22)';
          ctx.beginPath(); ctx.ellipse(F.x, GROUND + 2, F.H * 0.22, 7, 0, 0, Math.PI * 2); ctx.fill();
        }
        // the punching fighter is drawn on top
        const order = fighters.B.punch && !fighters.A.punch ? [fighters.A, fighters.B] : [fighters.B, fighters.A];
        drawReferee(now);
        for (const F of order) { ctx.save(); try { drawFighter(F, now); } catch (e) { console.warn(e); } ctx.restore(); }
      }
      drawFront();
      drawEffects();
      ctx.restore();
      drawOverlay(now);
    }
    raf = requestAnimationFrame(loop);
    api.destroy = () => cancelAnimationFrame(raf);
    api._fighters = () => fighters;
    return api;
  };
})(window);
