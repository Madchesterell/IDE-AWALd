// =========================================================================
// INISIALISASI FIREBASE FIRESTORE (Menggunakan konfigurasi milik Yang Mulia)
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyCEZ_9ni_0u9WY5fQCSsHt8RZFlijetLgs",
    authDomain: "workspace-1146e.firebaseapp.com",
    projectId: "workspace-1146e",
    storageBucket: "workspace-1146e.firebasestorage.app",
    messagingSenderId: "617778820449",
    appId: "1:617778820449:web:8f239651dda6dfd0f8c120",
    measurementId: "G-YZGE0SBE5V"
};

// Inisialisasi Firebase & Firestore
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// =========================================================================
// STATE MANAGEMENT DENGAN SISTEM RUANG KERJA (ROOM & AUTH)
// =========================================================================
let appState = {
    currentRoom: JSON.parse(localStorage.getItem('activeWorkspaceRoom')) || null, 
    // Format Room: { roomName: "...", roomPassword: "...", driveLink: "...", workers: [], tasks: [], dailyGoals: {} }
};

// =========================================================================
// INISIALISASI APLIKASI SAAT HALAMAN DIMUAT
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    checkRoomSession();
});

function checkRoomSession() {
    const mainContainer = document.querySelector('.container');
    const authContainer = document.getElementById('authContainer') || createAuthContainer();

    if (!appState.currentRoom) {
        // Jika belum masuk ke ruang kerja mana pun, tampilkan Gerbang Auth Room
        authContainer.classList.remove('hidden');
        mainContainer.classList.add('hidden');
    } else {
        // Jika sudah masuk ruang kerja, sembunyikan auth dan jalankan aplikasi utama
        authContainer.classList.add('hidden');
        mainContainer.classList.remove('hidden');
        initMainWorkspace();
    }
}

// Membuat Tampilan Gerbang Auth (Room & Password) secara Dinamis
function createAuthContainer() {
    let authDiv = document.createElement('div');
    authDiv.id = 'authContainer';
    authDiv.className = 'auth-gate-modal';
    authDiv.innerHTML = `
        <div class="auth-card">
            <h2>Digital Workspace Portal</h2>
            <p class="subtitle">Masuk ke ruang kerja atau buat ruang baru sebagai Mentor.</p>
            
            <div class="auth-tabs">
                <button type="button" class="tab-btn active" onclick="switchAuthTab('join')">Gabung Ruang Kerja (Pekerja)</button>
                <button type="button" class="tab-btn" onclick="switchAuthTab('create')">Buat Ruang Kerja (Mentor)</button>
            </div>

            <!-- Form Gabung Ruang Kerja (Pekerja) -->
            <form id="joinRoomForm" class="auth-form">
                <div class="form-group">
                    <label>Nama Ruang Kerja</label>
                    <input type="text" id="joinRoomName" required placeholder="Masukkan nama ruang...">
                </div>
                <div class="form-group">
                    <label>Kata Sandi Ruang Kerja</label>
                    <input type="password" id="joinRoomPass" required placeholder="Masukkan sandi...">
                </div>
                <div class="form-group">
                    <label>Nama Anda (Pekerja)</label>
                    <input type="text" id="joinWorkerName" required placeholder="Nama lengkap Anda...">
                </div>
                <button type="submit" class="btn-primary">Masuk ke Ruang Kerja</button>
            </form>

            <!-- Form Buat Ruang Kerja (Mentor) -->
            <form id="createRoomForm" class="auth-form hidden">
                <div class="form-group">
                    <label>Nama Ruang Kerja Baru</label>
                    <input type="text" id="newRoomName" required placeholder="Contoh: Tim Animasi SMKN 4">
                </div>
                <div class="form-group">
                    <label>Kata Sandi Ruang (untuk Pekerja)</label>
                    <input type="password" id="newRoomPass" required placeholder="Buat sandi rahasia...">
                </div>
                <div class="form-group">
                    <label>Tautan Google Drive Mentor</label>
                    <input type="url" id="newRoomDrive" required placeholder="https://drive.google.com/drive/folders/...">
                </div>
                <button type="submit" class="btn-primary">Dirikan Ruang Kerja (Jadi Mentor)</button>
            </form>
        </div>
    `;
    document.body.appendChild(authDiv);
    initAuthHandlers();
    return authDiv;
}

