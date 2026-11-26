'use strict';

/*
 * My Family — a toddler photo-and-voice board.
 * Everything (photos, voice recordings, settings) is stored on this device
 * in IndexedDB. Nothing is uploaded anywhere.
 */

// ---------------------------------------------------------------- storage
const DB_NAME = 'family-app';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('people')) db.createObjectStore('people', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const dbReady = openDB();

async function tx(storeName, mode, fn) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const req = fn(t.objectStore(storeName));
    let result;
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const peopleDB = {
  all: () => tx('people', 'readonly', s => s.getAll()),
  put: p => tx('people', 'readwrite', s => s.put(p)),
  del: id => tx('people', 'readwrite', s => s.delete(id)),
  clear: () => tx('people', 'readwrite', s => s.clear()),
};
const settingsDB = {
  get: k => tx('settings', 'readonly', s => s.get(k)),
  set: (k, v) => tx('settings', 'readwrite', s => s.put(v, k)),
};

// ---------------------------------------------------------------- state
const DEFAULT_SETTINGS = { childName: '', sessionMinutes: 15 };
const state = {
  people: [],
  settings: { ...DEFAULT_SETTINGS },
  urls: new Map(),
  screen: 'play',
};
const PALETTE = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'];
const $ = sel => document.querySelector(sel);

async function load() {
  const s = await settingsDB.get('settings');
  state.settings = { ...DEFAULT_SETTINGS, ...(s || {}) };
  state.people = (await peopleDB.all()).sort((a, b) => a.order - b.order);
}

async function saveSettings() {
  await settingsDB.set('settings', state.settings);
}

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Object URLs, cached per person so we don't leak them. */
function urlFor(id, kind, blob) {
  const key = id + ':' + kind;
  const cached = state.urls.get(key);
  if (cached && cached.blob === blob) return cached.url;
  if (cached) URL.revokeObjectURL(cached.url);
  if (!blob) { state.urls.delete(key); return null; }
  const url = URL.createObjectURL(blob);
  state.urls.set(key, { blob, url });
  return url;
}

function colorFor(i) { return `var(${PALETTE[i % PALETTE.length]})`; }

function childName() { return (state.settings.childName || '').trim(); }

function familyTitle() {
  const n = childName();
  return n ? `${n}’s Family` : 'My Family';
}

// ---------------------------------------------------------------- screens
function show(name) {
  document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === name));
  document.body.dataset.screen = name;
  state.screen = name;
  window.scrollTo(0, 0);
}

/** Fires on a real tap (not a scroll/drag). Works for whole-palm toddler taps and long presses. */
function onTap(el, fn) {
  let start = null;
  el.addEventListener('pointerdown', e => { start = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  el.addEventListener('pointerup', e => {
    if (!start || e.pointerId !== start.id) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    start = null;
    if (moved < 24) fn(e);
  });
  el.addEventListener('pointercancel', () => { start = null; });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(e); }
  });
}

function fillFace(faceEl, person) {
  faceEl.replaceChildren();
  const url = person ? urlFor(person.id, 'photo', person.photo) : null;
  if (url) {
    const img = new Image();
    img.src = url;
    img.alt = '';
    img.draggable = false;
    faceEl.append(img);
  } else {
    faceEl.textContent = ((person && person.name) || '?').trim().charAt(0).toUpperCase() || '?';
  }
}

// ---------------------------------------------------------------- play screen
function renderGrid() {
  const grid = $('#grid');
  grid.replaceChildren();
  $('#title').textContent = familyTitle();
  document.title = familyTitle();
  $('#empty').hidden = state.people.length > 0;

  state.people.forEach((p, i) => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile';
    tile.style.setProperty('--tc', colorFor(i));
    const face = document.createElement('div');
    face.className = 'face';
    fillFace(face, p);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;
    tile.append(face, name);
    onTap(tile, () => tapPerson(p, i, tile));
    grid.append(tile);
  });
}

let audio = null;
let overlayTimer = null;
let overlaySafety = null;
let overlayCurrent = null;

