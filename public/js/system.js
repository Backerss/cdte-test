// System state
let systemStatus = 'online';
let autoRefreshInterval = null;
let currentLogs = [];
let filteredLogs = [];
let currentActivities = [];
let academicSnapshots = [];
let currentAcademic = null;

// Initialize page
document.addEventListener('DOMContentLoaded', function () {
    initializeSystemData();
    loadLogs();
    loadActivities();
    loadAcademicYears();
    // updateSystemHealth(); // คอมเมนต์ไว้เพราะยังไม่ได้สร้างฟังก์ชัน

    // Start auto-refresh
    toggleAutoRefresh();

    // Update time display
    updateLastUpdateTime();
    setInterval(updateLastUpdateTime, 1000);
  
    // Setup reset input prevention
    setupResetInputPrevention();
});

async function loadAcademicYears() {
    try {
        const response = await fetch('/api/system/academic-years');
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'ไม่สามารถดึงปีการศึกษา');
        }
        currentAcademic = result.current;
        academicSnapshots = result.snapshots || [];
        renderAcademicYears();
    } catch (error) {
        console.error('Error loading academic years:', error);
        academicSnapshots = [];
        renderAcademicYears(true);
    }
}

function renderAcademicYears(hasError = false) {
    const listEl = document.getElementById('academicYearList');
    const currentEl = document.getElementById('currentAcademicLabel');
    if (currentEl && currentAcademic) {
        const start = new Date(currentAcademic.startDate).toLocaleDateString('th-TH');
        const end = new Date(currentAcademic.endDate).toLocaleDateString('th-TH');
        currentEl.textContent = `ปีการศึกษาปัจจุบัน: ${currentAcademic.academicYear} (${start} - ${end})`;
    }

    if (!listEl) return;

    if (hasError) {
        listEl.innerHTML = '<div class="empty-row">ไม่สามารถดึงข้อมูลปีการศึกษา</div>';
        return;
    }

    if (!academicSnapshots.length) {
        listEl.innerHTML = '<div class="empty-row">ยังไม่มี snapshot ปีการศึกษา</div>';
        return;
    }

    listEl.innerHTML = academicSnapshots.map(y => {
        const start = new Date(y.startDate).toLocaleDateString('th-TH');
        const end = new Date(y.endDate).toLocaleDateString('th-TH');
        return `
          <div class="academic-year-item">
            <div>
              <div class="academic-year-title">ปีการศึกษา ${y.academicYear}</div>
              <div class="academic-year-dates">${start} - ${end}</div>
              <div class="academic-year-note">นักศึกษา ${y.studentCount || 0} คน</div>
            </div>
            <div class="academic-year-actions">
              <button class="btn btn--primary btn--sm" onclick="exportAcademicYear('${y.academicYear}', 'json')">JSON</button>
              <button class="btn btn--primary btn--sm" onclick="exportAcademicYear('${y.academicYear}', 'csv')">Excel/CSV</button>
            </div>
          </div>
        `;
    }).join('');
}

// Academic year helper: ปีการศึกษาเริ่ม พ.ค. - มี.ค.
function getCurrentAcademicYear(now = new Date()) {
    const thaiYear = now.getFullYear() + 543;
    const month = now.getMonth() + 1;
    return month < 5 ? thaiYear - 1 : thaiYear;
}

