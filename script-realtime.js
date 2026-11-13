import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// ============ STATE ============
let workers = [];
let tasks = [];
let driveLink = '';
let currentRole = 'mentor';
let currentWorkerName = localStorage.getItem('ws_worker_name') || '';

// ============ DOM ============
const $ = (id) => document.getElementById(id);
const roleSelector = $('roleSelector');
const mentorPanel = $('mentorPanel');
const workerDailyGoalBox = $('workerDailyGoalBox');
const workerCountDisplay = $('workerCountDisplay');
const workerList = $('workerList');
const taskAssignee = $('taskAssignee');
const driveLinkInput = $('driveLinkInput');
const driveStatusText = $('driveStatusText');
const kpiProgressText = $('kpiProgressText');
const kpiProgressBar = $('kpiProgressBar');
const workerIdentitySelect = $('workerIdentitySelect');
const liveStatus = $('liveStatus');

// ============ LIVE STATUS ============
function setLiveStatus(connected) {
  if (!liveStatus) return;
  liveStatus.textContent = connected ? '🟢 Live Sync' : '🔴 Offline';
  liveStatus.style.color = connected ? '#16a34a' : '#dc2626';
}

// ============ REAL-TIME LISTENERS ============

// Workers
onSnapshot(
  query(collection(db, 'workers'), orderBy('createdAt', 'asc')),
  (snap) => {
    workers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderWorkers();
    updateWorkerSelect();
    updateWorkerCount();
    setLiveStatus(true);
  },
  (err) => { console.error(err); setLiveStatus(false); }
);

// Tasks
onSnapshot(
  query(collection(db, 'tasks'), orderBy('createdAt', 'desc')),
  (snap) => {
    tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderKanban();
    updateKpiProgress();
    setLiveStatus(true);
  },
  (err) => { console.error(err); setLiveStatus(false); }
);

// Config (Drive Link)
onSnapshot(doc(db, 'config', 'main'), (docSnap) => {
  driveLink = docSnap.exists() ? (docSnap.data().driveLink || '') : '';
  updateDriveStatus();
});

// ============ RENDER ============

function renderWorkers() {
  workerList.innerHTML = workers.map(w => `
    <li class="worker-tag">
      ${w.name}
      <button class="remove-worker" onclick="removeWorker('${w.id}')" title="Hapus">×</button>
    </li>
  `).join('') || '<li class="empty-hint">Belum ada pekerja.</li>';
}

function updateWorkerSelect() {
  taskAssignee.innerHTML = workers.length
    ? workers.map(w => `<option value="${w.name}">${w.name}</option>`).join('')
    : '<option value="">(Tambah pekerja dulu)</option>';

  const prev = workerIdentitySelect.value;
  workerIdentitySelect.innerHTML = '<option value="">-- Pilih Nama Anda --</option>' +
    workers.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
  if (prev) workerIdentitySelect.value = prev;
  else if (currentWorkerName) workerIdentitySelect.value = currentWorkerName;
}

function updateWorkerCount() {
  workerCountDisplay.textContent = `Pekerja: ${workers.length} / 20`;
}

function updateDriveStatus() {
  if (driveLink) {
    driveStatusText.textContent = `✅ Folder tertaut: ${driveLink}`;
    driveStatusText.classList.add('linked');
  } else {
    driveStatusText.textContent = 'Belum ada folder tertaut.';
    driveStatusText.classList.remove('linked');
  }
  driveLinkInput.value = driveLink;
}

function renderKanban() {
  ['todo', 'progress', 'review', 'done'].forEach(status => {
    let filtered = tasks.filter(t => t.status === status);
    if (currentRole === 'worker' && currentWorkerName) {
      filtered = filtered.filter(t => t.assignee === currentWorkerName);
    }
    $('count-' + status).textContent = filtered.length;
    $('list-' + status).innerHTML = filtered.map(renderTaskCard).join('') ||
      '<p class="empty-hint">Kosong</p>';
  });
}

