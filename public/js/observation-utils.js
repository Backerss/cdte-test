/**
 * observation-utils.js
 * Utility functions สำหรับจัดการ observations (งวดฝึกประสบการณ์)
 * - ดึงรายการ observations จาก API
 * - Populate dropdown selector
 * - แสดงสถานะและข้อมูล
 */

// Global state สำหรับ observations
let observationsData = {
  all: [],
  active: null,
  completed: [],
  loading: false
};

/**
 * โหลดรายการ observations จาก API
 * @returns {Promise<Object>} ข้อมูล observations ทั้งหมด
 */
async function loadObservations() {
  try {
    observationsData.loading = true;

    const response = await fetch('/api/student/observations');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'ไม่สามารถโหลดข้อมูลงวดฝึกได้');
    }

    observationsData = {
      all: result.observations || [],
      active: result.activeObservation || null,
      completed: result.completedObservations || [],
      loading: false
    };

    

    return observationsData;
  } catch (error) {
    console.error('Error loading observations:', error);
    observationsData.loading = false;
    throw error;
  }
}

/**
 * Populate dropdown selector ด้วยรายการ observations
 * @param {string} selectId - ID ของ select element
 * @param {string} selectedObsId - ID ของ observation ที่ต้องการ select (optional)
 * @param {Object} options - ตัวเลือกเพิ่มเติม
 */
async function populateObservationSelector(selectId, selectedObsId = null, options = {}) {
  const {
    includeEmpty = true,
    emptyText = 'เลือกการฝึกประสบการณ์วิชาชีพครู',
    showActiveFirst = true,
    onlyActive = false
  } = options;

  const selector = document.getElementById(selectId);
  if (!selector) {
    console.warn(`Selector element not found: #${selectId}`);
    return;
  }

  try {
    // โหลดข้อมูลถ้ายังไม่มี
    if (observationsData.all.length === 0 && !observationsData.loading) {
      await loadObservations();
    }

    // เคลียร์ options เดิม
    selector.innerHTML = '';

    // ถ้าไม่มีข้อมูล
    if (observationsData.all.length === 0) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = 'ยังไม่มีงวดการฝึกประสบการณ์';
      emptyOption.disabled = true;
      emptyOption.selected = true;
      selector.appendChild(emptyOption);
      return;
    }

    // เพิ่ม empty option
    if (includeEmpty) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = emptyText;
      emptyOption.disabled = true;
      selector.appendChild(emptyOption);
    }

    // กรอง observations ตาม options
    let obsToShow = onlyActive && observationsData.active
      ? [observationsData.active]
      : observationsData.all;

    // เรียงลำดับ: active ก่อน (ถ้าต้องการ)
    if (showActiveFirst && observationsData.active) {
      obsToShow = [
        observationsData.active,
        ...observationsData.all.filter(o => o.id !== observationsData.active.id)
      ];
    }

    // สร้าง options
    obsToShow.forEach(obs => {
      const option = document.createElement('option');
      option.value = obs.id;
      
      // สร้างข้อความแสดง
      let displayText = `${obs.name} (ปี ${obs.yearLevel})`;
      
      // เพิ่ม badge สถานะ
      if (obs.status === 'active' && obs.studentStatus === 'active') {
        displayText += ' - ปัจจุบัน ✓';
      } else if (obs.status === 'completed' || obs.studentStatus === 'completed') {
        displayText += ' - เสร็จสิ้น';
      }

      option.textContent = displayText;

      // เลือก option ที่ระบุ หรือ active เป็นค่าเริ่มต้น
      if (selectedObsId && obs.id === selectedObsId) {
        option.selected = true;
      } else if (!selectedObsId && obs.status === 'active' && obs.studentStatus === 'active') {
        option.selected = true;
      }

      selector.appendChild(option);
    });

    

  } catch (error) {
    console.error(`Error populating selector #${selectId}:`, error);
    
    // แสดง error option
    selector.innerHTML = '';
    const errorOption = document.createElement('option');
    errorOption.value = '';
    errorOption.textContent = 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
    errorOption.disabled = true;
    errorOption.selected = true;
    selector.appendChild(errorOption);
  }
}

/**
 * ดึงข้อมูล observation ตาม ID
 * @param {string} observationId - ID ของ observation
 * @returns {Object|null} ข้อมูล observation หรือ null ถ้าไม่พบ
 */
function getObservationById(observationId) {
  return observationsData.all.find(obs => obs.id === observationId) || null;
}

/**
 * ตรวจสอบว่ามี active observation หรือไม่
 * @returns {boolean}
 */
function hasActiveObservation() {
  return !!observationsData.active;
}

/**
 * ดึง active observation
 * @returns {Object|null}
 */
function getActiveObservation() {
  return observationsData.active;
}

/**
 * Format date เป็นภาษาไทย
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
function formatThaiDateShort(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 
                        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${date.getDate()} ${thaiMonths[date.getMonth()]} ${date.getFullYear() + 543}`;
  } catch (e) {
    return dateStr;
  }
}

/**
 * แสดงข้อมูล observation ในรูปแบบ summary
 * @param {Object} obs - ข้อมูล observation
 * @returns {string} HTML string
 */
function renderObservationSummary(obs) {
  if (!obs) return '<p style="color:var(--color-muted)">ไม่มีข้อมูล</p>';

  const statusBadge = obs.status === 'active' 
    ? '<span style="background:#28a745;color:white;padding:4px 12px;border-radius:12px;font-size:0.85rem">กำลังดำเนินการ</span>'
    : '<span style="background:#6c757d;color:white;padding:4px 12px;border-radius:12px;font-size:0.85rem">เสร็จสิ้น</span>';

  return `
    <div style="padding:16px;background:var(--color-bg);border-radius:8px;border:1px solid var(--color-border)">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
        <h4 style="margin:0;color:var(--color-primary)">${obs.name}</h4>
        ${statusBadge}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;font-size:0.9rem;color:var(--color-text)">
        <div>
          <strong>ปีการศึกษา:</strong> ${obs.academicYear || '-'}
        </div>
        <div>
          <strong>ชั้นปี:</strong> ปีที่ ${obs.yearLevel || '-'}
        </div>
        <div>
          <strong>ช่วงเวลา:</strong><br>
          ${formatThaiDateShort(obs.startDate)} - ${formatThaiDateShort(obs.endDate)}
        </div>
        <div>
          <strong>ความคืบหน้า:</strong><br>
          ประเมินแล้ว ${obs.evaluationsCompleted || 0}/9 ครั้ง
        </div>
      </div>
    </div>
  `;
}

/**
 * Export functions สำหรับใช้งานในหน้าอื่น
 */
window.ObservationUtils = {
  loadObservations,
  populateObservationSelector,
  getObservationById,
  hasActiveObservation,
  getActiveObservation,
  formatThaiDateShort,
  renderObservationSummary,
  // Expose data
  get data() {
    return observationsData;
  }
};

 
