/**
 * Observations Management System
 * Frontend JavaScript สำหรับจัดการหน้า Observations
 * เชื่อมต่อกับ API: /api/observations, /api/students
 */

// ========================================
// Global Variables
// ========================================
let selectedStudents = []; // เก็บ studentId ที่เลือก
let currentObservations = []; // เก็บรายการ observations ปัจจุบัน
let allStudents = []; // เก็บรายชื่อนักศึกษาทั้งหมด

// ========================================
// Thai Font Loading for jsPDF
// ========================================

// ArrayBuffer to base64 converter
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Load and register Thai font with jsPDF
async function loadAndRegisterFont(doc, fontUrl, vfsName, fontName, fontStyle = 'normal') {
  try {
    console.log(`Loading font: ${fontUrl}`);
    const resp = await fetch(fontUrl);
    if (!resp.ok) throw new Error(`Failed to fetch font: ${resp.status} ${resp.statusText}`);
    
    const buf = await resp.arrayBuffer();
    const b64 = arrayBufferToBase64(buf);
    
    // Register font with jsPDF VFS
    doc.addFileToVFS(vfsName, b64);
    doc.addFont(vfsName, fontName, fontStyle);
    
    console.log(`Font registered successfully: ${fontName} (${fontStyle})`);
    return true;
  } catch (err) {
    console.error(`Font loading error for ${fontUrl}:`, err);
    return false;
  }
}

// Global font loading cache
window._fontsLoaded = window._fontsLoaded || { done: false, promise: null };

// Ensure Thai fonts are loaded before PDF generation
async function ensureThaiFont(doc) {
  if (window._fontsLoaded.done) return window._fontsLoaded.success;
  if (window._fontsLoaded.promise) return window._fontsLoaded.promise;

  window._fontsLoaded.promise = (async () => {
    try {
      // Load THSarabunNew font from public/fonts/
      const success = await loadAndRegisterFont(
        doc, 
        '/fonts/THSarabunNew.ttf', 
        'THSarabunNew.ttf', 
        'THSarabunNew', 
        'normal'
      );
      
      window._fontsLoaded.done = true;
      window._fontsLoaded.success = success;
      
      if (success) {
        console.log('✅ Thai font loaded successfully for PDF generation');
      } else {
        console.warn('⚠️ Thai font loading failed, will use fallback helvetica');
      }
      
      return success;
    } catch (error) {
      console.error('Font loading error:', error);
      window._fontsLoaded.done = true;
      window._fontsLoaded.success = false;
      return false;
    }
  })();

  return window._fontsLoaded.promise;
}

// ========================================
// Initialization
// ========================================
document.addEventListener('DOMContentLoaded', function() {
  loadObservations();
});

// ========================================
// API Calls
// ========================================

/**
 * โหลดรายการ observations จาก API
 */
async function loadObservations() {
  try {
    const academicYear = document.getElementById('academicYearFilter')?.value || '';
    const yearLevel = document.getElementById('yearLevelFilter')?.value || '';
    const status = document.getElementById('statusFilter')?.value || '';
    
    // สร้าง query params
    const params = new URLSearchParams();
    if (academicYear) params.append('academicYear', academicYear);
    if (yearLevel) params.append('yearLevel', yearLevel);
    if (status) params.append('status', status);
    
    const url = `/api/observations?${params.toString()}`;
    
    const response = await fetch(url);
    
    
    const data = await response.json();
    
    
    if (data.success) {
      currentObservations = data.observations;
      renderObservations();
    } else {
      console.error('❌ Failed to load observations:', data.message);
      Swal.fire('ข้อผิดพลาด', data.message, 'error');
    }
  } catch (error) {
    console.error('💥 Error loading observations:', error);
    Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
  }
}

/**
 * โหลดรายชื่อนักศึกษาจาก API
 */
async function loadStudentsForSelection() {
  try {
    const yearLevel = document.getElementById('yearLevel')?.value || '';
    const params = new URLSearchParams();
    if (yearLevel) params.append('yearLevel', yearLevel);
    
    const response = await fetch(`/api/students?${params.toString()}`);
    const data = await response.json();
    
    if (data.success) {
      allStudents = data.students;
      populateStudentPrefixes(); // สร้าง options สำหรับ prefix filter
      renderStudentsList();
    } else {
      console.error('Failed to load students:', data.message);
    }
  } catch (error) {
    console.error('Error loading students:', error);
  }
}

/**
 * สร้าง observation ใหม่
 */
async function createObservation(formData) {
  try {
    const response = await fetch('/api/observations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating observation:', error);
    return { success: false, message: 'เกิดข้อผิดพลาดในการสร้างการสังเกตุ' };
  }
}

/**
 * อัปเดตสถานะ observation
 */
