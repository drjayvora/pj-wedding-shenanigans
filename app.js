import { CONFIG } from './config.js?v=3';

/* ───────────── helpers ───────────── */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => (n < -0.5 ? '−' : '') + '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = s => s ? new Date(s + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const SIDES = CONFIG.sides;
const EMOJI = { Roka: '🪔', Engagement: '💍', 'Gol Dhana': '🍬', Mehendi: '🌿', Haldi: '🌼', Sangeet: '🎶', Wedding: '🪷', Reception: '🥂', Venue: '🏛️', Catering: '🍛', Decor: '💐', Photography: '📸', Shopping: '🛍️', 'Travel & Stay': '🧳', Gifts: '🎁' };
const fnEmoji = f => EMOJI[f] || '✨';
const ratioOf = e => e.split === 'V' ? 1 : e.split === 'P' ? 0 : (e.ratio ?? 50) / 100;
const splitLabel = e => e.split === 'common' ? `Shared ${e.ratio ?? 50}:${100 - (e.ratio ?? 50)}` : `${SIDES[e.split].short} only`;

const state = {
  store: null, user: null, people: [], expenses: [], payments: [],
  view: 'overview', settleMode: 'family', filter: { q: '', fn: 'all', split: 'all' }, seeded: false
};

/* ───────────── data stores ───────────── */
const isCloud = () => CONFIG.firebase?.apiKey && !CONFIG.firebase.apiKey.startsWith('YOUR');

async function cloudStore() {
  const b = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [{ initializeApp }, fs, au] = await Promise.all([
    import(b + 'firebase-app.js'), import(b + 'firebase-firestore.js'), import(b + 'firebase-auth.js')
  ]);
  const app = initializeApp(CONFIG.firebase);
  const db = fs.getFirestore(app), auth = au.getAuth(app);
  const col = n => fs.collection(db, 'weddings', CONFIG.weddingId, n);
  const who = () => auth.currentUser?.email || '';
  return {
    mode: 'cloud',
    onAuth: cb => au.onAuthStateChanged(auth, cb),
    async signIn() {
      const p = new au.GoogleAuthProvider();
      try { await au.signInWithPopup(auth, p); }
      catch (e) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) await au.signInWithRedirect(auth, p);
        else if (e.code !== 'auth/popup-closed-by-user') throw e;
      }
    },
    signOut: () => au.signOut(auth),
    subscribe: (n, cb, err) => fs.onSnapshot(col(n), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), err),
    add: (n, d) => fs.addDoc(col(n), { ...d, createdAt: Date.now(), createdBy: who() }),
    set: (n, id, d) => fs.setDoc(fs.doc(col(n), id), { ...d, createdAt: Date.now(), createdBy: who() }, { merge: true }),
    update: (n, id, d) => fs.updateDoc(fs.doc(col(n), id), { ...d, updatedAt: Date.now(), updatedBy: who() }),
    remove: (n, id) => fs.deleteDoc(fs.doc(col(n), id))
  };
}

function localStore() {
  const KEY = 'pj-shenanigans-local-v1';
  let db; try { db = JSON.parse(localStorage.getItem(KEY)); } catch { }
  db = db || { people: [], expenses: [], payments: [] };
  const subs = { people: [], expenses: [], payments: [] };
  const save = n => { localStorage.setItem(KEY, JSON.stringify(db)); subs[n].forEach(cb => cb([...db[n]])); };
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  return {
    mode: 'local',
    onAuth: cb => cb({ email: 'local', displayName: 'Local mode' }),
    signIn() { }, signOut() { },
    subscribe(n, cb) { subs[n].push(cb); cb([...db[n]]); return () => { }; },
    async add(n, d) { db[n].push({ id: uid(), ...d, createdAt: Date.now() }); save(n); },
    async set(n, id, d) { db[n] = db[n].filter(x => x.id !== id).concat({ id, ...d, createdAt: Date.now() }); save(n); },
    async update(n, id, d) { db[n] = db[n].map(x => x.id === id ? { ...x, ...d, updatedAt: Date.now() } : x); save(n); },
    async remove(n, id) { db[n] = db[n].filter(x => x.id !== id); save(n); }
  };
}

