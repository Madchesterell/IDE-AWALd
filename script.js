import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, getDocs, limit, serverTimestamp, arrayUnion, arrayRemove, writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, updatePassword, GoogleAuthProvider, signInWithPopup,
  sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence
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
let dashboardWorkspaces = [];
let dashboardNotifications = [];

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function safeUrl(u) {
  try {
    const url = new URL(String(u || '').trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : '';
  } catch { return ''; }
}

function dueDiff(t) {
  if (!t.endDate) return null;
  return (new Date(t.endDate + 'T23:59:59') - new Date()) / 864e5;
}

function dueSoon(t) {
  const d = dueDiff(t);
  return t.status !== 'done' && d !== null && d >= 0 && d <= 2;
}

const needsAction = (t, role, name) => role === 'mentor'
  ? t.status === 'review'
  : t.assignee === name && (t.status === 'todo' || (t.status === 'progress' && t.revisionNotes));

function applyTaskFilters(list) {
  const q = ($('taskSearch')?.value || '').trim().toLowerCase();
  const st = $('filterStatus')?.value;
  const df = $('filterDifficulty')?.value;
  const du = $('filterDue')?.value;
  const as = $('filterAssignee')?.value;
  return list.filter(t => {
    if (q && !((t.title || '') + ' ' + (t.desc || '')).toLowerCase().includes(q)) return false;
    if (st && t.status !== st) return false;
    if (df && (t.difficulty || 'sedang').toLowerCase() !== df) return false;
    if (as && t.assignee !== as) return false;
    const d = dueDiff(t), open = t.status !== 'done' && d !== null;
    if (du === 'overdue' && !(open && d < 0)) return false;
    if (du === 'soon' && !dueSoon(t)) return false;
    if (du === 'week' && !(open && d >= 0 && d <= 7)) return false;
    return true;
  });
}

function updateTaskBadge() {
  const el = $('taskBadge');
  if (!el) return;
  const n = state.tasks.filter(t => needsAction(t, state.role, state.workerName)).length;
  el.textContent = n;
  el.classList.toggle('hidden', n === 0);
  el.title = state.role === 'mentor' ? 'Menunggu dinilai' : 'Perlu dikerjakan / direvisi';
}

function summarizeTasks(tasks, role, myName) {
  const mine = role === 'worker' ? tasks.filter(t => t.assignee === myName) : tasks;
  const c = { todo: 0, progress: 0, review: 0, done: 0, overdue: 0 };
  mine.forEach(t => {
    c[t.status] = (c[t.status] || 0) + 1;
    const d = dueDiff(t);
    if (t.status !== 'done' && d !== null && d < 0) c.overdue++;
  });
  const byMember = {};
  if (role === 'mentor') tasks.forEach(t => {
    const m = byMember[t.assignee] = byMember[t.assignee] || { done: 0, total: 0 };
    m.total++;
    if (t.status === 'done') m.done++;
  });
  return { c, total: mine.length, byMember, action: tasks.filter(t => needsAction(t, role, myName)).length };
}

/* =========================================
   FUNGSI BARU: Render stats pills untuk kartu ruang kerja
   Hanya menampilkan: perlu tindakan, Belum, Berjalan, Dinilai, Selesai (+ Terlambat jika ada)
========================================= */
function wsStatsPillsHtml(ws) {
  if (!ws.stats) return '';
  const { c, action } = ws.stats;
  const pills = [];

  // "Perlu tindakan" - hanya tampilkan jika > 0
  if (action > 0) {
    pills.push(`<span class="stat-pill s-action"><span class="stat-num">${action}</span> perlu tindakan</span>`);
  }

  // Status dasar: selalu tampilkan
  pills.push(`<span class="stat-pill s-todo"><span class="stat-num">${c.todo}</span> Belum</span>`);
  pills.push(`<span class="stat-pill s-progress"><span class="stat-num">${c.progress}</span> Berjalan</span>`);
  pills.push(`<span class="stat-pill s-review"><span class="stat-num">${c.review}</span> Dinilai</span>`);
  pills.push(`<span class="stat-pill s-done"><span class="stat-num">${c.done}</span> Selesai</span>`);

  // Terlambat - hanya tampilkan jika > 0
  if (c.overdue > 0) {
    pills.push(`<span class="stat-pill s-late"><span class="stat-num">${c.overdue}</span> Terlambat</span>`);
  }

  return `<div class="workspace-card-stats">${pills.join('')}</div>`;
}

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
  $('userEmailDisplay').textContent = state.user?.displayName || state.user?.email || '';
  const initials = (state.user?.displayName || state.user?.email || 'WP')
    .split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('');
  if ($('userAvatarInitials')) $('userAvatarInitials').textContent = initials || 'WP';
  loadUserWorkspaces();
  switchDashboardSection('home');
}

function switchDashboardSection(section) {
  const panels = { home: 'dashboardHomePanel', workspaces: 'myWorkspacesPanel', notifications: 'notificationsPanel' };
  Object.entries(panels).forEach(([key, id]) => $(id)?.classList.toggle('hidden', key !== section));
  $('dashboardNavBtn')?.classList.toggle('active', section === 'home');
  $('myWorkspacesNavBtn')?.classList.toggle('active', section === 'workspaces');
  $('notificationsNavBtn')?.classList.toggle('active', section === 'notifications');
  $('dashboardPageTitle').textContent = ({ home: 'Dashboard', workspaces: 'Ruang Kerja Saya', notifications: 'Notifikasi' })[section] || 'Dashboard';
  if (section === 'notifications') renderDashboardNotifications();
}