function renderTaskCard(task) {
  const isOverdue = task.endDate && new Date(task.endDate) < new Date() && task.status !== 'done';
  const canStart = currentRole === 'worker' && task.status === 'todo';
  const canReport = currentRole === 'worker' && task.status === 'progress';
  const canValidate = currentRole === 'mentor' && task.status === 'review';
  const canReopen = currentRole === 'mentor' && task.status === 'done';

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
  let relevant = tasks;
  if (currentRole === 'worker' && currentWorkerName) {
    relevant = tasks.filter(t => t.assignee === currentWorkerName);
  }
  const total = relevant.reduce((s, t) => s + (Number(t.kpi) || 0), 0);
  const done = relevant.filter(t => t.status === 'done').reduce((s, t) => s + (Number(t.kpi) || 0), 0);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  kpiProgressText.textContent = `${done} dari ${total} Poin KPI Tercapai (${pct}%)`;
  kpiProgressBar.style.width = pct + '%';
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============ ACTIONS ============

window.moveTask = async (taskId, newStatus) => {
  try {
    await updateDoc(doc(db, 'tasks', taskId), {
      status: newStatus,
      updatedAt: serverTimestamp()
    });
  } catch (err) { alert('Gagal: ' + err.message); }
};

window.removeWorker = async (workerId) => {
  if (!confirm('Hapus pekerja ini?')) return;
  try { await deleteDoc(doc(db, 'workers', workerId)); }
  catch (err) { alert('Gagal: ' + err.message); }
};

window.openReportModal = (taskId) => {
  $('reportTaskId').value = taskId;
  $('reportModal').classList.remove('hidden');
};

// ============ EVENT LISTENERS ============

roleSelector.addEventListener('change', (e) => {
  currentRole = e.target.value;
  mentorPanel.classList.toggle('hidden', currentRole !== 'mentor');
  workerDailyGoalBox.classList.toggle('hidden', currentRole !== 'worker');
  renderKanban();
  updateKpiProgress();
});

workerIdentitySelect.addEventListener('change', (e) => {
  currentWorkerName = e.target.value;
  localStorage.setItem('ws_worker_name', currentWorkerName);
  renderKanban();
  updateKpiProgress();
  loadDailyGoal();
});

$('saveDriveBtn').addEventListener('click', async () => {
  const link = driveLinkInput.value.trim();
  try {
    await setDoc(doc(db, 'config', 'main'), { driveLink: link }, { merge: true });
    alert('✅ Link Google Drive disimpan!');
  } catch (err) { alert('Gagal: ' + err.message); }
});

$('addWorkerBtn').addEventListener('click', async () => {
  const input = $('newWorkerName');
  const name = input.value.trim();
  if (!name) return;
  if (workers.length >= 20) return alert('Maksimal 20 pekerja!');
  if (workers.some(w => w.name.toLowerCase() === name.toLowerCase()))
    return alert('Nama sudah ada!');
  try {
    await addDoc(collection(db, 'workers'), { name, createdAt: serverTimestamp() });
    input.value = '';
  } catch (err) { alert('Gagal: ' + err.message); }
});

$('createTaskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('taskTitle').value.trim();
  const assignee = taskAssignee.value;
  if (!title || !assignee) return alert('Judul & assignee wajib diisi!');
  try {
    await addDoc(collection(db, 'tasks'), {
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
    await updateDoc(doc(db, 'tasks', taskId), {
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
  if (!currentWorkerName) return alert('Pilih nama Anda dulu!');
  const goal = $('dailyGoalInput').value.trim();
  if (!goal) return;
  const worker = workers.find(w => w.name === currentWorkerName);
  if (!worker) return;
  try {
    await updateDoc(doc(db, 'workers', worker.id), {
      dailyGoal: goal,
      goalDate: new Date().toISOString().split('T')[0]
    });
    $('dailyGoalInput').value = '';
  } catch (err) { alert('Gagal: ' + err.message); }
});

function loadDailyGoal() {
  const worker = workers.find(w => w.name === currentWorkerName);
  const today = new Date().toISOString().split('T')[0];
  if (worker && worker.goalDate === today && worker.dailyGoal) {
    $('dailyGoalDisplay').textContent = `🎯 ${worker.dailyGoal}`;
  } else {
    $('dailyGoalDisplay').textContent = '';
  }
}

// Re-render daily goal when workers update
const origRenderWorkers = renderWorkers;
renderWorkers = function () {
  origRenderWorkers();
  loadDailyGoal();
};

function setDefaultDates() {
  const today = new Date();
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  $('startDate').valueAsDate = today;
  $('endDate').valueAsDate = nextWeek;
}

// ============ INIT ============
setDefaultDates();
if (currentWorkerName) {
  workerIdentitySelect.value = currentWorkerName;
}