function stopSound() {
  if (audio) { audio.onended = null; audio.pause(); audio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function sayText(text, onend) {
  if (!('speechSynthesis' in window)) { if (onend) setTimeout(onend, 1200); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85;
  u.pitch = 1.15;
  u.onend = () => onend && onend();
  u.onerror = () => onend && onend();
  speechSynthesis.speak(u);
}

function speakPerson(p, onend) {
  stopSound();
  const url = urlFor(p.id, 'voice', p.voice);
  const fallback = () => sayText(`This is ${p.name}!`, onend);
  if (!url) { fallback(); return; }
  audio = new Audio(url);
  audio.onended = onend;
  audio.play().catch(fallback);
}

function tapPerson(p, i, tile) {
  if (sessionOver) return;
  tile.classList.remove('bounce');
  void tile.offsetWidth; // restart the animation
  tile.classList.add('bounce');
  openOverlay(p, i);
}

function openOverlay(p, i) {
  const ov = $('#overlay');
  overlayCurrent = { p, i };
  ov.style.setProperty('--tc', colorFor(i));
  fillFace($('#ov-face'), p);
  $('#ov-name').textContent = p.name;
  ov.hidden = false;
  ov.classList.remove('pop', 'speaking');
  void ov.offsetWidth;
  ov.classList.add('pop', 'speaking');

  clearTimeout(overlayTimer);
  clearTimeout(overlaySafety);
  overlaySafety = setTimeout(closeOverlay, 20000); // never get stuck
  speakPerson(p, () => {
    ov.classList.remove('speaking');
    overlayTimer = setTimeout(closeOverlay, 1500);
  });
}

function closeOverlay() {
  clearTimeout(overlayTimer);
  clearTimeout(overlaySafety);
  stopSound();
  $('#overlay').hidden = true;
  overlayCurrent = null;
}

// Tapping the big face plays the voice again.
onTap($('#overlay'), () => {
  if (overlayCurrent) openOverlay(overlayCurrent.p, overlayCurrent.i);
});

// ---------------------------------------------------------------- play session
let sessionTimer = null;
let sessionOver = false;
let hiddenAt = 0;

function startSession() {
  clearTimeout(sessionTimer);
  sessionOver = false;
  const minutes = Number(state.settings.sessionMinutes) || 0;
  if (minutes > 0) sessionTimer = setTimeout(endSession, minutes * 60 * 1000);
}

function endSession() {
  clearTimeout(sessionTimer);
  sessionOver = true;
  closeOverlay();
  const n = childName();
  $('#bye-text').textContent = n ? `All done! Bye-bye, ${n}!` : 'All done! Bye-bye!';
  show('goodbye');
  sayText(n ? `All done! Bye bye, ${n}!` : 'All done! Bye bye!');
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    closeOverlay();
    return;
  }
  // Coming back after an hour or more (e.g. the next day) starts a fresh session.
  if (hiddenAt && Date.now() - hiddenAt > 60 * 60 * 1000 && (state.screen === 'play' || state.screen === 'goodbye')) {
    show('play');
    startSession();
  }
});

// ---------------------------------------------------------------- grown-up corner
(function setupCorner() {
  const corner = $('#corner');
  const HOLD_MS = 2000;
  let timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; corner.classList.remove('holding'); };
  corner.addEventListener('pointerdown', e => {
    e.preventDefault();
    cancel();
    void corner.offsetWidth;
    corner.classList.add('holding');
    timer = setTimeout(() => { cancel(); openGate(); }, HOLD_MS);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => corner.addEventListener(ev, cancel));
})();

// ---------------------------------------------------------------- gate
let gateAnswer = '';
let gateInput = '';
let gateIdle = null;
let gateReturnTo = 'play';

function newGateQuestion() {
  const a = 6 + Math.floor(Math.random() * 4); // 6–9
  const b = 4 + Math.floor(Math.random() * 6); // 4–9 → sums are always two digits
  gateAnswer = String(a + b);
  gateInput = '';
  $('#gate-q').textContent = `${a} + ${b} = ?`;
  renderGateInput();
}

function renderGateInput() {
  $('#gate-input').textContent = gateInput || ' ';
}

function bumpGateIdle() {
  clearTimeout(gateIdle);
  gateIdle = setTimeout(leaveGate, 30000);
}

function openGate() {
  closeOverlay();
  gateReturnTo = state.screen === 'goodbye' ? 'goodbye' : 'play';
  newGateQuestion();
  show('gate');
  bumpGateIdle();
}

function leaveGate() {
  clearTimeout(gateIdle);
  if (state.screen === 'gate') show(gateReturnTo);
}

document.querySelectorAll('.keypad button').forEach(btn => {
  btn.addEventListener('click', () => {
    const k = btn.dataset.k;
    bumpGateIdle();
    if (k === 'cancel') { leaveGate(); return; }
    if (k === 'clear') { gateInput = ''; renderGateInput(); return; }
    gateInput += k;
    renderGateInput();
    if (gateInput.length < gateAnswer.length) return;
    if (gateInput === gateAnswer) {
      clearTimeout(gateIdle);
      openParent();
    } else {
      const g = $('.gate');
      g.classList.remove('shake');
      void g.offsetWidth;
      g.classList.add('shake');
      setTimeout(newGateQuestion, 350);
    }
  });
});

// ---------------------------------------------------------------- grown-up settings
function openParent() {
  stopSound();
  clearTimeout(sessionTimer);
  renderParent();
  show('parent');
}

function renderParent() {
  $('#child-name').value = state.settings.childName;
  $('#session-mins').value = String(state.settings.sessionMinutes);

  const list = $('#people-list');
  list.replaceChildren();
  $('#people-empty').hidden = state.people.length > 0;

  state.people.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'person-row';
    li.style.setProperty('--tc', colorFor(i));

    const face = document.createElement('div');
    face.className = 'face thumb';
    fillFace(face, p);

    const info = document.createElement('div');
    info.className = 'info';
    const strong = document.createElement('strong');
    strong.textContent = p.name;
    const small = document.createElement('small');
    small.textContent = p.voice ? '🎙️ Voice recorded' : 'No voice yet (uses a computer voice)';
    info.append(strong, small);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const up = button('↑', 'btn icon', () => move(i, -1), 'Move up');
    up.disabled = i === 0;
    const down = button('↓', 'btn icon', () => move(i, 1), 'Move down');
    down.disabled = i === state.people.length - 1;
    const edit = button('Edit', 'btn', () => openEditor(p));
    actions.append(up, down, edit);

    li.append(face, info, actions);
    list.append(li);
  });
}