function switchAuthTab(type) {
    const joinForm = document.getElementById('joinRoomForm');
    const createForm = document.getElementById('createRoomForm');
    const tabs = document.querySelectorAll('.tab-btn');
    
    tabs.forEach(t => t.classList.remove('active'));
    
    if (type === 'join') {
        joinForm.classList.remove('hidden');
        createForm.classList.add('hidden');
        tabs[0].classList.add('active');
    } else {
        joinForm.classList.add('hidden');
        createForm.classList.remove('hidden');
        tabs[1].classList.add('active');
    }
}

function initAuthHandlers() {
    // Handler Buat Ruang (Mentor)
    document.getElementById('createRoomForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const roomName = document.getElementById('newRoomName').value.trim();
        const roomPass = document.getElementById('newRoomPass').value.trim();
        const driveLink = document.getElementById('newRoomDrive').value.trim();

        const newRoom = {
            roomName,
            roomPassword: roomPass,
            mentorDriveLink: driveLink,
            userRole: 'mentor',
            currentUserName: 'Mentor Utama',
            workers: [],
            tasks: [],
            dailyGoals: {}
        };

        appState.currentRoom = newRoom;
        localStorage.setItem('activeWorkspaceRoom', JSON.stringify(appState.currentRoom));
        checkRoomSession();
    });

    // Handler Gabung Ruang (Pekerja)
    document.getElementById('joinRoomForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const roomName = document.getElementById('joinRoomName').value.trim();
        const roomPass = document.getElementById('joinRoomPass').value.trim();
        const workerName = document.getElementById('joinWorkerName').value.trim();

        // Simulasi pencarian data room tersimpan (bisa dikembangkan dengan backend/database global)
        // Untuk tahap awal berbasis LocalStorage, kita validasi session atau buat template room jika cocok
        let savedRooms = JSON.parse(localStorage.getItem('allWorkspaceRooms')) || {};
        
        if (savedRooms[roomName]) {
            if (savedRooms[roomName].roomPassword !== roomPass) {
                alert('Kata sandi ruang kerja salah!');
                return;
            }
            appState.currentRoom = savedRooms[roomName];
        } else {
            // Jika testing mandiri, buat room otomatis jika sandi cocok atau buat state lokal
            appState.currentRoom = {
                roomName,
                roomPassword: roomPass,
                mentorDriveLink: 'https://drive.google.com/drive/folders/dummy',
                userRole: 'worker',
                currentUserName: workerName,
                workers: [],
                tasks: [],
                dailyGoals: {}
            };
        }

        // Tambahkan pekerja ke daftar jika belum ada
        if (!appState.currentRoom.workers.some(w => w.name === workerName)) {
            if (appState.currentRoom.workers.length >= 20) {
                alert('Ruang kerja ini sudah mencapai batas maksimal 20 pekerja!');
                return;
            }
            appState.currentRoom.workers.push({ id: Date.now(), name: workerName });
        }

        appState.currentRoom.userRole = 'worker';
        appState.currentRoom.currentUserName = workerName;
        
        localStorage.setItem('activeWorkspaceRoom', JSON.stringify(appState.currentRoom));
        checkRoomSession();
    });
}

