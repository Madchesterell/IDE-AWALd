// ============================================================
// 1. IMPORT
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, getDocs, limit, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ============================================================
// 2. KONFIGURASI
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
const auth = getAuth(app);

// ============================================================
// 3. STATE
// ============================================================
let state = {
  user: null,
  workspaceId: null,
  workspaceName: null,
  role: null,
  workerName: null,
  driveLink: '',
  members: [],
  tasks: []
};

let unsubscribers = [];
const $ = (id) => document.getElementById(id);

// ============================================================
// 4. HELPER
// ============================================================
function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function setLiveStatus(ok) {
  const el = $('liveStatus');
  if (!el) return;
  el.textContent = ok ? '🟢 Live Sync' : '🔴 Offline';
  el.style.color = ok ? '#16a34a' : '#dc2626';
}

// ============================================================
// 5. VIEW SWITCHER
// ============================================================
function showAuthView() {
  $('authView').classList.remove('hidden');
  $('dashboardView').classList.add('hidden');
  $('workspaceView').classList.add('hidden');
}

function showDashboardView() {
  $('authView').classList.add('hidden');
  $('dashboardView').classList.remove('hidden');
  $('workspaceView').classList.add('hidden');
  $('userEmailDisplay').textContent = state.user?.email || '';
  loadUserWorkspaces();
}

function showWorkspaceView() {
  $('authView').classList.add('hidden');
  $('dashboardView').classList.add('hidden');
  $('workspaceView').classList.remove('hidden');
  $('workspaceTitle').textContent = state.workspaceName || 'Workspace';
  $('mentorPanel').classList.toggle('hidden', state.role !== 'mentor');
  $('workerDailyGoalBox').classList.toggle('hidden', state.role !== 'worker');
  $('roleControls').innerHTML = `
    <span style="font-size:0.8rem;color:var(--text-muted);">
      ${state.role === 'mentor' ? '👨‍🏫 Mentor' : '👷 Pekerja'} ·
      <strong>${escapeHtml(state.workerName)}</strong>
    </span>
  `;
}