function button(label, cls, onClick, aria) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.textContent = label;
  if (aria) b.setAttribute('aria-label', aria);
  b.addEventListener('click', onClick);
  return b;
}

async function move(i, dir) {
  const j = i + dir;
  const arr = state.people;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  arr.forEach((p, k) => { p.order = k; });
  await Promise.all([peopleDB.put(arr[i]), peopleDB.put(arr[j])]);
  renderParent();
  renderGrid();
}

$('#child-name').addEventListener('input', e => {
  state.settings.childName = e.target.value;
  saveSettings();
});
$('#session-mins').addEventListener('change', e => {
  state.settings.sessionMinutes = Number(e.target.value) || 0;
  saveSettings();
});
$('#add-person').addEventListener('click', () => openEditor(null));
$('#done').addEventListener('click', () => {
  renderGrid();
  show('play');
  startSession();
});

// ---------------------------------------------------------------- editor
let draft = null;
let previewAudio = null;
const MAX_REC_SECONDS = 10;
let recorder = null;
let recStream = null;
let recChunks = [];
let recTick = null;
let recStartedAt = 0;
let recDiscard = false;

function openEditor(p) {
  draft = p
    ? { ...p }
    : { id: newId(), name: '', photo: null, voice: null, voiceType: '', order: state.people.length };
  draft.isNew = !p;
  $('#ed-title').textContent = p ? `Edit ${p.name}` : 'Add a person';
  $('#ed-name').value = draft.name;
  $('#ed-delete').hidden = !p;
  $('#ed-error').hidden = true;
  const idx = p ? state.people.indexOf(p) : state.people.length;
  $('#ed-photo').style.setProperty('--tc', colorFor(Math.max(0, idx)));
  renderDraftPhoto();
  updateVoiceUI();
  updateVoiceHint();
  $('#editor').showModal();
}

function renderDraftPhoto() {
  const el = $('#ed-photo');
  el.replaceChildren();
  if (draft.photo) {
    const img = new Image();
    const url = URL.createObjectURL(draft.photo);
    img.onload = () => URL.revokeObjectURL(url);
    img.src = url;
    img.alt = '';
    el.append(img);
  } else {
    el.textContent = (draft.name || '?').trim().charAt(0).toUpperCase() || '?';
  }
}

