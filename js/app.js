/* Ringside — app controller: matchup builder, fight playback, Corner Mode, scorecards, odds. */
(function () {
  const BX = window.BX;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F = BX.fighterById;
  const STOP = ['KO', 'TKO', 'RTD'];

  const state = {
    A: 'usyk', B: 'fury', div: 'auto', rounds: 12, mode: 'watch', speed: 6,
    fight: null, queue: [], timer: 0, paused: false, playing: false, sum: null, seed: 0, lastRoundShown: 0,
  };

  const TAC_DESC = {
    auto: 'Let them do what they do best.',
    body: 'Sap the gas tank downstairs. Pays off late.',
    pressure: 'Cut off the ring and raise output. Costs stamina, opens you up.',
    box: 'Jab and move at range. Safer, fewer power shots.',
    counter: 'Lower output, tighter defence, punish every miss.',
    survive: 'Hold, move and ride out a bad round.',
    ko: 'All-in on power. Big risk, big reward.',
  };

  // ── setup UI ───────────────────────────────────────────────
  const divSel = $('#divSel');
  divSel.innerHTML = `<option value="auto">Auto (heavier fighter's division)</option>` +
    BX.DIVISIONS.map((d) => `<option value="${d.key}">${d.name}${d.lb ? ` (${d.lb} lb)` : ''}</option>`).join('');

  function fightDiv() {
    return state.div === 'auto' ? BX.defaultDivision(F(state.A), F(state.B)) : state.div;
  }

  function koPct(f) { return f.record.w ? Math.round((f.record.ko / f.record.w) * 100) : 0; }
  const cm2ft = (cm) => { const inch = Math.round(cm / 2.54); return `${Math.floor(inch / 12)}′${inch % 12}″`; };

  function renderCorner(side) {
    const f = F(state[side]);
    const el = side === 'A' ? $('#cornerA') : $('#cornerB');
    const d = BX.divByKey(f.div);
    el.innerHTML = `
      <div class="cc-top">
        <span class="corner-tag">${side === 'A' ? 'RED' : 'BLUE'} CORNER</span>
        <button class="btn small ghost" data-pick="${side}">Change fighter</button>
      </div>
      <div class="fname">${esc(f.name)}</div>
      <div class="nick">${f.nick ? `“${esc(f.nick)}”` : ''}</div>
      <div class="meta"><span class="cc">${f.country}</span><span>${d.name}</span><span>${BX.STYLES[f.style]}</span><span>${f.era}</span></div>
      <div class="rec"><b>${f.record.w}-${f.record.l}-${f.record.d}</b><span>${f.record.ko} KOs · ${koPct(f)}% KO rate</span></div>
      <div class="attrs">${BX.ATTR_KEYS.map((k) => `<span class="lab">${BX.ATTR_LABELS[k]}</span><span class="bar"><i style="width:${f.attr[k]}%"></i></span><span class="val">${f.attr[k]}</span>`).join('')}</div>`;
  }

  function renderTape() {
    const a = F(state.A), b = F(state.B);
    const div = fightDiv();
    const na = BX.fightNight(a, div), nb = BX.fightNight(b, div);
    const row = (k, va, vb, cmp) => {
      const adv = cmp ? Math.sign(cmp) : 0;
      return `<div class="tape-row"><span class="l ${adv > 0 ? 'adv' : ''}">${va}</span><span class="k">${k}</span><span class="r ${adv < 0 ? 'adv' : ''}">${vb}</span></div>`;
    };
    const notes = [];
    for (const [f, n] of [[a, na], [b, nb]]) {
      if (n.drain > 0.03) notes.push(`${f.short} is drained making ${BX.divByKey(div).lb} lb (stamina and chin suffer).`);
      else if (n.up > 0.06) notes.push(`${f.short} is moving up in weight (less pop, gives away size).`);
    }
    $('#tape').innerHTML = `
      <div class="tape-vs">VS</div>
      <div class="tape-sub">${BX.divByKey(div).name} · ${state.rounds} rounds</div>
      ${row('Record', `${a.record.w}-${a.record.l}-${a.record.d}`, `${b.record.w}-${b.record.l}-${b.record.d}`)}
      ${row('KO rate', `${koPct(a)}%`, `${koPct(b)}%`, koPct(a) - koPct(b))}
      ${row('Height', `${cm2ft(a.height)} <small>${a.height}cm</small>`, `${cm2ft(b.height)} <small>${b.height}cm</small>`, a.height - b.height)}
      ${row('Reach', `${Math.round(a.reach / 2.54)}″`, `${Math.round(b.reach / 2.54)}″`, a.reach - b.reach)}
      ${row('Stance', a.stance === 'S' ? 'Southpaw' : 'Orthodox', b.stance === 'S' ? 'Southpaw' : 'Orthodox')}
      ${row('Style', BX.STYLES[a.style], BX.STYLES[b.style])}
      ${row('Weigh-in', `${na.weighIn} lb`, `${nb.weighIn} lb`)}
      ${row('Fight night', `~${na.lbs} lb`, `~${nb.lbs} lb`, na.lbs - nb.lbs)}
      ${row('Prime', a.era, b.era)}
      ${notes.length ? `<div class="tape-note">${notes.map(esc).join('<br>')}</div>` : ''}`;
  }

  function renderModeExplainer() {
    const m = state.mode;
    $('#modeExplainer').innerHTML = m === 'watch'
      ? 'Sit back and watch. Both corners are run by the AI.'
      : `<b>Corner Mode:</b> you're the head trainer in the <b>${m === 'A' ? 'red' : 'blue'} corner</b> for ${esc(F(state[m]).name)}. Between every round you'll see the damage and the cards, then send your fighter out with a game plan. Good calls genuinely swing fights.`;
  }

  function renderSetup() {
    renderCorner('A'); renderCorner('B'); renderTape(); renderModeExplainer();
    divSel.value = state.div;
    $('#roundsSel').value = String(state.rounds);
    document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === state.mode));
    $('#odds').hidden = true;
  }

  document.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pick]');
    if (p) openPicker(p.dataset.pick);
  });
  divSel.addEventListener('change', () => { state.div = divSel.value; renderTape(); $('#odds').hidden = true; });
  $('#roundsSel').addEventListener('change', (e) => { state.rounds = +e.target.value; renderTape(); $('#odds').hidden = true; });
  $('#speedSel').addEventListener('change', (e) => { state.speed = +e.target.value; });
  $('#modeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.mode = b.dataset.mode;
    renderSetup();
  });
  $('#swapBtn').addEventListener('click', () => { [state.A, state.B] = [state.B, state.A]; renderSetup(); });
  $('#randomBtn').addEventListener('click', () => {
    const pool = BX.FIGHTERS;
    const a = pool[Math.floor(Math.random() * pool.length)];
    // dream fights are more fun within two divisions of each other
    const ia = BX.divIndex(a.div);
    const near = pool.filter((f) => f.id !== a.id && Math.abs(BX.divIndex(f.div) - ia) <= 2);
    const b = near[Math.floor(Math.random() * near.length)];
    state.A = a.id; state.B = b.id; state.div = 'auto';
    renderSetup();
  });

  // ── picker ─────────────────────────────────────────────────
  let pickSide = 'A';
  const pickDiv = $('#pickDiv'), pickCountry = $('#pickCountry'), pickEra = $('#pickEra'), pickSearch = $('#pickSearch');
  const COUNTRY_NAMES = { AUS: 'Australia', USA: 'USA', GBR: 'Great Britain', MEX: 'Mexico', UKR: 'Ukraine', JPN: 'Japan', PHI: 'Philippines', PUR: 'Puerto Rico', RUS: 'Russia', KAZ: 'Kazakhstan', NIC: 'Nicaragua', THA: 'Thailand', ARG: 'Argentina', PAN: 'Panama', GHA: 'Ghana', BRA: 'Brazil', CHN: 'China', NZL: 'New Zealand', GER: 'Germany', FRA: 'France', KOR: 'South Korea' };
  pickDiv.innerHTML = `<option value="">All divisions</option>` + BX.DIVISIONS.map((d) => `<option value="${d.key}">${d.name}</option>`).join('');
  const countries = [...new Set(BX.FIGHTERS.map((f) => f.country))].sort((a, b) => (COUNTRY_NAMES[a] || a).localeCompare(COUNTRY_NAMES[b] || b));
  pickCountry.innerHTML = `<option value="">All countries</option>` + countries.map((c) => `<option value="${c}">${COUNTRY_NAMES[c] || c} (${BX.FIGHTERS.filter((f) => f.country === c).length})</option>`).join('');
  const eras = [...new Set(BX.FIGHTERS.map((f) => f.era))].sort();
  pickEra.innerHTML = `<option value="">All eras</option>` + eras.map((e) => `<option>${e}</option>`).join('');

  function openPicker(side) {
    pickSide = side;
    $('#pickerTitle').textContent = `Choose the ${side === 'A' ? 'red' : 'blue'} corner`;
    $('#picker').hidden = false;
    pickSearch.value = '';
    renderPickList();
    setTimeout(() => pickSearch.focus(), 30);
  }
  function renderPickList() {
    const q = pickSearch.value.trim().toLowerCase();
    const list = BX.FIGHTERS.filter((f) =>
      (!pickDiv.value || f.div === pickDiv.value) && (!pickCountry.value || f.country === pickCountry.value) && (!pickEra.value || f.era === pickEra.value) &&
      (!q || f.name.toLowerCase().includes(q) || f.nick.toLowerCase().includes(q)));
    let html = '';
    for (const d of BX.DIVISIONS) {
      const g = list.filter((f) => f.div === d.key);
      if (!g.length) continue;
      html += `<div class="pick-group">${d.name}</div>`;
      html += g.map((f) => `<button class="pick ${state[pickSide] === f.id ? 'cur' : ''}" data-id="${f.id}"><span><span class="pn">${esc(f.name)}</span> <span class="pk">${f.nick ? '“' + esc(f.nick) + '” · ' : ''}${f.country} · ${f.era}</span></span><span class="pk">${BX.STYLES[f.style]}</span><span class="pr">${f.record.w}-${f.record.l}-${f.record.d}</span></button>`).join('');
    }
    $('#pickList').innerHTML = html || '<p style="padding:16px;color:var(--muted)">No fighters match.</p>';
  }
  [pickDiv, pickCountry, pickEra].forEach((s) => s.addEventListener('change', renderPickList));
  pickSearch.addEventListener('input', renderPickList);
  $('#pickList').addEventListener('click', (e) => {
    const b = e.target.closest('.pick'); if (!b) return;
    state[pickSide] = b.dataset.id;
    $('#picker').hidden = true;
    renderSetup();
  });
  $('#pickerClose').addEventListener('click', () => { $('#picker').hidden = true; });
  $('#picker').addEventListener('click', (e) => { if (e.target.id === 'picker') $('#picker').hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#picker').hidden = true; });

  // ── odds (1,000 sims) ──────────────────────────────────────
  $('#oddsBtn').addEventListener('click', runOdds);
  function runOdds() {
    const a = F(state.A), b = F(state.B), div = fightDiv(), rounds = state.rounds;
    const n = 1000, out = { A: { win: 0, ko: 0, dec: 0 }, B: { win: 0, ko: 0, dec: 0 }, draw: 0, byRound: new Array(rounds + 1).fill(0), stop: 0, sumR: 0, methods: {} };
    const box = $('#odds');
    box.hidden = false;
    box.innerHTML = `<h2>Simulating ${n.toLocaleString()} fights…</h2><div class="progress" style="margin-top:12px"><i id="oddsProg"></i></div>`;
    const seed0 = (Math.random() * 1e9) >>> 0;
    let i = 0;
    const step = () => {
      const end = Math.min(n, i + 40);
      for (; i < end; i++) {
        const r = BX.simulate({ a, b, div, rounds, seed: (seed0 + i * 7919) >>> 0, quick: true }).result;
        const stop = STOP.includes(r.method);
        if (r.winner) { out[r.winner].win++; out[r.winner][stop ? 'ko' : 'dec']++; } else out.draw++;
        if (stop) { out.stop++; out.sumR += r.round; out.byRound[r.round]++; }
        const key = r.winner ? `${r.winner}|${stop ? 'stop' : r.method}` : 'draw';
        out.methods[key] = (out.methods[key] || 0) + 1;
      }
      const prog = $('#oddsProg'); if (prog) prog.style.width = `${(i / n) * 100}%`;
      if (i < n) setTimeout(step, 0); else renderOdds(out, n, a, b);
    };
    setTimeout(step, 10);
  }
  function pct(x, n) { return `${((x / n) * 100).toFixed(1)}%`; }
  function toAmerican(p) {
    if (p <= 0) return '—'; if (p >= 1) return '—';
    return p >= 0.5 ? `${Math.round((-100 * p) / (1 - p))}` : `+${Math.round((100 * (1 - p)) / p)}`;
  }
  function renderOdds(o, n, a, b) {
    const pa = o.A.win / n, pb = o.B.win / n, pd = o.draw / n;
    const top = Object.entries(o.methods).sort((x, y) => y[1] - x[1])[0];
    const topLabel = (() => {
      if (!top) return '';
      if (top[0] === 'draw') return 'Draw';
      const [s, m] = top[0].split('|');
      return `${(s === 'A' ? a : b).short} by ${m === 'stop' ? 'stoppage' : { UD: 'unanimous decision', SD: 'split decision', MD: 'majority decision', TD: 'technical decision' }[m] || m}`;
    })();
    const maxR = Math.max(1, ...o.byRound);
    $('#odds').innerHTML = `
      <div class="card-head"><h2>${n.toLocaleString()} simulations · ${esc(a.name)} vs ${esc(b.name)}</h2><button class="btn small ghost" id="oddsAgain">Run again</button></div>
      <div class="odds-bar">
        <div class="a" style="width:${pa * 100}%">${pa > 0.12 ? `${esc(a.short)} ${pct(o.A.win, n)}` : ''}</div>
        <div class="d" style="width:${pd * 100}%">${pd > 0.08 ? `Draw ${pct(o.draw, n)}` : ''}</div>
        <div class="b" style="width:${pb * 100}%">${pb > 0.12 ? `${esc(b.short)} ${pct(o.B.win, n)}` : ''}</div>
      </div>
      <div class="odds-grid">
        <div class="stat"><div class="k">${esc(a.short)} wins</div><div class="v" style="color:#ff8b90">${pct(o.A.win, n)} <small style="font-size:14px;color:var(--muted)">(${toAmerican(pa)})</small></div><div class="s">KO/TKO ${pct(o.A.ko, n)} · Decision ${pct(o.A.dec, n)}</div></div>
        <div class="stat"><div class="k">${esc(b.short)} wins</div><div class="v" style="color:#7fb2ff">${pct(o.B.win, n)} <small style="font-size:14px;color:var(--muted)">(${toAmerican(pb)})</small></div><div class="s">KO/TKO ${pct(o.B.ko, n)} · Decision ${pct(o.B.dec, n)}</div></div>
        <div class="stat"><div class="k">Goes the distance</div><div class="v">${pct(n - o.stop, n)}</div><div class="s">Draws ${pct(o.draw, n)}</div></div>
        <div class="stat"><div class="k">Most likely result</div><div class="v" style="font-size:18px">${esc(topLabel)}</div><div class="s">${top ? pct(top[1], n) : ''} of sims</div></div>
      </div>
      <div style="margin-top:14px"><div class="k" style="color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.08em">Stoppages by round${o.stop ? ` · avg round ${(o.sumR / o.stop).toFixed(1)}` : ''}</div>
        <div class="round-hist">${o.byRound.slice(1).map((v) => `<div style="height:${(v / maxR) * 100}%" title="${v} stoppages"></div>`).join('')}</div>
        <div class="round-hist-l">${o.byRound.slice(1).map((_, i) => `<span>${i + 1}</span>`).join('')}</div>
      </div>`;
    $('#oddsAgain').addEventListener('click', runOdds);
  }

  // ── fight playback ─────────────────────────────────────────
  const ring = BX.Ring($('#ring'));

  $('#startBtn').addEventListener('click', () => startFight());
  $('#backBtn').addEventListener('click', backToSetup);
  $('#homeLink').addEventListener('click', (e) => { e.preventDefault(); backToSetup(); });

  function backToSetup() {
    stopPlayback();
    $('#fight').hidden = true; $('#setup').hidden = false;
    history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo({ top: 0 });
  }
  function stopPlayback() { clearTimeout(state.timer); state.playing = false; state.queue = []; }

  function startFight(seed) {
    stopPlayback();
    state.speed = +$('#speedSel').value;
    const a = F(state.A), b = F(state.B);
    state.seed = seed || (Math.random() * 1e9) >>> 0;
    const control = state.mode === 'watch' ? {} : { [state.mode]: true };
    state.fight = BX.createFight({ a, b, div: fightDiv(), rounds: state.rounds, seed: state.seed, control });
    state.sum = state.fight.summary();
    state.queue = []; state.paused = false; state.lastRoundShown = 0; state.finished = false; state.afterQueue = null; state.pendingTac = null; state.tactic = { A: 'auto', B: 'auto' };
    $('#setup').hidden = true; $('#fight').hidden = false;
    $('#resultCard').hidden = true; $('#cornerPanel').hidden = true; $('.canvas-wrap').classList.remove('cp-open');
    $('#feed').innerHTML = '';
    $('#pauseBtn').textContent = 'Pause';
    $('#fightTitle').textContent = `${a.name} vs ${b.name} · ${BX.divByKey(fightDiv()).name} · ${state.rounds} rds`;
    $('#sbA').textContent = a.short; $('#sbB').textContent = b.short;
    $('#sbKdA').textContent = ''; $('#sbKdB').textContent = '';
    $('#sbRound').textContent = 'PRE'; $('#sbClock').textContent = '0:00';
    $('#skipRoundBtn').hidden = false; $('#skipEndBtn').hidden = state.mode !== 'watch';
    setSpeedSeg();
    ring.setFighters(a, b);
    const blank = { head: 100, headMax: 100, stam: 100, body: 100, hurt: false, cut: 0, kd: 0, th: 0, la: 0, pth: 0, pla: 0, jth: 0, jla: 0 };
    renderMeters({ A: blank, B: blank });
    renderCards(0); renderPunchStats();
    location.hash = `a=${state.A}&b=${state.B}&div=${fightDiv()}&r=${state.rounds}&seed=${state.seed}&mode=${state.mode}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    state.playing = true;
    if (state.mode !== 'watch') {
      // show the intro first, then the pre-fight game plan
      state.queue.push(...state.fight.takeFrames());
      state.afterQueue = () => showCornerPanel(true);
    }
    if (state.speed === 0 && state.mode === 'watch') { instantFinish(); return; }
    pump();
  }

  function setSpeedSeg() {
    document.querySelectorAll('#speedSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.speed === state.speed));
  }
  $('#speedSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state.speed = +b.dataset.speed; $('#speedSel').value = String(state.speed); setSpeedSeg();
  });
  $('#pauseBtn').addEventListener('click', () => {
    state.paused = !state.paused;
    $('#pauseBtn').textContent = state.paused ? 'Resume' : 'Pause';
    ring.setPaused(state.paused);
    if (!state.paused) pump();
    else clearTimeout(state.timer);
  });
  $('#keyOnly').addEventListener('change', (e) => $('.feed').classList.toggle('key-only', e.target.checked));
  $('#hideCards').addEventListener('change', () => renderCards(state.lastRoundShown));

  // Skip round: render the rest of the current round's frames instantly.
  $('#skipRoundBtn').addEventListener('click', () => {
    if (!state.fight || !$('#cornerPanel').hidden) return;
    clearTimeout(state.timer);
    while (state.queue.length) {
      const fr = state.queue.shift();
      applyFrame(fr, true);
      if (fr.type === 'roundEnd' || fr.type === 'end') break;
    }
    ring.toCorners(false);
    pump();
  });
  $('#skipEndBtn').addEventListener('click', () => { if (state.fight && state.mode === 'watch') instantFinish(); });

  function instantFinish() {
    clearTimeout(state.timer);
    state.fight.runToEnd();
    state.queue.push(...state.fight.takeFrames());
    let lastFrame = null;
    while (state.queue.length) { lastFrame = state.queue.shift(); applyFrame(lastFrame, true); }
    finishFight();
  }

  function frameDuration(fr) {
    const sp = state.speed || 30;
    switch (fr.type) {
      case 'intro': return Math.max(1200, 4000 / Math.sqrt(sp));
      case 'roundStart': return Math.max(500, 2000 / Math.sqrt(sp));
      case 'roundEnd': return Math.max(900, 3600 / Math.sqrt(sp));
      case 'end': return 300;
      default: return 3000 / sp;
    }
  }

  function pump() {
    clearTimeout(state.timer);
    if (state.paused || !state.playing) return;
    if (!state.queue.length) {
      if (state.afterQueue) { const f = state.afterQueue; state.afterQueue = null; f(); return; }
      if (state.fight.done) { finishFight(); return; }
      if (state.mode !== 'watch' && state.fight.round > 0) { showCornerPanel(false); return; }
      state.queue.push(...state.fight.playRound());
      if (state.speed === 0) {
        // instant: flush this round
        while (state.queue.length) applyFrame(state.queue.shift(), true);
        ring.toCorners(true);
        return pump();
      }
    }
    const fr = state.queue.shift();
    const dur = frameDuration(fr);
    applyFrame(fr, false);
    const countMs = Math.max(140, Math.min(1000, 1000 / Math.sqrt(state.speed || 30)));
    const need = ring.playFrame(fr, dur, countMs);
    state.timer = setTimeout(pump, Math.max(dur, need));
  }

  function applyFrame(fr, silentRing) {
    // log
    const feed = $('#feed');
    if (fr.say.length) {
      const frag = document.createDocumentFragment();
      for (const s of fr.say) {
        const d = document.createElement('div');
        d.className = `ln k-${s.kind}${s.side ? ' side-' + s.side : ''}`;
        const t = s.kind === 'round' && (fr.type === 'roundStart' || fr.type === 'intro') ? '' : `R${s.r} ${s.clock}`;
        d.innerHTML = `<span class="t">${t}</span><span>${esc(s.text)}</span>`;
        frag.appendChild(d);
      }
      const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
      feed.appendChild(frag);
      if (atBottom || silentRing) feed.scrollTop = feed.scrollHeight;
    }
    // scorebug
    if (fr.type !== 'intro') {
      $('#sbRound').textContent = `R${fr.r}`;
      $('#sbClock').textContent = fr.type === 'roundStart' ? '0:00' : fr.type === 'roundEnd' ? 'END' : BX.fmtClock(Math.min(179, fr.sec + 3));
    }
    if (fr.A) {
      renderMeters(fr);
      $('#sbKdA').textContent = fr.B.kd ? `${fr.B.kd} KD` : '';
      $('#sbKdB').textContent = fr.A.kd ? `${fr.A.kd} KD` : '';
      // ($('#sbKdA') shows knockdowns scored BY red: i.e. blue's times down)
    }
    if (fr.type === 'roundStart' && fr.tactics) state.tactic = fr.tactics;
    if (fr.type === 'roundEnd') { state.lastRoundShown = fr.r; renderCards(fr.r); renderPunchStats(fr.r); }
    if (silentRing && fr.type !== 'tick') ring.playFrame(fr, 0, 0);
  }

  function renderMeters(fr) {
    for (const side of ['A', 'B']) {
      const s = fr[side];
      const f = F(state[side]);
      const tac = state.tactic && state.tactic[side] && state.tactic[side] !== 'auto' ? BX.TACTICS[state.tactic[side]].label : '';
      const pctTxt = (x, y) => (y ? Math.round((x / y) * 100) : 0);
      $(side === 'A' ? '#meterA' : '#meterB').innerHTML = `
        <div class="m-head"><span class="m-name">${esc(f.short)}</span><span class="badges">${tac ? `<span class="badge tac">${esc(tac)}</span>` : ''}${s.cut > 0 ? `<span class="badge cut">Cut</span>` : ''}${s.hurt ? '<span class="badge hurt">Hurt</span>' : ''}</span></div>
        <div class="mbar hp"><span>Condition</span><span class="track"><i style="width:${s.head}%;background-position:${s.head}% 0"></i><b style="left:${s.headMax}%"></b></span><span class="num">${s.head}</span></div>
        <div class="mbar st"><span>Stamina</span><span class="track"><i style="width:${s.stam}%"></i></span><span class="num">${s.stam}</span></div>
        <div class="mbar bd"><span>Body</span><span class="track"><i style="width:${s.body}%"></i></span><span class="num">${s.body}</span></div>
        <div class="m-stats">
          <div><b>${s.la}/${s.th}</b><span>Landed</span></div>
          <div><b>${pctTxt(s.la, s.th)}%</b><span>Connect</span></div>
          <div><b>${s.pla}</b><span>Power</span></div>
          <div><b>${s.jla}</b><span>Jabs</span></div>
        </div>`;
    }
  }

  function renderCards(uptoRound) {
    const sum = state.fight ? state.fight.summary() : null;
    const box = $('#cards');
    if (!sum) { box.innerHTML = ''; return; }
    const done = state.fight.done && !state.queue.length && state.finished;
    if ($('#hideCards').checked && !done) {
      box.innerHTML = `<div class="cards-hidden">Scorecards are sealed until the final bell. ${uptoRound ? `${uptoRound} round${uptoRound > 1 ? 's' : ''} scored.` : ''}</div>`;
      return;
    }
    const n = sum.rounds;
    const a = F(state.A).short, b = F(state.B).short;
    let html = `<table><thead><tr><th style="text-align:left">Judge</th>${Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('')}<th>Total</th></tr></thead><tbody>`;
    for (const j of sum.judges) {
      const cards = j.cards.slice(0, uptoRound);
      const ta = cards.reduce((t, c) => t + c[0], 0), tb = cards.reduce((t, c) => t + c[1], 0);
      const cell = (i, k) => {
        if (i >= cards.length) return `<td class="pending">–</td>`;
        const c = cards[i];
        const won = k === 0 ? c[0] > c[1] : c[1] > c[0];
        return `<td class="${won ? 'win' : ''}">${c[k]}</td>`;
      };
      html += `<tr><td class="judge" rowspan="2">${esc(j.name)}</td>${Array.from({ length: n }, (_, i) => cell(i, 0)).join('')}<td class="tot ra">${ta || '–'}</td></tr>`;
      html += `<tr>${Array.from({ length: n }, (_, i) => cell(i, 1)).join('')}<td class="tot rb">${tb || '–'}</td></tr>`;
    }
    html += `</tbody></table><div style="margin-top:8px;font-size:12px;color:var(--muted)">Top row <span class="ra">${esc(a)}</span>, bottom row <span class="rb">${esc(b)}</span>. Gold = round winner. 10-point must system.</div>`;
    box.innerHTML = html;
  }

  function renderPunchStats(uptoRound) {
    const sum = state.fight ? state.fight.summary() : null;
    const box = $('#punchStats');
    if (!sum) { box.innerHTML = ''; return; }
    const rA = sum.A.rounds.slice(0, uptoRound || 0), rB = sum.B.rounds.slice(0, uptoRound || 0);
    const tot = (rs, k) => rs.reduce((t, r) => t + r[k], 0);
    const row = (label, ka, kt) => {
      const la = tot(rA, ka), ta = tot(rA, kt), lb = tot(rB, ka), tb = tot(rB, kt);
      const mx = Math.max(1, la, lb);
      const p = (l, t) => (t ? Math.round((l / t) * 100) : 0);
      return `<div class="ps-row"><div class="ps-val ps-a"><span><b>${la}</b>/${ta} <small style="color:var(--muted)">${p(la, ta)}%</small></span><span class="bar"><i style="width:${(la / mx) * 100}%"></i></span></div><div class="lab">${label}</div><div class="ps-val r ps-b"><span><b>${lb}</b>/${tb} <small style="color:var(--muted)">${p(lb, tb)}%</small></span><span class="bar"><i style="width:${(lb / mx) * 100}%"></i></span></div></div>`;
    };
    const n = sum.rounds;
    const maxP = Math.max(1, ...rA.map((r) => r.la), ...rB.map((r) => r.la));
    box.innerHTML = `
      ${row('Total punches', 'la', 'th')}
      ${row('Jabs', 'jla', 'jth')}
      ${row('Power punches', 'pla', 'pth')}
      ${row('Body shots', 'body', 'pla')}
      <div class="per-round"><div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Punches landed per round</div>
        <div class="pr-grid">${Array.from({ length: n }, (_, i) => `<div class="pr-col"><i class="a" style="height:${rA[i] ? (rA[i].la / maxP) * 100 : 0}%"></i><i class="b" style="height:${rB[i] ? (rB[i].la / maxP) * 100 : 0}%"></i></div>`).join('')}</div>
        <div class="pr-labels">${Array.from({ length: n }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>
      </div>`;
    // "Body shots" row shows body landed out of power landed — label clarifies share
    box.querySelectorAll('.ps-row')[3].querySelector('.lab').textContent = 'Body (of power)';
  }

  function finishFight() {
    state.playing = false;
    state.finished = true;
    $('#cornerPanel').hidden = true;
    const sum = state.fight.summary();
    state.lastRoundShown = sum.A.rounds.length;
    renderCards(sum.judges[0].cards.length);
    renderPunchStats(sum.A.rounds.length);
    ring.endScene(sum.result);
    const r = sum.result;
    const W = r.winner ? F(state[r.winner]) : null;
    const L = r.winner ? F(state[r.winner === 'A' ? 'B' : 'A']) : null;
    const methodLong = { KO: 'Knockout', TKO: 'Technical knockout', RTD: 'Corner retirement', UD: 'Unanimous decision', SD: 'Split decision', MD: 'Majority decision', TD: 'Technical decision' }[r.method] || r.method;
    const cardsLine = r.totals && !STOP.includes(r.method) ? sum.judges.map((j, i) => `${j.name}: ${Math.max(...r.totals[i])}-${Math.min(...r.totals[i])}`).join(' · ') : '';
    let verdict = '';
    if (state.mode !== 'watch') {
      const mine = state.mode;
      verdict = r.winner === mine ? 'Your corner got it right. Great coaching.' : r.winner ? 'Tough night in the corner. Rematch and try a different game plan?' : 'A draw. So close.';
    }
    $('#resultCard').innerHTML = `
      <div class="rk">Official result</div>
      <div class="rw" style="color:${r.winner === 'A' ? '#ff8b90' : r.winner === 'B' ? '#7fb2ff' : 'var(--text)'}">${W ? `${esc(W.name)} def. ${esc(L.name)}` : 'Draw'}</div>
      <div class="rm">${methodLong}${r.detail && STOP.includes(r.method) ? ` (${esc(r.detail)})` : ''}${STOP.includes(r.method) || r.method === 'TD' ? ` · Round ${r.round}, ${r.clock}` : ` · ${sum.rounds} rounds`}</div>
      ${cardsLine ? `<div class="rc">${esc(cardsLine)}</div>` : ''}
      ${verdict ? `<div class="verdict">${verdict}</div>` : ''}
      <div class="actions" style="margin-top:16px">
        <button class="btn primary" id="rematchBtn">Rematch</button>
        ${state.mode === 'watch' ? '<button class="btn" id="replayBtn">Watch it again</button>' : ''}
        <button class="btn ghost" id="shareBtn">Copy link to this fight</button>
        <button class="btn ghost" id="newMatchBtn">New matchup</button>
      </div>`;
    $('#resultCard').hidden = false;
    $('#rematchBtn').onclick = () => startFight();
    if ($('#replayBtn')) $('#replayBtn').onclick = () => startFight(state.seed);
    $('#newMatchBtn').onclick = backToSetup;
    $('#shareBtn').onclick = async () => {
      try { await navigator.clipboard.writeText(location.href); $('#shareBtn').textContent = 'Link copied'; } catch { $('#shareBtn').textContent = 'Copy the URL bar'; }
    };
    setTimeout(() => $('#resultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 600);
  }

  // ── Corner Mode ────────────────────────────────────────────
  function showCornerPanel(prefight) {
    const side = state.mode;
    const v = state.fight.cornerView(side);
    const me = F(state[side]), opp = F(state[side === 'A' ? 'B' : 'A']);
    const recSet = new Set(v.advice.map((a) => a[0]));
    let advice = v.advice.map((a) => `<li>${esc(a[1])}</li>`).join('');
    if (prefight) {
      const tips = [];
      if (me.reach > opp.reach + 6) { tips.push(`You've got a ${Math.round((me.reach - opp.reach) / 2.54)}″ reach advantage. Make it count at range.`); recSet.add('box'); }
      if (opp.reach > me.reach + 6) { tips.push(`${opp.short} has the reach. Get inside or you'll eat jabs all night.`); recSet.add('pressure'); }
      if (opp.attr.chin < 80) { tips.push(`${opp.short}'s chin is questionable. Big shots will tell.`); recSet.add('ko'); }
      if (opp.attr.sta < 80) { tips.push(`${opp.short} fades late. Body work now pays off later.`); recSet.add('body'); }
      if (opp.attr.pow > 90) { tips.push(`${opp.short} can punch. Respect the power and don't get reckless.`); recSet.add('counter'); }
      if (opp.style === 'swarmer') { tips.push(`${opp.short} will come forward. Make them pay on the way in.`); recSet.add('counter'); }
      if (!tips.length) tips.push(`Even matchup on paper. Win the early rounds and adjust.`);
      advice = tips.map((t) => `<li>${esc(t)}</li>`).join('');
    }
    const pick = state.pendingTac || (prefight ? 'auto' : v.current || 'auto');
    const tacs = Object.keys(BX.TACTICS).map((k) => `<button class="tac ${k === pick ? 'sel' : ''} ${recSet.has(k) ? 'suggested' : ''}" data-tac="${k}"><b>${esc(BX.TACTICS[k].label)}</b><span>${esc(TAC_DESC[k])}</span></button>`).join('');
    const avg = (x) => (x / 3).toFixed(0);
    const cardTxt = v.round ? (state.mode && $('#hideCards').checked ? 'Cards sealed' : `Unofficial: ${avg(v.card.mine)}-${avg(v.card.theirs)}`) : '';
    const bar = (label, val, max, col) => `<div class="mbar ${col}"><span>${label}</span><span class="track"><i style="width:${val}%;background-position:${val}% 0"></i>${max !== undefined ? `<b style="left:${max}%"></b>` : ''}</span><span class="num">${val}</span></div>`;
    $('#cornerPanel').innerHTML = `
      <div class="cp-head">
        <div class="cp-title">${prefight ? 'Fight-night game plan' : `Between rounds · Round ${v.round + 1} of ${v.rounds} next`}<small>You're in ${esc(me.short)}'s corner. ${prefight ? 'Set the plan for round 1.' : 'You have 60 seconds. What do you tell them?'}</small></div>
        <div class="cp-card">${cardTxt}</div>
      </div>
      <div class="cp-grid">
        <div class="cp-box"><h3>${esc(me.short)} on the stool</h3>
          ${bar('Condition', v.me.head, v.me.headMax, 'hp')}
          ${bar('Stamina', v.me.stam, undefined, 'st')}
          ${bar('Body', v.me.body, undefined, 'bd')}
          <div style="margin-top:6px;color:var(--muted)">${v.me.cut ? `Cut over the ${v.cutEye} eye (${v.me.cut > 6 ? 'bad' : v.me.cut > 3 ? 'worsening' : 'minor'}). ` : 'No cuts. '}${v.opp.kd ? `You've scored ${v.opp.kd} knockdown${v.opp.kd > 1 ? 's' : ''}. ` : ''}${v.me.kd ? `Been down ${v.me.kd}×.` : ''}</div>
        </div>
        <div class="cp-box"><h3>Scouting ${esc(opp.short)}</h3>
          ${bar('Condition', v.opp.head, v.opp.headMax, 'hp')}
          ${bar('Stamina', v.opp.stam, undefined, 'st')}
          ${bar('Body', v.opp.body, undefined, 'bd')}
          ${v.round ? `<div style="margin-top:6px;color:var(--muted)">Last round: you landed ${v.last.la}/${v.last.th} (${v.last.pla} power), they landed ${v.last.ola}/${v.last.oth}.</div>` : ''}
        </div>
      </div>
      <div class="cp-box"><h3>Your assistant's read</h3><ul class="cp-advice">${advice || '<li>Nothing alarming. Keep doing what works.</li>'}</ul></div>
      <div class="tac-grid">${tacs}</div>
      <div class="cp-actions">
        <button class="btn primary" id="sendOut">${prefight ? 'Ring the bell' : `Seconds out · Round ${v.round + 1}`}</button>
        ${prefight ? '' : '<button class="btn danger small" id="towel">Throw in the towel</button>'}
        <span style="color:var(--muted);font-size:12.5px">★ = suggested by your assistant</span>
      </div>`;
    state.pendingTac = pick;
    const panel = $('#cornerPanel');
    panel.hidden = false;
    panel.parentElement.classList.add('cp-open');
    panel.scrollTop = 0;
    if (window.innerWidth <= 640) panel.scrollIntoView({ behavior: 'smooth' });
    panel.querySelectorAll('.tac').forEach((b) => b.addEventListener('click', () => {
      state.pendingTac = b.dataset.tac;
      panel.querySelectorAll('.tac').forEach((x) => x.classList.toggle('sel', x === b));
    }));
    $('#sendOut').onclick = () => {
      state.fight.setTactic(side, state.pendingTac || 'auto');
      state.pendingTac = null;
      panel.hidden = true; panel.parentElement.classList.remove('cp-open');
      state.queue.push(...state.fight.playRound());
      if (state.speed === 0) {
        while (state.queue.length) applyFrame(state.queue.shift(), true);
        ring.toCorners(true);
      }
      pump();
    };
    const towel = $('#towel');
    if (towel) towel.onclick = () => {
      if (!confirm(`Throw in the towel and stop the fight? ${opp.short} wins by retirement.`)) return;
      state.fight.setTactic(side, 'towel');
      panel.hidden = true; panel.parentElement.classList.remove('cp-open');
      state.queue.push(...state.fight.playRound());
      pump();
    };
  }

  // ── boot ───────────────────────────────────────────────────
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('a') && F(h.get('a'))) state.A = h.get('a');
    if (h.get('b') && F(h.get('b'))) state.B = h.get('b');
    if (h.get('div') && BX.divByKey(h.get('div'))) state.div = h.get('div');
    if (h.get('r')) state.rounds = Math.max(1, Math.min(15, +h.get('r') || 12));
    if (h.get('mode') && ['watch', 'A', 'B'].includes(h.get('mode'))) state.mode = h.get('mode');
    return h.get('seed') ? +h.get('seed') : 0;
  }
  const seed = readHash();
  renderSetup();
  if (seed && state.mode === 'watch') startFight(seed);
})();