/* ───────────── maths ───────────── */
function simplify(net) {
  const cr = [], db = [];
  for (const [id, v] of Object.entries(net)) { const r = Math.round(v); if (r > 0) cr.push([id, r]); else if (r < 0) db.push([id, -r]); }
  cr.sort((a, b) => b[1] - a[1]); db.sort((a, b) => b[1] - a[1]);
  const out = []; let i = 0, j = 0;
  while (i < db.length && j < cr.length) {
    const m = Math.min(db[i][1], cr[j][1]);
    if (m >= 1) out.push({ from: db[i][0], to: cr[j][0], amount: m });
    db[i][1] -= m; cr[j][1] -= m;
    if (db[i][1] < 1) i++; if (cr[j][1] < 1) j++;
  }
  return out;
}

function compute() {
  const pm = new Map(state.people.map(p => [p.id, p]));
  const sideOf = id => pm.get(id)?.side ?? 'V';
  const head = s => (state.people.find(p => p.side === s && p.head) || state.people.find(p => p.side === s))?.id;
  const net = {}, bump = (id, v) => { if (id) net[id] = (net[id] || 0) + v; };
  const fam = { V: { paid: 0, share: 0, bal: 0 }, P: { paid: 0, share: 0, bal: 0 } };
  const tot = { all: 0, common: 0, V: 0, P: 0 }, byFn = {};
  for (const e of state.expenses) {
    const a = +e.amount || 0, r = ratioOf(e), vs = a * r, ps = a - vs, s = sideOf(e.paidBy);
    tot.all += a; tot[e.split] = (tot[e.split] || 0) + a;
    const f = e.fn || 'Other'; byFn[f] = (byFn[f] || 0) + a;
    fam[s].paid += a; fam.V.share += vs; fam.P.share += ps;
    bump(e.paidBy, a); bump(head('V'), -vs); bump(head('P'), -ps);
  }
  for (const p of state.payments) {
    const a = +p.amount || 0;
    bump(p.from, a); bump(p.to, -a);
    fam[sideOf(p.from)].bal += a; fam[sideOf(p.to)].bal -= a;
  }
  fam.V.bal += fam.V.paid - fam.V.share;
  fam.P.bal += fam.P.paid - fam.P.share;
  const vb = Math.round(fam.V.bal);
  const familyTx = Math.abs(vb) < 1 ? [] : vb > 0 ? [{ from: head('P'), to: head('V'), amount: vb }] : [{ from: head('V'), to: head('P'), amount: -vb }];
  return { pm, sideOf, fam, tot, byFn, familyTx, personTx: simplify(net) };
}