function buildDashboardNotifications(workspaces) {
  const items = [];
  workspaces.forEach(ws => (ws.tasks || []).forEach(task => {
    const relevant = ws.role === 'mentor' || task.assignee === ws.workerName;
    if (!relevant) return;
    if (needsAction(task, ws.role, ws.workerName)) items.push({ ...task, workspaceId: ws.id, workspaceName: ws.name, kind: 'action', role: ws.role });
    if (task.status === 'done') items.push({ ...task, workspaceId: ws.id, workspaceName: ws.name, kind: 'done', role: ws.role });
  }));
  return items.sort((a, b) => (a.kind === b.kind ? String(b.endDate || '').localeCompare(String(a.endDate || '')) : a.kind === 'action' ? -1 : 1));
}

function renderDashboardNotifications() {
  const list = $('dashboardNotificationsList');
  const summary = $('dashboardNotificationSummary');
  const actions = dashboardNotifications.filter(item => item.kind === 'action');
  const completed = dashboardNotifications.filter(item => item.kind === 'done');
  const badge = $('dashboardNotificationBadge');
  if (badge) { badge.textContent = actions.length; badge.classList.toggle('hidden', actions.length === 0); }
  if (summary) {
    summary.innerHTML = `
      <div class="dashboard-notification-grid">
        <button type="button" class="notification-summary-card needs-action" data-open-notifications>
          <span class="notification-summary-icon">◷</span>
          <span><strong>${actions.length}</strong><small>Perlu tindakan</small></span>
        </button>
        <button type="button" class="notification-summary-card completed" data-open-notifications>
          <span class="notification-summary-icon">✓</span>
          <span><strong>${completed.length}</strong><small>Selesai</small></span>
        </button>
      </div>`;
    summary.querySelectorAll('[data-open-notifications]').forEach(button =>
      button.addEventListener('click', () => switchDashboardSection('notifications'))
    );
  }
  if (!list) return;
  if (!dashboardNotifications.length) {
    list.innerHTML = '<p class="empty-hint">Belum ada notifikasi. Aktivitas tugas akan muncul di sini.</p>';
    return;
  }
  list.innerHTML = dashboardNotifications.map(item => `
    <article class="dashboard-notification-item">
      <span class="notification-status-dot ${item.kind === 'done' ? 'is-done' : 'is-action'}"></span>
      <div class="dashboard-notification-copy">
        <strong>${escapeHtml(item.title || 'Tugas tanpa judul')}</strong>
        <p>${escapeHtml(item.workspaceName)} · ${item.kind === 'done' ? 'Tugas selesai' : (item.role === 'mentor' ? 'Menunggu penilaian' : 'Perlu tindakan')}</p>
      </div>
      <span class="notification-kind ${item.kind}">${item.kind === 'done' ? 'Selesai' : 'Perlu tindakan'}</span>
    </article>
  `).join('');
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
  $('mentorTaskCreator').classList.toggle('hidden', !isMentor);
  $('workerDailyGoalBox').classList.toggle('hidden', isMentor);
  $('roleControls').innerHTML = `<span style="font-size:0.8rem;color:var(--text-muted);"> ${isMentor ? 'Mentor / Admin' : 'Anggota'} · <strong>${escapeHtml(state.workerName)}</strong> </span>`;
  switchWorkspaceTab('task');
}

