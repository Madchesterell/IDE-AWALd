import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, getDocs, limit, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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

let state = {
  user: null,
  workspaceId: null,
  workspaceName: null,
  role: null,
  workerName: null,
  driveLink: '',
  members: [],
  tasks: [],
  divisions: []
};

let unsubscribers = [];
const $ = (id) => document.getElementById(id);

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
  el.textContent = ok ? '● Terhubung' : '● Terputus';
  el.style.color = ok ? '#16a34a' : '#dc2626';
}

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
  $('workspaceTitle').textContent = state.workspaceName || 'Ruang Kerja';
  
  const isMentor = state.role === 'mentor';
  const divTab = $('tabDivisionView');
  if (divTab) divTab.classList.toggle('hidden', !isMentor);
  
  const taskLabel = $('tabTaskLabel');
  if (taskLabel) taskLabel.textContent = isMentor ? 'Papan Tugas' : 'Tugas Saya';

  $('mentorPanel').classList.toggle('hidden', !isMentor);
  $('workerDailyGoalBox').classList.toggle('hidden', isMentor);
  
  // Ubah teks tombol pertama menjadi "Tugas Saya" untuk pekerja
  const taskLabel = $('tabTaskLabel');
  if (taskLabel) taskLabel.textContent = isMentor ? 'Papan Tugas' : 'Tugas Saya';

  $('mentorPanel').classList.toggle('hidden', !isMentor);
  $('workerDailyGoalBox').classList.toggle('hidden', isMentor);

  $('roleControls').innerHTML = `
    <span style="font-size:0.8rem;color:var(--text-muted);">
      ${isMentor ? 'Mentor / Admin' : 'Anggota'} ·
      <strong>${escapeHtml(state.workerName)}</strong>
    </span>
  `;

  switchWorkspaceTab('task');
}

function switchWorkspaceTab(tabName) {
  const taskBtn = $('tabTaskView');
  const divBtn = $('tabDivisionView');
  if (tabName === 'task') {
    $('mainTaskContainer').classList.remove('hidden');
    $('divisionManagementPanel').classList.add('hidden');
    if (taskBtn) { taskBtn.classList.add('active'); taskBtn.classList.remove('btn-primary', 'btn-secondary'); }
    if (divBtn) { divBtn.classList.remove('active'); divBtn.classList.remove('btn-primary', 'btn-secondary'); }
  } else {
    $('mainTaskContainer').classList.add('hidden');
    $('divisionManagementPanel').classList.remove('hidden');
    if (taskBtn) { taskBtn.classList.remove('active'); taskBtn.classList.remove('btn-primary', 'btn-secondary'); }
    if (divBtn) { divBtn.classList.add('active'); divBtn.classList.remove('btn-primary', 'btn-secondary'); }
    renderDivisionManagement();
  }
}