/* ───────────── views ───────────── */
const sorted = () => [...state.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
const nameOf = (pm, id) => esc(pm.get(id)?.name || 'Someone');

function expItem(e, pm) {
  return `<button class="exp" data-action="edit-exp" data-id="${e.id}">
    <span class="exp-ic">${fnEmoji(e.fn)}</span>
    <span class="exp-main"><span class="exp-t">${esc(e.title)}</span>
      <span class="exp-m">${nameOf(pm, e.paidBy)} paid · ${fmtDate(e.date)}${e.fn ? ' · ' + esc(e.fn) : ''}</span></span>
    <span class="exp-r"><span class="exp-a">${inr(e.amount)}</span><span class="tag tag-${e.split}">${splitLabel(e)}</span></span>
  </button>`;
}

function famCard(k, f) {
  const b = Math.round(f.bal);
  const chip = Math.abs(b) < 1 ? '<span class="chip ok">All square</span>' : b > 0 ? `<span class="chip up">Gets back ${inr(b)}</span>` : `<span class="chip down">Owes ${inr(-b)}</span>`;
  return `<article class="card fam fam-${k}">
    <header><span class="dot"></span><h3>${esc(SIDES[k].name)}</h3></header>
    <dl><div><dt>Paid</dt><dd>${inr(f.paid)}</dd></div><div><dt>Fair share</dt><dd>${inr(f.share)}</dd></div></dl>
    ${chip}
  </article>`;
}

function vOverview(c) {
  const tx = c.familyTx[0];
  const hero = !state.expenses.length
    ? `<p class="hero-label">Welcome</p><p class="hero-big">Let the shenanigans begin</p><p class="hero-sub">Add the first shared cost and we'll keep the score.</p>`
    : tx ? `<p class="hero-label">To square up</p><p class="hero-big">${esc(SIDES[c.sideOf(tx.from)].short)} <span class="arrow">→</span> ${esc(SIDES[c.sideOf(tx.to)].short)}</p><p class="hero-amt">${inr(tx.amount)}</p>
           <button class="btn btn-light" data-view="settle">See settlement</button>`
      : `<p class="hero-label">Balance</p><p class="hero-big">All square ✨</p><p class="hero-sub">Both families are even. Love that for you.</p>`;
  const fns = Object.entries(c.byFn).sort((a, b) => b[1] - a[1]);
  const max = fns[0]?.[1] || 1;
  const recent = sorted().slice(0, 5);
  return `
  <section class="hero">${hero}</section>
  <section class="stats">
    <div class="stat"><span>Total spend</span><strong>${inr(c.tot.all)}</strong></div>
    <div class="stat"><span>Shared pot</span><strong>${inr(c.tot.common || 0)}</strong></div>
    <div class="stat"><span>${esc(SIDES.V.short)} only</span><strong>${inr(c.tot.V || 0)}</strong></div>
    <div class="stat"><span>${esc(SIDES.P.short)} only</span><strong>${inr(c.tot.P || 0)}</strong></div>
  </section>
  <section class="grid2">${famCard('V', c.fam.V)}${famCard('P', c.fam.P)}</section>
  ${fns.length ? `<section class="card"><h2 class="h2">By function</h2><ul class="bars">${fns.map(([f, v]) => `
    <li><button data-action="filter-fn" data-fn="${esc(f)}"><span class="bl">${fnEmoji(f)} ${esc(f)}</span><span class="bv">${inr(v)}</span>
    <span class="track"><span style="width:${Math.max(4, v / max * 100)}%"></span></span></button></li>`).join('')}</ul></section>` : ''}
  <section class="card"><div class="row-h"><h2 class="h2">Recent</h2>${recent.length ? '<button class="link" data-view="expenses">See all</button>' : ''}</div>
    ${recent.length ? `<div class="list">${recent.map(e => expItem(e, c.pm)).join('')}</div>` : `<p class="empty">Nothing yet. Tap <b>+</b> to add an expense.</p>`}
  </section>`;
}

function filtered() {
  const { q, fn, split } = state.filter, ql = q.trim().toLowerCase();
  const pm = new Map(state.people.map(p => [p.id, p]));
  return sorted().filter(e => (fn === 'all' || (e.fn || 'Other') === fn) && (split === 'all' || e.split === split) &&
    (!ql || [e.title, e.notes, e.fn, pm.get(e.paidBy)?.name].join(' ').toLowerCase().includes(ql)));
}

function expList() {
  const pm = new Map(state.people.map(p => [p.id, p]));
  const list = filtered(), sum = list.reduce((s, e) => s + (+e.amount || 0), 0);
  return `<p class="sum">${list.length} ${list.length === 1 ? 'expense' : 'expenses'} · <b>${inr(sum)}</b></p>
    ${list.length ? `<div class="list">${list.map(e => expItem(e, pm)).join('')}</div>` : '<p class="empty">No expenses match.</p>'}`;
}

function vExpenses() {
  const fns = [...new Set(state.expenses.map(e => e.fn || 'Other'))].sort();
  const f = state.filter;
  const chip = (v, l) => `<button class="fchip ${f.fn === v ? 'on' : ''}" data-action="filter-fn" data-fn="${esc(v)}">${l}</button>`;
  return `<h2 class="page-h">Expenses</h2>
  <div class="toolbar">
    <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>
      <input id="q" type="search" placeholder="Search expenses" value="${esc(f.q)}" autocomplete="off" /></label>
    <select id="split-f" aria-label="Split type">
      <option value="all">All splits</option>
      <option value="common" ${f.split === 'common' ? 'selected' : ''}>Shared</option>
      <option value="V" ${f.split === 'V' ? 'selected' : ''}>${esc(SIDES.V.short)} only</option>
      <option value="P" ${f.split === 'P' ? 'selected' : ''}>${esc(SIDES.P.short)} only</option>
    </select>
  </div>
  <div class="chips">${chip('all', 'All')}${fns.map(x => chip(x, fnEmoji(x) + ' ' + esc(x))).join('')}</div>
  <div id="exp-list">${expList()}</div>`;
}

function vSettle(c) {
  const fam = state.settleMode === 'family';
  const txs = fam ? c.familyTx : c.personTx;
  const pays = [...state.payments].sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const who = id => fam ? esc(SIDES[c.sideOf(id)].name) : nameOf(c.pm, id);
  return `<h2 class="page-h">Settle up</h2>
  <div class="seg" role="tablist">
    <button class="${fam ? 'on' : ''}" data-action="settle-mode" data-mode="family">Between families</button>
    <button class="${!fam ? 'on' : ''}" data-action="settle-mode" data-mode="people">Person to person</button>
  </div>
  <p class="hint">${fam ? 'One transfer between the two families. Settled by each family\'s head.' : 'Fewest transfers between individuals, including paybacks inside a family.'}</p>
  <section class="card">
    ${txs.length ? txs.map(t => `<div class="tx">
      <div class="tx-who"><span class="av av-${c.sideOf(t.from)}">${who(t.from).charAt(0)}</span><div><b>${who(t.from)}</b><small>pays ${who(t.to)}</small></div></div>
      <div class="tx-r"><strong>${inr(t.amount)}</strong><button class="btn btn-sm" data-action="record" data-from="${t.from}" data-to="${t.to}" data-amt="${t.amount}">Mark paid</button></div>
    </div>`).join('') : `<p class="empty big">🎉 Everyone is square.</p>`}
  </section>
  <div class="row-h"><h2 class="h2">Payments recorded</h2><button class="link" data-action="add-pay">+ Record payment</button></div>
  <section class="card">
    ${pays.length ? pays.map(p => `<button class="exp" data-action="edit-pay" data-id="${p.id}">
      <span class="exp-ic">💸</span><span class="exp-main"><span class="exp-t">${nameOf(c.pm, p.from)} → ${nameOf(c.pm, p.to)}</span>
      <span class="exp-m">${fmtDate(p.date)}${p.note ? ' · ' + esc(p.note) : ''}</span></span><span class="exp-r"><span class="exp-a">${inr(p.amount)}</span></span></button>`).join('')
      : '<p class="empty">No settlements yet.</p>'}
  </section>`;
}

function vMore(c) {
  const grp = k => state.people.filter(p => p.side === k).map(p => {
    const paid = state.expenses.filter(e => e.paidBy === p.id).reduce((s, e) => s + (+e.amount || 0), 0);
    return `<button class="person" data-action="edit-person" data-id="${p.id}"><span class="av av-${k}">${esc(p.name.charAt(0))}</span>
      <span class="exp-main"><span class="exp-t">${esc(p.name)}${p.head ? ' <span class="crown">Family head</span>' : ''}</span><span class="exp-m">Paid ${inr(paid)}</span></span><span class="chev">›</span></button>`;
  }).join('') || '<p class="empty">No one yet.</p>';
  const u = state.user;
  return `<h2 class="page-h">Family</h2>
  ${['V', 'P'].map(k => `<section class="card"><div class="row-h"><h2 class="h2"><span class="dot dot-${k}"></span>${esc(SIDES[k].name)}</h2><span class="muted">Share ${inr(c.fam[k].share)}</span></div>${grp(k)}</section>`).join('')}
  <button class="btn btn-outline btn-block" data-action="add-person">+ Add family member</button>
  <section class="card settings">
    <h2 class="h2">Settings</h2>
    <button class="set-row" data-action="export"><span>⬇️ Export to CSV</span><span class="chev">›</span></button>
    <div class="set-row"><span>${state.store.mode === 'cloud' ? '☁️ Live sync on' : '📱 Local mode'}</span><span class="muted">${state.store.mode === 'cloud' ? esc(u?.email) : 'this device only'}</span></div>
    ${state.store.mode === 'cloud' ? '<button class="set-row" data-action="sign-out"><span>↩︎ Sign out</span><span class="chev">›</span></button>' : '<p class="hint">Add your Firebase config in <code>config.js</code> to sync between phones.</p>'}
  </section>
  <p class="footer-note">Made with love for P &amp; J · ${new Date().getFullYear()}</p>`;
}

function render() {
  const c = compute();
  const v = { overview: vOverview, expenses: vExpenses, settle: vSettle, more: vMore }[state.view];
  $('#view').innerHTML = v(c);
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
}

/* ───────────── sheets (forms) ───────────── */
const sheet = $('#sheet');
function openSheet(html) {
  sheet.innerHTML = `<div class="sheet-in"><span class="grab"></span>${html}</div>`;
  sheet.showModal();
  setTimeout(() => sheet.querySelector('[autofocus]')?.focus({ preventScroll: true }), 50);
}
const closeSheet = () => sheet.close();
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

const personOpts = sel => ['V', 'P'].map(k => `<optgroup label="${esc(SIDES[k].name)}">${state.people.filter(p => p.side === k)
  .map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('');

function expForm(e) {
  const x = e || { split: 'common', ratio: 50, date: today(), paidBy: (state.people.find(p => p.side === 'V' && p.head) || state.people[0])?.id };
  const r = x.ratio ?? 50;
  openSheet(`<form data-form="exp" data-id="${e?.id || ''}">
    <h2 class="sheet-h">${e ? 'Edit expense' : 'New expense'}</h2>
    <label class="amt"><span>₹</span><input name="amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" required value="${x.amount ?? ''}" ${e ? '' : 'autofocus'} /></label>
    <label class="f"><span>What was it for?</span><input name="title" required maxlength="80" placeholder="e.g. Sangeet DJ advance" value="${esc(x.title || '')}" /></label>
    <div class="f2">
      <label class="f"><span>Paid by</span><select name="paidBy" required>${personOpts(x.paidBy)}</select></label>
      <label class="f"><span>Date</span><input name="date" type="date" required value="${esc(x.date || today())}" /></label>
    </div>
    <label class="f"><span>Function</span><input name="fn" list="fn-list" placeholder="Sangeet, Wedding, Decor…" value="${esc(x.fn || '')}" />
      <datalist id="fn-list">${CONFIG.functions.map(f => `<option value="${esc(f)}">`).join('')}</datalist></label>
    <fieldset class="f"><legend>Who bears this cost?</legend>
      <div class="seg seg-3">
        ${[['common', 'Shared'], ['V', SIDES.V.short + ' only'], ['P', SIDES.P.short + ' only']].map(([v, l]) =>
    `<label><input type="radio" name="split" value="${v}" ${x.split === v ? 'checked' : ''} /><span>${esc(l)}</span></label>`).join('')}
      </div>
    </fieldset>
    <div class="ratio" ${x.split === 'common' ? '' : 'hidden'}>
      <div class="ratio-h"><span>${esc(SIDES.V.short)} <b id="rv">${r}%</b></span><span><b id="rp">${100 - r}%</b> ${esc(SIDES.P.short)}</span></div>
      <input name="ratio" type="range" min="0" max="100" step="5" value="${r}" />
      <p class="ratio-p" id="rprev"></p>
    </div>
    <label class="f"><span>Notes <i>(optional)</i></span><textarea name="notes" rows="2" maxlength="300" placeholder="Vendor, receipt link, anything…">${esc(x.notes || '')}</textarea></label>
    <div class="sheet-act">
      ${e ? '<button type="button" class="btn btn-danger" data-action="del-exp">Delete</button>' : '<button type="button" class="btn btn-ghost" data-action="close">Cancel</button>'}
      <button class="btn btn-primary" type="submit">${e ? 'Save changes' : 'Add expense'}</button>
    </div>
    ${e?.createdBy && e.createdBy !== 'local' ? `<p class="meta">Added by ${esc(e.createdBy)}${e.updatedBy ? ' · edited by ' + esc(e.updatedBy) : ''}</p>` : ''}
  </form>`);
  updateRatio();
}

function updateRatio() {
  const f = sheet.querySelector('form[data-form="exp"]'); if (!f) return;
  const split = f.split.value, r = +f.ratio.value, a = +f.amount.value || 0;
  f.querySelector('.ratio').hidden = split !== 'common';
  $('#rv').textContent = r + '%'; $('#rp').textContent = (100 - r) + '%';
  f.ratio.style.setProperty('--p', r + '%');
  $('#rprev').textContent = a ? `${SIDES.V.short} ${inr(a * r / 100)}  ·  ${SIDES.P.short} ${inr(a - a * r / 100)}` : 'Default is 50:50 — slide to change';
}
sheet.addEventListener('input', updateRatio);

function payForm(p, pre) {
  const x = p || { date: today(), ...pre };
  openSheet(`<form data-form="pay" data-id="${p?.id || ''}">
    <h2 class="sheet-h">${p ? 'Edit payment' : 'Record a payment'}</h2>
    <label class="amt"><span>₹</span><input name="amount" type="number" inputmode="decimal" min="1" step="0.01" required value="${x.amount ?? ''}" autofocus /></label>
    <div class="f2">
      <label class="f"><span>From</span><select name="from" required>${personOpts(x.from)}</select></label>
      <label class="f"><span>To</span><select name="to" required>${personOpts(x.to)}</select></label>
    </div>
    <label class="f"><span>Date</span><input name="date" type="date" required value="${esc(x.date)}" /></label>
    <label class="f"><span>Note <i>(optional)</i></span><input name="note" maxlength="120" placeholder="UPI, cash, cheque…" value="${esc(x.note || '')}" /></label>
    <div class="sheet-act">
      ${p ? '<button type="button" class="btn btn-danger" data-action="del-pay">Delete</button>' : '<button type="button" class="btn btn-ghost" data-action="close">Cancel</button>'}
      <button class="btn btn-primary" type="submit">${p ? 'Save' : 'Record payment'}</button>
    </div>
  </form>`);
}

function personForm(p) {
  const x = p || { side: 'V' };
  openSheet(`<form data-form="person" data-id="${p?.id || ''}">
    <h2 class="sheet-h">${p ? 'Edit member' : 'Add family member'}</h2>
    <label class="f"><span>Name</span><input name="name" required maxlength="40" value="${esc(x.name || '')}" autofocus /></label>
    <fieldset class="f"><legend>Family</legend><div class="seg">
      ${['V', 'P'].map(k => `<label><input type="radio" name="side" value="${k}" ${x.side === k ? 'checked' : ''} /><span>${esc(SIDES[k].name)}</span></label>`).join('')}
    </div></fieldset>
    <label class="check"><input type="checkbox" name="head" ${x.head ? 'checked' : ''} /><span>Family head <small>— settles on behalf of the family</small></span></label>
    <div class="sheet-act">
      ${p ? '<button type="button" class="btn btn-danger" data-action="del-person">Remove</button>' : '<button type="button" class="btn btn-ghost" data-action="close">Cancel</button>'}
      <button class="btn btn-primary" type="submit">Save</button>
    </div>
  </form>`);
}

sheet.addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target, id = f.dataset.id, d = Object.fromEntries(new FormData(f)), S = state.store;
  const btn = f.querySelector('[type=submit]'); btn.disabled = true;
  try {
    if (f.dataset.form === 'exp') {
      const data = { title: d.title.trim(), amount: Math.round(+d.amount * 100) / 100, paidBy: d.paidBy, date: d.date, fn: d.fn.trim() || 'Other', split: d.split, ratio: d.split === 'common' ? +d.ratio : null, notes: d.notes.trim() };
      if (!(data.amount > 0)) throw new Error('Enter an amount');
      id ? await S.update('expenses', id, data) : await S.add('expenses', data);
      toast(id ? 'Expense updated' : 'Expense added ✨');
    } else if (f.dataset.form === 'pay') {
      if (d.from === d.to) throw new Error('Pick two different people');
      const data = { from: d.from, to: d.to, amount: Math.round(+d.amount * 100) / 100, date: d.date, note: d.note.trim() };
      id ? await S.update('payments', id, data) : await S.add('payments', data);
      toast('Payment recorded 💸');
    } else if (f.dataset.form === 'person') {
      const data = { name: d.name.trim(), side: d.side, head: !!d.head };
      if (data.head) for (const p of state.people) if (p.side === data.side && p.head && p.id !== id) await S.update('people', p.id, { head: false });
      id ? await S.update('people', id, data) : await S.add('people', data);
      toast('Saved');
    }
    closeSheet();
  } catch (err) { toast(err.message || 'Something went wrong', true); btn.disabled = false; }
});

/* ───────────── actions ───────────── */
async function confirmDel(col, id, msg) {
  if (!confirm(msg)) return;
  try { await state.store.remove(col, id); closeSheet(); toast('Deleted'); } catch (e) { toast(e.message, true); }
}

function exportCsv() {
  const pm = new Map(state.people.map(p => [p.id, p]));
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Function', 'Description', 'Amount', 'Paid by', 'Payer family', 'Split', `${SIDES.V.short} share`, `${SIDES.P.short} share`, 'Notes']];
  for (const e of sorted().reverse()) {
    const a = +e.amount || 0, r = ratioOf(e), p = pm.get(e.paidBy);
    rows.push([e.date, e.fn, e.title, a, p?.name, SIDES[p?.side]?.short, splitLabel(e), (a * r).toFixed(2), (a - a * r).toFixed(2), e.notes]);
  }
  rows.push([], ['Payments'], ['Date', 'From', 'To', 'Amount', 'Note']);
  for (const p of state.payments) rows.push([p.date, pm.get(p.from)?.name, pm.get(p.to)?.name, p.amount, p.note]);
  const blob = new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `pj-wedding-shenanigans-${today()}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-view],[data-action]'); if (!t) return;
  if (t.dataset.view) { state.view = t.dataset.view; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const a = t.dataset.action, id = t.dataset.id || sheet.querySelector('form')?.dataset.id;
  const find = (arr, i) => arr.find(x => x.id === i);
  switch (a) {
    case 'sign-in': state.store.signIn().catch(err => toast(err.message, true)); break;
    case 'sign-out': state.store.signOut(); break;
    case 'add-exp': if (!state.people.length) return toast('Add a family member first', true); expForm(); break;
    case 'edit-exp': expForm(find(state.expenses, id)); break;
    case 'del-exp': confirmDel('expenses', id, 'Delete this expense?'); break;
    case 'add-pay': payForm(); break;
    case 'record': payForm(null, { from: t.dataset.from, to: t.dataset.to, amount: t.dataset.amt }); break;
    case 'edit-pay': payForm(find(state.payments, id)); break;
    case 'del-pay': confirmDel('payments', id, 'Delete this payment?'); break;
    case 'add-person': personForm(); break;
    case 'edit-person': personForm(find(state.people, id)); break;
    case 'del-person':
      if (state.expenses.some(x => x.paidBy === id) || state.payments.some(x => x.from === id || x.to === id)) return toast('They have expenses or payments — reassign those first', true);
      confirmDel('people', id, 'Remove this member?'); break;
    case 'settle-mode': state.settleMode = t.dataset.mode; render(); break;
    case 'filter-fn': state.filter.fn = t.dataset.fn; state.view = 'expenses'; render(); break;
    case 'export': exportCsv(); break;
    case 'close': closeSheet(); break;
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'q') { state.filter.q = e.target.value; $('#exp-list').innerHTML = expList(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'split-f') { state.filter.split = e.target.value; $('#exp-list').innerHTML = expList(); }
});

let toastT;
function toast(msg, bad) {
  const el = $('#toast'); el.textContent = msg; el.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toastT); toastT = setTimeout(() => el.className = 'toast', 2600);
}