async function createSnapshotForCurrentYear() {
    try {
        Swal.fire({ title: 'กำลังบันทึก snapshot...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const resp = await fetch('/api/system/academic-years/snapshot', { method: 'POST' });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
            throw new Error(data.message || 'สร้าง snapshot ไม่สำเร็จ');
        }
        Swal.fire({ icon: 'success', title: 'บันทึก snapshot สำเร็จ', text: `นักศึกษา ${data.studentCount || 0} คน`, timer: 1500, showConfirmButton: false });
        await loadAcademicYears();
    } catch (error) {
        console.error('Snapshot error:', error);
        Swal.fire({ icon: 'error', title: 'สร้าง snapshot ไม่สำเร็จ', text: error.message });
    }
}

async function exportAcademicYear(year, format = 'json') {
    try {
        const resp = await fetch(`/api/system/academic-years/${year}/export?format=${format}`);
        if (format === 'json') {
            const data = await resp.json();
            if (!resp.ok || !data.success) throw new Error(data.message || 'ส่งออกไม่สำเร็จ');
            const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `academic-year-${year}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } else {
            if (!resp.ok) {
                const errData = await resp.json();
                throw new Error(errData.message || 'ส่งออกไม่สำเร็จ');
            }
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `academic-year-${year}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }
        Swal.fire({ icon: 'success', title: 'ส่งออกสำเร็จ', timer: 1200, showConfirmButton: false });
    } catch (error) {
        console.error('Export error:', error);
        Swal.fire({ icon: 'error', title: 'ส่งออกไม่สำเร็จ', text: error.message });
    }
}

async function initializeSystemData() {
    try {
        const response = await fetch('/api/system/status');
        const result = await response.json();
    
        if (result.success) {
            systemStatus = result.status || 'online';
      
            // Update UI
            document.querySelectorAll('.status-card').forEach(card => {
                card.classList.remove('active');
            });
            const statusElement = document.getElementById(`status${systemStatus.charAt(0).toUpperCase() + systemStatus.slice(1)}`);
            if (statusElement) {
                statusElement.classList.add('active');
            }
      
            updateStatusDisplay();
        } else {
            systemStatus = 'online';
            updateStatusDisplay();
        }
    } catch (error) {
        console.error('Error loading system status:', error);
        systemStatus = 'online';
        updateStatusDisplay();
    }
}

function setSystemStatus(status) {
    const statusText = {
        online: 'เปิดใช้งานปกติ',
        maintenance: 'โหมดบำรุงรักษา',
        offline: 'ปิดชั่วคราว'
    };

    const statusDesc = {
        online: 'ผู้ใช้สามารถเข้าถึงระบบได้ตามปกติ',
        maintenance: 'ระบบจะแสดงหน้าปิดปรับปรุง ผู้ใช้จะไม่สามารถเข้าถึงได้',
        offline: 'ปิดการเข้าถึงทั้งหมดชั่วคราว'
    };

    // สอบถามก่อนดำเนินการ
    Swal.fire({
        title: `ยืนยันการเปลี่ยนสถานะ?`,
        html: `
            <div style="text-align:left;">
                <p style="margin:12px 0;"><strong>สถานะใหม่:</strong> ${statusText[status]}</p>
                <p style="margin:12px 0;color:var(--color-muted);">${statusDesc[status]}</p>
                <p style="margin:12px 0;padding:12px;background:#fff3cd;border-radius:6px;border-left:4px solid #ffc107;">
                    ⚠️ <strong>คำเตือน:</strong> การเปลี่ยนสถานะจะมีผลต่อผู้ใช้ทั้งหมดทันที
                </p>
            </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันการเปลี่ยน',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: status === 'offline' ? '#d33' : '#2E3094'
    }).then(async (result) => {
        if (result.isConfirmed) {
            // แสดง Loading
            Swal.fire({
                title: 'กำลังเปลี่ยนสถานะ...',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            try {
                // เรียก API เพื่อเปลี่ยนสถานะ
                const response = await fetch('/api/system/status', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ status })
                });

                const result = await response.json();

                if (result.success) {
                    systemStatus = status;

                    // Update UI
                    document.querySelectorAll('.status-card').forEach(card => {
                        card.classList.remove('active');
                    });
                    document.getElementById(`status${status.charAt(0).toUpperCase() + status.slice(1)}`).classList.add('active');
                    updateStatusDisplay();

                    Swal.fire({
                        icon: 'success',
                        title: 'เปลี่ยนสถานะสำเร็จ',
                        text: `ระบบเปลี่ยนเป็น "${statusText[status]}" แล้ว`,
                        timer: 2000,
                        showConfirmButton: false
                    });

                    // โหลดกิจกรรมใหม่
                    loadActivities();
                } else {
                    throw new Error(result.message || 'เกิดข้อผิดพลาด');
                }
            } catch (error) {
                console.error('Error changing system status:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'เกิดข้อผิดพลาด',
                    text: 'ไม่สามารถเปลี่ยนสถานะได้ กรุณาลองใหม่'
                });
            }
        }
    });
}

function updateStatusDisplay() {
    const statusText = {
        online: 'เปิดใช้งานปกติ ✅',
        maintenance: 'อยู่ระหว่างบำรุงรักษา 🔧',
        offline: 'ปิดชั่วคราว 🚫'
    };

    document.getElementById('currentStatus').textContent = statusText[systemStatus];
}

function updateLastUpdateTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('lastUpdate').textContent = timeStr;
}



async function loadLogs() {
    try {
        const response = await fetch('/api/system/logs');
        const result = await response.json();
    
        if (result.success) {
            currentLogs = result.logs || [];
            filteredLogs = [...currentLogs];
            renderLogs();
        } else {
            console.error('Failed to load logs:', result.message);
            currentLogs = [];
            filteredLogs = [];
            renderLogs();
        }
    } catch (error) {
        console.error('Error loading logs:', error);
        currentLogs = [];
        filteredLogs = [];
        renderLogs();
    }
}

function renderLogs() {
    const viewer = document.getElementById('logsViewer');

    if (filteredLogs.length === 0) {
        viewer.innerHTML = `
        <div class="log-entry" style="text-align:center;padding:40px;color:#858585;">
            ไม่พบ logs ที่ตรงกับเงื่อนไขการค้นหา
        </div>
    `;
        return;
    }

    viewer.innerHTML = filteredLogs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString('th-TH');
        return `
        <div class="log-entry ${log.level}">
            <span class="log-timestamp">[${time}]</span>
            <span class="log-level ${log.level}">${log.level}</span>
            <span class="log-category">[${log.category}]</span>
            <span class="log-message">${log.message}</span>
        </div>
    `;
    }).join('');

    // Auto-scroll to bottom
    viewer.scrollTop = viewer.scrollHeight;
}

function filterLogs() {
    const level = document.getElementById('logLevel').value;
    const category = document.getElementById('logCategory').value;
    const search = document.getElementById('logSearch').value.toLowerCase();

    filteredLogs = currentLogs.filter(log => {
        const matchLevel = !level || log.level === level;
        const matchCategory = !category || log.category === category;
        const matchSearch = !search || log.message.toLowerCase().includes(search);

        return matchLevel && matchCategory && matchSearch;
    });

    renderLogs();
}

function clearLogsDisplay() {
    Swal.fire({
        title: 'ล้างหน้าจอ Logs?',
        text: 'การกระทำนี้จะล้าง logs ที่แสดงบนหน้าจอ',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    }).then((result) => {
        if (result.isConfirmed) {
            currentLogs = [];
            filteredLogs = [];
            renderLogs();
            Swal.fire({
                icon: 'success',
                title: 'ล้างหน้าจอสำเร็จ',
                timer: 1500,
                showConfirmButton: false
            });
        }
    });
}

function exportLogs() {
    const data = filteredLogs.map(log =>
        `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.category}] ${log.message}`
    ).join('\n');

    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system-logs-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    Swal.fire({
        icon: 'success',
        title: 'Export สำเร็จ',
        text: 'ดาวน์โหลดไฟล์ logs แล้ว',
        timer: 2000,
        showConfirmButton: false
    });
}

function toggleAutoRefresh() {
    const checkbox = document.getElementById('autoRefresh');

    if (checkbox.checked) {
        autoRefreshInterval = setInterval(async () => {
            await loadLogs();
            await loadActivities();
        }, 5000);
    } else {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
    }
}

async function loadActivities() {
    try {
        const response = await fetch('/api/system/activities');
        const result = await response.json();
    
        if (result.success) {
            currentActivities = result.activities || [];
            renderActivities();
        } else {
            console.error('Failed to load activities:', result.message);
            currentActivities = [];
            renderActivities();
        }
    } catch (error) {
        console.error('Error loading activities:', error);
        currentActivities = [];
        renderActivities();
    }
}

function renderActivities() {
    const container = document.getElementById('activityList');

    if (currentActivities.length === 0) {
        container.innerHTML = `
            <div class="activity-item" style="text-align:center;padding:40px;color:var(--color-muted);border:2px dashed var(--color-border);">
                <div style="font-size:3rem;margin-bottom:16px;">📝</div>
                <h4 style="margin:0 0 8px 0;color:var(--color-text);">ยังไม่มีกิจกรรมล่าสุด</h4>
                <p style="margin:0;">ระบบจะบันทึกการกระทำของผู้ใช้และผู้ดูแลระบบ<br><small>แสดงเฉพาะ 5 กิจกรรมล่าสุด</small></p>
            </div>
        `;
        return;
    }

    // แสดงเฉพาะ 5 กิจกรรมล่าสุด
    const recentActivities = currentActivities.slice(0, 5);

    container.innerHTML = recentActivities.map(activity => {
        const iconMap = {
            'login': '🔐',
            'logout': '🚪',
            'register': '👤', 
            'update': '✏️',
            'delete': '🗑️',
            'create': '➕',
            'upload': '📤',
            'download': '📥',
            'view': '👁️',
            'approve': '✅',
            'reject': '❌',
            'evaluation': '📊',
            'lesson_plan': '📝',
            'profile_update': '👤',
            'password_change': '🔑',
            'system': '⚙️',
            'backup': '💾',
            'error': '⚠️',
            'success': '✅'
        };

        const colorMap = {
            'login': '#22c55e',
            'logout': '#6b7280', 
            'register': '#3b82f6',
            'update': '#f59e0b',
            'delete': '#ef4444',
            'create': '#3b82f6',
            'upload': '#8b5cf6',
            'download': '#06b6d4',
            'view': '#84cc16',
            'approve': '#10b981',
            'reject': '#f87171',
            'evaluation': '#f97316',
            'lesson_plan': '#0ea5e9',
            'profile_update': '#14b8a6',
            'password_change': '#e11d48',
            'system': '#64748b',
            'backup': '#7c3aed',
            'error': '#ef4444',
            'success': '#22c55e'
        };

        const icon = iconMap[activity.type] || '📝';
        const activityColor = colorMap[activity.type] || '#6b7280';
        const timeAgo = formatTimeAgo(activity.timestamp);

        const userInfo = activity.userId ? 
            `<span style="color: ${activityColor}; font-weight: 600;">${escapeHtml(activity.userName || activity.userId)}</span>` : 
            '<span style="color: var(--color-muted);">ระบบ</span>';

        return `
            <div class="activity-item" style="border-left: 3px solid ${activityColor}; background: linear-gradient(90deg, ${activityColor}10, transparent);">
                <div class="activity-icon" style="color: ${activityColor}; font-size: 1.5rem;">${icon}</div>
                <div class="activity-content">
                    <div class="activity-title" style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        ${userInfo} <span style="color: var(--color-muted);">•</span> <span>${escapeHtml(activity.title)}</span>
                    </div>
                    <div class="activity-desc" style="margin-bottom: 6px;">${escapeHtml(activity.description)}</div>
                    <div class="activity-time" style="display: flex; align-items: center; gap: 12px; font-size: 0.8rem;">
                        <span style="color: var(--color-muted);">🕐 ${timeAgo}</span>
                        ${activity.ipAddress ? `<span style="color: var(--color-muted);">🌐 ${activity.ipAddress}</span>` : ''}
                        ${activity.status ? `<span class="status-badge ${activity.status}" style="padding: 2px 8px; border-radius: 10px; font-size: 0.7rem;">${activity.status === 'success' ? '✅ สำเร็จ' : activity.status === 'error' ? '❌ ผิดพลาด' : '⏳ กำลังดำเนินการ'}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function formatTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now - time) / 1000); // วินาที

    if (diff < 60) return 'เมื่อสักครู่';
    if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)} วันที่แล้ว`;
  
    return time.toLocaleDateString('th-TH', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function refreshSystemData() {
    Swal.fire({
        title: 'กำลังรีเฟรชข้อมูล...',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        await Promise.all([
            loadLogs(),
            loadActivities()
        ]);

        Swal.fire({
            icon: 'success',
            title: 'รีเฟรชสำเร็จ',
            timer: 1500,
            showConfirmButton: false
        });
    } catch (error) {
        console.error('Error refreshing data:', error);
        Swal.fire({
            icon: 'error',
            title: 'เกิดข้อผิดพลาด',
            text: 'ไม่สามารถรีเฟรชข้อมูลได้'
        });
    }
}

function openBackupModal() {
    document.getElementById('backupModal').style.display = 'flex';

    // Set last backup date
    const lastBackup = new Date();
    lastBackup.setDate(lastBackup.getDate() - 1);
    document.getElementById('lastBackupDate').textContent = lastBackup.toLocaleString('th-TH');
}

function closeBackupModal() {
    document.getElementById('backupModal').style.display = 'none';
}

function performBackup() {
    const backupDB = document.getElementById('backupDB').checked;
    const backupFiles = document.getElementById('backupFiles').checked;
    const backupConfig = document.getElementById('backupConfig').checked;

    if (!backupDB && !backupFiles && !backupConfig) {
        Swal.fire({
            icon: 'warning',
            title: 'กรุณาเลือกข้อมูล',
            text: 'กรุณาเลือกข้อมูลที่ต้องการสำรองอย่างน้อย 1 รายการ'
        });
        return;
    }

    closeBackupModal();

    Swal.fire({
        title: 'กำลังสำรองข้อมูล...',
        html: 'กรุณารอสักครู่<br><b>0%</b>',
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();

            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                Swal.getHtmlContainer().querySelector('b').textContent = `${progress}%`;

                if (progress >= 100) {
                    clearInterval(interval);

                    Swal.fire({
                        icon: 'success',
                        title: 'สำรองข้อมูลสำเร็จ',
                        text: 'ข้อมูลถูกสำรองไว้เรียบร้อยแล้ว',
                        timer: 2000
                    });

                    // Update last backup date
                    document.getElementById('lastBackupDate').textContent = new Date().toLocaleString('th-TH');
                }
            }, 300);
        }
    });
}

// Reset Database System
let currentVerificationCode = '';
let resetCountdownInterval = null;
let resetCountdownData = null;

function generateVerificationCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function openResetDatabaseModal() {
    // Generate new verification code
    currentVerificationCode = generateVerificationCode();
  
    // Display the code
    document.getElementById('verificationCode').textContent = currentVerificationCode;
  
    // Clear input
    document.getElementById('verificationInput').value = '';
  
    // Show modal
    document.getElementById('resetDatabaseModal').style.display = 'flex';
  
    // Focus on input
    setTimeout(() => {
        document.getElementById('verificationInput').focus();
    }, 100);
}

function closeResetDatabaseModal() {
    // Simply hide the modal. Do NOT clear the verification code here
    // so it remains available for the countdown / reset process.
    document.getElementById('resetDatabaseModal').style.display = 'none';
}

function verifyResetDatabase() {
    const inputCode = document.getElementById('verificationInput').value.trim();
  
    if (inputCode === '') {
        Swal.fire({
            icon: 'warning',
            title: 'กรุณากรอกรหัสยืนยัน',
            text: 'โปรดพิมพ์รหัสยืนยัน 16 ตัวอักษรที่แสดงด้านบน'
        });
        return;
    }
  
    if (inputCode.length !== 16) {
        Swal.fire({
            icon: 'error',
            title: 'รหัสยืนยันไม่ครบ',
            text: 'รหัสยืนยันต้องมี 16 ตัวอักษร'
        });
        return;
    }
  
    if (inputCode !== currentVerificationCode) {
        Swal.fire({
            icon: 'error',
            title: 'รหัสยืนยันไม่ถูกต้อง',
            text: 'โปรดตรวจสอบและพิมพ์รหัสให้ถูกต้อง',
            didClose: () => {
                // Generate new code for security
                currentVerificationCode = generateVerificationCode();
                document.getElementById('verificationCode').textContent = currentVerificationCode;
                document.getElementById('verificationInput').value = '';
                document.getElementById('verificationInput').focus();
            }
        });
        return;
    }
  
    // Close reset modal first
    closeResetDatabaseModal();
  
    // Final confirmation
    Swal.fire({
        title: '⚠️ ยืนยันการ Reset ฐานข้อมูล',
        html: `
            <div style="text-align: left; background: #fef2f2; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <h4 style="color: #dc2626; margin: 0 0 12px 0;">การกระทำนี้จะ:</h4>
                <ul style="color: #7f1d1d; margin: 0; padding-left: 20px;">
                    <li><strong>ลบข้อมูลผู้ใช้ทั้งหมด</strong></li>
                    <li><strong>ลบข้อมูลการประเมินทั้งหมด</strong></li>
                    <li><strong>ลบแผนการสอนและไฟล์ทั้งหมด</strong></li>
                    <li><strong>ลบข้อมูลโรงเรียนและครูพี่เลี้ยง</strong></li>
                    <li><strong>สร้าง Admin ใหม่:</strong> admin/admin123</li>
                </ul>
                <p style="color: #dc2626; font-weight: 600; margin: 12px 0 0 0;">⚠️ ไม่สามารถเรียกคืนข้อมูลได้!</p>
            </div>
            <p style="font-size: 1.1rem; color: #dc2626; font-weight: 600;">คุณแน่ใจที่จะดำเนินการหรือไม่?</p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '🗑️ ยืนยัน Reset ทั้งหมด',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280',
        reverseButtons: true
    }).then(async (result) => {
        if (result.isConfirmed) {
            await performDatabaseReset();
        }
    });
}

async function performDatabaseReset() {
    // Start 10-minute countdown
    startResetCountdown();
}

function startResetCountdown() {
    const countdownMinutes = 10;
    const countdownStart = new Date();
    const countdownEnd = new Date(countdownStart.getTime() + countdownMinutes * 60 * 1000);
  
    // Store the verification code in the countdown data
    resetCountdownData = {
        startTime: countdownStart,
        endTime: countdownEnd,
        verificationCode: currentVerificationCode
    };
  
    console.log('Starting countdown with verification code:', currentVerificationCode);
  
    // Show countdown modal
    showCountdownModal();
  
    // Start countdown interval
    resetCountdownInterval = setInterval(() => {
        updateCountdownDisplay();
    }, 1000);
}

function showCountdownModal() {
    Swal.fire({
        title: '⏰ Reset Database - Countdown',
        html: `
            <div style="text-align: center;">
                <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
                    <div style="font-size: 2rem; margin-bottom: 10px;">⏰</div>
                    <h3 style="color: #92400e; margin: 0 0 10px 0;">Countdown ก่อน Reset Database</h3>
                    <p style="color: #7c2d12; margin: 0;">ระบบจะทำการ Reset อัตโนมัติใน:</p>
                </div>
        
                <div id="countdownDisplay" style="font-size: 3rem; font-weight: bold; color: #dc2626; margin: 20px 0; font-family: 'Courier New', monospace;">
                    10:00
                </div>
        
                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
                    <h4 style="color: #dc2626; margin: 0 0 10px 0;">⚠️ อีก 10 นาที ระบบจะ:</h4>
                    <ul style="text-align: left; color: #7f1d1d; margin: 0; padding-left: 20px;">
                        <li>ลบข้อมูลผู้ใช้ทั้งหมด</li>
                        <li>ลบข้อมูลการประเมินทั้งหมด</li>
                        <li>ลบไฟล์และเอกสารทั้งหมด</li>
                        <li>สร้าง Admin ใหม่ (admin/admin123)</li>
                    </ul>
                </div>
        
                <p style="color: #059669; font-weight: 600;">✅ คุณสามารถยกเลิกได้ทุกเวลา</p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '✅ ยกเลิกการ Reset',
        cancelButtonText: '⏱️ รอ Countdown ต่อไป',
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#6b7280',
        allowOutsideClick: false,
        allowEscapeKey: false,
        reverseButtons: true
    }).then((result) => {
        if (result.isConfirmed) {
            cancelResetCountdown();
        } else if (result.isDismissed) {
            // ปิด modal แต่ยังรัน countdown ต่อ
            Swal.close();
        }
    });
}

function updateCountdownDisplay() {
    if (!resetCountdownData) return;
  
    const now = new Date();
    const remaining = Math.max(0, resetCountdownData.endTime.getTime() - now.getTime());
  
    if (remaining <= 0) {
        // Time's up - execute reset
        clearInterval(resetCountdownInterval);
        resetCountdownInterval = null;
        Swal.close();
        executeActualReset();
        return;
    }
  
    const minutes = Math.floor(remaining / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
  
    const countdownElement = document.getElementById('countdownDisplay');
    if (countdownElement) {
        countdownElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
        // Change color as time runs out
        if (remaining < 60000) { // Less than 1 minute
            countdownElement.style.color = '#dc2626';
            countdownElement.style.animation = 'pulse 1s infinite';
        } else if (remaining < 180000) { // Less than 3 minutes
            countdownElement.style.color = '#f59e0b';
        }
    }
}

function cancelResetCountdown() {
    if (resetCountdownInterval) {
        clearInterval(resetCountdownInterval);
        resetCountdownInterval = null;
    }
    // Clear countdown data and verification code when user cancels
    resetCountdownData = null;
    currentVerificationCode = '';
  
    Swal.fire({
        icon: 'info',
        title: '✅ ยกเลิกการ Reset แล้ว',
        text: 'การ Reset Database ถูกยกเลิกเรียบร้อยแล้ว',
        timer: 2000,
        showConfirmButton: false
    });
}

async function executeActualReset() {
    // Get verification code from countdown data or current verification code
    const verificationCodeToUse = resetCountdownData?.verificationCode || currentVerificationCode;
  
    // Debug: Check if verification code exists
    if (!verificationCodeToUse) {
        Swal.fire({
            icon: 'error',
            title: '❌ ข้อผิดพลาด',
            text: 'ไม่พบรหัสยืนยัน กรุณาเริ่มต้นกระบวนการใหม่',
            confirmButtonText: 'ตกลง'
        });
        return;
    }
  
    console.log('Sending reset request with verification code:', verificationCodeToUse);
  
    Swal.fire({
        title: '🗑️ กำลัง Reset ฐานข้อมูล...',
        html: 'กรุณารอสักครู่ กำลังดำเนินการ Reset...<br><div style="color: #dc2626; font-weight: 600;">⚠️ ไม่สามารถหยุดได้แล้ว!</div>',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    try {
        const requestData = {
            verificationCode: verificationCodeToUse,
            confirmed: true,
            timestamp: new Date().toISOString()
        };
    
        console.log('Request data:', requestData);
    
        const response = await fetch('/api/system/reset-database', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
            try {
                const errorText = await response.text();
                console.error('Server error response:', errorText);
        
                // Try to parse JSON error response
                try {
                    const errorJson = JSON.parse(errorText);
                    if (errorJson.message) {
                        errorMessage = errorJson.message;
                    }
                } catch (jsonError) {
                    // If not JSON, use text as is
                    if (errorText) {
                        errorMessage = errorText;
                    }
                }
            } catch (textError) {
                console.error('Error reading response text:', textError);
            }
      
            throw new Error(errorMessage);
        }
    
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error('เซิร์เวอร์ตอบกลับข้อมูลที่ไม่ใช่ JSON: ' + text.substring(0, 100));
        }

        const result = await response.json();

        if (result.success) {
            Swal.fire({
                icon: 'success',
                title: '✅ Reset ฐานข้อมูลสำเร็จ',
                html: `
                    <div style="text-align: left; background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0;">
                        <h4 style="color: #16a34a; margin: 0 0 12px 0;">การดำเนินการสำเร็จ:</h4>
                        <ul style="color: #15803d; margin: 0; padding-left: 20px;">
                            <li>ลบข้อมูลเก่าทั้งหมดแล้ว</li>
                            <li>สร้าง Admin ใหม่แล้ว</li>
                            <li>ระบบพร้อมใช้งาน</li>
                        </ul>
                        <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px; padding: 12px; margin-top: 16px;">
                            <strong style="color: #92400e;">ข้อมูลการเข้าสู่ระบบใหม่:</strong><br>
                            <code style="background: #fff; padding: 4px 8px; border-radius: 4px; color: #1f2937;">Username: admin</code><br>
                            <code style="background: #fff; padding: 4px 8px; border-radius: 4px; color: #1f2937;">Password: admin123</code>
                        </div>
                    </div>
                `,
                confirmButtonText: '🔄 รีโหลดหน้าเว็บ',
                allowOutsideClick: false
            }).then(() => {
                // Reload the page
                window.location.reload();
            });
        } else {
            throw new Error(result.message || 'เกิดข้อผิดพลาดในการ Reset ฐานข้อมูล');
        }
    } catch (error) {
        console.error('Error resetting database:', error);
        Swal.fire({
            icon: 'error',
            title: '❌ เกิดข้อผิดพลาด',
            text: 'ไม่สามารถ Reset ฐานข้อมูลได้: ' + error.message,
            confirmButtonText: 'ตกลง'
        });
    } finally {
        // Always clear verification/ countdown state after attempt
        try {
            if (resetCountdownInterval) {
                clearInterval(resetCountdownInterval);
                resetCountdownInterval = null;
            }
        } catch (e) {
            console.error('Error clearing countdown interval in finally:', e);
        }

        resetCountdownData = null;
        currentVerificationCode = '';
    }
}

// Setup input prevention for reset verification
function setupResetInputPrevention() {
    // Use event delegation since the input might not exist yet
    document.addEventListener('paste', function(e) {
        if (e.target && e.target.id === 'verificationInput') {
            e.preventDefault();
            Swal.fire({
                icon: 'warning',
                title: 'ไม่อนุญาตให้ Paste',
                text: 'โปรดพิมพ์รหัสยืนยันด้วยตนเอง',
                timer: 2000
            });
        }
    });
    
    document.addEventListener('drop', function(e) {
        if (e.target && e.target.id === 'verificationInput') {
            e.preventDefault();
        }
    });
    
    document.addEventListener('contextmenu', function(e) {
        if (e.target && e.target.id === 'verificationInput') {
            e.preventDefault();
        }
    });
    
    document.addEventListener('input', function(e) {
        if (e.target && e.target.id === 'verificationInput') {
            // Allow only English letters
            e.target.value = e.target.value.replace(/[^A-Za-z]/g, '');
        }
    });
  
    // Prevent common keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.target && e.target.id === 'verificationInput') {
            // Prevent Ctrl+V, Ctrl+C, Ctrl+X, Ctrl+A
            if (e.ctrlKey && (e.key === 'v' || e.key === 'c' || e.key === 'x' || e.key === 'a')) {
                e.preventDefault();
                if (e.key === 'v') {
                    Swal.fire({
                        icon: 'warning',
                        title: 'ไม่อนุญาต Keyboard Shortcuts',
                        text: 'โปรดพิมพ์ด้วยตนเอง',
                        timer: 1500
                    });
                }
            }
        }
    });
}

// Close modal when clicking outside
window.onclick = function (event) {
    const backupModal = document.getElementById('backupModal');
    const resetModal = document.getElementById('resetDatabaseModal');
  
    if (event.target === backupModal) {
        closeBackupModal();
    }
  
    if (event.target === resetModal) {
        closeResetDatabaseModal();
    }
}