function switchWorkspaceTab(tabName) {
  const taskBtn = $('tabTaskView');
  const divBtn = $('tabDivisionView');
  if (tabName === 'task') {
    $('mainTaskContainer').classList.remove('hidden');
    $('divisionManagementPanel').classList.add('hidden');
    if (taskBtn) taskBtn.classList.add('active');
    if (divBtn) divBtn.classList.remove('active');
  } else {
    $('mainTaskContainer').classList.add('hidden');
    $('divisionManagementPanel').classList.remove('hidden');
    if (taskBtn) taskBtn.classList.remove('active');
    if (divBtn) divBtn.classList.add('active');
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
  } else {
    $('authTitle').innerHTML = 'Selamat <span>Datang</span>';
    $('authSubtitle').textContent = 'Masuk untuk mengakses dashboard Anda.';
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
    await setPersistence(auth, $('rememberMe').checked ? browserLocalPersistence : browserSessionPersistence);
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
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi nanti.',
    'auth/network-request-failed': 'Koneksi internet bermasalah.',
    'auth/user-disabled': 'Akun ini dinonaktifkan.',
    'auth/popup-blocked': 'Popup diblokir browser.',
    'auth/operation-not-allowed': 'Metode masuk ini belum diaktifkan di Firebase.'
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
  if (list) list.innerHTML = '<p class="empty-hint">Memuat daftar ruang kerja...</p>';
  try {
    const userSnap = await getDoc(doc(db, 'users', state.user.uid));
    const ids = userSnap.exists() ? (userSnap.data().workspaceIds || []) : [];
    if (!ids.length) {
      dashboardWorkspaces = [];
      dashboardNotifications = [];
      renderWorkspaceList([]);
      renderDashboardNotifications();
      return;
    }
    const workspaces = await Promise.all(ids.map(async id => {
      const wsSnap = await getDoc(doc(db, 'workspaces', id));
      if (!wsSnap.exists()) return null;
      const memberSnap = await getDoc(doc(db, 'workspaces', id, 'members', state.user.uid));
      if (!memberSnap.exists()) return null;
      const member = memberSnap.data();
      const role = member.role || 'worker';
      let tasks = [];
      try {
        const taskSnap = await getDocs(collection(db, 'workspaces', id, 'tasks'));
        tasks = taskSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (e) { console.warn('Ringkasan gagal:', e); }
      return { id, ...wsSnap.data(), role, workerName: member.name, tasks, stats: summarizeTasks(tasks, role, member.name) };
    }));
    dashboardWorkspaces = workspaces.filter(Boolean);
    dashboardNotifications = buildDashboardNotifications(dashboardWorkspaces);
    renderWorkspaceList(dashboardWorkspaces);
    renderDashboardNotifications();
  } catch (err) {
    console.error(err);
    if (list) list.innerHTML = `<p class="empty-hint">Gagal memuat: ${escapeHtml(err.message)}</p>`;
  }
}

/* =========================================
   FUNGSI YANG DIUBAH: renderWorkspaceList
   Kartu sekarang hanya menampilkan:
   - Nama Ruang Kerja + badge role
   - Stats pills (perlu tindakan, Belum, Berjalan, Dinilai, Selesai)
========================================= */
function renderWorkspaceList(workspaces) {
  const cardMarkup = (ws) => `
    <div class="workspace-card" role="button" tabindex="0" onclick="openWorkspace('${ws.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openWorkspace('${ws.id}')}">
      <div class="workspace-card-header">
        <h3>${escapeHtml(ws.name)}</h3>
        <span class="role-badge ${ws.role}">${ws.role === 'mentor' ? 'Mentor' : 'Anggota'}</span>
      </div>
      ${wsStatsPillsHtml(ws)}
    </div>`;
  const empty = '<p class="empty-hint">Belum ada ruang kerja. Silakan buat atau gabung terlebih dahulu.</p>';
  if ($('workspaceList')) {
    $('workspaceList').innerHTML = workspaces.length
      ? `<div class="workspace-grid">${workspaces.map(ws => cardMarkup(ws)).join('')}</div>`
      : empty;
  }
  if ($('dashboardWorkspacePreview')) {
    $('dashboardWorkspacePreview').innerHTML = workspaces.length
      ? `<div class="workspace-grid">${workspaces.slice(0, 3).map(ws => cardMarkup(ws)).join('')}</div>`
      : empty;
  }
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
    const uid = state.user.uid;
    const mentorName = state.user.displayName || 'Mentor';
    const wsRef = doc(collection(db, 'workspaces'));
    const batch = writeBatch(db);
    batch.set(wsRef, {
      name, ownerUid: uid, joinCode, driveLink: drive ? safeUrl(drive) : '', createdAt: serverTimestamp()
    });
    batch.set(doc(db, 'workspaces', wsRef.id, 'members', uid), {
      uid, email: state.user.email, name: mentorName, role: 'mentor', division: 'Manajemen', joinedAt: serverTimestamp()
    });
    batch.set(doc(db, 'users', uid), { workspaceIds: arrayUnion(wsRef.id) }, { merge: true });
    await batch.commit();
    state.workspaceId = wsRef.id;
    state.workspaceName = name;
    state.role = 'mentor';
    state.workerName = mentorName;
    $('createWorkspaceModal').classList.add('hidden');
    $('createWorkspaceForm').reset();
    showWorkspaceView();
    subscribeToWorkspace();
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
    const snap = await getDocs(query(collection(db, 'workspaces'), where('joinCode', '==', code), limit(1)));
    if (snap.empty) return alert('Kode undangan tidak valid.');
    const wsDoc = snap.docs[0];
    const wsData = wsDoc.data();
    const uid = state.user.uid;
    const myMemberRef = doc(db, 'workspaces', wsDoc.id, 'members', uid);
    const existingMe = await getDoc(myMemberRef);
    const myName = state.user.displayName || state.user.email.split('@')[0];
    let myRole = 'worker';
    let finalName = myName;
    if (existingMe.exists()) {
      myRole = existingMe.data().role || 'worker';
      finalName = existingMe.data().name || myName;
      await setDoc(doc(db, 'users', uid), { workspaceIds: arrayUnion(wsDoc.id) }, { merge: true });
    } else {
      const membersSnap = await getDocs(collection(db, 'workspaces', wsDoc.id, 'members'));
      const workerCount = membersSnap.docs.filter(d => d.data().role === 'worker').length;
      if (workerCount >= 20) { alert('Ruang kerja sudah penuh (maksimal 20 anggota).'); return; }
      const batch = writeBatch(db);
      batch.set(myMemberRef, {
        uid, email: state.user.email, name: myName, role: 'worker', division: 'Umum', joinedAt: serverTimestamp()
      });
      batch.set(doc(db, 'users', uid), { workspaceIds: arrayUnion(wsDoc.id) }, { merge: true });
      await batch.commit();
    }
    state.workspaceId = wsDoc.id;
    state.workspaceName = wsData.name;
    state.role = myRole;
    state.workerName = finalName;
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
  unsubscribers.push(onSnapshot(membersRef,
    (snap) => {
      state.members = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.joinedAt?.seconds || 0) - (b.joinedAt?.seconds || 0));
      const me = state.members.find(m => m.id === state.user.uid);
      if (me) {
        state.workerName = me.name || state.workerName;
        if (me.role !== state.role) { state.role = me.role; showWorkspaceView(); }
      }
      renderMembers();
      renderTasks();
      if (!$('divisionManagementPanel').classList.contains('hidden')) renderDivisionManagement();
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
      if (!$('divisionManagementPanel').classList.contains('hidden')) renderDivisionManagement();
    },
    (err) => { console.error(err); }
  ));

  const tasksRef = collection(db, 'workspaces', state.workspaceId, 'tasks');
  unsubscribers.push(onSnapshot(query(tasksRef, orderBy('createdAt', 'desc')),
    (snap) => {
      state.tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTasks();
      setLiveStatus(true);
    },
    (err) => { console.error(err); setLiveStatus(false); }
  ));

  unsubscribers.push(onSnapshot(doc(db, 'workspaces', state.workspaceId),
    (docSnap) => {
      if (docSnap.exists()) {
        state.driveLink = docSnap.data().driveLink || '';
        state.joinCode = docSnap.data().joinCode || '';
        if ($('wsCodeDisplay')) $('wsCodeDisplay').textContent = state.joinCode || '-';
        updateDriveStatus();
      }
    },
    (err) => { console.error(err); }
  ));
}