/* ───────────── boot ───────────── */
let unsubs = [];
function startData() {
  unsubs.forEach(u => u && u()); unsubs = [];
  const err = e => toast(e.code === 'permission-denied' ? 'No access — is your email in the allow-list and rules?' : e.message, true);
  for (const n of ['people', 'expenses', 'payments']) {
    unsubs.push(state.store.subscribe(n, rows => {
      state[n] = n === 'people' ? rows.sort((a, b) => (b.head ? 1 : 0) - (a.head ? 1 : 0) || (a.name || '').localeCompare(b.name || '')) : rows;
      if (n === 'people' && !rows.length && !state.seeded) {
        state.seeded = true;
        CONFIG.people.forEach(({ id, ...p }) => state.store.set('people', id, p));
      }
      render();
    }, err));
  }
}

function showGate(msg, wrongUser) {
  $('#app').hidden = true; $('#gate').hidden = false;
  $('#gate-msg').textContent = msg;
  $('#gate-out').hidden = !wrongUser;
  $('[data-action="sign-in"]').hidden = !!wrongUser;
}

(async function boot() {
  try { state.store = isCloud() ? await cloudStore() : localStore(); }
  catch (e) { console.error(e); state.store = localStore(); toast('Could not reach Firebase — running locally', true); }
  $('#mode-pill').textContent = state.store.mode === 'cloud' ? 'Live' : 'Local';
  $('#mode-pill').classList.toggle('live', state.store.mode === 'cloud');
  state.store.onAuth(user => {
    state.user = user;
    if (!user) { unsubs.forEach(u => u && u()); unsubs = []; return showGate('One shared ledger for both families. Sign in to start.'); }
    const allow = (CONFIG.allowedEmails || []).map(s => s.toLowerCase());
    if (state.store.mode === 'cloud' && allow.length && !allow.includes((user.email || '').toLowerCase()))
      return showGate(`${user.email} isn't on the guest list for this ledger.`, true);
    $('#gate').hidden = true; $('#app').hidden = false;
    startData();
  });
})();