function updateVoiceHint() {
  const kid = childName() || 'sweetie';
  const who = ($('#ed-name').value || '').trim() || 'Grandma';
  $('#ed-voice-hint').textContent = `Try: “Hi ${kid}! It's ${who}! I love you!” Up to ${MAX_REC_SECONDS} seconds, said slowly and cheerfully.`;
}

$('#ed-name').addEventListener('input', () => {
  draft.name = $('#ed-name').value;
  if (!draft.photo) renderDraftPhoto();
  updateVoiceHint();
});

function isRecording() { return recorder && recorder.state === 'recording'; }

function updateVoiceUI() {
  const rec = $('#ed-rec');
  const status = $('#ed-voice-status');
  if (isRecording()) {
    const left = Math.max(0, MAX_REC_SECONDS - Math.floor((Date.now() - recStartedAt) / 1000));
    rec.textContent = `■ Stop (${left}s)`;
    rec.classList.add('recording');
    $('#ed-play').disabled = true;
    $('#ed-del-voice').disabled = true;
    status.textContent = 'Recording… speak now.';
    return;
  }
  rec.classList.remove('recording');
  rec.textContent = draft && draft.voice ? '● Record again' : '● Record';
  $('#ed-play').disabled = !(draft && draft.voice);
  $('#ed-del-voice').disabled = !(draft && draft.voice);
  status.textContent = draft && draft.voice
    ? 'Voice recorded ✓'
    : 'No recording yet. Without one, a computer voice says the name.';
}

function setVoiceError(msg) {
  const status = $('#ed-voice-status');
  status.textContent = msg;
}

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  return candidates.find(m => MediaRecorder.isTypeSupported(m)) || '';
}

async function startRecording() {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    setVoiceError('Recording needs the app opened from its https:// web address (in Chrome or Safari).');
    return;
  }
  stopPreview();
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    setVoiceError('The microphone is blocked. Allow microphone access for this site in the browser settings, then try again.');
    return;
  }
  const mime = pickMimeType();
  recChunks = [];
  recDiscard = false;
  recorder = new MediaRecorder(recStream, mime ? { mimeType: mime } : undefined);
  recorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
  recorder.onstop = () => {
    clearInterval(recTick);
    const type = recorder.mimeType || mime || 'audio/webm';
    recStream.getTracks().forEach(t => t.stop());
    recStream = null;
    recorder = null;
    if (!recDiscard && draft) {
      const blob = new Blob(recChunks, { type });
      if (blob.size > 0) { draft.voice = blob; draft.voiceType = type; }
    }
    recChunks = [];
    if (draft) updateVoiceUI();
    if (stopResolver) { stopResolver(); stopResolver = null; }
  };
  recorder.start();
  recStartedAt = Date.now();
  updateVoiceUI();
  recTick = setInterval(() => {
    if ((Date.now() - recStartedAt) / 1000 >= MAX_REC_SECONDS) stopRecording();
    else updateVoiceUI();
  }, 250);
}

let stopResolver = null;
function stopRecording(discard = false) {
  if (!isRecording()) return Promise.resolve();
  recDiscard = discard;
  return new Promise(resolve => {
    stopResolver = resolve;
    recorder.stop();
  });
}

function stopPreview() {
  if (previewAudio) {
    previewAudio.pause();
    URL.revokeObjectURL(previewAudio.src);
    previewAudio = null;
  }
}

$('#ed-rec').addEventListener('click', () => {
  if (isRecording()) stopRecording();
  else startRecording();
});

$('#ed-play').addEventListener('click', () => {
  if (!draft || !draft.voice) return;
  stopPreview();
  previewAudio = new Audio(URL.createObjectURL(draft.voice));
  previewAudio.onended = stopPreview;
  previewAudio.play().catch(() => setVoiceError('This recording could not be played on this device. Try recording again.'));
});

$('#ed-del-voice').addEventListener('click', () => {
  stopPreview();
  draft.voice = null;
  draft.voiceType = '';
  updateVoiceUI();
});

$('#ed-photo-input').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    draft.photo = await squarePhoto(file);
    renderDraftPhoto();
    $('#ed-error').hidden = true;
  } catch (err) {
    showEditorError("Couldn't open that photo. Try a JPG or PNG.");
  }
});

