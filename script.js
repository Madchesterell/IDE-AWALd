// ============================================================
// 1. IMPORT FIREBASE
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, getDocs, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================
// 2. KONFIGURASI FIREBASE
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCEZ_9ni_0u9WY5fQCSsHt8RZFlijetLgs",
  authDomain: "workspace-1146e.firebaseapp.com",
  projectId: "workspace-1146e",
  storageBucket: "workspace-1146e.firebasestorage.app",
  messagingSenderId: "617778820449",
  appId: "1:617778820449:web:8f239651dda6dfd0f8c120",
  measurementId: "G-YZGE0SBE5V"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================================
// 3. STATE APLIKASI
// ============================================================
let state = {
  roomId: null,
  roomName: null,
  role: null,        // 'mentor' atau 'worker'
  workerName: null,
  driveLink: '',
  workers: [],
  tasks: []
};

let unsubscribers = []; // untuk berhenti listen saat logout

// ============================================================
// 4. HELPER
// ============================================================
const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function hashPassword(password) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function setLiveStatus(ok) {
  const el = $('liveStatus');
  if (!el) return;
  el.textContent = ok ? '🟢 Live Sync' : '🔴 Offline';
  el.style.color = ok ? '#16a34a' : '#dc2626';
}

// ============================================================
// 5. AUTH GATE
// ============================================================
window.switchAuthTab = function(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.classList.add('active');
  $('joinRoomForm').classList.toggle('hidden', tab !== 'join');
  $('createRoomForm').classList.toggle('hidden', tab !== 'create');
};

function showAuthGate() {
  $('authContainer').classList.remove('hidden');
  $('mainApp').classList.add('hidden');
}

function hideAuthGate() {
  $('authContainer').classList.add('hidden');
  $('mainApp').classList.remove('hidden');
}