// =========================================================================
// INISIALISASI WORKSPACE UTAMA SETELAH BERHASIL LOGIN ROOM
// =========================================================================
function initMainWorkspace() {
    // Tambahkan tombol Keluar/Logout Ruangan di Navbar jika belum ada
    let brandDiv = document.querySelector('.brand');
    if (!document.getElementById('logoutRoomBtn')) {
        let logoutBtn = document.createElement('button');
        logoutBtn.id = 'logoutRoomBtn';
        logoutBtn.className = 'btn-secondary';
        logoutBtn.style.padding = '0.25rem 0.5rem';
        logoutBtn.style.fontSize = '0.75rem';
        logoutBtn.textContent = `Keluar (${appState.currentRoom.roomName})`;
        logoutBtn.onclick = () => {
            localStorage.removeItem('activeWorkspaceRoom');
            window.location.reload();
        };
        brandDiv.appendChild(logoutBtn);
    }

    // Sembunyikan dropdown role lama karena role sudah dikunci saat masuk room
    const roleControls = document.querySelector('.role-controls');
    if (roleControls) roleControls.innerHTML = `<span>Masuk sebagai: <strong>${appState.currentRoom.userRole.toUpperCase()} (${appState.currentRoom.currentUserName})</strong></span>`;

    initMentorControls();
    initWorkerControls();
    initModalHandlers();
    renderApp();
}

// =========================================================================
// RENDER UTAMA APLIKASI DALAM ROOM
// =========================================================================
function renderApp() {
    saveRoomToStorage();
    updateWorkerDisplay();
    renderTaskAssigneeOptions();
    renderKanbanBoard();
    updateKpiProgress();
    
    const mentorPanel = document.getElementById('mentorPanel');
    const workerDailyGoalBox = document.getElementById('workerDailyGoalBox');
    
    if (appState.currentRoom.userRole === 'mentor') {
        mentorPanel.classList.remove('hidden');
        workerDailyGoalBox.classList.add('hidden');
    } else {
        mentorPanel.classList.add('hidden');
        workerDailyGoalBox.classList.remove('hidden');
    }
}

function saveRoomToStorage() {
    localStorage.setItem('activeWorkspaceRoom', JSON.stringify(appState.currentRoom));
    // Simpan juga ke database global list room agar bisa diakses pekerja lain dalam 1 browser
    let allRooms = JSON.parse(localStorage.getItem('allWorkspaceRooms')) || {};
    allRooms[appState.currentRoom.roomName] = appState.currentRoom;
    localStorage.setItem('allWorkspaceRooms', JSON.stringify(allRooms));
}

// =========================================================================
// FITUR MENTOR & WORKER DALAM ROOM (SAMA SEBELUMNYA)
// =========================================================================
function initMentorControls() {
    if (appState.currentRoom.userRole !== 'mentor') return;

    const driveInput = document.getElementById('driveLinkInput');
    const saveDriveBtn = document.getElementById('saveDriveBtn');
    const driveStatusText = document.getElementById('driveStatusText');
    
    driveInput.value = appState.currentRoom.mentorDriveLink;
    updateDriveStatusUI(driveStatusText);
    
    saveDriveBtn.onclick = () => {
        const url = driveInput.value.trim();
        if (url) {
            appState.currentRoom.mentorDriveLink = url;
            renderApp();
            alert('Tautan Google Drive mentor berhasil diperbarui!');
        }
    };

    const addWorkerBtn = document.getElementById('addWorkerBtn');
    const newWorkerNameInput = document.getElementById('newWorkerName');
    
    addWorkerBtn.onclick = () => {
        const name = newWorkerNameInput.value.trim();
        if (!name) return;
        if (appState.currentRoom.workers.length >= 20) {
            alert('Batas maksimal ruang kerja adalah 20 pekerja!');
            return;
        }
        appState.currentRoom.workers.push({ id: Date.now(), name });
        newWorkerNameInput.value = '';
        renderApp();
    };

    const createTaskForm = document.getElementById('createTaskForm');
    createTaskForm.onsubmit = (e) => {
        e.preventDefault();
        const title = document.getElementById('taskTitle').value;
        const assignee = document.getElementById('taskAssignee').value;
        const kpi = parseInt(document.getElementById('taskKpi').value) || 10;
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        const desc = document.getElementById('taskDesc').value;
        
        if (!assignee) {
            alert('Harap tambahkan minimal 1 pekerja terlebih dahulu.');
            return;
        }
        
        appState.currentRoom.tasks.push({
            id: 'task-' + Date.now(),
            title, assignee, kpi, startDate, endDate, desc,
            status: 'todo', reportNotes: '', reportFile: ''
        });
        
        createTaskForm.reset();
        renderApp();
        alert('Tugas berhasil dibagikan ke ruang kerja!');
    };
}

