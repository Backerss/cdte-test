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
    console.log('🔍 Fetching observations from:', url);
    
    const response = await fetch(url);
    console.log('📡 Response status:', response.status);
    
    const data = await response.json();
    console.log('📦 Response data:', data);
    
    if (data.success) {
      currentObservations = data.observations;
      console.log('✅ Loaded observations:', currentObservations.length);
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
    if (student.studentId && student.studentId.length >= 2) {
      // เอา 2 หลักแรกของรหัสนักศึกษา
      const prefix = student.studentId.substring(0, 2);
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
    option.textContent = `${prefix}xxxxx (${allStudents.filter(s => s.studentId.startsWith(prefix)).length} คน)`;
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
    const student = allStudents.find(s => s.studentId === studentId);
    
    if (!student) {
      item.style.display = 'none';
      return;
    }
    
    let shouldShow = true;
    
    // Filter by year
    if (yearFilter && student.yearLevel !== parseInt(yearFilter)) {
      shouldShow = false;
    }
    
    // Filter by prefix
    if (prefixFilter && !student.studentId.startsWith(prefixFilter)) {
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
  
  console.log('🎨 Rendering observations. Count:', currentObservations?.length || 0);
  
  if (!currentObservations || currentObservations.length === 0) {
    console.log('⚠️ No observations to display - showing empty state');
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

  console.log('✨ Rendering', currentObservations.length, 'observation cards');
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
      <input type="checkbox" class="student-checkbox" value="${student.studentId}" 
             onchange="toggleStudentSelection('${student.studentId}')"
             ${selectedStudents.includes(student.studentId) ? 'checked' : ''}>
      <div class="student-info">
        <div class="student-name">${escapeHtml(student.name)}</div>
        <div class="student-id">รหัส: ${student.studentId} | ปี ${student.yearLevel}</div>
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
 * คำนวณวันสิ้นสุด (เพิ่ม 15 วัน)
 */
function calculateEndDate() {
  const startDate = document.getElementById('startDate').value;
  if (startDate) {
    const start = new Date(startDate + 'T00:00:00'); // ป้องกัน timezone issue
    const end = new Date(start.getTime() + (14 * 24 * 60 * 60 * 1000)); // 15 วัน (14*24h)
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
        ${observation.students.map(student => `
          <div class="managed-student-item" data-student-search="${student.name} ${student.studentId}">
            <div style="flex:1;">
              <div style="font-weight:500;color:var(--color-text);">${escapeHtml(student.name)}</div>
              <div style="font-size:0.85rem;color:var(--color-muted);margin:4px 0;">รหัส: ${student.studentId}</div>
              <div style="display:flex;gap:16px;font-size:0.8rem;">
                <span>การประเมิน: ${student.evaluationsCompleted}/9</span>
                <span>แผนการสอน: ${student.lessonPlanSubmitted ? '✅ ส่งแล้ว' : '❌ ยังไม่ส่ง'}</span>
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
        `).join('')}
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
 * เปิดโมดัลเพิ่มนักศึกษาเข้างวดสังเกต
 */
async function openAddStudentModal(observationId, startDate) {
  // ตรวจสอบเงื่อนไขเวลา
  const now = new Date();
  const start = new Date(startDate);
  const daysPassed = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  
  // ตรวจสอบเงื่อนไขเวลา
  if (daysPassed > 5) {
    Swal.fire({
      icon: 'error',
      title: 'ไม่สามารถเพิ่มนักศึกษาได้',
      html: `<p>การสังเกตนี้เริ่มต้นมาแล้ว <strong>${daysPassed} วัน</strong></p>
             <p>ระบบอนุญาตให้เพิ่มนักศึกษาได้เฉพาะภายใน <strong>5 วัน</strong> เท่านั้น</p>`,
      confirmButtonText: 'รับทราบ'
    });
    return;
  }
  
  // โหลดรายชื่อนักศึกษาที่ยังไม่ได้เข้าร่วม
  await loadAvailableStudents(observationId);
}

/**
 * โหลดรายชื่อนักศึกษาที่ยังไม่ได้เข้าร่วมการสังเกต
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
            <li>นักศึกษาในชั้นปีนี้เข้าร่วมการสังเกตนี้แล้วทั้งหมด</li>
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
    title: '➕ เพิ่มนักศึกษาเข้างวดสังเกต',
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
 * เพิ่มนักศึกษาเข้างวดสังเกต
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
 * ดูความคืบหน้า (Coming Soon)
 */
function viewProgress(observationId) {
  Swal.fire('Coming Soon', 'ฟีเจอร์นี้กำลังพัฒนา', 'info');
}

/**
 * ส่งออกข้อมูล (Coming Soon)
 */
function exportData(observationId) {
  Swal.fire('Coming Soon', 'ฟีเจอร์ส่งออกข้อมูลกำลังพัฒนา', 'info');
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