function renderMembers() {
  const list = $('workerList');
  if (!list) return;
  list.innerHTML = state.members.map(m => `<li class="worker-tag"> ${escapeHtml(m.name)} (${escapeHtml(m.division || 'Umum')}) ${m.role === 'mentor' ? '👨‍🏫' : ''} </li>`).join('') || '<li class="empty-hint">Belum ada anggota.</li>';
}

function updateAssigneeSelect() {
  const select = $('taskAssignee');
  if (!select) return;
  const workers = state.members.filter(m => m.role === 'worker');
  const fa = $('filterAssignee');
  if (fa) {
    const pv = fa.value;
    fa.innerHTML = '<option value="">Semua anggota</option>' + workers.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
    fa.value = pv;
    fa.classList.toggle('hidden', state.role !== 'mentor');
  }
  const prev = select.value;
  select.innerHTML = workers.length
    ? workers.map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('')
    : '<option value="">(Belum ada pekerja)</option>';
  if (prev && [...select.options].some(o => o.value === prev)) select.value = prev;
}

function updateWorkerCount() {
  const el = $('workerCountDisplay');
  if (el) el.textContent = `Anggota: ${state.members.filter(m => m.role === 'worker').length} / 20`;
}

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
    const href = safeUrl(currentVal);
    statusEl.innerHTML = href
      ? `${labelStatus} <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;word-break:break-all;">${escapeHtml(currentVal)}</a>`
      : '⚠️ Tautan tidak valid (harus diawali http:// atau https://)';
    statusEl.classList.add('linked');
  }
  if (liveValue === null && inputEl && document.activeElement !== inputEl) {
    inputEl.value = savedVal;
  }
}

function renderDivisionOptions() {
  const selectDiv = $('editMemberDivision');
  if (!selectDiv) return;
  const defaultOpts = '<option value="Umum">(Umum)</option>' + (state.divisions.some(d => d.name === 'Manajemen') ? '' : '<option value="Manajemen">Manajemen</option>');
  selectDiv.innerHTML = defaultOpts + state.divisions.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
}