function toggleAuthMode() {
  const isLogin = !$('loginForm').classList.contains('hidden');
  $('loginForm').classList.toggle('hidden', isLogin);
  $('registerForm').classList.toggle('hidden', !isLogin);
  if (isLogin) {
    $('authTitle').innerHTML = 'Buat <span>Akun Baru</span>';
    $('authSubtitle').textContent = 'Daftar untuk mulai mengelola ruang kerja Anda.';
    $('authToggleText').textContent = 'Sudah punya akun?';
    $('authToggleLink').textContent = 'Masuk di sini';
  } else {
    $('authTitle').innerHTML = 'Selamat <span>Datang</span>';
    $('authSubtitle').textContent = 'Masuk untuk mengakses dashboard Anda.';
    $('authToggleText').textContent = 'Belum punya akun?';
    $('authToggleLink').textContent = 'Daftar sekarang';
  }
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

async function loadUserWorkspaces() {
  const list = $('workspaceList');
  list.innerHTML = '<p class="empty-hint">Memuat daftar ruang kerja...</p>';
  try {
    const userSnap = await getDoc(doc(db, 'users', state.user.uid));
    const ids = userSnap.exists() ? (userSnap.data().workspaceIds || []) : [];
    if (ids.length === 0) {
      list.innerHTML = '<p class="empty-hint">Belum ada ruang kerja. Silakan buat atau gabung terlebih dahulu.</p>';
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
    list.innerHTML = '<p class="empty-hint">Belum ada ruang kerja.</p>';
    return;
  }
  list.innerHTML = workspaces.map(ws => `
    <div class="workspace-card" onclick="openWorkspace('${ws.id}')">
      <div class="workspace-card-header">
        <h3>${escapeHtml(ws.name)}</h3>
        <span class="role-badge ${ws.role}">${ws.role === 'mentor' ? 'Mentor' : 'Anggota'}</span>
      </div>
      ${ws.role === 'mentor' ? `<p class="join-code">Kode undangan: <strong>${escapeHtml(ws.joinCode || '-')}</strong></p>` : ''}
    </div>
  `).join('');
}

async function handleCreateWorkspace(e) {
  e.preventDefault();
  const name = $('newWorkspaceName').value.trim();
  const codeInput = ($('newWorkspaceCode')?.value || '').trim().toUpperCase();
  const drive = ($('newWorkspaceDrive')?.value || '').trim();
  if (!name) return alert('Nama ruang kerja wajib diisi.');
  if (codeInput.length !== 6) return alert('Kode undangan harus tepat 6 karakter.');

  const btn = $('createWorkspaceSubmitBtn');
  const original = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Membuat...';

  try {
    const existing = await getDocs(query(collection(db, 'workspaces'), where('joinCode', '==', codeInput), limit(1)));
    if (!existing.empty) {
      alert('Kode undangan sudah digunakan. Silakan pilih kode lain.');
      btn.disabled = false; btn.textContent = original;
      return;
    }

    const joinCode = codeInput;
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
        name: state.workerName, role: 'mentor', division: 'Manajemen', joinedAt: serverTimestamp()
      }),
      setDoc(doc(db, 'users', state.user.uid), { workspaceIds: arrayUnion(wsRef.id) }, { merge: true })
    ]).catch(err => console.error('Background update gagal:', err));
    
  } catch (err) {
    console.error(err);
    alert('Gagal membuat ruang kerja: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = original;
  }
}

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
    if (membersSnap.size >= 20) return alert('Ruang kerja sudah penuh (maksimal 20 anggota).');

    const myName = state.user.displayName || state.user.email.split('@')[0];
    await setDoc(doc(db, 'workspaces', wsDoc.id, 'members', state.user.uid), {
      uid: state.user.uid, email: state.user.email,
      name: myName, role: 'worker', division: 'Umum', joinedAt: serverTimestamp()
    });
    setDoc(doc(db, 'users', state.user.uid), { workspaceIds: arrayUnion(wsDoc.id) }, { merge: true });

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

