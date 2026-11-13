// =========================================================================
// STATE MANAGEMENT (PENYIMPANAN DATA LOKAL & MEMORI)
// =========================================================================
let appState = {
    currentRole: 'mentor', // 'mentor' atau 'worker'
    mentorDriveLink: localStorage.getItem('mentorDriveLink') || '',
    workers: JSON.parse(localStorage.getItem('workspaceWorkers')) || [
        { id: 1, name: 'Budi Santoso' },
        { id: 2, name: 'Siti Aminah' },
        { id: 3, name: 'Reza Pratama' }
    ],
    tasks: JSON.parse(localStorage.getItem('workspaceTasks')) || [
        {
            id: 'task-1',
            title: 'Desain Konsep Awal Karakter 3D',
            assignee: 'Budi Santoso',
            kpi: 15,
            startDate: '2026-11-01',
            endDate: '2026-11-10',
            desc: 'Buat sketsa tampak depan dan samping.',
            status: 'todo', // todo, progress, review, done
            reportNotes: '',
            reportFile: ''
        }
    ],
    dailyGoals: JSON.parse(localStorage.getItem('workspaceDailyGoals')) || {}
};

// =========================================================================
// INISIALISASI APLIKASI SAAT HALAMAN DIMUAT
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initRoleSwitcher();
    initMentorControls();
    initWorkerControls();
    initModalHandlers();
    renderApp();
});

// =========================================================================
// RENDER UTAMA APLIKASI
// =========================================================================
function renderApp() {
    saveToLocalStorage();
    updateWorkerDisplay();
    renderTaskAssigneeOptions();
    renderKanbanBoard();
    updateKpiProgress();
    
    // Tampilkan / Sembunyikan Panel Berdasarkan Peran
    const mentorPanel = document.getElementById('mentorPanel');
    const workerDailyGoalBox = document.getElementById('workerDailyGoalBox');
    
    if (appState.currentRole === 'mentor') {
        mentorPanel.classList.remove('hidden');
        workerDailyGoalBox.classList.add('hidden');
    } else {
        mentorPanel.classList.add('hidden');
        workerDailyGoalBox.classList.remove('hidden');
    }
}

// Simpan ke LocalStorage agar data tidak hilang saat refresh
function saveToLocalStorage() {
    localStorage.setItem('mentorDriveLink', appState.mentorDriveLink);
    localStorage.setItem('workspaceWorkers', JSON.stringify(appState.workers));
    localStorage.setItem('workspaceTasks', JSON.stringify(appState.tasks));
    localStorage.setItem('workspaceDailyGoals', JSON.stringify(appState.dailyGoals));
}

// =========================================================================
// PENGATURAN PERAN (ROLE SWITCHER)
// =========================================================================
function initRoleSwitcher() {
    const roleSelector = document.getElementById('roleSelector');
    roleSelector.value = appState.currentRole;
    
    roleSelector.addEventListener('change', (e) => {
        appState.currentRole = e.target.value;
        renderApp();
    });
}

// =========================================================================
// FITUR MENTOR: DRIVE, PEKERJA, & PEMBUATAN TUGAS
// =========================================================================
function initMentorControls() {
    // 1. Simpan Tautan Google Drive Mentor
    const driveInput = document.getElementById('driveLinkInput');
    const saveDriveBtn = document.getElementById('saveDriveBtn');
    const driveStatusText = document.getElementById('driveStatusText');
    
    driveInput.value = appState.mentorDriveLink;
    updateDriveStatusUI(driveStatusText);
    
    saveDriveBtn.addEventListener('click', () => {
        const url = driveInput.value.trim();
        if (url) {
            appState.mentorDriveLink = url;
            saveToLocalStorage();
            updateDriveStatusUI(driveStatusText);
            alert('Tautan Google Drive mentor berhasil disimpan!');
        } else {
            alert('Mohon masukkan tautan URL Google Drive yang valid.');
        }
    });

    // 2. Tambah Pekerja (Maksimal 20 orang)
    const addWorkerBtn = document.getElementById('addWorkerBtn');
    const newWorkerNameInput = document.getElementById('newWorkerName');
    
    addWorkerBtn.addEventListener('click', () => {
        const name = newWorkerNameInput.value.trim();
        if (!name) return;
        
        if (appState.workers.length >= 20) {
            alert('Batas maksimal ruang kerja adalah 20 pekerja!');
            return;
        }
        
        const newWorker = {
            id: Date.now(),
            name: name
        };
        
        appState.workers.push(newWorker);
        newWorkerNameInput.value = '';
        renderApp();
    });

    // 3. Form Pembuatan Tugas Baru
    const createTaskForm = document.getElementById('createTaskForm');
    createTaskForm.addEventListener('submit', (e) => {
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
        
        const newTask = {
            id: 'task-' + Date.now(),
            title,
            assignee,
            kpi,
            startDate,
            endDate,
            desc,
            status: 'todo',
            reportNotes: '',
            reportFile: ''
        };
        
        appState.tasks.push(newTask);
        createTaskForm.reset();
        renderApp();
        alert('Tugas baru berhasil dibagikan ke ruang kerja!');
    });
}