function renderTasks() {
  const tbody = $('taskTableBody');
  if (!tbody) return;
  let filteredTasks = state.tasks;
  if (state.role === 'worker') {
    filteredTasks = state.tasks.filter(t => t.assignee === state.workerName);
  }
  updateTaskBadge();
  filteredTasks = applyTaskFilters(filteredTasks);
  if (filteredTasks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: #6b7280;">Belum ada tugas dalam daftar.</td></tr>`;
    return;
  }
  tbody.innerHTML = filteredTasks.map(task => {
    const isSoon = dueSoon(task);
    const isOverdue = task.endDate && new Date(task.endDate + 'T23:59:59') < new Date() && task.status !== 'done';
    const isWorker = state.role === 'worker';
    const isMentor = state.role === 'mentor';
    const canStart = isWorker && task.status === 'todo' && task.assignee === state.workerName;
    const canReport = isWorker && task.status === 'progress' && task.assignee === state.workerName;
    const canValidate = isMentor && task.status === 'review';
    const canReopen = isMentor && task.status === 'done';
    const driveHref = safeUrl(task.reportFileLink);
    const driveIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
    let statusBg = '#f3f4f6', statusColor = '#374151', statusText = 'Belum Mulai';
    if (task.status === 'progress') { statusBg = '#dbeafe'; statusColor = '#1e40af'; statusText = 'Berjalan'; }
    else if (task.status === 'review') { statusBg = '#f3e8ff'; statusColor = '#6b21a8'; statusText = 'Dinilai'; }
    else if (task.status === 'done') { statusBg = '#dcfce7'; statusColor = '#15803d'; statusText = 'Selesai'; }
    let diffBg = '#fef3c7', diffColor = '#92400e', diffText = 'Sedang';
    const diffRaw = (task.difficulty || '').toLowerCase();
    if (diffRaw === 'tinggi' || diffRaw === 'high') { diffBg = '#fee2e2'; diffColor = '#991b1b'; diffText = 'Tinggi'; }
    else if (diffRaw === 'rendah' || diffRaw === 'low') { diffBg = '#e0f2fe'; diffColor = '#0369a1'; diffText = 'Rendah'; }
    else if (diffRaw === 'sedang' || diffRaw === 'medium') { diffBg = '#fef3c7'; diffColor = '#92400e'; diffText = 'Sedang'; }
    return `
      <tr style="border-bottom: 1px solid #f3f4f6; transition: background 0.2s;" onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background='transparent'">
        <td style="padding: 14px 16px;"><div class="task-title">${escapeHtml(task.title)}</div></td>
        <td class="task-desc-cell" style="padding: 14px 16px;">
          <div class="task-desc${task.desc ? '' : ' empty'}">${escapeHtml(task.desc || 'Tanpa keterangan tambahan')}</div>
          ${task.revisionNotes ? `<div class="task-revision">⚠️ Revisi: ${escapeHtml(task.revisionNotes)}</div>` : ''}
        </td>
        <td style="padding: 14px 16px; font-size: 0.88rem; color: #4b5563;">
          <div>${escapeHtml(task.assignee)}</div>
          <div style="font-size: 0.75rem; color: #9ca3af;">(Anggota Tim)</div>
        </td>
        <td class="col-center" style="padding: 14px 16px;">
          <span style="background: ${diffBg}; color: ${diffColor}; padding: 3px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 500;">${diffText}</span>
        </td>
        <td class="col-center" style="padding: 14px 16px;">
          <span style="background: ${statusBg}; color: ${statusColor}; padding: 3px 10px; border-radius: 6px; font-size: 0.78rem; font-weight: 500;">${statusText}</span>
        </td>
        <td style="padding: 14px 16px; font-size: 0.85rem; color: ${isOverdue ? '#dc2626' : isSoon ? '#b45309' : '#4b5563'}; font-weight: ${isOverdue ? '600' : '400'};">
          ${task.endDate || '-'}${isSoon ? ' <span class="tag-soon">Segera</span>' : ''}
        </td>
        <td style="padding: 14px 16px;">
          ${driveHref
            ? `<a class="btn-drive" href="${escapeHtml(driveHref)}" target="_blank" rel="noopener noreferrer">${driveIcon}Buka Drive</a>`
            : '<span style="font-size: 0.75rem; color: #9ca3af;">-</span>'}
        </td>
        <td class="col-center" style="padding: 14px 16px;">
          <div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 6px;">
            ${canStart ? `<button class="btn-sm" style="font-size: 0.75rem; padding: 4px 10px;" onclick="moveTask('${task.id}','progress')">▶ Mulai</button>` : ''}
            ${canReport ? `<button class="btn-sm" style="font-size: 0.75rem; padding: 4px 10px;" onclick="openReportModal('${task.id}')">📤 Lapor</button>` : ''}
            ${canValidate ? `<button class="btn-sm btn-success" style="font-size: 0.75rem; padding: 4px 10px;" onclick="openReviewModal('${task.id}')">Detail & Nilai</button>` : ''}
            ${canReopen ? `<button class="btn-sm btn-warning" style="font-size: 0.75rem; padding: 4px 10px;" onclick="moveTask('${task.id}','review')">↩ Buka</button>` : ''}
            ${isMentor ? `<button class="btn-sm btn-ghost" onclick="openEditTaskModal('${task.id}')">Edit</button><button class="btn-sm btn-warning" onclick="deleteTask('${task.id}')">Hapus</button>` : ''}
            ${(task.history || []).length ? `<button class="btn-sm btn-ghost" onclick="openHistoryModal('${task.id}')">Riwayat</button>` : ''}
            ${!canStart && !canReport && !canValidate && !canReopen && !isMentor && !(task.history || []).length ? `<span style="font-size: 0.75rem; color: #9ca3af;">-</span>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function loadDailyGoal() {
  const me = state.members.find(m => m.id === state.user?.uid);
  const today = localDate();
  const display = $('dailyGoalDisplay');
  if (!display) return;
  if (me && me.goalDate === today && me.dailyGoal) {
    display.textContent = `🎯 ${me.dailyGoal}`;
  } else {
    display.textContent = '';
  }
}

function setDefaultDates() {
  const startEl = $('startDate');
  const endEl = $('endDate');
  if (startEl) startEl.value = localDate();
  if (endEl) endEl.value = localDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
}

function renderDivisionManagement() {
  const divListContainer = $('divisionListContainer');
  if (divListContainer) {
    divListContainer.innerHTML = state.divisions.length === 0 ? '<p class="empty-hint">Belum ada divisi terdaftar.</p>' :
      state.divisions.map(d => {
        const countEmp = state.members.filter(m => m.division === d.name).length;
        return `<div style="border: 1px solid #e5e7eb; padding: 12px; border-radius: 8px; margin-bottom: 10px; background: #fff;">
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
        <td class="col-center" style="padding: 10px;"><span class="role-badge ${m.role}">${m.role === 'mentor' ? 'Mentor' : 'Anggota'}</span></td>
        <td style="padding: 10px; font-size: 0.85rem;">${escapeHtml(m.division || 'Umum')}</td>
        <td class="col-center" style="padding: 10px;">
          <button class="btn-sm" onclick="openEditMemberModal('${m.id}')">Edit</button>
          ${m.id !== state.user.uid ? `<button class="btn-sm btn-warning" onclick="removeMember('${m.id}')">Keluarkan</button>` : ''}
        </td>
      </tr>`).join('');
  }
}

window.deleteDivision = async (divId) => {
  const div = state.divisions.find(d => d.id === divId);
  if (!confirm('Hapus divisi ini? Anggota di dalamnya akan dipindahkan ke "Umum".')) return;
  try {
    const batch = writeBatch(db);
    if (div) {
      state.members.filter(m => m.division === div.name).forEach(m =>
        batch.update(doc(db, 'workspaces', state.workspaceId, 'members', m.id), { division: 'Umum' }));
    }
    batch.delete(doc(db, 'workspaces', state.workspaceId, 'divisions', divId));
    await batch.commit();
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

window.openEditTaskModal = (id) => {
  const t = state.tasks.find(x => x.id === id); if (!t) return;
  const sel = $('editTaskAssignee');
  sel.innerHTML = state.members.filter(m => m.role === 'worker').map(m => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`).join('');
  if (![...sel.options].some(o => o.value === t.assignee)) sel.insertAdjacentHTML('afterbegin', `<option value="${escapeHtml(t.assignee)}">${escapeHtml(t.assignee)}</option>`);
  sel.value = t.assignee;
  $('editTaskId').value = id;
  $('editTaskTitle').value = t.title || '';
  $('editTaskDifficulty').value = (t.difficulty || 'sedang').toLowerCase();
  $('editTaskStart').value = t.startDate || '';
  $('editTaskEnd').value = t.endDate || '';
  $('editTaskDesc').value = t.desc || '';
  $('editTaskModal').classList.remove('hidden');
};

window.deleteTask = async (id) => {
  if (state.role !== 'mentor' || !confirm('Hapus tugas ini? Tindakan tidak bisa dibatalkan.')) return;
  try { await deleteDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', id)); }
  catch (err) { alert('Gagal: ' + err.message); }
};

window.openHistoryModal = (id) => {
  const t = state.tasks.find(x => x.id === id); if (!t) return;
  const label = { laporan: '📤 Laporan', revisi: '↩ Revisi', selesai: '✅ Divalidasi' };
  $('historyTitle').textContent = t.title;
  $('historyList').innerHTML = [...(t.history || [])].sort((a, b) => b.at - a.at).map(h => `
    <div class="hist-item hist-${escapeHtml(h.type)}">
      <div class="hist-head">
        <strong>${label[h.type] || escapeHtml(h.type)}</strong> · ${escapeHtml(h.by || '')}
        <span>${new Date(h.at).toLocaleString('id-ID')}</span>
      </div>
      ${h.text ? `<div>${escapeHtml(h.text)}</div>` : ''}
      ${safeUrl(h.link) ? `<a href="${escapeHtml(safeUrl(h.link))}" target="_blank" rel="noopener noreferrer">🔗 Buka file</a>` : ''}
    </div>`).join('') || '<p class="empty-hint">Belum ada riwayat.</p>';
  $('historyModal').classList.remove('hidden');
};

window.removeMember = async (memberId) => {
  const m = state.members.find(x => x.id === memberId);
  if (!m || memberId === state.user.uid || !confirm(`Keluarkan ${m.name} dari ruang kerja ini?`)) return;
  try { await deleteDoc(doc(db, 'workspaces', state.workspaceId, 'members', memberId)); }
  catch (err) { alert('Gagal: ' + err.message); }
};

async function leaveWorkspace() {
  if (state.role === 'mentor' && state.members.filter(m => m.role === 'mentor').length <= 1) {
    return alert('Anda mentor terakhir. Jadikan anggota lain mentor, atau hapus ruang kerja.');
  }
  if (!confirm('Keluar dari ruang kerja ini?')) return;
  try {
    const uid = state.user.uid, wsId = state.workspaceId;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'workspaces', wsId, 'members', uid));
    batch.set(doc(db, 'users', uid), { workspaceIds: arrayRemove(wsId) }, { merge: true });
    await batch.commit();
    backToDashboard();
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function changeJoinCode() {
  const input = prompt('Kode undangan baru (6 huruf/angka). Kosongkan untuk dibuat acak:');
  if (input === null) return;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = (input.trim() || Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')).toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return alert('Kode harus tepat 6 huruf atau angka.');
  try {
    const dup = await getDocs(query(collection(db, 'workspaces'), where('joinCode', '==', code), limit(1)));
    if (!dup.empty) return alert('Kode sudah dipakai ruang kerja lain.');
    await updateDoc(doc(db, 'workspaces', state.workspaceId), { joinCode: code });
    alert('✅ Kode undangan diganti menjadi ' + code);
  } catch (err) { alert('Gagal: ' + err.message); }
}

async function deleteWorkspace() {
  const typed = prompt(`Hapus ruang kerja beserta semua tugasnya? Ketik nama ruang kerja ("${state.workspaceName}") untuk konfirmasi:`);
  if (typed === null) return;
  if (typed.trim() !== state.workspaceName) return alert('Nama tidak cocok. Penghapusan dibatalkan.');
  try {
    const wsId = state.workspaceId;
    const refs = [];
    for (const sub of ['tasks', 'divisions', 'members']) {
      (await getDocs(collection(db, 'workspaces', wsId, sub))).forEach(d => refs.push(d.ref));
    }
    refs.push(doc(db, 'workspaces', wsId));
    unsubscribers.forEach(u => u()); unsubscribers = [];
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      refs.slice(i, i + 400).forEach(r => batch.delete(r));
      await batch.commit();
    }
    await setDoc(doc(db, 'users', state.user.uid), { workspaceIds: arrayRemove(wsId) }, { merge: true });
    backToDashboard();
  } catch (err) { alert('Gagal menghapus: ' + err.message); }
}

async function renameUser(newName, oldName) {
  await updateProfile(auth.currentUser, { displayName: newName });
  const uid = state.user.uid;
  const userSnap = await getDoc(doc(db, 'users', uid));
  const ids = userSnap.exists() ? (userSnap.data().workspaceIds || []) : [];
  await setDoc(doc(db, 'users', uid), { displayName: newName }, { merge: true });
  for (const id of ids) {
    const mRef = doc(db, 'workspaces', id, 'members', uid);
    if (!(await getDoc(mRef)).exists()) continue;
    const tasks = await getDocs(query(collection(db, 'workspaces', id, 'tasks'), where('assignee', '==', oldName)));
    const batch = writeBatch(db);
    batch.update(mRef, { name: newName });
    tasks.forEach(t => batch.update(t.ref, { assignee: newName }));
    await batch.commit();
  }
  state.user = auth.currentUser;
  $('userEmailDisplay').textContent = newName;
}

window.moveTask = async (taskId, newStatus) => {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  const ok = (state.role === 'worker' && t.assignee === state.workerName && t.status === 'todo' && newStatus === 'progress')
    || (state.role === 'mentor' && t.status === 'done' && newStatus === 'review');
  if (!ok) return alert('Perubahan status ini tidak diizinkan.');
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
        ${safeUrl(state.driveLink)
          ? `<a href="${escapeHtml(safeUrl(state.driveLink))}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); font-weight: 600; text-decoration: underline;">📂 Buka Folder Drive Utama Ruang Kerja</a>
             <input type="hidden" id="reportDriveLink" value="${escapeHtml(state.driveLink)}">`
          : `<span style="color: #dc2626; font-size: 0.85rem;">⚠️ Mentor belum mengatur Link Google Drive Utama. Silakan masukkan link manual:</span>
             <input type="url" id="reportDriveLink" class="form-control" placeholder="https://drive.google.com/..." required style="margin-top:5px;">`}
      </div>
      <small style="color: var(--text-muted);">Masukkan file ke folder di atas, lalu tulis catatan dan kirim laporan.</small>`;
  } else {
    subtitle.textContent = "Masukkan tautan Google Drive khusus untuk file tugas ini.";
    container.innerHTML = `
      <label for="reportDriveLink">Tautan File Google Drive Tugas</label>
      <input type="url" id="reportDriveLink" class="form-control" placeholder="https://drive.google.com/..." required />
      <small style="color: var(--text-muted); font-size: 0.75rem;">Tempelkan tautan file atau folder tugas yang sudah diunggah ke Drive.</small>`;
  }
  $('reportModal').classList.remove('hidden');
};

window.openReviewModal = (taskId) => {
  $('reviewTaskId').value = taskId;
  $('mentorReviewNotes').value = '';
  const reviewTask = state.tasks.find(x => x.id === taskId);
  const notesBox = $('reviewReportNotes');
  if (notesBox) {
    const link = safeUrl(reviewTask?.reportFileLink);
    notesBox.innerHTML = `<strong>Catatan pekerja:</strong> ${escapeHtml(reviewTask?.reportNotes || '-')}` +
      (link ? `<br><a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">🔗 Buka file Drive</a>` : '');
  }
  $('reviewModal').classList.remove('hidden');
};

function setupEventListeners() {
  $('loginForm').addEventListener('submit', handleLogin);
  $('registerForm').addEventListener('submit', handleRegister);
  $('authToggleLink').addEventListener('click', (e) => { e.preventDefault(); toggleAuthMode(); });
  const authToggleLink2 = $('authToggleLink2');
  if (authToggleLink2) authToggleLink2.addEventListener('click', (e) => { e.preventDefault(); toggleAuthMode(); });
  $('logoutBtn').addEventListener('click', handleLogout);
  $('googleLoginBtn').addEventListener('click', async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        alert('Gagal masuk dengan Google: ' + mapAuthError(err.code));
      }
    }
  });
  $('forgotPasswordLink').addEventListener('click', async (e) => {
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    if (!email) return alert('Isi alamat email dulu, lalu klik "Lupa kata sandi?".');
    try {
      await sendPasswordResetEmail(auth, email);
      alert('Tautan reset kata sandi dikirim ke ' + email + '.');
    } catch (err) { alert('Gagal: ' + mapAuthError(err.code)); }
  });

  // Tombol Buat & Gabung sekarang ada di halaman Ruang Kerja Saya
  $('createWorkspaceBtn').addEventListener('click', () => $('createWorkspaceModal').classList.remove('hidden'));
  $('joinWorkspaceBtn').addEventListener('click', () => $('joinWorkspaceModal').classList.remove('hidden'));

  // Tombol Pengaturan Akun sekarang ada di sidebar
  $('accountBtn').addEventListener('click', () => {
    $('accountName').value = state.user.displayName || state.user.email.split('@')[0];
    $('accountPassword').value = '';
    $('accountModal').classList.remove('hidden');
  });

  $('dashboardNavBtn').addEventListener('click', () => switchDashboardSection('home'));
  $('myWorkspacesNavBtn').addEventListener('click', () => switchDashboardSection('workspaces'));
  $('notificationsNavBtn').addEventListener('click', () => switchDashboardSection('notifications'));
  $('viewAllWorkspacesBtn').addEventListener('click', () => switchDashboardSection('workspaces'));
  $('createWorkspaceForm').addEventListener('submit', handleCreateWorkspace);
  $('joinWorkspaceForm').addEventListener('submit', handleJoinWorkspace);
  $('backToDashboardBtn').addEventListener('click', backToDashboard);
  $('tabTaskView').addEventListener('click', () => switchWorkspaceTab('task'));
  $('tabDivisionView').addEventListener('click', () => switchWorkspaceTab('division'));
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => { $(btn.dataset.close).classList.add('hidden'); });
  });
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
  });

  if ($('saveDriveBtn')) {
    $('saveDriveBtn').addEventListener('click', async () => {
      const link = ($('driveLinkInput')?.value || '').trim();
      if (state.role !== 'mentor') return;
      if (link && !safeUrl(link)) return alert('Tautan harus diawali http:// atau https://');
      try {
        await updateDoc(doc(db, 'workspaces', state.workspaceId), { driveLink: link });
        state.driveLink = link;
        updateDriveStatus();
        if (link) alert('✅ Link Google Drive berhasil disimpan!');
        else alert('Link Google Drive telah dihapus.');
      } catch (err) { alert('Gagal: ' + err.message); }
    });
  }

  if ($('driveLinkInput')) {
    $('driveLinkInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('saveDriveBtn')?.click(); }
    });
    $('driveLinkInput').addEventListener('input', (e) => { updateDriveStatus(e.target.value); });
  }

  function toggleWorkspaceDriveGroup() {
    const group = $('workspaceDriveGroup');
    const source = $('taskDriveSource');
    if (!group || !source) return;
    group.classList.toggle('hidden', source.value !== 'workspace');
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
      if (endEl.value && endEl.value < startEl.value) endEl.value = startEl.value;
    }
  }
  if ($('startDate')) $('startDate').addEventListener('change', syncEndDateMin);
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
    if (state.role !== 'mentor') return;
    if (startDate && endDate && endDate < startDate) return alert('Tenggat waktu tidak boleh lebih awal dari tanggal mulai.');
    try {
      await addDoc(collection(db, 'workspaces', state.workspaceId, 'tasks'), {
        title, assignee, difficulty, startDate, endDate,
        desc: $('taskDesc').value.trim(),
        driveSource, status: 'todo',
        reportNotes: '', reportFileLink: '', revisionNotes: '',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
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
    if (!safeUrl(reportLink)) return alert('Tautan harus diawali http:// atau https://');
    const reportTask = state.tasks.find(x => x.id === taskId);
    if (!reportTask || reportTask.status !== 'progress') return alert('Tugas ini tidak sedang dikerjakan.');
    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), {
        status: 'review',
        reportNotes: notes,
        reportFileLink: reportLink,
        history: arrayUnion({ type: 'laporan', by: state.workerName, text: notes, link: reportLink, at: Date.now() }),
        revisionNotes: '',
        updatedAt: serverTimestamp()
      });
      $('reportModal').classList.add('hidden');
      e.target.reset();
      alert('✅ Laporan terkirim ke Mentor!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('btnValidateDone').addEventListener('click', async () => {
    const taskId = $('reviewTaskId').value;
    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', taskId), {
        status: 'done',
        history: arrayUnion({ type: 'selesai', by: state.workerName, text: $('mentorReviewNotes').value.trim(), at: Date.now() }),
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
        history: arrayUnion({ type: 'revisi', by: state.workerName, text: revNotes, at: Date.now() }),
        updatedAt: serverTimestamp()
      });
      $('reviewModal').classList.add('hidden');
      alert('↩ Catatan revisi dikirimkan ke pekerja!');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  ['taskSearch', 'filterStatus', 'filterDifficulty', 'filterDue', 'filterAssignee'].forEach(id =>
    $(id)?.addEventListener(id === 'taskSearch' ? 'input' : 'change', renderTasks));

  $('leaveWorkspaceBtn').addEventListener('click', leaveWorkspace);
  $('changeCodeBtn').addEventListener('click', changeJoinCode);
  $('deleteWorkspaceBtn').addEventListener('click', deleteWorkspace);

  $('editTaskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.role !== 'mentor') return;
    const startDate = $('editTaskStart').value, endDate = $('editTaskEnd').value;
    if (endDate < startDate) return alert('Tenggat waktu tidak boleh lebih awal dari tanggal mulai.');
    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'tasks', $('editTaskId').value), {
        title: $('editTaskTitle').value.trim(),
        assignee: $('editTaskAssignee').value,
        difficulty: $('editTaskDifficulty').value,
        startDate, endDate,
        desc: $('editTaskDesc').value.trim(),
        updatedAt: serverTimestamp()
      });
      $('editTaskModal').classList.add('hidden');
    } catch (err) { alert('Gagal: ' + err.message); }
  });

  $('accountForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = $('accountName').value.trim(), newPw = $('accountPassword').value;
    const oldName = state.user.displayName || state.user.email.split('@')[0];
    try {
      if (newPw) await updatePassword(auth.currentUser, newPw);
      if (newName && newName !== oldName) await renameUser(newName, oldName);
      $('accountModal').classList.add('hidden');
      alert('✅ Akun diperbarui!');
    } catch (err) {
      alert(err.code === 'auth/requires-recent-login'
        ? 'Demi keamanan, keluar lalu masuk lagi sebelum mengganti kata sandi.'
        : 'Gagal: ' + (err.code ? mapAuthError(err.code) : err.message));
    }
  });

  $('createDivisionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('newDivisionName').value.trim();
    const desc = $('newDivisionDesc').value.trim();
    if (!name) return alert('Nama divisi wajib diisi.');
    if (name.toLowerCase() === 'umum' || state.divisions.some(d => d.name.toLowerCase() === name.toLowerCase())) {
      return alert('Nama divisi sudah ada.');
    }
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
    const target = state.members.find(m => m.id === memId);
    if (target?.role === 'mentor' && newRole !== 'mentor' && state.members.filter(m => m.role === 'mentor').length <= 1) {
      return alert('Tidak bisa menurunkan mentor terakhir.');
    }
    try {
      await updateDoc(doc(db, 'workspaces', state.workspaceId, 'members', memId), {
        role: newRole, division: newDiv
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
        dailyGoal: goal, goalDate: localDate()
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
        const words = (user.displayName || '').trim().split(/\s+/).filter(Boolean);
        initialsEl.textContent = (words.length > 1 ? words[0][0] + words[1][0] : nameSource.substring(0, 2)).toUpperCase();
      }
      ensureUserDoc(user)
        .catch(err => console.error('[DEBUG] ensureUserDoc gagal:', err))
        .finally(() => showDashboardView());
    } else {
      unsubscribers.forEach(u => u());
      unsubscribers = [];
      state = { user: null, workspaceId: null, workspaceName: null, role: null, workerName: null,
                driveLink: '', members: [], tasks: [], divisions: [] };
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