async function handleCreateRoom(e) {
  e.preventDefault();
  const roomName = $('newRoomName').value.trim();
  const password = $('newRoomPass').value.trim();
  const driveLink = $('newRoomDrive').value.trim();

  if (!roomName || !password) return alert('Isi nama ruang dan kata sandi!');
  if (password.length < 4) return alert('Kata sandi minimal 4 karakter.');

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Memproses...';

  try {
    const roomsRef = collection(db, 'rooms');
    const cek = await getDocs(query(roomsRef, where('roomNameLower', '==', roomName.toLowerCase()), limit(1)));
    if (!cek.empty) {
      alert('Nama ruang kerja sudah dipakai. Pilih nama lain.');
      return;
    }

    const passwordHash = await hashPassword(password);
    const roomDoc = await addDoc(roomsRef, {
      roomName,
      roomNameLower: roomName.toLowerCase(),
      passwordHash,
      mentorDriveLink: driveLink,
      createdAt: serverTimestamp()
    });

    const session = { roomId: roomDoc.id, roomName, role: 'mentor', workerName: 'Mentor' };
    localStorage.setItem('ws_session', JSON.stringify(session));
    Object.assign(state, session);

    await loadWorkspace();
  } catch (err) {
    console.error(err);
    alert('Gagal membuat ruang: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Dirikan Ruang Kerja (Jadi Mentor)';
  }
}

async function handleJoinRoom(e) {
  e.preventDefault();
  const roomName = $('joinRoomName').value.trim();
  const password = $('joinRoomPass').value.trim();
  const workerName = $('joinWorkerName').value.trim();

  if (!roomName || !password || !workerName) return alert('Isi semua field!');

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Memproses...';

  try {
    const snap = await getDocs(query(collection(db, 'rooms'),
      where('roomNameLower', '==', roomName.toLowerCase()), limit(1)));
    if (snap.empty) {
      alert('Ruang kerja tidak ditemukan.');
      return;
    }

    const roomDoc = snap.docs[0];
    const roomData = roomDoc.data();

    const passwordHash = await hashPassword(password);
    if (roomData.passwordHash !== passwordHash) {
      alert('Kata sandi salah!');
      return;
    }

    const workersRef = collection(db, 'rooms', roomDoc.id, 'workers');
    const workersSnap = await getDocs(workersRef);
    if (workersSnap.size >= 20) {
      alert('Ruang kerja sudah penuh (maks 20 pekerja).');
      return;
    }

    const sudahAda = workersSnap.docs.find(d => d.data().name.toLowerCase() === workerName.toLowerCase());
    if (!sudahAda) {
      await addDoc(workersRef, { name: workerName, createdAt: serverTimestamp() });
    }

    const session = { roomId: roomDoc.id, roomName: roomData.roomName, role: 'worker', workerName };
    localStorage.setItem('ws_session', JSON.stringify(session));
    Object.assign(state, session);

    await loadWorkspace();
  } catch (err) {
    console.error(err);
    alert('Gagal bergabung: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Masuk ke Ruang Kerja';
  }
}

// ============================================================
// 6. LOAD WORKSPACE
// ============================================================
async function loadWorkspace() {
  hideAuthGate();

  $('mentorPanel').classList.toggle('hidden', state.role !== 'mentor');
  $('workerDailyGoalBox').classList.toggle('hidden', state.role !== 'worker');

  $('roleControls').innerHTML = `
    <span style="font-size:0.8rem;color:var(--text-muted);">
      ${state.role === 'mentor' ? '👨‍🏫 Mentor' : '👷 Pekerja'} ·
      <strong>${escapeHtml(state.workerName)}</strong> ·
      Room: <strong>${escapeHtml(state.roomName)}</strong>
    </span>
    <button type="button" class="btn-secondary" id="logoutBtn" style="padding:0.35rem 0.75rem;font-size:0.75rem;">Keluar</button>
  `;
  $('logoutBtn').addEventListener('click', logout);

  subscribeToRoom();
}

// ============================================================
// 7. SUBSCRIBE KE DATA ROOM
// ============================================================
function subscribeToRoom() {
  unsubscribers.forEach(u => u());
  unsubscribers = [];

  const workersRef = collection(db, 'rooms', state.roomId, 'workers');
  const unsubWorkers = onSnapshot(
    query(workersRef, orderBy('createdAt', 'asc')),
    (snap) => {
      state.workers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderWorkers();
      updateWorkerSelect();
      updateWorkerCount();
      loadDailyGoal();
      setLiveStatus(true);
    },
    (err) => { console.error(err); setLiveStatus(false); }
  );
  unsubscribers.push(unsubWorkers);

  const tasksRef = collection(db, 'rooms', state.roomId, 'tasks');
  const unsubTasks = onSnapshot(
    query(tasksRef, orderBy('createdAt', 'desc')),
    (snap) => {
      state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderKanban();
      updateKpiProgress();
      setLiveStatus(true);
    },
    (err) => { console.error(err); setLiveStatus(false); }
  );
  unsubscribers.push(unsubTasks);

  const unsubRoom = onSnapshot(doc(db, 'rooms', state.roomId), (docSnap) => {
    if (docSnap.exists()) {
      state.driveLink = docSnap.data().mentorDriveLink || '';
      updateDriveStatus();
    }
  });
  unsubscribers.push(unsubRoom);
}

// ============================================================
// 8. RENDER
// ============================================================
function renderWorkers() {
  const list = $('workerList');
  if (!list) return;
  list.innerHTML = state.workers.map(w => `
    <li class="worker-tag">
      ${escapeHtml(w.name)}
      ${state.role === 'mentor' ? `<button class="remove-worker" onclick="removeWorker('${w.id}')" title="Hapus">×</button>` : ''}
    </li>
  `).join('') || '<li class="empty-hint">Belum ada pekerja.</li>';
}

function updateWorkerSelect() {
  const select = $('taskAssignee');
  if (!select) return;
  select.innerHTML = state.workers.length
    ? state.workers.map(w => `<option value="${escapeHtml(w.name)}">${escapeHtml(w.name)}</option>`).join('')
    : '<option value="">(Tambah pekerja dulu)</option>';
}

function updateWorkerCount() {
  const el = $('workerCountDisplay');
  if (el) el.textContent = `Pekerja: ${state.workers.length} / 20`;
}

function updateDriveStatus() {
  const statusEl = $('driveStatusText');
  const inputEl = $('driveLinkInput');
  if (!statusEl) return;
  if (state.driveLink) {
    statusEl.textContent = `✅ Folder tertaut: ${state.driveLink}`;
    statusEl.classList.add('linked');
  } else {
    statusEl.textContent = 'Belum ada folder tertaut.';
    statusEl.classList.remove('linked');
  }
  if (inputEl) inputEl.value = state.driveLink;
}

function renderKanban() {
  ['todo', 'progress', 'review', 'done'].forEach(status => {
    let filtered = state.tasks.filter(t => t.status === status);
    if (state.role === 'worker') {
      filtered = filtered.filter(t => t.assignee === state.workerName);
    }
    $('count-' + status).textContent = filtered.length;
    $('list-' + status).innerHTML = filtered.map(renderTaskCard).join('') ||
      '<p class="empty-hint">Kosong</p>';
  });
}

function renderTaskCard(task) {
  const isOverdue = task.endDate && new Date(task.endDate) < new Date() && task.status !== 'done';
  const isWorker = state.role === 'worker';
  const isMentor = state.role === 'mentor';

  const canStart = isWorker && task.status === 'todo' && task.assignee === state.workerName;
  const canReport = isWorker && task.status === 'progress' && task.assignee === state.workerName;
  const canValidate = isMentor && task.status === 'review';
  const canReopen = isMentor && task.status === 'done';

  return `
    <div class="task-card ${isOverdue ? 'overdue' : ''}">
      <div class="task-header">
        <h4>${escapeHtml(task.title)}</h4>
        <span class="kpi-badge">${task.kpi} KPI</span>
      </div>
      ${task.desc ? `<p class="task-desc">${escapeHtml(task.desc)}</p>` : ''}
      <div class="task-meta">
        <span>👤 ${escapeHtml(task.assignee)}</span>
        <span>📅 ${task.startDate || '-'} → ${task.endDate || '-'}</span>
      </div>
      ${task.reportNotes ? `<div class="task-report"><strong>📎 Laporan:</strong> ${escapeHtml(task.reportNotes)}${task.reportFileName ? ` <em>(${escapeHtml(task.reportFileName)})</em>` : ''}</div>` : ''}
      <div class="task-actions">
        ${canStart ? `<button class="btn-sm" onclick="moveTask('${task.id}','progress')">▶ Mulai</button>` : ''}
        ${canReport ? `<button class="btn-sm" onclick="openReportModal('${task.id}')">📤 Kirim Laporan</button>` : ''}
        ${canValidate ? `<button class="btn-sm btn-success" onclick="moveTask('${task.id}','done')">✅ Validasi</button>
                         <button class="btn-sm btn-warning" onclick="moveTask('${task.id}','progress')">↩ Revisi</button>` : ''}
        ${canReopen ? `<button class="btn-sm btn-warning" onclick="moveTask('${task.id}','review')">↩ Buka Kembali</button>` : ''}
      </div>
    </div>`;
}

function updateKpiProgress() {
  let relevant = state.tasks;
  if (state.role === 'worker') {
    relevant = state.tasks.filter(t => t.assignee === state.workerName);
  }
  const total = relevant.reduce((s, t) => s + (Number(t.kpi) || 0), 0);
  const done = relevant.filter(t => t.status === 'done').reduce((s, t) => s + (Number(t.kpi) || 0), 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  $('kpiProgressText').textContent = `${done} dari ${total} Poin KPI Tercapai (${pct}%)`;
  $('kpiProgressBar').style.width = pct + '%';
}

// ============================================================
// 9. ACTIONS
// ============================================================
window.moveTask = async (taskId, newStatus) => {
  try {
    await updateDoc(doc(db, 'rooms', state.roomId, 'tasks', taskId), {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
  } catch (err) { alert('Gagal: ' + err.message); }
};

window.removeWorker = async (workerId) => {
  if (!confirm('Hapus pekerja ini?')) return;
  try {
    await deleteDoc(doc(db, 'rooms', state.roomId, 'workers', workerId));
  } catch (err) { alert('Gagal: ' + err.message); }
};

window.openReportModal = (taskId) => {
  $('reportTaskId').value = taskId;
  $('reportModal').classList.remove('hidden');
};

// ============================================================
// 10. EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  $('createRoomForm').addEventListener('submit', handleCreateRoom);
  $('joinRoomForm').addEventListener('submit', handleJoinRoom);

  $('saveDriveBtn').addEventListener('click', async () => {
    const link = $('driveLinkInput').value.trim();
    try {
      await updateDoc(doc(db, 'rooms', state.roomId), { mentorDriveLink: link });
      alert('✅ Link Google Drive disimpan!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('addWorkerBtn').addEventListener('click', async () => {
    const input = $('newWorkerName');
    const name = input.value.trim();
    if (!name) return;
    if (state.workers.length >= 20) return alert('Maksimal 20 pekerja!');
    if (state.workers.some(w => w.name.toLowerCase() === name.toLowerCase()))
      return alert('Nama sudah ada!');
    try {
      await addDoc(collection(db, 'rooms', state.roomId, 'workers'), {
        name, createdAt: serverTimestamp()
      });
      input.value = '';
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('createTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('taskTitle').value.trim();
    const assignee = $('taskAssignee').value;
    if (!title || !assignee) return alert('Judul & assignee wajib diisi!');
    try {
      await addDoc(collection(db, 'rooms', state.roomId, 'tasks'), {
        title,
        assignee,
        kpi: parseInt($('taskKpi').value, 10) || 10,
        startDate: $('startDate').value,
        endDate: $('endDate').value,
        desc: $('taskDesc').value.trim(),
        status: 'todo',
        reportNotes: '',
        reportFileName: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      e.target.reset();
      $('taskKpi').value = 10;
      setDefaultDates();
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('submitReportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskId = $('reportTaskId').value;
    const notes = $('reportNotes').value.trim();
    const file = $('reportFile').files[0];
    try {
      await updateDoc(doc(db, 'rooms', state.roomId, 'tasks', taskId), {
        status: 'review',
        reportNotes: notes,
        reportFileName: file ? file.name : '',
        updatedAt: serverTimestamp()
      });
      $('reportModal').classList.add('hidden');
      e.target.reset();
      alert('✅ Laporan terkirim ke Mentor!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('closeModalBtn').addEventListener('click', () => {
    $('reportModal').classList.add('hidden');
  });

  $('saveDailyGoalBtn').addEventListener('click', async () => {
    const goal = $('dailyGoalInput').value.trim();
    if (!goal) return;
    const worker = state.workers.find(w => w.name === state.workerName);
    if (!worker) return alert('Data pekerja tidak ditemukan.');
    try {
      await updateDoc(doc(db, 'rooms', state.roomId, 'workers', worker.id), {
        dailyGoal: goal,
        goalDate: new Date().toISOString().split('T')[0]
      });
      $('dailyGoalInput').value = '';
    } catch (err) { alert('Gagal: ' + err.message); }
  });
}

function loadDailyGoal() {
  const worker = state.workers.find(w => w.name === state.workerName);
  const today = new Date().toISOString().split('T')[0];
  const display = $('dailyGoalDisplay');
  if (!display) return;
  if (worker && worker.goalDate === today && worker.dailyGoal) {
    display.textContent = `🎯 ${worker.dailyGoal}`;
  } else {
    display.textContent = '';
  }
}

function setDefaultDates() {
  const today = new Date();
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const startEl = $('startDate');
  const endEl = $('endDate');
  if (startEl) startEl.valueAsDate = today;
  if (endEl) endEl.valueAsDate = nextWeek;
}

// ============================================================
// 11. LOGOUT
// ============================================================
function logout() {
  if (!confirm('Keluar dari ruang kerja?')) return;
  unsubscribers.forEach(u => u());
  unsubscribers = [];
  localStorage.removeItem('ws_session');
  location.reload();
}

// ============================================================
// 12. INIT
// ============================================================
function init() {
  setDefaultDates();
  setupEventListeners();

  const saved = localStorage.getItem('ws_session');
  if (saved) {
    try {
      const session = JSON.parse(saved);
      Object.assign(state, session);
      loadWorkspace();
    } catch {
      showAuthGate();
    }
  } else {
    showAuthGate();
  }
}

init();