async function updateObservationStatus(observationId, status) {
  try {
    const response = await fetch(`/api/observations/${observationId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating observation:', error);
    return { success: false, message: 'เกิดข้อผิดพลาดในการอัปเดต' };
  }
}

/**
 * โหลดข้อมูล observation และนักศึกษา
 */
async function loadObservationDetail(observationId) {
  try {
    const response = await fetch(`/api/observations/${observationId}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error loading observation detail:', error);
    return { success: false, message: 'เกิดข้อผิดพลาดในการโหลดข้อมูล' };
  }
}

/**
 * อัปเดตสถานะนักศึกษา
 */
async function updateStudentStatus(observationId, studentDocId, updateData) {
  try {
    const response = await fetch(`/api/observations/${observationId}/students/${studentDocId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating student status:', error);
    return { success: false, message: 'เกิดข้อผิดพลาดในการอัปเดต' };
  }
}

// ========================================
// Student Filter Functions
// ========================================

/**
 * สร้าง options สำหรับ prefix filter
 */
function populateStudentPrefixes() {
  const prefixSet = new Set();
  
  allStudents.forEach(student => {
    const sid = (student.user_id || student.studentId || student.id || '');
    if (sid && sid.length >= 2) {
      // เอา 2 หลักแรกของรหัสนักศึกษา (ใช้ user_id เป็นหลัก, fallback to studentId)
      const prefix = String(sid).substring(0, 2);
      prefixSet.add(prefix);
    }
  });
  
  const prefixFilter = document.getElementById('studentPrefixFilter');
  const sortedPrefixes = Array.from(prefixSet).sort();
  
  // เคลียร์ options เดิม (เว้น option แรก)
  prefixFilter.innerHTML = '<option value="">รหัสนำหน้าทั้งหมด</option>';
  
  sortedPrefixes.forEach(prefix => {
    const option = document.createElement('option');
    option.value = prefix;
    const count = allStudents.filter(s => ((s.user_id || s.studentId || s.id || '').startsWith(prefix))).length;
    option.textContent = `${prefix}xxxxx (${count} คน)`;
    prefixFilter.appendChild(option);
  });
}

/**
 * กรองรายชื่อนักศึกษาตาม filter ต่างๆ
 */
function filterStudentsList() {
  const yearFilter = document.getElementById('studentYearFilter').value;
  const prefixFilter = document.getElementById('studentPrefixFilter').value;
  const searchQuery = document.getElementById('studentSearch').value.toLowerCase();
  
  const items = document.querySelectorAll('.student-item');
  let visibleCount = 0;
  
  items.forEach(item => {
    const studentId = item.querySelector('.student-checkbox').value;
    const student = allStudents.find(s => (s.user_id || s.studentId || s.id || '') === studentId);
    
    if (!student) {
      item.style.display = 'none';
      return;
    }
    
    let shouldShow = true;
    
    // Filter by year
    if (yearFilter && student.yearLevel !== parseInt(yearFilter)) {
      shouldShow = false;
    }
    
    // Filter by prefix (use canonical id)
    const sid = (student.user_id || student.studentId || '');
    if (prefixFilter && !sid.startsWith(prefixFilter)) {
      shouldShow = false;
    }
    
    // Filter by search
    if (searchQuery) {
      const searchText = `${student.name} ${student.studentId}`.toLowerCase();
      if (!searchText.includes(searchQuery)) {
        shouldShow = false;
      }
    }
    
    item.style.display = shouldShow ? 'flex' : 'none';
    if (shouldShow) visibleCount++;
  });
  
  // อัปเดตจำนวนที่แสดง
  const container = document.getElementById('studentsList');
  const emptyState = container.querySelector('.empty-state');
  
  if (visibleCount === 0 && !emptyState) {
    container.innerHTML = '<div class="empty-state" style="padding:20px;text-align:center;color:var(--color-muted);">ไม่พบนักศึกษาที่ตรงกับเงื่อนไข</div>';
  } else if (visibleCount > 0 && emptyState) {
    renderStudentsList();
  }
}

// ========================================
// Render Functions
// ========================================

/**
 * แสดงรายการ observations
 */
function renderObservations() {
  const container = document.getElementById('observationsList');
  
  
  
  if (!currentObservations || currentObservations.length === 0) {
    
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <h3 style="color:var(--color-text)">ยังไม่มีการสังเกตุ</h3>
        <p>เริ่มต้นสร้างการสังเกตุแรกของคุณ</p>
        <button class="btn btn--primary" onclick="openCreateObservationModal()">
          <span>➕</span>
          สร้างการสังเกตุใหม่
        </button>
      </div>
    `;
    return;
  }

  
  container.innerHTML = currentObservations.map(obs => `
    <div class="observation-card">
      <div class="observation-header">
        <div>
          <h3 class="observation-title">${escapeHtml(obs.name)}</h3>
          <div class="observation-meta">
            <span>📅 ${formatThaiDate(obs.startDate)} - ${formatThaiDate(obs.endDate)}</span>
            <span>🎓 ปี ${obs.yearLevel}</span>
            <span>👥 ${obs.totalStudents} คน</span>
          </div>
        </div>
        <span class="status-badge ${obs.status}">
          ${getStatusText(obs.status)}
        </span>
      </div>

      <div class="progress-section">
        <div class="progress-item">
          <div class="progress-number">${obs.completedEvaluations}/${obs.totalStudents}</div>
          <div class="progress-label">ประเมินเสร็จ</div>
        </div>
        <div class="progress-item">
          <div class="progress-number">${obs.submittedLessonPlans}/${obs.totalStudents}</div>
          <div class="progress-label">ส่งแผนการสอน</div>
        </div>
        <div class="progress-item">
          <div class="progress-number">${obs.totalStudents > 0 ? Math.round((obs.completedEvaluations / obs.totalStudents) * 100) : 0}%</div>
          <div class="progress-label">ความคืบหน้า</div>
        </div>
      </div>

      <div class="observation-actions">
        <button class="btn btn--secondary btn--sm" onclick="manageStudents('${obs.id}')">
          👥 จัดการนักศึกษา
        </button>
        <button class="btn btn--secondary btn--sm" onclick="viewProgress('${obs.id}')">
          📊 ดูความคืบหน้า
        </button>
        <button class="btn btn--secondary btn--sm" onclick="exportData('${obs.id}')">
          📄 ส่งออกข้อมูล
        </button>
        ${obs.status === 'active' ? `
          <button class="btn btn--danger btn--sm" onclick="terminateObservation('${obs.id}')">
            🛑 ยุติการสังเกตุ
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

/**
 * แสดงรายชื่อนักศึกษาในโมดัลสร้าง
 */
function renderStudentsList() {
  const container = document.getElementById('studentsList');
  
  if (!allStudents || allStudents.length === 0) {
    container.innerHTML = '<div style="padding:16px;text-align:center;color:var(--color-muted)">ไม่พบนักศึกษา</div>';
    return;
  }
  
  container.innerHTML = allStudents.map(student => `
    <div class="student-item">
      <input type="checkbox" class="student-checkbox" value="${(student.user_id || student.studentId || student.id || '')}" 
             onchange="toggleStudentSelection('${(student.user_id || student.studentId || student.id || '')}')"
             ${selectedStudents.includes((student.user_id || student.studentId || student.id || '')) ? 'checked' : ''}>
      <div class="student-info">
        <div class="student-name">${escapeHtml(student.name)}</div>
        <div class="student-id">รหัส: ${(student.user_id || student.studentId || '')} | ปี ${student.yearLevel}</div>
      </div>
    </div>
  `).join('');
  
  // Apply current filters
  filterStudentsList();
}

// ========================================
// Filter Functions
// ========================================

/**
 * กรองรายการ observations
 */
function filterObservations() {
  loadObservations(); // โหลดใหม่จาก API พร้อม filters
}

// ========================================
// Modal Functions
// ========================================

/**
 * เปิดโมดัลสร้างการสังเกตุ
 */
function openCreateObservationModal() {
  document.getElementById('createObservationModal').style.display = 'flex';
  selectedStudents = [];
  
  // Reset filters
  if (document.getElementById('studentYearFilter')) {
    document.getElementById('studentYearFilter').value = '';
  }
  if (document.getElementById('studentPrefixFilter')) {
    document.getElementById('studentPrefixFilter').value = '';
  }
  if (document.getElementById('studentSearch')) {
    document.getElementById('studentSearch').value = '';
  }
  
  loadStudentsForSelection();
  updateSelectedCount();
}

/**
 * ปิดโมดัลสร้างการสังเกตุ
 */
function closeCreateObservationModal() {
  document.getElementById('createObservationModal').style.display = 'none';
  document.getElementById('createObservationForm').reset();
  selectedStudents = [];
  document.getElementById('yearConflictWarning').style.display = 'none';
  updateSelectedCount();
}

/**
 * ตรวจสอบความซ้ำของปีการศึกษา + ชั้นปี
 */
async function checkYearConflict() {
  const academicYear = document.getElementById('academicYear').value;
  const yearLevel = document.getElementById('yearLevel').value;
  const warning = document.getElementById('yearConflictWarning');

  if (academicYear && yearLevel) {
    // เช็คจาก currentObservations ที่โหลดมา
    const conflict = currentObservations.some(obs => 
      obs.academicYear === academicYear && 
      obs.yearLevel.toString() === yearLevel &&
      obs.status === 'active'
    );
    
    warning.style.display = conflict ? 'block' : 'none';
    
    // โหลดนักศึกษาตามชั้นปีที่เลือก
    await loadStudentsForSelection();
  } else {
    warning.style.display = 'none';
  }
}

/**
 * คำนวณวันสิ้นสุด (เพิ่ม 10 วัน)
 */
function calculateEndDate() {
  const startDate = document.getElementById('startDate').value;
  if (startDate) {
    const start = new Date(startDate + 'T00:00:00'); // ป้องกัน timezone issue
    const end = new Date(start.getTime() + (10 * 24 * 60 * 60 * 1000)); // 10 วัน
    const year = end.getFullYear();
    const month = String(end.getMonth() + 1).padStart(2, '0');
    const day = String(end.getDate()).padStart(2, '0');
    document.getElementById('endDate').value = `${year}-${month}-${day}`;
  }
}

// ========================================
// Student Selection Functions
// ========================================

/**
 * เปลี่ยนสถานะการเลือกนักศึกษา
 */
function toggleStudentSelection(studentId) {
  const checkbox = document.querySelector(`input[value="${studentId}"]`);
  if (checkbox && checkbox.checked) {
    if (!selectedStudents.includes(studentId)) {
      selectedStudents.push(studentId);
    }
  } else {
    selectedStudents = selectedStudents.filter(id => id !== studentId);
  }
  updateSelectedCount();
}

/**
 * เลือก/ยกเลิกทั้งหมด
 */
function selectAllStudents() {
  const checkboxes = document.querySelectorAll('.student-checkbox');
  const allSelected = Array.from(checkboxes).every(cb => cb.checked);
  
  checkboxes.forEach(cb => {
    cb.checked = !allSelected;
    const studentId = cb.value;
    if (!allSelected) {
      if (!selectedStudents.includes(studentId)) {
        selectedStudents.push(studentId);
      }
    } else {
      selectedStudents = selectedStudents.filter(id => id !== studentId);
    }
  });
  updateSelectedCount();
}

/**
 * เลือกเฉพาะนักศึกษาที่แสดงอยู่
 */
function selectAllVisibleStudents() {
  const visibleCheckboxes = Array.from(document.querySelectorAll('.student-item'))
    .filter(item => item.style.display !== 'none')
    .map(item => item.querySelector('.student-checkbox'));
  
  visibleCheckboxes.forEach(cb => {
    cb.checked = true;
    const studentId = cb.value;
    if (!selectedStudents.includes(studentId)) {
      selectedStudents.push(studentId);
    }
  });
  updateSelectedCount();
  
  Swal.fire({
    icon: 'success',
    title: 'เลือกแล้ว',
    text: `เลือกนักศึกษา ${visibleCheckboxes.length} คน`,
    timer: 1500,
    showConfirmButton: false
  });
}

/**
 * ยกเลิกการเลือกทั้งหมด
 */
function clearAllStudents() {
  const checkboxes = document.querySelectorAll('.student-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = false;
  });
  selectedStudents = [];
  updateSelectedCount();
}

/**
 * อัปเดตจำนวนนักศึกษาที่เลือก
 */
function updateSelectedCount() {
  const countElement = document.getElementById('selectedCount');
  if (countElement) {
    countElement.textContent = `เลือกแล้ว: ${selectedStudents.length} คน`;
  }
}

// ========================================
// Form Submit Handler
// ========================================

// ผูก event กับฟอร์ม
if (document.getElementById('createObservationForm')) {
  document.getElementById('createObservationForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = {
      name: document.getElementById('observationName').value,
      academicYear: document.getElementById('academicYear').value,
      yearLevel: parseInt(document.getElementById('yearLevel').value),
      startDate: document.getElementById('startDate').value,
      endDate: document.getElementById('endDate').value,
      description: document.getElementById('description').value,
      studentIds: selectedStudents
    };

    // Validate
    if (selectedStudents.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาเลือกนักศึกษา',
        text: 'ต้องเลือกนักศึกษาอย่างน้อย 1 คน'
      });
      return;
    }

    // Show loading
    Swal.fire({
      title: 'กำลังสร้าง...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Create observation
    const result = await createObservation(formData);
    
    if (result.success) {
      Swal.fire({
        icon: 'success',
        title: 'สร้างการสังเกตุสำเร็จ',
        text: result.message
      });
      
      closeCreateObservationModal();
      loadObservations(); // Reload list
    } else {
      Swal.fire({
        icon: 'error',
        title: 'ไม่สามารถสร้างได้',
        text: result.message
      });
    }
  });
}

// ========================================
// Student Management Functions
// ========================================

/**
 * จัดการนักศึกษาในการสังเกตุ
 */
async function manageStudents(observationId) {
  // Show loading
  Swal.fire({
    title: 'กำลังโหลด...',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  const result = await loadObservationDetail(observationId);
  Swal.close();
  
  if (!result.success) {
    Swal.fire('ข้อผิดพลาด', result.message, 'error');
    return;
  }
  
  const observation = result.observation;
  
  document.getElementById('managementModalTitle').textContent = `จัดการนักศึกษา - ${observation.name}`;
  
  const content = `
    <div class="students-management">
      <div style="display:flex;gap:12px;margin-bottom:16px;align-items:center;">
        <input type="text" class="form-input" placeholder="ค้นหานักศึกษา..." onkeyup="searchManagedStudents(this.value)" style="flex:1;">
        <button class="btn btn--primary" onclick="openAddStudentModal('${observationId}', '${observation.startDate}')">
          <span>➕</span> เพิ่มนักศึกษา
        </button>
      </div>
      
      <div class="managed-students-list">
        ${observation.students.map(student => {
          const sid = (student.user_id || student.studentId || '');
          return `
          <div class="managed-student-item" data-student-search="${student.name} ${sid}">
            <div style="flex:1;">
              <div style="font-weight:500;color:var(--color-text);">${escapeHtml(student.name)}</div>
              <div style="font-size:0.85rem;color:var(--color-muted);margin:4px 0;">รหัส: ${sid}</div>
              <div style="display:flex;gap:16px;font-size:0.8rem;">
                <span>การประเมิน: ${student.evaluationsCompleted}/9</span>
                ${((student.yearLevel || 0) >= 2) ? `
                <span>แผนการสอน: ${student.lessonPlanSubmitted ? '✅ ส่งแล้ว' : '❌ ยังไม่ส่ง'}</span>
                ` : ''}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <span class="status-badge ${student.status}" style="text-align:center;">
                ${student.status === 'active' ? 'กำลังฝึก' : 'ยุติแล้ว'}
              </span>
              ${student.status === 'active' ? `
                <button class="btn btn--danger btn--sm" onclick="terminateStudent('${observationId}', '${student.id}')">
                  ยุติการฝึก
                </button>
              ` : `
                <button class="btn btn--secondary btn--sm" onclick="reactivateStudent('${observationId}', '${student.id}')">
                  เปิดใหม่
                </button>
              `}
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
  `;

  document.getElementById('studentManagementContent').innerHTML = content;
  document.getElementById('studentManagementModal').style.display = 'flex';
}

/**
 * ปิดโมดัลจัดการนักศึกษา
 */
function closeStudentManagementModal() {
  document.getElementById('studentManagementModal').style.display = 'none';
}

/**
 * ยุติการฝึกของนักศึกษา
 */
async function terminateStudent(observationId, studentDocId) {
  const result = await Swal.fire({
    icon: 'warning',
    title: 'ยืนยันการยุติการฝึก',
    text: 'คุณต้องการยุติการฝึกของนักศึกษาคนนี้หรือไม่?',
    showCancelButton: true,
    confirmButtonText: 'ยุติการฝึก',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#d33'
  });
  
  if (result.isConfirmed) {
    const updateResult = await updateStudentStatus(observationId, studentDocId, { status: 'terminated' });
    
    if (updateResult.success) {
      Swal.fire('สำเร็จ', 'ยุติการฝึกเรียบร้อยแล้ว', 'success');
      manageStudents(observationId); // Refresh
    } else {
      Swal.fire('ข้อผิดพลาด', updateResult.message, 'error');
    }
  }
}

/**
 * เปิดการฝึกใหม่
 */
async function reactivateStudent(observationId, studentDocId) {
  const updateResult = await updateStudentStatus(observationId, studentDocId, { status: 'active' });
  
  if (updateResult.success) {
    Swal.fire('สำเร็จ', 'เปิดการฝึกใหม่เรียบร้อยแล้ว', 'success');
    manageStudents(observationId); // Refresh
  } else {
    Swal.fire('ข้อผิดพลาด', updateResult.message, 'error');
  }
}

/**
 * ค้นหานักศึกษาในโมดัลจัดการ
 */
function searchManagedStudents(query) {
  const items = document.querySelectorAll('.managed-student-item');
  const searchLower = query.toLowerCase();
  
  items.forEach(item => {
    const searchText = item.getAttribute('data-student-search').toLowerCase();
    item.style.display = searchText.includes(searchLower) ? 'flex' : 'none';
  });
}

/**
 * เปิดโมดัลเพิ่มนักศึกษาเข้าการฝึกประสบการณ์วิชาชีพครู
 */
async function openAddStudentModal(observationId, startDate) {
  // ตรวจสอบเงื่อนไขเวลา
  const now = new Date();
  const start = new Date(startDate);
  const daysPassed = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  
  // ตรวจสอบเงื่อนไขเวลา: อนุญาตให้เพิ่มเฉพาะภายใน 10 วัน (วันที่ 0..10)
  // หากเลยวันที่ 10 (daysPassed > 10) จะไม่อนุญาตสำหรับผู้ใช้ทั่วไป แต่ผู้ดูแลระบบ (role === 'admin') ยังคงสามารถเพิ่มได้
  if (daysPassed > 10 && !(window.currentUser && window.currentUser.role === 'admin')) {
    Swal.fire({
      icon: 'error',
      title: 'ไม่สามารถเพิ่มนักศึกษาได้',
      html: `<p>การฝึกประสบการณ์วิชาชีพครูนี้เริ่มต้นมาแล้ว <strong>${daysPassed} วัน</strong></p>
             <p>ระบบอนุญาตให้เพิ่มนักศึกษาได้เฉพาะภายใน <strong>10 วัน</strong> เท่านั้น (หลังวันที่ 10 สามารถเพิ่มได้เฉพาะผู้ดูแลระบบ)</p>`,
      confirmButtonText: 'รับทราบ'
    });
    return;
  }
  
  // โหลดรายชื่อนักศึกษาที่ยังไม่ได้เข้าร่วม
  await loadAvailableStudents(observationId);
}

/**
 * โหลดรายชื่อนักศึกษาที่ยังไม่ได้เข้าร่วมการฝึกประสบการณ์วิชาชีพครู
 */
async function loadAvailableStudents(observationId) {
  Swal.fire({
    title: 'กำลังโหลด...',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  try {
    const response = await fetch(`/api/observations/${observationId}/available-students`);
    const data = await response.json();
    
    if (data.success) {
      Swal.close();
      showAddStudentDialog(observationId, data.students);
    } else {
      Swal.fire('ข้อผิดพลาด', data.message, 'error');
    }
  } catch (error) {
    console.error('Error loading available students:', error);
    Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อนักศึกษาได้', 'error');
  }
}

/**
 * แสดงไดอะล็อกเลือกนักศึกษาที่จะเพิ่ม
 */
function showAddStudentDialog(observationId, students) {
  if (students.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'ไม่มีนักศึกษาที่สามารถเพิ่มได้',
      html: `
        <div style="text-align:left;padding:12px;">
          <p style="margin-bottom:12px;">ไม่พบนักศึกษาที่สามารถเพิ่มได้ เนื่องจาก:</p>
          <ul style="padding-left:20px;color:#6c757d;">
            <li>นักศึกษาในชั้นปีนี้เข้าร่วมการฝึกประสบการณ์วิชาชีพครูนี้แล้วทั้งหมด</li>
            <li style="margin-top:8px;">หรือนักศึกษาที่เหลือยังไม่ได้กรอกข้อมูลส่วนตัว (ชื่อ-นามสกุล)</li>
          </ul>
          <div style="margin-top:16px;padding:12px;background:#fff3cd;border-radius:6px;font-size:0.9rem;">
            💡 <strong>หมายเหตุ:</strong> นักศึกษาต้องกรอกข้อมูลส่วนตัวให้ครบถ้วนก่อนจึงจะสามารถเข้าร่วมการสังเกตได้
          </div>
        </div>
      `,
      confirmButtonText: 'รับทราบ',
      width: '500px'
    });
    return;
  }
  
  // สร้าง checkbox list แบบสวยงาม
  let selectedIds = [];
  
  const studentCheckboxes = students.map((s, index) => {
    const yearLabel = s.yearCategory === '4+' ? 'ปี 4+' : `ปี ${s.yearLevel}`;
    const warningBadge = s.isDifferentYear 
      ? `<span style="display:inline-block;background:#fff3cd;color:#856404;padding:2px 8px;border-radius:4px;font-size:0.75rem;margin-left:8px;">⚠️ ต่างชั้นปี</span>`
      : '';
    
    return `
    <div class="swal-student-item" data-year-category="${s.yearCategory}" style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;" 
         onclick="toggleSwalStudent('${s.id}', this)">
      <input type="checkbox" id="swal-cb-${s.id}" value="${s.id}" 
             style="width:18px;height:18px;cursor:pointer;" 
             onclick="event.stopPropagation();">
      <div style="flex:1;text-align:left;">
        <div style="font-weight:500;color:#2E3094;">
          ${escapeHtml(s.name)}
          ${warningBadge}
        </div>
        <div style="font-size:0.85rem;color:#6c757d;">รหัส: ${s.studentId} | ${yearLabel}</div>
      </div>
    </div>
  `;
  }).join('');
  
  Swal.fire({
    title: '➕ เพิ่มนักศึกษาเข้ารอบสังเกต',
    html: `
      <div style="text-align:left;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-size:0.9rem;color:#6c757d;">
            <span id="swal-total-students">พบ ${students.length} คน</span>
            <span id="swal-selected-count" style="color:#2E3094;font-weight:600;margin-left:8px;">เลือก: 0 คน</span>
          </div>
          <button type="button" class="btn btn--sm" onclick="toggleAllSwalStudents()" 
                  style="padding:4px 12px;font-size:0.85rem;background:#f0f0f0;border:1px solid #ddd;border-radius:6px;cursor:pointer;">
            เลือก/ยกเลิกทั้งหมด
          </button>
        </div>
        
        <div style="max-height:400px;overflow-y:auto;border:1px solid #e0e0e0;border-radius:8px;padding:12px;background:#f9f9f9;">
          <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-bottom:12px;">
            <select id="swal-year-filter" class="form-input" onchange="filterSwalStudents()">
              <option value="">ทุกชั้นปี</option>
              <option value="1">ปี 1</option>
              <option value="2">ปี 2</option>
              <option value="3">ปี 3</option>
              <option value="4">ปี 4</option>
              <option value="4+">ปี 4+</option>
            </select>
            <input type="text" id="swal-search-input" class="form-input" 
                   placeholder="🔍 ค้นหานักศึกษา (ชื่อหรือรหัส)..." 
                   oninput="filterSwalStudents()">
          </div>
          <div id="swal-students-container">
            ${studentCheckboxes}
          </div>
        </div>
        
        <div style="margin-top:12px;padding:12px;background:#e3f2fd;border-radius:8px;font-size:0.85rem;color:#1976d2;">
          💡 <strong>คำแนะนำ:</strong> คลิกที่การ์ดหรือกดช่อง checkbox เพื่อเลือกนักศึกษา
        </div>
      </div>
    `,
    width: '600px',
    showCancelButton: true,
    confirmButtonText: 'เพิ่มนักศึกษา',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#2E3094',
    didOpen: () => {
      // Setup toggle functions
      window.toggleSwalStudent = function(studentId, element) {
        const checkbox = document.getElementById(`swal-cb-${studentId}`);
        checkbox.checked = !checkbox.checked;
        
        if (checkbox.checked) {
          element.style.background = '#e3f2fd';
          element.style.borderColor = '#2E3094';
        } else {
          element.style.background = 'white';
          element.style.borderColor = '#e0e0e0';
        }
        
        updateSwalSelectedCount();
      };
      
      window.toggleAllSwalStudents = function() {
        const allCheckboxes = document.querySelectorAll('#swal-students-container input[type="checkbox"]');
        const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
        
        allCheckboxes.forEach(cb => {
          cb.checked = !allChecked;
          const item = cb.closest('.swal-student-item');
          if (cb.checked) {
            item.style.background = '#e3f2fd';
            item.style.borderColor = '#2E3094';
          } else {
            item.style.background = 'white';
            item.style.borderColor = '#e0e0e0';
          }
        });
        
        updateSwalSelectedCount();
      };
      
      window.updateSwalSelectedCount = function() {
        const checked = document.querySelectorAll('#swal-students-container input[type="checkbox"]:checked');
        document.getElementById('swal-selected-count').textContent = `เลือก: ${checked.length} คน`;
      };
      
      window.filterSwalStudents = function() {
        const items = document.querySelectorAll('.swal-student-item');
        const searchInput = document.getElementById('swal-search-input');
        const yearFilter = document.getElementById('swal-year-filter');
        const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
        const yearValue = yearFilter ? yearFilter.value : '';
        let visibleCount = 0;
        
        items.forEach(item => {
          const text = item.textContent.toLowerCase();
          const yearCategory = item.getAttribute('data-year-category');
          
          const matchesSearch = !searchQuery || text.includes(searchQuery);
          const matchesYear = !yearValue || yearCategory === yearValue;
          
          if (matchesSearch && matchesYear) {
            item.style.display = 'flex';
            visibleCount++;
          } else {
            item.style.display = 'none';
          }
        });
        
        const filterText = (searchQuery || yearValue) 
          ? `พบ ${visibleCount} จาก ${students.length} คน` 
          : `พบ ${students.length} คน`;
        document.getElementById('swal-total-students').textContent = filterText;
      };
      
      // Add checkbox change listeners
      const checkboxes = document.querySelectorAll('#swal-students-container input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.addEventListener('change', function(e) {
          const item = this.closest('.swal-student-item');
          if (this.checked) {
            item.style.background = '#e3f2fd';
            item.style.borderColor = '#2E3094';
          } else {
            item.style.background = 'white';
            item.style.borderColor = '#e0e0e0';
          }
          updateSwalSelectedCount();
        });
      });
    },
    preConfirm: () => {
      const selected = Array.from(document.querySelectorAll('#swal-students-container input[type="checkbox"]:checked'))
        .map(cb => cb.value);
      
      if (selected.length === 0) {
        Swal.showValidationMessage('กรุณาเลือกนักศึกษาอย่างน้อย 1 คน');
        return false;
      }
      
      return selected;
    }
  }).then(async (result) => {
    if (result.isConfirmed) {
      await addStudentsToObservation(observationId, result.value);
    }
  });
}

/**
 * เพิ่มนักศึกษาเข้ารอบสังเกต
 */
async function addStudentsToObservation(observationId, studentIds) {
  Swal.fire({
    title: 'กำลังเพิ่มนักศึกษา...',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  try {
    const response = await fetch(`/api/observations/${observationId}/add-students`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ studentIds })
    });
    
    const data = await response.json();
    
    if (data.success) {
      Swal.fire({
        icon: 'success',
        title: 'สำเร็จ',
        text: `เพิ่มนักศึกษา ${studentIds.length} คนเรียบร้อยแล้ว`,
        confirmButtonText: 'ตกลง'
      }).then(() => {
        manageStudents(observationId); // Refresh
      });
    } else {
      Swal.fire('ข้อผิดพลาด', data.message, 'error');
    }
  } catch (error) {
    console.error('Error adding students:', error);
    Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเพิ่มนักศึกษาได้', 'error');
  }
}

// ========================================
// Action Functions
// ========================================

/**
 * ดูความคืบหน้าการสังเกตการสอน
 */
async function viewProgress(observationId) {
  // แสดง loading
  Swal.fire({
    title: 'กำลังโหลดข้อมูล...',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    // ดึงข้อมูลจาก API
    const response = await fetch(`/api/observations/${observationId}/schools-summary`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'ไม่สามารถโหลดข้อมูลได้');
    }

    Swal.close();

    // แสดง Modal
    displayProgressModal(result);
  } catch (error) {
    console.error('Error loading progress:', error);
    Swal.fire({
      icon: 'error',
      title: 'เกิดข้อผิดพลาด',
      text: error.message || 'ไม่สามารถโหลดข้อมูลความคืบหน้าได้'
    });
  }
}

/**
 * แสดง Progress Modal พร้อมข้อมูล
 */
function displayProgressModal(data) {
  const { observation, schools, totalSchools, totalStudentsInObservation } = data;

  // อัปเดต title
  document.getElementById('progressModalTitle').innerHTML = 
    `📊 ความคืบหน้า: ${escapeHtml(observation.name)}`;

  // สร้าง summary cards
  const summaryHTML = `
    <div class="progress-summary">
      <div class="progress-card">
        <div class="progress-card-label">จำนวนโรงเรียนทั้งหมด</div>
        <div class="progress-card-value">${totalSchools}</div>
        <div class="progress-card-label">แห่ง</div>
      </div>
      <div class="progress-card">
        <div class="progress-card-label">นักศึกษาทั้งหมด</div>
        <div class="progress-card-value">${totalStudentsInObservation}</div>
        <div class="progress-card-label">คน</div>
      </div>
      <div class="progress-card">
        <div class="progress-card-label">ครูพี่เลี้ยงทั้งหมด</div>
        <div class="progress-card-value">${schools.reduce((sum, s) => sum + s.totalMentors, 0)}</div>
        <div class="progress-card-label">คน</div>
      </div>
      <div class="progress-card">
        <div class="progress-card-label">ค่าเฉลี่ยนักศึกษาต่อโรงเรียน</div>
        <div class="progress-card-value">${totalSchools > 0 ? (totalStudentsInObservation / totalSchools).toFixed(1) : 0}</div>
        <div class="progress-card-label">คน/แห่ง</div>
      </div>
    </div>
  `;

  // สร้างตารางโรงเรียน
  let tableHTML = '';
  
  if (schools.length === 0) {
    tableHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏫</div>
        <p>ยังไม่มีข้อมูลโรงเรียนในรอบสังเกตนี้</p>
        <p style="font-size:0.9rem;margin-top:8px;">นักศึกษายังไม่ได้กรอกข้อมูลโรงเรียนที่เข้าสังเกต</p>
      </div>
    `;
  } else {
    tableHTML = `
      <div style="margin-top:24px;">
        <h4 style="margin-bottom:16px;color:var(--color-primary);display:flex;align-items:center;gap:8px;">
          <span>🏫</span>
          รายชื่อโรงเรียน
        </h4>
        <table class="schools-table">
          <thead>
            <tr>
              <th style="width:40px;">ลำดับ</th>
              <th>ชื่อโรงเรียน</th>
              <th>จังหวัด</th>
              <th style="text-align:center;">นักศึกษา</th>
              <th style="text-align:center;">ครูพี่เลี้ยง</th>
              <th style="text-align:center;">ระดับชั้น</th>
              <th style="width:100px;text-align:center;">ดูรายละเอียด</th>
            </tr>
          </thead>
          <tbody>
            ${schools.map((school, index) => `
              <tr>
                <td style="text-align:center;">${index + 1}</td>
                <td>
                  <strong>${escapeHtml(school.name)}</strong>
                  ${school.district ? `<br><small style="color:var(--color-muted);">${escapeHtml(school.district)}</small>` : ''}
                </td>
                <td>${escapeHtml(school.province || '-')}</td>
                <td style="text-align:center;">
                  <span class="badge badge--primary">${school.totalStudents} คน</span>
                </td>
                <td style="text-align:center;">
                  <span class="badge badge--success">${school.totalMentors} คน</span>
                </td>
                <td style="text-align:center;">
                  ${school.gradeLevels && school.gradeLevels.length > 0 
                    ? `<span class="badge badge--warning">${school.gradeLevels.join(', ')}</span>`
                    : '<span style="color:var(--color-muted);">-</span>'}
                </td>
                <td style="text-align:center;">
                  <button class="btn btn--sm btn--primary" onclick="viewSchoolDetail('${school.id}')" 
                          style="padding:6px 12px;font-size:0.85rem;">
                    ดูข้อมูล
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // แสดงเนื้อหาใน Modal
  document.getElementById('progressContent').innerHTML = summaryHTML + tableHTML;

  // เปิด Modal
  document.getElementById('progressModal').style.display = 'flex';

  // เก็บข้อมูลไว้ใช้ในการดูรายละเอียด
  window._currentProgressData = data;
}

/**
 * ปิด Progress Modal
 */
function closeProgressModal() {
  document.getElementById('progressModal').style.display = 'none';
  window._currentProgressData = null;
}

/**
 * ดูรายละเอียดโรงเรียน
 */
function viewSchoolDetail(schoolId) {
  if (!window._currentProgressData) {
    Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูล', 'error');
    return;
  }

  const school = window._currentProgressData.schools.find(s => s.id === schoolId);
  
  if (!school) {
    Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลโรงเรียน', 'error');
    return;
  }

  // อัปเดต title
  document.getElementById('schoolDetailTitle').innerHTML = 
    `🏫 ${escapeHtml(school.name)}`;

  // สร้างเนื้อหารายละเอียด
  const detailHTML = `
    <!-- ข้อมูลทั่วไปของโรงเรียน -->
    <div class="school-detail-section">
      <h4>📋 ข้อมูลทั่วไป</h4>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">ชื่อโรงเรียน</span>
          <span class="detail-value">${escapeHtml(school.name)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">จังหวัด</span>
          <span class="detail-value">${escapeHtml(school.province || '-')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">อำเภอ/เขต</span>
          <span class="detail-value">${escapeHtml(school.district || '-')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">เบอร์โทรศัพท์</span>
          <span class="detail-value">${escapeHtml(school.phone || '-')}</span>
        </div>
        <div class="detail-item" style="grid-column: 1 / -1;">
          <span class="detail-label">ที่อยู่</span>
          <span class="detail-value">${escapeHtml(school.address || '-')}</span>
        </div>
      </div>
    </div>

    <!-- ข้อมูลผู้บริหาร -->
    <div class="school-detail-section">
      <h4>👔 ข้อมูลผู้บริหาร</h4>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">ชื่อผู้อำนวยการ</span>
          <span class="detail-value">${escapeHtml(school.principalName || '-')}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">เบอร์ติดต่อผู้อำนวยการ</span>
          <span class="detail-value">${escapeHtml(school.principalPhone || '-')}</span>
        </div>
      </div>
    </div>

    <!-- สถิติโรงเรียน -->
    <div class="school-detail-section">
      <h4>📊 สถิติโรงเรียน</h4>
      <div class="detail-grid">
        <div class="detail-item">
          <span class="detail-label">จำนวนนักเรียน</span>
          <span class="detail-value">${school.studentCount ? school.studentCount.toLocaleString() : '-'} คน</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">จำนวนห้องเรียน</span>
          <span class="detail-value">${school.classroomCount || '-'} ห้อง</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">จำนวนบุคลากร</span>
          <span class="detail-value">${school.staffCount || '-'} คน</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">ระดับชั้นที่เปิดสอน</span>
          <span class="detail-value">
            ${school.gradeLevels && school.gradeLevels.length > 0 
              ? school.gradeLevels.join(', ') 
              : '-'}
          </span>
        </div>
      </div>
    </div>

    <!-- นักศึกษาที่เข้าสังเกต -->
    <div class="school-detail-section">
      <h4>🎓 นักศึกษาที่เข้าสังเกต (${school.totalStudents} คน)</h4>
      ${school.students && school.students.length > 0 ? `
        <div class="students-list">
          ${school.students.map((student, idx) => `
            <div class="student-item">
              <div class="student-info">
                <span class="student-name">${idx + 1}. ${escapeHtml(student.name)}</span>
                <span class="student-id">รหัสนักศึกษา: ${escapeHtml(student.studentId)} | ชั้นปีที่ ${student.yearLevel || '-'}</span>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state" style="padding:20px;">
          <p style="color:var(--color-muted);">ยังไม่มีข้อมูลนักศึกษา</p>
        </div>
      `}
    </div>

    <!-- ครูพี่เลี้ยง -->
    <div class="school-detail-section">
      <h4>👨‍🏫 ครูพี่เลี้ยง (${school.totalMentors} คน)</h4>
      ${school.mentors && school.mentors.length > 0 ? `
        <div class="mentors-list">
          ${school.mentors.map((mentor, idx) => `
            <div class="mentor-item">
              <div class="mentor-info">
                <span class="mentor-name">${idx + 1}. ${escapeHtml(mentor.name)}</span>
                <span class="mentor-subject">
                  วิชา: ${escapeHtml(mentor.subject)}
                  ${mentor.phone ? ` | โทร: ${escapeHtml(mentor.phone)}` : ''}
                  ${mentor.email ? ` | อีเมล: ${escapeHtml(mentor.email)}` : ''}
                </span>
              </div>
              ${mentor.studentId ? `
                <span class="badge badge--primary">รหัส: ${escapeHtml(mentor.studentId)}</span>
              ` : ''}
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state" style="padding:20px;">
          <p style="color:var(--color-muted);">ยังไม่มีข้อมูลครูพี่เลี้ยง</p>
        </div>
      `}
    </div>
  `;

  // แสดงเนื้อหาใน Modal
  document.getElementById('schoolDetailContent').innerHTML = detailHTML;

  // เปิด School Detail Modal
  document.getElementById('schoolDetailModal').style.display = 'flex';
}

/**
 * ปิด School Detail Modal
 */
function closeSchoolDetailModal() {
  document.getElementById('schoolDetailModal').style.display = 'none';
}

/**
 * ส่งออกข้อมูล - เปิด Export Modal
 */
let currentExportObservationId = null;

function exportData(observationId) {
  currentExportObservationId = observationId;
  document.getElementById('exportModal').style.display = 'flex';
}

/**
 * ปิด Export Modal
 */
function closeExportModal() {
  document.getElementById('exportModal').style.display = 'none';
  currentExportObservationId = null;
}

/**
 * แสดงข้อความ Coming Soon
 */
function showComingSoon() {
  Swal.fire({
    icon: 'info',
    title: 'เร็วๆ นี้',
    text: 'ฟีเจอร์นี้กำลังอยู่ระหว่างการพัฒนา',
    confirmButtonText: 'รับทราบ'
  });
}

/**
 * ส่งออกรายชื่อนักศึกษาเป็น PDF
 */
async function exportStudentList() {
  if (!currentExportObservationId) {
    Swal.fire({
      icon: 'error',
      title: 'เกิดข้อผิดพลาด',
      text: 'ไม่พบข้อมูลการสังเกตุ'
    });
    return;
  }

  // แสดง loading
  Swal.fire({
    title: 'กำลังสร้างเอกสาร...',
    text: 'กรุณารอสักครู่',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    // ดึงข้อมูล observation และนักศึกษา
    const result = await loadObservationDetail(currentExportObservationId);
    
    if (!result.success) {
      throw new Error(result.message || 'ไม่สามารถดึงข้อมูลได้');
    }

    const observation = result.observation;
    
    // สร้าง PDF
    await generateStudentListPDF(observation);
    
    Swal.close();
    closeExportModal();
    
    Swal.fire({
      icon: 'success',
      title: 'สำเร็จ',
      text: 'ส่งออกเอกสารเรียบร้อยแล้ว',
      timer: 2000,
      showConfirmButton: false
    });
  } catch (error) {
    console.error('Error exporting student list:', error);
    Swal.fire({
      icon: 'error',
      title: 'เกิดข้อผิดพลาด',
      text: error.message || 'ไม่สามารถส่งออกเอกสารได้'
    });
  }
}

/**
 * สร้างเอกสาร PDF รายชื่อนักศึกษา (แบบเอกสารทางการไทย)
 */
async function generateStudentListPDF(observation) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    putOnlyUsedFonts: true,
    compress: true
  });

  // Load Thai font before generating content
  const fontLoaded = await ensureThaiFont(doc);
  
  // Set font based on loading success
  if (fontLoaded) {
    doc.setFont('THSarabunNew', 'normal');
    console.log('Using Thai font: THSarabunNew');
  } else {
    doc.setFont('helvetica', 'normal');
    console.log('Using fallback font: helvetica');
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 25; // เพิ่มระยะขอบให้มาตรฐาน
  let yPos = margin + 10;

  // === ส่วนหัวเอกสารแบบทางการ ===
  
  // หัวเรื่องหลัก - ใช้ฟอนต์เดียวกันทั้งหมด
  doc.setFontSize(fontLoaded ? 18 : 16);
  doc.setTextColor(0, 0, 0);
  doc.setFont(fontLoaded ? 'THSarabunNew' : 'helvetica', 'normal');
  doc.text('สาขาวิชาคอมพิวเตอร์ศึกษา', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(fontLoaded ? 16 : 14);
  doc.text('มหาวิทยาลัยราชภัฏนครศรีธรรมราช', pageWidth / 2, yPos, { align: 'center' });
  yPos += 12;
  
  // เส้นแบ่งแบบเรียบ
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(1);
  doc.line(margin + 40, yPos, pageWidth - margin - 40, yPos);
  yPos += 15;


  // === หัวข้อเอกสาร ===
  doc.setFontSize(fontLoaded ? 18 : 16);
  doc.setFont(fontLoaded ? 'THSarabunNew' : 'helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('รายชื่อนักศึกษาในรอบการสังเกตการสอน', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // === รายละเอียดรอบการสังเกต ===
  doc.setFontSize(fontLoaded ? 14 : 11);
  doc.setFont(fontLoaded ? 'THSarabunNew' : 'helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  const obsDetails = [
    `ชื่อรอบ: ${observation.name}`,
    `ปีการศึกษา: ${observation.academicYear}`,
    `ชั้นปี: ปีที่ ${observation.yearLevel}`,
    `ระยะเวลา: ${formatThaiDate(observation.startDate)} - ${formatThaiDate(observation.endDate)}`,
    `จำนวนนักศึกษา: ${observation.totalStudents} คน`,
    `สถานะ: ${getStatusText(observation.status)}`
  ];

  // กรอบข้อมูลรอบแบบเรียบ
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(margin, yPos - 3, pageWidth - 2 * margin, (obsDetails.length * 6) + 8);
  
  yPos += 3;
  obsDetails.forEach(detail => {
    doc.text(detail, margin + 5, yPos);
    yPos += 6;
  });

  yPos += 10;

  // วันที่ส่งออก
  doc.setFontSize(fontLoaded ? 12 : 10);
  doc.setFont(fontLoaded ? 'THSarabunNew' : 'helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const today = new Date();
  const exportDate = `วันที่ส่งออกเอกสาร: ${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear() + 543}`;
  doc.text(exportDate, pageWidth - margin, yPos, { align: 'right' });
  yPos += 15;

  // === ตารางรายชื่อนักศึกษา ===
  doc.setTextColor(0, 0, 0);
  
  // ตรวจสอบว่าควรแสดงคอลัมน์แผนการสอนหรือไม่ (เฉพาะนักศึกษาปี 2 ขึ้นไป)
  const showLessonPlanColumn = observation.students && observation.students.some(s => (s.yearLevel || 0) >= 2);

  const tableData = observation.students.map((student, index) => {
    const base = [
      (index + 1).toString(),
      student.studentId || '-',
      student.name || '-',
      getStatusText(student.status),
      `${student.evaluationsCompleted || 0}/9`
    ];
    if (showLessonPlanColumn) {
      base.push(student.lessonPlanSubmitted ? 'ส่งแล้ว' : 'ยังไม่ส่ง');
    }
    return base;
  });

  const headRow = ['ลำดับ', 'รหัสนักศึกษา', 'ชื่อ-นามสกุล', 'สถานะ', 'การประเมิน'];
  if (showLessonPlanColumn) headRow.push('แผนการสอน');

  doc.autoTable({
    startY: yPos,
    head: [headRow],
    body: tableData,
    theme: 'grid',
    styles: {
      font: fontLoaded ? 'THSarabunNew' : 'helvetica',
      fontSize: fontLoaded ? 12 : 9,
      cellPadding: 4,
      halign: 'center',
      valign: 'middle',
      lineColor: [0, 0, 0],
      lineWidth: 0.3
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      font: fontLoaded ? 'THSarabunNew' : 'helvetica',
      fontStyle: 'normal',
      halign: 'center',
      fontSize: fontLoaded ? 13 : 10,
      lineColor: [0, 0, 0],
      lineWidth: 0.5
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 28, halign: 'center' },
      2: { cellWidth: 45, halign: 'left', cellPadding: { left: 6 } },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' }
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248]
    },
    margin: { left: margin + 15, right: margin + 15 },
    tableWidth: 'auto'
  });

  // === ส่วนท้าย ===
  const finalY = doc.lastAutoTable.finalY + 15;
  
  if (finalY < pageHeight - 40) {
    yPos = finalY;
  } else {
    doc.addPage();
    yPos = margin;
  }

  // สรุปข้อมูล
  doc.setFontSize(fontLoaded ? 15 : 13);
  doc.setFont(fontLoaded ? 'THSarabunNew' : 'helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('สรุปข้อมูล', margin, yPos);
  yPos += 8;
  
  doc.setFontSize(fontLoaded ? 13 : 11);
  doc.setFont(fontLoaded ? 'THSarabunNew' : 'helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  const completionPercent = observation.totalStudents > 0 
    ? Math.round((observation.completedEvaluations / observation.totalStudents) * 100) 
    : 0;
  
  const summary = [
    `• นักศึกษาทั้งหมด: ${observation.totalStudents} คน`,
    `• ประเมินครบแล้ว: ${observation.completedEvaluations} คน (${completionPercent}%)`,
    `• ส่งแผนการสอนแล้ว: ${observation.submittedLessonPlans} คน`,
    `• ยังไม่ประเมิน: ${observation.totalStudents - observation.completedEvaluations} คน`
  ];

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(margin, yPos - 3, pageWidth - 2 * margin, (summary.length * 6) + 8);
  
  yPos += 2;
  summary.forEach(line => {
    doc.text(line, margin + 5, yPos);
    yPos += 6;
  });

  yPos += 10;

  // ลายเซ็น
  doc.setFontSize(fontLoaded ? 13 : 11);
  doc.setFont(fontLoaded ? 'THSarabunNew' : 'helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  const signatureY = pageHeight - 60;
  
  // กรอบลายเซ็น
  const sigWidth = 80;
  const sig1X = pageWidth / 2 - sigWidth - 20;
  const sig2X = pageWidth / 2 + 20;
  
  doc.text('ผู้จัดทำเอกสาร', sig1X + sigWidth / 2, signatureY, { align: 'center' });
  doc.text('ผู้ตรวจสอบ', sig2X + sigWidth / 2, signatureY, { align: 'center' });
  
  // เส้นลายเซ็น
  doc.setLineWidth(0.5);
  doc.setDrawColor(0, 0, 0);
  doc.line(sig1X + 10, signatureY + 20, sig1X + sigWidth - 10, signatureY + 20);
  doc.line(sig2X + 10, signatureY + 20, sig2X + sigWidth - 10, signatureY + 20);
  
  doc.setFontSize(fontLoaded ? 11 : 9);
  doc.text('( ......................................... )', sig1X + sigWidth / 2, signatureY + 25, { align: 'center' });
  doc.text('( ......................................... )', sig2X + sigWidth / 2, signatureY + 25, { align: 'center' });
  
  doc.text('วันที่ ........ / ........ / ........', sig1X + sigWidth / 2, signatureY + 32, { align: 'center' });
  doc.text('วันที่ ........ / ........ / ........', sig2X + sigWidth / 2, signatureY + 32, { align: 'center' });

  // Footer และเลขหน้า
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // เส้นแบ่งท้ายหน้า
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.line(margin + 20, pageHeight - 20, pageWidth - margin - 20, pageHeight - 20);
    
    // เลขหน้า
    doc.setFontSize(fontLoaded ? 11 : 9);
    doc.setFont(fontLoaded ? 'THSarabunNew' : 'helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(
      `หน้า ${i} จาก ${pageCount}`,
      pageWidth / 2,
      pageHeight - 12,
      { align: 'center' }
    );
    
    // ข้อความท้ายหน้า
    doc.setFontSize(fontLoaded ? 10 : 8);
    doc.text(
      'สาขาวิชาคอมพิวเตอร์ศึกษา มหาวิทยาลัยราชภัฏนครศรีธรรมราช',
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  // บันทึกไฟล์
  const fileDate = new Date();
  const dateStr = `${fileDate.getDate()}-${fileDate.getMonth() + 1}-${fileDate.getFullYear() + 543}`;
  const fileName = `รายชื่อนักศึกษา_${observation.name.replace(/[^ก-๙a-zA-Z0-9]/g, '_')}_${dateStr}.pdf`;
  doc.save(fileName);
}

/**
 * ยุติการสังเกตุ
 */
async function terminateObservation(observationId) {
  const result = await Swal.fire({
    icon: 'warning',
    title: 'ยืนยันการยุติการสังเกตุ',
    text: 'คุณต้องการยุติการสังเกตุทั้งหมดหรือไม่?',
    showCancelButton: true,
    confirmButtonText: 'ยุติการสังเกตุ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#d33'
  });
  
  if (result.isConfirmed) {
    const updateResult = await updateObservationStatus(observationId, 'cancelled');
    
    if (updateResult.success) {
      Swal.fire('สำเร็จ', 'ยุติการสังเกตุเรียบร้อยแล้ว', 'success');
      loadObservations(); // Reload
    } else {
      Swal.fire('ข้อผิดพลาด', updateResult.message, 'error');
    }
  }
}

// ========================================
// Helper Functions
// ========================================

/**
 * แปลงวันที่เป็นรูปแบบไทย
 */
function formatThaiDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00'); // ป้องกัน timezone issue
  const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
}

/**
 * แปลงสถานะเป็นข้อความไทย
 */
function getStatusText(status) {
  const statusMap = {
    active: 'กำลังดำเนินการ',
    completed: 'เสร็จสิ้น',
    cancelled: 'ยกเลิก'
  };
  return statusMap[status] || status;
}

/**
 * Escape HTML เพื่อความปลอดภัย
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ========================================
// Modal Click Outside to Close
// ========================================

if (document.getElementById('createObservationModal')) {
  document.getElementById('createObservationModal').addEventListener('click', function(e) {
    if (e.target === this) {
      closeCreateObservationModal();
    }
  });
}

if (document.getElementById('studentManagementModal')) {
  document.getElementById('studentManagementModal').addEventListener('click', function(e) {
    if (e.target === this) {
      closeStudentManagementModal();
    }
  });
}

// Progress Modal - ห้ามปิดเมื่อคลิกนอก modal (ต้องกดปุ่ม Close เท่านั้น)
if (document.getElementById('progressModal')) {
  document.getElementById('progressModal').addEventListener('click', function(e) {
    // ไม่ทำอะไร - บังคับให้ต้องกดปุ่ม Close
  });
}

// School Detail Modal - ห้ามปิดเมื่อคลิกนอก modal (ต้องกดปุ่ม ย้อนกลับ เท่านั้น)
if (document.getElementById('schoolDetailModal')) {
  document.getElementById('schoolDetailModal').addEventListener('click', function(e) {
    // ไม่ทำอะไร - บังคับให้ต้องกดปุ่ม ย้อนกลับ
  });
}