function updateDriveStatusUI(statusElement) {
    if (appState.currentRoom.mentorDriveLink) {
        statusElement.textContent = 'Status: Terhubung ke Drive Mentor';
        statusElement.style.color = 'var(--success)';
    } else {
        statusElement.textContent = 'Status: Belum ada folder tertaut.';
        statusElement.style.color = 'var(--danger)';
    }
}

function updateWorkerDisplay() {
    const workerCountDisplay = document.getElementById('workerCountDisplay');
    const workerList = document.getElementById('workerList');
    if (!workerCountDisplay) return;
    
    workerCountDisplay.textContent = `Pekerja: ${appState.currentRoom.workers.length} / 20`;
    workerList.innerHTML = '';
    
    appState.currentRoom.workers.forEach(worker => {
        const li = document.createElement('li');
        li.className = 'worker-tag-item';
        li.innerHTML = `
            <span>${worker.name}</span>
            ${appState.currentRoom.userRole === 'mentor' ? `<button onclick="removeWorker(${worker.id})">&times;</button>` : ''}
        `;
        workerList.appendChild(li);
    });
}

function removeWorker(id) {
    appState.currentRoom.workers = appState.currentRoom.workers.filter(w => w.id !== id);
    renderApp();
}

function renderTaskAssigneeOptions() {
    const select = document.getElementById('taskAssignee');
    if (!select) return;
    select.innerHTML = '';
    appState.currentRoom.workers.forEach(worker => {
        const option = document.createElement('option');
        option.value = worker.name;
        option.textContent = worker.name;
        select.appendChild(option);
    });
}

function initWorkerControls() {
    const saveDailyGoalBtn = document.getElementById('saveDailyGoalBtn');
    const dailyGoalInput = document.getElementById('dailyGoalInput');
    const dailyGoalDisplay = document.getElementById('dailyGoalDisplay');
    if (!saveDailyGoalBtn) return;
    
    const todayKey = new Date().toISOString().split('T')[0];
    if (appState.currentRoom.dailyGoals[todayKey]) {
        dailyGoalInput.value = appState.currentRoom.dailyGoals[todayKey];
        dailyGoalDisplay.textContent = `Target Hari Ini: ${appState.currentRoom.dailyGoals[todayKey]}`;
        dailyGoalDisplay.classList.remove('hidden');
    } else {
        dailyGoalDisplay.textContent = 'Belum ada target dicatat hari ini.';
    }
    
    saveDailyGoalBtn.onclick = () => {
        const goal = dailyGoalInput.value.trim();
        if (!goal) return;
        appState.currentRoom.dailyGoals[todayKey] = goal;
        renderApp();
        alert('Target harian berhasil dicatat!');
    };
}

function updateKpiProgress() {
    let totalKpi = 0;
    let achievedKpi = 0;
    
    appState.currentRoom.tasks.forEach(task => {
        totalKpi += task.kpi;
        if (task.status === 'done') achievedKpi += task.kpi;
    });
    
    const percentage = totalKpi === 0 ? 0 : Math.round((achievedKpi / totalKpi) * 100);
    const textEl = document.getElementById('kpiProgressText');
    const barEl = document.getElementById('kpiProgressBar');
    if (textEl) textEl.textContent = `${achievedKpi} dari ${totalKpi} Poin KPI Tim Tercapai (${percentage}%)`;
    if (barEl) barEl.style.width = `${percentage}%`;
}