// ============================================================
// 6. AUTH
// ============================================================
function toggleAuthMode() {
  const isLogin = !$('loginForm').classList.contains('hidden');
  $('loginForm').classList.toggle('hidden', isLogin);      // ✅ dibalik
  $('registerForm').classList.toggle('hidden', !isLogin);  // ✅ dibalik
  $('authTitle').textContent = isLogin ? 'Buat Akun Baru' : 'Selamat Datang';
  $('authSubtitle').textContent = isLogin
    ? 'Daftar untuk mulai mengelola workspace Anda.'
    : 'Masuk untuk mengakses platform evaluasi kinerja karyawan.';
  $('authToggleText').textContent = isLogin ? 'Sudah punya akun?' : 'Belum punya akun?';
  $('authToggleLink').textContent = isLogin ? 'Masuk di sini' : 'Daftar sekarang';
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const btn = $('loginBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Masuk...';
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    alert('Gagal masuk: ' + mapAuthError(err.code));
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = $('registerName').value.trim();
  const email = $('registerEmail').value.trim();
  const password = $('registerPassword').value;
  const btn = $('registerBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Mendaftar...';
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), {
      email, displayName: name, workspaceIds: [], createdAt: serverTimestamp()
    });
  } catch (err) {
    alert('Gagal daftar: ' + mapAuthError(err.code));
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

function mapAuthError(code) {
  const map = {
    'auth/email-already-in-use': 'Email sudah terdaftar.',
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/weak-password': 'Kata sandi minimal 6 karakter.',
    'auth/user-not-found': 'Email tidak terdaftar.',
    'auth/wrong-password': 'Kata sandi salah.',
    'auth/invalid-credential': 'Email atau kata sandi salah.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.'
  };
  return map[code] || code;
}

async function handleLogout() {
  if (!confirm('Keluar dari akun?')) return;
  unsubscribers.forEach(u => u());
  unsubscribers = [];
  await signOut(auth);
}

// ============================================================
// 7. DASHBOARD — LOAD WORKSPACES
// ============================================================
async function loadUserWorkspaces() {
  const list = $('workspaceList');
  list.innerHTML = '<p class="empty-hint">Memuat workspace...</p>';
  try {
    const userSnap = await getDoc(doc(db, 'users', state.user.uid));
    const ids = userSnap.exists() ? (userSnap.data().workspaceIds || []) : [];
    if (ids.length === 0) {
      list.innerHTML = '<p class="empty-hint">Belum ada workspace. Buat atau gabung dulu.</p>';
      return;
    }
    const workspaces = await Promise.all(ids.map(async id => {
      const wsSnap = await getDoc(doc(db, 'workspaces', id));
      if (!wsSnap.exists()) return null;
      const memberSnap = await getDoc(doc(db, 'workspaces', id, 'members', state.user.uid));
      return {
        id, ...wsSnap.data(),
        role: memberSnap.exists() ? memberSnap.data().role : 'worker'
      };
    }));
    renderWorkspaceList(workspaces.filter(Boolean));
  } catch (err) {
    console.error(err);
    list.innerHTML = `<p class="empty-hint">Gagal memuat: ${escapeHtml(err.message)}</p>`;
  }
}

function renderWorkspaceList(workspaces) {
  const list = $('workspaceList');
  if (workspaces.length === 0) {
    list.innerHTML = '<p class="empty-hint">Belum ada workspace.</p>';
    return;
  }
  list.innerHTML = workspaces.map(ws => `
    <div class="workspace-card" onclick="openWorkspace('${ws.id}')">
      <div class="workspace-card-header">
        <h3>${escapeHtml(ws.name)}</h3>
        <span class="role-badge ${ws.role}">${ws.role === 'mentor' ? '👨‍🏫 Mentor' : '👷 Pekerja'}</span>
      </div>
      ${ws.role === 'mentor' ? `<p class="join-code">Kode undangan: <strong>${escapeHtml(ws.joinCode || '-')}</strong></p>` : ''}
    </div>
  `).join('');
}

// ============================================================
// 8. CREATE WORKSPACE (FAST)
// ============================================================
async function handleCreateWorkspace(e) {
  e.preventDefault();
  const name = $('newWorkspaceName').value.trim();
  const drive = $('newWorkspaceDrive').value.trim();
  if (!name) return alert('Nama workspace wajib diisi.');

  const btn = $('createWorkspaceSubmitBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Membuat...';

  try {
    const joinCode = generateJoinCode();
    const wsRef = await addDoc(collection(db, 'workspaces'), {
      name, ownerUid: state.user.uid, joinCode, driveLink: drive, createdAt: serverTimestamp()
    });

    state.workspaceId = wsRef.id;
    state.workspaceName = name;
    state.role = 'mentor';
    state.workerName = state.user.displayName || 'Mentor';
    $('createWorkspaceModal').classList.add('hidden');
    $('createWorkspaceForm').reset();
    showWorkspaceView();
    subscribeToWorkspace();

    Promise.all([
      setDoc(doc(db, 'workspaces', wsRef.id, 'members', state.user.uid), {
        uid: state.user.uid, email: state.user.email,
        name: state.workerName, role: 'mentor', joinedAt: serverTimestamp()
      }),
     await setDoc(doc(db, 'users', state.user.uid), { workspaceIds: arrayUnion(wsDoc.id) }, { merge: true });
    ]).catch(err => console.error('Background update gagal:', err));

  } catch (err) {
    console.error(err);
    alert('Gagal membuat workspace: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

// ============================================================
// 9. JOIN WORKSPACE
// ============================================================
async function handleJoinWorkspace(e) {
  e.preventDefault();
  const code = $('joinCodeInput').value.trim().toUpperCase();
  if (code.length !== 6) return alert('Kode harus 6 karakter.');

  const btn = $('joinWorkspaceSubmitBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Mencari...';

  try {
    const snap = await getDocs(query(collection(db, 'workspaces'),
      where('joinCode', '==', code), limit(1)));
    if (snap.empty) return alert('Kode undangan tidak valid.');

    const wsDoc = snap.docs[0];
    const wsData = wsDoc.data();

    const membersSnap = await getDocs(collection(db, 'workspaces', wsDoc.id, 'members'));
    if (membersSnap.size >= 20) return alert('Workspace sudah penuh (maks 20).');

    const myName = state.user.displayName || state.user.email.split('@')[0];
    await setDoc(doc(db, 'workspaces', wsDoc.id, 'members', state.user.uid), {
      uid: state.user.uid, email: state.user.email,
      name: myName, role: 'worker', joinedAt: serverTimestamp()
    });
    setDoc(doc(db, 'users', state.user.uid), { workspaceIds: arrayUnion(wsRef.id) }, { merge: true })

    state.workspaceId = wsDoc.id;
    state.workspaceName = wsData.name;
    state.role = 'worker';
    state.workerName = myName;
    $('joinWorkspaceModal').classList.add('hidden');
    $('joinWorkspaceForm').reset();
    showWorkspaceView();
    subscribeToWorkspace();
  } catch (err) {
    console.error(err);
    alert('Gagal bergabung: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

// ============================================================
// 10. OPEN WORKSPACE
// ============================================================
window.openWorkspace = async (workspaceId) => {
  try {
    const wsSnap = await getDoc(doc(db, 'workspaces', workspaceId));
    if (!wsSnap.exists()) return alert('Workspace tidak ditemukan.');
    const memberSnap = await getDoc(doc(db, 'workspaces', workspaceId, 'members', state.user.uid));
    if (!memberSnap.exists()) return alert('Anda bukan anggota workspace ini.');

    state.workspaceId = workspaceId;
    state.workspaceName = wsSnap.data().name;
    state.role = memberSnap.data().role;
    state.workerName = memberSnap.data().name || state.user.displayName || 'User';
    showWorkspaceView();
    subscribeToWorkspace();
  } catch (err) {
    alert('Gagal membuka workspace: ' + err.message);
  }
};

function backToDashboard() {
  unsubscribers.forEach(u => u());
  unsubscribers = [];
  state.workspaceId = null;
  state.workspaceName = null;
  state.role = null;
  state.members = [];
  state.tasks = [];
  showDashboardView();
}

// ============================================================
// 11. SUBSCRIBE WORKSPACE DATA
// ============================================================
function subscribeToWorkspace() {
  unsubscribers.forEach(u => u());
  unsubscribers = [];

  const membersRef = collection(db, 'workspaces', state.workspaceId, 'members');
  unsubscribers.push(onSnapshot(query(membersRef, orderBy('joinedAt', 'asc')),
    (snap) => {
      state.members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderMembers();
      updateAssigneeSelect();
      updateWorkerCount();
      loadDailyGoal();
      setLiveStatus(true);
    },
    (err) => { console.error(err); setLiveStatus(false); }
  ));

  const tasksRef = collection(db, 'workspaces', state.workspaceId, 'tasks');
  unsubscribers.push(onSnapshot(query(tasksRef, orderBy('createdAt', 'desc')),
    (snap) => {
      state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderKanban();
      updateKpiProgress();
      setLiveStatus(true);
    },
    (err) => { console.error(err); setLiveStatus(false); }
  ));

  unsubscribers.push(onSnapshot(doc(db, 'workspaces', state.workspaceId),
    (docSnap) => {
      if (docSnap.exists()) {
        state.driveLink = docSnap.data().driveLink || '';
        updateDriveStatus();
      }
    }
  ));
}

// ============================================================
// 12. RENDER
// ============================================================
function renderMembers() {
  const list = $('workerList');
  if (!list) return;
  list.innerHTML = state.members.map(m => `
    <li class="worker-tag">
      ${escapeHtml(m.name)} ${m.role === 'mentor' ? '👨‍🏫' : ''}
      ${state.role === 'mentor' && m.role !== 'mentor'
        ? `<button class="remove-worker" onclick="removeMember('${m.id}')">×</button>` : ''}
    </li>
  `).join('') || '<li class="empty-hint">Belum ada anggota.</li>';
}

function updateAssigneeSelect() {
  const select = $('taskAssignee');
  if (!select) return;
  const workers = state.members.filter(m => m.role === 'worker');
  select.innerHTML = workers.length
    ? workers.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('')
    : '<option value="">(Belum ada pekerja)</option>';
}

function updateWorkerCount() {
  const el = $('workerCountDisplay');
  if (el) el.textContent = `Pekerja: ${state.members.filter(m => m.role === 'worker').length} / 20`;
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
    if (state.role === 'worker') filtered = filtered.filter(t => t.assignee === state.workerName);
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

function loadDailyGoal() {
  const me = state.members.find(m => m.id === state.user?.uid);
  const today = new Date().toISOString().split('T')[0];
  const display = $('dailyGoalDisplay');
  if (!display) return;
  if (me && me.goalDate === today && me.dailyGoal) {
    display.textContent = `🎯 ${me.dailyGoal}`;
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
// 13. ACTIONS
// ============================================================
window.moveTask = async (taskId, newStatus) => {
  try {
    await updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), {
      status: newStatus, updatedAt: serverTimestamp()
    });
  } catch (err) { alert('Gagal: ' + err.message); }
};

window.removeMember = async (memberId) => {
  if (!confirm('Hapus anggota ini dari workspace?')) return;
  try {
    await deleteDoc(doc(db, 'workspaces', state.workspaceId, 'members', memberId));
  } catch (err) { alert('Gagal: ' + err.message); }
};

window.openReportModal = (taskId) => {
  $('reportTaskId').value = taskId;
  $('reportModal').classList.remove('hidden');
};

// ============================================================
// 14. EVENT LISTENERS
// ============================================================
function setupEventListeners() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('registerForm').addEventListener('submit', handleRegister);
  $('authToggleLink').addEventListener('click', (e) => { e.preventDefault(); toggleAuthMode(); });
  $('logoutBtn').addEventListener('click', handleLogout);

  $('createWorkspaceBtn').addEventListener('click', () => $('createWorkspaceModal').classList.remove('hidden'));
  $('joinWorkspaceBtn').addEventListener('click', () => $('joinWorkspaceModal').classList.remove('hidden'));
  $('createWorkspaceForm').addEventListener('submit', handleCreateWorkspace);
  $('joinWorkspaceForm').addEventListener('submit', handleJoinWorkspace);
  $('backToDashboardBtn').addEventListener('click', backToDashboard);

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      $(btn.dataset.close).classList.add('hidden');
    });
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });

  $('saveDriveBtn').addEventListener('click', async () => {
    const link = $('driveLinkInput').value.trim();
    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId), { driveLink: link });
      alert('✅ Link Google Drive disimpan!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('addWorkerBtn').addEventListener('click', () => {
    alert('Untuk menambah pekerja: bagikan kode undangan workspace ke mereka.\n\nKode undangan bisa dilihat di Dashboard.');
  });

  $('createTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('taskTitle').value.trim();
    const assignee = $('taskAssignee').value;
    if (!title || !assignee) return alert('Judul & assignee wajib diisi!');
    try {
      await addDoc(collection(db, 'workspaces', state.workspaceId, 'tasks'), {
        title, assignee,
        kpi: parseInt($('taskKpi').value, 10) || 10,
        startDate: $('startDate').value,
        endDate: $('endDate').value,
        desc: $('taskDesc').value.trim(),
        status: 'todo',
        reportNotes: '', reportFileName: '',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
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
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), {
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
    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'members', state.user.uid), {
        dailyGoal: goal,
        goalDate: new Date().toISOString().split('T')[0]
      });
      $('dailyGoalInput').value = '';
    } catch (err) { alert('Gagal: ' + err.message); }
  });
}

// ============================================================
// 15. INIT + AUTH STATE
// ============================================================
function init() {
  setDefaultDates();
  setupEventListeners();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      state.user = user;

      // Pastikan dokumen users/{uid} ada (untuk akun lama)
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            workspaceIds: [],
            createdAt: serverTimestamp()
          });
          console.log('[DEBUG] Dokumen user dibuat untuk:', user.email);
        }
      } catch (err) {
        console.error('[DEBUG] Gagal cek/buat dokumen user:', err);
      }

      showDashboardView();
    } else {
      state.user = null;
      showAuthView();
    }
  });
}

init();