window.openWorkspace = async (workspaceId) => {
  try {
    const wsSnap = await getDoc(doc(db, 'workspaces', workspaceId));
    if (!wsSnap.exists()) return alert('Ruang kerja tidak ditemukan.');
    const memberSnap = await getDoc(doc(db, 'workspaces', workspaceId, 'members', state.user.uid));
    if (!memberSnap.exists()) return alert('Anda bukan anggota ruang kerja ini.');

    state.workspaceId = workspaceId;
    state.workspaceName = wsSnap.data().name;
    state.role = memberSnap.data().role;
    state.workerName = memberSnap.data().name || state.user.displayName || 'User';
    showWorkspaceView();
    subscribeToWorkspace();
  } catch (err) {
    alert('Gagal membuka ruang kerja: ' + err.message);
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
  state.divisions = [];
  showDashboardView();
}

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

  const divisionsRef = collection(db, 'workspaces', state.workspaceId, 'divisions');
  unsubscribers.push(onSnapshot(divisionsRef,
    (snap) => {
      state.divisions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderDivisionOptions();
    },
    (err) => { console.error(err); }
  ));

  const tasksRef = collection(db, 'workspaces', state.workspaceId, 'tasks');
  unsubscribers.push(onSnapshot(query(tasksRef, orderBy('createdAt', 'desc')),
    (snap) => {
      state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderKanban();
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

function renderMembers() {
  const list = $('workerList');
  if (!list) return;
  list.innerHTML = state.members.map(m => `
    <li class="worker-tag">
      ${escapeHtml(m.name)} (${escapeHtml(m.division || 'Umum')}) ${m.role === 'mentor' ? '👨‍🏫' : ''}
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
  if (el) el.textContent = `Anggota: ${state.members.filter(m => m.role === 'worker').length} / 20`;
}

// Fitur Baru: Memverifikasi nilai input Google Drive secara real-time
function updateDriveStatus(liveValue = null) {
  const statusEl = $('driveStatusText');
  const inputEl = $('driveLinkInput');
  if (!statusEl) return;

  const currentVal = liveValue !== null ? liveValue.trim() : (state.driveLink || '').trim();
  const savedVal = (state.driveLink || '').trim();

  if (!currentVal) {
    statusEl.textContent = 'Belum ada folder yang tertaut.';
    statusEl.classList.remove('linked');
  } else {
    const isSaved = currentVal === savedVal && savedVal !== '';
    const labelStatus = isSaved ? '✅ Folder tertaut:' : '⏳ Tautan terdeteksi (belum disimpan):';
    statusEl.innerHTML = `${labelStatus} <a href="${escapeHtml(currentVal)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;word-break:break-all;">${escapeHtml(currentVal)}</a>`;
    statusEl.classList.add('linked');
  }

  if (liveValue === null && inputEl && document.activeElement !== inputEl) {
    inputEl.value = savedVal;
  }
}

function renderDivisionOptions() {
  const selectDiv = $('editMemberDivision');
  if (!selectDiv) return;
  const defaultOpts = '<option value="Umum">(Umum)</option>';
  selectDiv.innerHTML = defaultOpts + state.divisions.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
}

function renderKanban() {
  const tbody = $('taskTableBody');
  if (!tbody) return;

  let filteredTasks = state.tasks;
  if (state.role === 'worker') {
    filteredTasks = state.tasks.filter(t => t.assignee === state.workerName);
  }

  if (filteredTasks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #6b7280;">Belum ada tugas dalam daftar.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredTasks.map(task => {
    const isOverdue = task.endDate && new Date(task.endDate) < new Date() && task.status !== 'done';
    const isWorker = state.role === 'worker';
    const isMentor = state.role === 'mentor';
    
    const canStart = isWorker && task.status === 'todo' && task.assignee === state.workerName;
    const canReport = isWorker && task.status === 'progress' && task.assignee === state.workerName;
    const canValidate = isMentor && task.status === 'review';
    const canReopen = isMentor && task.status === 'done';

    let statusBg = '#f3f4f6';
    let statusColor = '#374151';
    let statusText = 'To Do';
    if (task.status === 'progress') { statusBg = '#dbeafe'; statusColor = '#1e40af'; statusText = 'In Progress'; }
    else if (task.status === 'review') { statusBg = '#f3e8ff'; statusColor = '#6b21a8'; statusText = 'Dinilai'; }
    else if (task.status === 'done') { statusBg = '#dcfce7'; statusColor = '#15803d'; statusText = 'Selesai'; }

    let diffBg = '#fef3c7', diffColor = '#92400e', diffText = 'Sedang';
    const diffRaw = (task.difficulty || '').toLowerCase();
    if (diffRaw === 'tinggi' || diffRaw === 'high') {
      diffBg = '#fee2e2'; diffColor = '#991b1b'; diffText = 'Tinggi';
    } else if (diffRaw === 'rendah' || diffRaw === 'low') {
      diffBg = '#e0f2fe'; diffColor = '#0369a1'; diffText = 'Rendah';
    } else if (diffRaw === 'sedang' || diffRaw === 'medium') {
      diffBg = '#fef3c7'; diffColor = '#92400e'; diffText = 'Sedang';
    } else {
      const kpiVal = Number(task.kpi) || 10;
      if (kpiVal > 15) { diffBg = '#fee2e2'; diffColor = '#991b1b'; diffText = 'Tinggi'; }
      else if (kpiVal < 8) { diffBg = '#e0f2fe'; diffColor = '#0369a1'; diffText = 'Rendah'; }
    }

    return `
      <tr style="border-bottom: 1px solid #f3f4f6; transition: background 0.2s;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background='transparent'">
        <td style="padding: 14px 16px;">
          <div style="font-weight: 600; color: #1f2937; font-size: 0.92rem;">${escapeHtml(task.title)}</div>
          <div style="font-size: 0.78rem; color: #6b7280; margin-top: 2px;">${escapeHtml(task.desc || 'Tanpa keterangan tambahan')}</div>
          ${task.reportFileLink ? `<a href="${escapeHtml(task.reportFileLink)}" target="_blank" style="font-size: 0.75rem; color: #2563eb; text-decoration: underline; display: inline-block; margin-top: 2px;">🔗 Lihat File Drive</a>` : ''}
          ${task.revisionNotes ? `<div style="font-size: 0.75rem; color: #92400e; background: #fffbeb; padding: 2px 6px; border-radius: 4px; margin-top: 2px;">⚠️ Revisi: ${escapeHtml(task.revisionNotes)}</div>` : ''}
        </td>
        <td style="padding: 14px 16px; font-size: 0.88rem; color: #4b5563;">
          <div>${escapeHtml(task.assignee)}</div>
          <div style="font-size: 0.75rem; color: #9ca3af;">(Anggota Tim)</div>
        </td>
        <td style="padding: 14px 16px;">
          <span style="background: ${diffBg}; color: ${diffColor}; padding: 3px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 500;">${diffText}</span>
        </td>
        <td style="padding: 14px 16px;">
          <span style="background: ${statusBg}; color: ${statusColor}; padding: 3px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 500;">${statusText}</span>
        </td>
        <td style="padding: 14px 16px; font-size: 0.85rem; color: ${isOverdue ? '#dc2626' : '#4b5563'}; font-weight: ${isOverdue ? '600' : '400'};">
          ${task.endDate || '-'}
        </td>
        <td style="padding: 14px 16px; text-align: right;">
          <div style="display: flex; justify-content: flex-end; gap: 6px;">
            ${canStart ? `<button class="btn-sm" style="font-size: 0.75rem; padding: 4px 10px;" onclick="moveTask('${task.id}','progress')">▶ Mulai</button>` : ''}
            ${canReport ? `<button class="btn-sm" style="font-size: 0.75rem; padding: 4px 10px;" onclick="openReportModal('${task.id}')">📤 Lapor</button>` : ''}
            ${canValidate ? `<button class="btn-sm btn-success" style="font-size: 0.75rem; padding: 4px 10px;" onclick="openReviewModal('${task.id}')">Detail & Nilai</button>` : ''}
            ${canReopen ? `<button class="btn-sm btn-warning" style="font-size: 0.75rem; padding: 4px 10px;" onclick="moveTask('${task.id}','review')">↩ Buka</button>` : ''}
            ${!canStart && !canReport && !canValidate && !canReopen ? `<span style="font-size: 0.75rem; color: #9ca3af;">-</span>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');
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

function renderDivisionManagement() {
  const divListContainer = $('divisionListContainer');
  if (divListContainer) {
    divListContainer.innerHTML = state.divisions.length === 0 ? '<p class="empty-hint">Belum ada divisi terdaftar.</p>' :
      state.divisions.map(d => {
        const countEmp = state.members.filter(m => m.division === d.name).length;
        return `
          <div style="border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; margin-bottom: 10px; background: #fff;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <h4 style="margin: 0; font-size: 1rem; color: #1f2937;">${escapeHtml(d.name)}</h4>
                <p style="margin: 4px 0 8px 0; font-size: 0.8rem; color: #6b7280;">${escapeHtml(d.desc || 'Tidak ada deskripsi.')}</p>
              </div>
              <span style="background: #eff6ff; color: #1d4ed8; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;">${countEmp} Anggota</span>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <button class="btn-sm btn-warning" onclick="deleteDivision('${d.id}')" style="font-size: 0.7rem;">Hapus</button>
            </div>
          </div>`;
      }).join('');
  }

  const tableBody = $('memberSettingsTableBody');
  if (tableBody) {
    tableBody.innerHTML = state.members.map(m => `
      <tr style="border-bottom: 1px solid #f3f4f6;">
        <td style="padding: 10px; font-weight: 500;">${escapeHtml(m.name)}</td>
        <td style="padding: 10px; color: #6b7280; font-size: 0.85rem;">${escapeHtml(m.email)}</td>
        <td style="padding: 10px;"><span class="role-badge ${m.role}">${m.role === 'mentor' ? 'Mentor' : 'Anggota'}</span></td>
        <td style="padding: 10px; font-size: 0.85rem;">${escapeHtml(m.division || 'Umum')}</td>
        <td style="padding: 10px;"><button class="btn-sm" onclick="openEditMemberModal('${m.id}')">Edit</button></td>
      </tr>`).join('');
  }
}

window.deleteDivision = async (divId) => {
  if (!confirm('Hapus divisi ini?')) return;
  try {
    await deleteDoc(doc(db, 'workspaces', state.workspaceId, 'divisions', divId));
  } catch (err) { alert('Gagal: ' + err.message); }
};

window.openEditMemberModal = (memberId) => {
  const mem = state.members.find(m => m.id === memberId);
  if (!mem) return;
  $('editMemberId').value = mem.id;
  $('editMemberNameDisplay').value = mem.name;
  $('editMemberRole').value = mem.role;
  $('editMemberDivision').value = mem.division || 'Umum';
  $('editMemberModal').classList.remove('hidden');
};

window.moveTask = async (taskId, newStatus) => {
  try {
    await updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), {
      status: newStatus, updatedAt: serverTimestamp()
    });
  } catch (err) { alert('Gagal: ' + err.message); }
};

window.openReportModal = (taskId) => {
  $('reportTaskId').value = taskId;
  const task = state.tasks.find(t => t.id === taskId);
  const container = $('reportDriveContainer');
  const subtitle = $('reportModalSubtitle');

  if (task && task.driveSource === 'workspace') {
    subtitle.textContent = "Unggah file Anda ke folder Google Drive Utama yang disediakan Mentor.";
    container.innerHTML = `
      <label>Tautan Folder Google Drive Utama Ruang Kerja</label>
      <div style="padding: 10px; background: rgba(0,0,0,0.03); border-radius: 6px; margin-bottom: 8px;">
        ${state.driveLink ? `
          <a href="${escapeHtml(state.driveLink)}" target="_blank" style="color: var(--primary-color); font-weight: 600; text-decoration: underline;">
            📂 Buka Folder Drive Utama Ruang Kerja
          </a>
          <input type="hidden" id="reportDriveLink" value="${escapeHtml(state.driveLink)}">
        ` : `
          <span style="color: #dc2626; font-size: 0.85rem;">⚠️ Mentor belum mengatur Link Google Drive Utama. Silakan masukkan link manual:</span>
          <input type="url" id="reportDriveLink" class="form-control" placeholder="https://drive.google.com/..." required style="margin-top:5px;">
        `}
      </div>
      <small style="color: var(--text-muted);">Masukkan file ke folder di atas, lalu tulis catatan dan kirim laporan.</small>
    `;
  } else {
    subtitle.textContent = "Masukkan tautan Google Drive khusus untuk file tugas ini.";
    container.innerHTML = `
      <label for="reportDriveLink">Tautan File Google Drive Tugas</label>
      <input type="url" id="reportDriveLink" class="form-control" placeholder="https://drive.google.com/..." required />
      <small style="color: var(--text-muted); font-size: 0.75rem;">Tempelkan tautan file atau folder tugas yang sudah diunggah ke Drive.</small>
    `;
  }

  $('reportModal').classList.remove('hidden');
};

window.openReviewModal = (taskId) => {
  $('reviewTaskId').value = taskId;
  $('mentorReviewNotes').value = '';
  $('reviewModal').classList.remove('hidden');
};

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

  $('tabTaskView').addEventListener('click', () => switchWorkspaceTab('task'));
  $('tabDivisionView').addEventListener('click', () => switchWorkspaceTab('division'));

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

  // Tombol simpan link drive
  if ($('saveDriveBtn')) {
    $('saveDriveBtn').addEventListener('click', async () => {
      const link = ($('driveLinkInput')?.value || '').trim();
      try {
        await updateDoc(doc(db, 'workspaces', state.workspaceId), { driveLink: link });
        state.driveLink = link;
        updateDriveStatus();
        if (link) {
          alert('✅ Link Google Drive berhasil disimpan!');
        } else {
          alert('Link Google Drive telah dihapus.');
        }
      } catch (err) { alert('Gagal: ' + err.message); }
    });
  }

  // Listener input real-time untuk verifikasi teks Drive
  if ($('driveLinkInput')) {
    $('driveLinkInput').addEventListener('input', (e) => {
      updateDriveStatus(e.target.value);
    });
  }

  function toggleWorkspaceDriveGroup() {
    const group = $('workspaceDriveGroup');
    const source = $('taskDriveSource');
    if (!group || !source) return;
    group.style.display = source.value === 'workspace' ? 'block' : 'none';
  }
  if ($('taskDriveSource')) {
    $('taskDriveSource').addEventListener('change', toggleWorkspaceDriveGroup);
    toggleWorkspaceDriveGroup();
  }

  function syncEndDateMin() {
    const startEl = $('startDate');
    const endEl = $('endDate');
    if (!startEl || !endEl) return;
    if (startEl.value) {
      endEl.min = startEl.value;
      if (endEl.value && endEl.value < startEl.value) {
        endEl.value = startEl.value;
      }
    }
  }
  if ($('startDate')) {
    $('startDate').addEventListener('change', syncEndDateMin);
  }
  if ($('endDate')) {
    $('endDate').addEventListener('change', () => {
      const startEl = $('startDate');
      const endEl = $('endDate');
      if (startEl?.value && endEl.value && endEl.value < startEl.value) {
        alert('Tenggat waktu tidak boleh lebih awal dari tanggal mulai.');
        endEl.value = startEl.value;
      }
    });
  }

  $('createTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('taskTitle').value.trim();
    const assignee = $('taskAssignee').value;
    const difficulty = ($('taskDifficulty')?.value || 'sedang').toLowerCase();
    const driveSource = $('taskDriveSource').value;
    const startDate = $('startDate').value;
    const endDate = $('endDate').value;

    if (!title || !assignee) return alert('Judul & assignee wajib diisi!');
    if (startDate && endDate && endDate < startDate) {
      return alert('Tenggat waktu tidak boleh lebih awal dari tanggal mulai.');
    }

    try {
      await addDoc(collection(db, 'workspaces', state.workspaceId, 'tasks'), {
        title,
        assignee,
        difficulty,
        startDate,
        endDate,
        desc: $('taskDesc').value.trim(),
        driveSource,
        status: 'todo',
        reportNotes: '',
        reportFileLink: '',
        revisionNotes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      e.target.reset();
      if ($('taskDifficulty')) $('taskDifficulty').value = 'sedang';
      setDefaultDates();
      syncEndDateMin();
      toggleWorkspaceDriveGroup();
      alert('✅ Tugas berhasil dibagikan!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('submitReportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const taskId = $('reportTaskId').value;
    const notes = $('reportNotes').value.trim();
    const reportLinkEl = $('reportDriveLink');
    const reportLink = reportLinkEl ? reportLinkEl.value.trim() : (state.driveLink || '');

    if (!reportLink) return alert('Tautan Google Drive wajib diisi!');

    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), {
        status: 'review',
        reportNotes: notes,
        reportFileLink: reportLink,
        revisionNotes: '',
        updatedAt: serverTimestamp()
      });
      $('reportModal').classList.add('hidden');
      e.target.reset();
      alert('✅ Laporan terkirim ke Mentor!');
    } catch (err) { 
      alert('Gagal: ' + err.message); 
    }
  });

  $('btnValidateDone').addEventListener('click', async () => {
    const taskId = $('reviewTaskId').value;
    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), {
        status: 'done',
        revisionNotes: '',
        updatedAt: serverTimestamp()
      });
      $('reviewModal').classList.add('hidden');
      alert('✅ Tugas divalidasi selesai (Done)!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('btnSendRevision').addEventListener('click', async () => {
    const taskId = $('reviewTaskId').value;
    const revNotes = $('mentorReviewNotes').value.trim();
    if (!revNotes) return alert('Catatan revisi wajib diisi jika ingin meminta revisi.');

    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), {
        status: 'progress',
        revisionNotes: revNotes,
        updatedAt: serverTimestamp()
      });
      $('reviewModal').classList.add('hidden');
      alert('↩ Catatan revisi dikirimkan ke pekerja!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('closeModalBtn').addEventListener('click', () => $('reportModal').classList.add('hidden'));
  $('closeReviewModalBtn').addEventListener('click', () => $('reviewModal').classList.add('hidden'));

  $('createDivisionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('newDivisionName').value.trim();
    const desc = $('newDivisionDesc').value.trim();
    if (!name) return alert('Nama divisi wajib diisi.');
    try {
      await addDoc(collection(db, 'workspaces', state.workspaceId, 'divisions'), {
        name, desc, createdAt: serverTimestamp()
      });
      e.target.reset();
      alert('✅ Divisi baru berhasil dibuat!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('editMemberForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const memId = $('editMemberId').value;
    const newRole = $('editMemberRole').value;
    const newDiv = $('editMemberDivision').value;
    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'members', memId), {
        role: newRole,
        division: newDiv
      });
      $('editMemberModal').classList.add('hidden');
      alert('✅ Data anggota diperbarui!');
    } catch (err) { alert('Gagal: ' + err.message); }
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

function init() {
  setDefaultDates();
  setupEventListeners();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      state.user = user;
      const initialsEl = $('userAvatarInitials');
      if (initialsEl) {
        const nameSource = user.displayName || user.email || 'FA';
        initialsEl.textContent = nameSource.substring(0, 2).toUpperCase();
      }

      ensureUserDoc(user)
        .catch(err => console.error('[DEBUG] ensureUserDoc gagal:', err))
        .finally(() => showDashboardView());

    } else {
      state.user = null;
      showAuthView();
    }
  });
}

async function ensureUserDoc(user) {
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
    }
  } catch (err) {
    console.error('[DEBUG] Gagal cek/buat dokumen user:', err);
  }
}

init();