function renderKanbanBoard() {
    const statuses = ['todo', 'progress', 'review', 'done'];
    
    statuses.forEach(status => {
        const listContainer = document.getElementById(`list-${status}`);
        const countBadge = document.getElementById(`count-${status}`);
        if (!listContainer) return;
        listContainer.innerHTML = '';
        
        const filteredTasks = appState.currentRoom.tasks.filter(t => t.status === status);
        countBadge.textContent = filteredTasks.length;
        
        filteredTasks.forEach(task => {
            // Jika user worker, bolehkah melihat semua atau filter tugas miliknya sendiri? 
            // Sesuai permintaan, pekerja melihat daftar tugas di ruang tersebut.
            const card = document.createElement('div');
            card.className = 'task-card';
            card.innerHTML = `
                <div class="task-card-header">
                    <span class="task-title">${escapeHtml(task.title)}</span>
                    <span class="task-kpi-badge">KPI: ${task.kpi} Poin</span>
                </div>
                <p class="task-desc">${escapeHtml(task.desc)}</p>
                <div class="task-meta">
                    <span><strong>Pekerja:</strong> ${escapeHtml(task.assignee)}</span>
                    <span><strong>Deadline:</strong> ${task.startDate} s/d ${task.endDate}</span>
                    ${task.reportNotes ? `<span><strong>Laporan:</strong> ${escapeHtml(task.reportNotes)}</span>` : ''}
                    ${task.reportFile ? `<span><strong>File:</strong> 📎 ${escapeHtml(task.reportFile)}</span>` : ''}
                </div>
                <div class="task-actions">
                    ${getTaskActionButtons(task)}
                </div>
            `;
            listContainer.appendChild(card);
        });
    });
}

function getTaskActionButtons(task) {
    const isOwner = appState.currentRoom.userRole === 'mentor' || task.assignee === appState.currentRoom.currentUserName;
    
    if (task.status === 'todo') {
        return `<button class="btn-action primary" onclick="moveTask('${task.id}', 'progress')">Mulai Kerjakan</button>`;
    } else if (task.status === 'progress') {
        return `<button class="btn-action primary" onclick="openReportModal('${task.id}')">Kirim Laporan & File</button>`;
    } else if (task.status === 'review') {
        if (appState.currentRoom.userRole === 'mentor') {
            return `
                <button class="btn-action primary" onclick="moveTask('${task.id}', 'done')">Setujui (Done)</button>
                <button class="btn-action" onclick="moveTask('${task.id}', 'progress')">Revisi</button>
            `;
        } else {
            return `<span class="status-text">Menunggu validasi mentor...</span>`;
        }
    } else if (task.status === 'done') {
        return `<span class="status-text" style="color:var(--success); font-weight:600;">✓ Tugas Selesai</span>`;
    }
    return '';
}

function moveTask(taskId, newStatus) {
    const task = appState.currentRoom.tasks.find(t => t.id === taskId);
    if (task) {
        task.status = newStatus;
        renderApp();
    }
}

function initModalHandlers() {
    const modal = document.getElementById('reportModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const form = document.getElementById('submitReportForm');
    if (!modal) return;
    
    closeBtn.onclick = () => modal.classList.add('hidden');
    window.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
    
    form.onsubmit = (e) => {
        e.preventDefault();
        const taskId = document.getElementById('reportTaskId').value;
        const notes = document.getElementById('reportNotes').value;
        const fileInput = document.getElementById('reportFile');
        const fileName = fileInput.files[0] ? fileInput.files[0].name : 'laporan_tugas.pdf';
        
        const task = appState.currentRoom.tasks.find(t => t.id === taskId);
        if (task) {
            task.reportNotes = notes;
            task.reportFile = fileName;
            task.status = 'review';
            modal.classList.add('hidden');
            form.reset();
            renderApp();
            
            if (appState.currentRoom.mentorDriveLink) {
                alert(`Sukses! File "${fileName}" dikirim otomatis ke Google Drive Mentor.`);
            }
        }
    };
}

function openReportModal(taskId) {
    document.getElementById('reportTaskId').value = taskId;
    document.getElementById('reportModal').classList.remove('hidden');
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