function updateDriveStatusUI(statusElement) {
    if (appState.mentorDriveLink) {
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
    
    workerCountDisplay.textContent = `Pekerja: ${appState.workers.length} / 20`;
    workerList.innerHTML = '';
    
    appState.workers.forEach(worker => {
        const li = document.createElement('li');
        li.className = 'worker-tag-item';
        li.innerHTML = `
            <span>${worker.name}</span>
            ${appState.currentRole === 'mentor' ? `<button onclick="removeWorker(${worker.id})">&times;</button>` : ''}
        `;
        workerList.appendChild(li);
    });
}

function removeWorker(id) {
    if (appState.workers.length <= 1) {
        alert('Ruang kerja minimal harus memiliki 1 pekerja.');
        return;
    }
    appState.workers = appState.workers.filter(w => w.id !== id);
    renderApp();
}

function renderTaskAssigneeOptions() {
    const select = document.getElementById('taskAssignee');
    select.innerHTML = '';
    
    appState.workers.forEach(worker => {
        const option = document.createElement('option');
        option.value = worker.name;
        option.textContent = worker.name;
        select.appendChild(option);
    });
}

// =========================================================================
// FITUR TARGET HARIAN & KPI PEKERJA
// =========================================================================
function initWorkerControls() {
    const saveDailyGoalBtn = document.getElementById('saveDailyGoalBtn');
    const dailyGoalInput = document.getElementById('dailyGoalInput');
    const dailyGoalDisplay = document.getElementById('dailyGoalDisplay');
    
    // Ambil target hari ini (berdasarkan tanggal sistem)
    const todayKey = new Date().toISOString().split('T')[0];
    if (appState.dailyGoals[todayKey]) {
        dailyGoalInput.value = appState.dailyGoals[todayKey];
        dailyGoalDisplay.textContent = `Target Hari Ini: ${appState.dailyGoals[todayKey]}`;
        dailyGoalDisplay.classList.remove('hidden');
    } else {
        dailyGoalDisplay.textContent = 'Belum ada target dicatat hari ini.';
    }
    
    saveDailyGoalBtn.addEventListener('click', () => {
        const goal = dailyGoalInput.value.trim();
        if (!goal) return;
        
        appState.dailyGoals[todayKey] = goal;
        saveToLocalStorage();
        dailyGoalDisplay.textContent = `Target Hari Ini: ${goal}`;
        alert('Target harian berhasil dicatat! Pertahankan semangat kerja.');
    });
}

function updateKpiProgress() {
    let totalKpi = 0;
    let achievedKpi = 0;
    
    appState.tasks.forEach(task => {
        totalKpi += task.kpi;
        if (task.status === 'done') {
            achievedKpi += task.kpi;
        }
    });
    
    const percentage = totalKpi === 0 ? 0 : Math.round((achievedKpi / totalKpi) * 100);
    
    document.getElementById('kpiProgressText').textContent = `${achievedKpi} dari ${totalKpi} Poin KPI Tim Tercapai (${percentage}%)`;
    document.getElementById('kpiProgressBar').style.width = `${percentage}%`;
}

// =========================================================================
// PAPAN KANBAN & MANAJEMEN KARTU TUGAS
// =========================================================================
function renderKanbanBoard() {
    const statuses = ['todo', 'progress', 'review', 'done'];
    
    statuses.forEach(status => {
        const listContainer = document.getElementById(`list-${status}`);
        const countBadge = document.getElementById(`count-${status}`);
        listContainer.innerHTML = '';
        
        const filteredTasks = appState.tasks.filter(t => t.status === status);
        countBadge.textContent = filteredTasks.length;
        
        filteredTasks.forEach(task => {
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
    if (task.status === 'todo') {
        return `<button class="btn-action primary" onclick="moveTask('${task.id}', 'progress')">Mulai Kerjakan</button>`;
    } else if (task.status === 'progress') {
        return `<button class="btn-action primary" onclick="openReportModal('${task.id}')">Kirim Laporan & File</button>`;
    } else if (task.status === 'review') {
        if (appState.currentRole === 'mentor') {
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
    const task = appState.tasks.find(t => t.id === taskId);
    if (task) {
        task.status = newStatus;
        renderApp();
    }
}

// =========================================================================
// MODAL UNGGAH LAPORAN & SIMULASI AUTO-DRIVE SYNC
// =========================================================================
function initModalHandlers() {
    const modal = document.getElementById('reportModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const form = document.getElementById('submitReportForm');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const taskId = document.getElementById('reportTaskId').value;
        const notes = document.getElementById('reportNotes').value;
        const fileInput = document.getElementById('reportFile');
        const fileName = fileInput.files[0] ? fileInput.files[0].name : 'laporan_tugas.pdf';
        
        const task = appState.tasks.find(t => t.id === taskId);
        if (task) {
            task.reportNotes = notes;
            task.reportFile = fileName;
            task.status = 'review'; // Masuk ke kolom review mentor
            
            saveToLocalStorage();
            modal.classList.add('hidden');
            form.reset();
            renderApp();
            
            // Simulasi Auto-Drive Sync
            if (appState.mentorDriveLink) {
                alert(`Sukses! File "${fileName}" dan laporan telah otomatis disinkronkan ke Google Drive Mentor.`);
            } else {
                alert('Laporan berhasil dikirim, namun Mentor belum menautkan folder Google Drive.');
            }
        }
    });
}

function openReportModal(taskId) {
    const modal = document.getElementById('reportModal');
    document.getElementById('reportTaskId').value = taskId;
    modal.classList.remove('hidden');
}

// Fungsi Keamanan Dasar Mencegah XSS pada Input Teks
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}