/** Crop to a square (biased toward the top, where faces usually are) and shrink to save space. */
async function squarePhoto(file, maxSize = 720) {
  let src;
  try {
    src = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (_) {
    src = await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }
  const w = src.width;
  const h = src.height;
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = h > w ? (h - side) * 0.3 : 0;
  const out = Math.min(maxSize, side);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = out;
  canvas.getContext('2d').drawImage(src, sx, sy, side, side, 0, 0, out, out);
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.86);
  });
}

function showEditorError(msg) {
  const el = $('#ed-error');
  el.textContent = msg;
  el.hidden = false;
}

async function closeEditor() {
  await stopRecording(true);
  stopPreview();
  draft = null;
  if ($('#editor').open) $('#editor').close();
}

$('#ed-cancel').addEventListener('click', closeEditor);
$('#editor').addEventListener('cancel', e => { e.preventDefault(); closeEditor(); });
$('#ed-form').addEventListener('submit', e => e.preventDefault());

$('#ed-save').addEventListener('click', async () => {
  if (!draft) return;
  const name = $('#ed-name').value.trim();
  if (!name) {
    showEditorError('Please add a name.');
    $('#ed-name').focus();
    return;
  }
  await stopRecording(false);
  const { isNew, ...person } = draft;
  person.name = name;
  try {
    await peopleDB.put(person);
  } catch (err) {
    showEditorError('Could not save. The tablet may be out of storage space.');
    return;
  }
  const idx = state.people.findIndex(x => x.id === person.id);
  if (idx >= 0) state.people[idx] = person;
  else state.people.push(person);
  requestPersistentStorage();
  await closeEditor();
  renderParent();
  renderGrid();
});

$('#ed-delete').addEventListener('click', async () => {
  if (!draft || draft.isNew) return;
  if (!confirm(`Remove ${draft.name} from the family board? Their photo and recording will be deleted.`)) return;
  const id = draft.id;
  await peopleDB.del(id);
  urlFor(id, 'photo', null);
  urlFor(id, 'voice', null);
  state.people = state.people.filter(x => x.id !== id);
  state.people.forEach((p, k) => { p.order = k; });
  await Promise.all(state.people.map(p => peopleDB.put(p)));
  await closeEditor();
  renderParent();
  renderGrid();
});

let persistAsked = false;
function requestPersistentStorage() {
  if (persistAsked) return;
  persistAsked = true;
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

// ---------------------------------------------------------------- backup
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataURLToBlob(url, kind) {
  if (typeof url !== 'string' || !url.startsWith(`data:${kind}/`)) return null;
  const res = await fetch(url);
  return res.blob();
}

$('#export').addEventListener('click', async () => {
  const data = {
    app: 'family-app',
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    people: await Promise.all(state.people.map(async p => ({
      id: p.id,
      name: p.name,
      order: p.order,
      voiceType: p.voiceType || '',
      photo: p.photo ? await blobToDataURL(p.photo) : null,
      voice: p.voice ? await blobToDataURL(p.voice) : null,
    }))),
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `family-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});

$('#import').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch (_) { data = null; }
  if (!data || data.app !== 'family-app' || !Array.isArray(data.people)) {
    alert("That file isn't a family backup from this app.");
    return;
  }
  if (!confirm(`Replace everyone on this tablet with the ${data.people.length} people in this backup?`)) return;
  const list = await Promise.all(data.people.map(async (p, i) => ({
    id: String(p.id || newId()),
    name: String(p.name || 'Someone'),
    order: i,
    voiceType: String(p.voiceType || ''),
    photo: await dataURLToBlob(p.photo, 'image'),
    voice: await dataURLToBlob(p.voice, 'audio'),
  })));
  await peopleDB.clear();
  for (const p of list) await peopleDB.put(p);
  if (data.settings && typeof data.settings === 'object') {
    state.settings = {
      ...DEFAULT_SETTINGS,
      childName: String(data.settings.childName || ''),
      sessionMinutes: Number(data.settings.sessionMinutes) || 0,
    };
    await saveSettings();
  }
  await load();
  requestPersistentStorage();
  renderParent();
  renderGrid();
});

// ---------------------------------------------------------------- start
document.addEventListener('contextmenu', e => {
  if (state.screen !== 'parent') e.preventDefault();
});

(async function init() {
  try {
    await load();
  } catch (err) {
    console.error(err);
  }
  renderGrid();
  show('play');
  startSession();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
