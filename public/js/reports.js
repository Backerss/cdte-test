/**
 * reports.js
 * Frontend JavaScript สำหรับหน้า Reports
 * ดึงข้อมูลจาก API และแสดงผลในรูปแบบกราฟและตาราง
 */

// Global variables
let reportsData = null;
let filteredStudents = [];
let allCharts = {};

// Table pagination
const tablePageSize = 10;
let currentTablePage = 1;

// ========================================
// Helpers
// ========================================

function computeStudentAverage(student) {
  const values = Object.values(student.evaluationData || {}).filter(v => v > 0);
  if (!values.length) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function getRatingText(score) {
  const ratings = {
    1: 'ปรับปรุง',
    2: 'พอใช้',
    3: 'ปานกลาง',
    4: 'ดี',
    5: 'มากที่สุด'
  };
  return ratings[score] || '-';
}

function getQuestionText(qName) {
  const questions = {
    q1: 'ครูมีการให้ข้อมูลแก่นักเรียนสม่ำเสมอตลอดการจัดการเรียนรู้',
    q2: 'ครูมีการถามคำถามแก่นักเรียนสม่ำเสมอตลอดการจัดการเรียนรู้',
    q3: 'ครูมีการให้คำแนะนำแก่นักเรียนสม่ำเสมอตลอดการจัดการเรียนรู้',
    q4: 'ครูมีการว่ากล่าวตักเตือนนักเรียนสม่ำเสมอตลอดการจัดการเรียนรู้',
    q5: 'ครูมีการแสดงท่าทาง การเคลื่อนไหว ความเงียบ',
    q6: 'ครูมีการยิ้ม การหัวเราะ',
    q7: 'ครูมีการมอง',
    q8: 'ครูมีการเดิน',
    q9: 'ครูมีการเขียนกระดาน/ เขียนบอร์ด/ เขียนบนหน้าจอ',
    q10: 'นักเรียนเพ่งมองในสิ่งที่ครูกำลังดำเนินการสอน',
    q11: 'นักเรียนทำงานตามที่ครูมอบหมายในชั้นเรียน',
    q12: 'นักเรียนสนทนากันในชั้นเรียน',
    q13: 'นักเรียนไม่เพ่งมองสิ่งที่ครูกำลังดำเนินการสอน',
    q14: 'นักเรียนไม่ทำงานตามที่ครูมอบหมายในชั้นเรียน',
    q15: 'นักเรียนพูดคุยกันในระหว่างครูสอน',
    q16: 'นักเรียนตั้งใจทำงาน',
    q17: 'นักเรียนไม่ตั้งใจทำงานและไม่รบกวนผู้อื่น',
    q18: 'นักเรียนไม่ตั้งใจทำงานแต่รบกวนผู้อื่น',
    q19: 'พื้นห้องเรียนมีรอยเปื้อนและสกปรก',
    q20: 'เครื่องคอมพิวเตอร์มีอุปกรณ์ต่อพ่วงเพียงพอต่อการเรียน เช่น แป้นพิมพ์ เมาส์ เป็นต้น และใช้งานได้',
    q21: 'ฝาผนังมีรอยเปื้อนและสะอาดเป็นบางส่วน',
    q22: 'มีเครื่องคอมพิวเตอร์ใช้งานอย่างเพียงพอ 1 เครื่องต่อนักเรียน 1 คน',
    q23: 'เครื่องคอมพิวเตอร์สามารถใช้งานได้ทุกเครื่อง',
    q24: 'ในห้องเรียนคอมพิวเตอร์มีอุปกรณ์ในการสอน เช่น ทีวี เครื่องและจอฉาย เครื่องขยายเสียง เป็นต้น',
    q25: 'ห้องเรียนคอมพิวเตอร์มีแสงสว่างมากจนเกินไป',
    q26: 'ห้องเรียนคอมพิวเตอร์มีแสงสว่างไม่เพียงพอ'
  };
  return questions[qName] || qName;
}

function getQuestionSectionTitle(qName) {
  const num = parseInt(String(qName).replace(/^q/, ''), 10);
  if (num >= 1 && num <= 4) return 'ครู - พฤติกรรมด้านภาษา (Verbal Behaviors)';
  if (num >= 5 && num <= 9) return 'ครู - พฤติกรรมที่ไม่ใช่ภาษา (Non-Verbal Behavior)';
  if (num >= 10 && num <= 15) return 'นักเรียน - พฤติกรรมทางวิชาการของผู้เรียน';
  if (num >= 16 && num <= 18) return 'นักเรียน - พฤติกรรมการทำงานของผู้เรียน';
  if (num >= 19 && num <= 26) return 'สิ่งแวดล้อมทางการเรียนรู้ - สภาพทางกายภาพของห้องเรียน';
  return '';
}

function formatThaiDate(isoOrNull) {
  if (!isoOrNull) return '-';
  const d = new Date(isoOrNull);
  if (Number.isNaN(d.getTime())) return String(isoOrNull);
  return d.toLocaleString('th-TH');
}

function getAttemptDate(attempt) {
  return attempt?.submittedAt || attempt?.date || null;
}

function computeGrade(avg) {
  if (avg >= 4.5) return { text: 'ดีมาก', key: 'excellent' };
  if (avg >= 4.0) return { text: 'ดี', key: 'verygood' };
  if (avg >= 3.5) return { text: 'ปานกลาง', key: 'good' };
  if (avg >= 3.0) return { text: 'พอใช้', key: 'fair' };
  return { text: 'ปรับปรุง', key: 'poor' };
}

function getCurrentFilterState() {
  const observationSelect = document.getElementById('filterObservation');
  const yearSelect = document.getElementById('filterYear');
  const attemptSelect = document.getElementById('filterAttempt');
  const scoreSelect = document.getElementById('filterScore');
  const evalCountSelect = document.getElementById('filterEvalCount');
  const sortSelect = document.getElementById('sortBy');
  const searchInput = document.getElementById('searchStudent');

  const observationText = observationSelect?.selectedOptions?.[0]?.textContent || '';
  const yearText = yearSelect?.selectedOptions?.[0]?.textContent || '';

  return {
    observationId: observationSelect?.value || '',
    observationText,
    yearLevel: yearSelect?.value || '',
    yearText,
    evaluationNum: attemptSelect?.value || '',
    evaluationNumText: attemptSelect?.selectedOptions?.[0]?.textContent || '',
    searchText: searchInput?.value || '',
    scoreFilter: scoreSelect?.value || '',
    scoreFilterText: scoreSelect?.selectedOptions?.[0]?.textContent || '',
    evalCountFilter: evalCountSelect?.value || '',
    evalCountFilterText: evalCountSelect?.selectedOptions?.[0]?.textContent || '',
    sortBy: sortSelect?.value || '',
    sortByText: sortSelect?.selectedOptions?.[0]?.textContent || ''
  };
}

function getExportStudents() {
  if (!reportsData) return [];
  return Array.isArray(filteredStudents) ? filteredStudents : [];
}

// ========================================
// Thai Font for jsPDF (cache base64, register per-doc)
// ========================================

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function loadAndRegisterFont(doc, fontUrl, vfsName, fontName, fontStyle = 'normal') {
  try {
    const resp = await fetch(fontUrl);
    if (!resp.ok) throw new Error(`Failed to fetch font: ${resp.status} ${resp.statusText}`);
    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    const buf = await resp.arrayBuffer();

    // Basic validation: expect TTF/OTF signature (avoid caching HTML/error pages)
    const bytes = new Uint8Array(buf);
    const sig0 = bytes[0] || 0;
    const sig1 = bytes[1] || 0;
    const sig2 = bytes[2] || 0;
    const sig3 = bytes[3] || 0;
    const isTtf = (sig0 === 0x00 && sig1 === 0x01 && sig2 === 0x00 && sig3 === 0x00);
    const isOtf = (sig0 === 0x4F && sig1 === 0x54 && sig2 === 0x54 && sig3 === 0x4F); // 'OTTO'
    if (!isTtf && !isOtf) {
      throw new Error(`Invalid font signature (content-type: ${contentType || 'unknown'})`);
    }

    const b64 = arrayBufferToBase64(buf);
    // Cache base64 for subsequent exports (each jsPDF instance needs registration)
    window._reportsThaiFontCache = window._reportsThaiFontCache || {};
    window._reportsThaiFontCache.b64 = b64;
    window._reportsThaiFontCache.vfsName = vfsName;
    window._reportsThaiFontCache.fontName = fontName;
    window._reportsThaiFontCache.fontStyle = fontStyle;

    doc.addFileToVFS(vfsName, b64);
    doc.addFont(vfsName, fontName, fontStyle);
    return true;
  } catch (err) {
    console.warn(`Font loading error for ${fontUrl}:`, err);
    return false;
  }
}

window._reportsThaiFontCache = window._reportsThaiFontCache || {
  b64: null,
  vfsName: 'THSarabunNew.ttf',
  fontName: 'THSarabunNew',
  fontStyle: 'normal',
  fetchPromise: null
};

function registerCachedThaiFontToDoc(doc) {
  const cache = window._reportsThaiFontCache;
  if (!cache?.b64) return false;
  try {
    doc.addFileToVFS(cache.vfsName, cache.b64);
    doc.addFont(cache.vfsName, cache.fontName, cache.fontStyle);
    return true;
  } catch (e) {
    console.warn('Could not register cached Thai font to doc:', e);
    return false;
  }
}

async function ensureThaiFont(doc) {
  // IMPORTANT: Each jsPDF instance needs addFileToVFS/addFont.
  if (registerCachedThaiFontToDoc(doc)) return true;

  const cache = window._reportsThaiFontCache;
  if (cache.fetchPromise) {
    const ok = await cache.fetchPromise;
    return ok ? registerCachedThaiFontToDoc(doc) : false;
  }

  cache.fetchPromise = (async () => {
    const ok = await loadAndRegisterFont(
      doc,
      '/fonts/THSarabunNew.ttf',
      cache.vfsName,
      cache.fontName,
      cache.fontStyle
    );
    return ok;
  })();

  const loadedOk = await cache.fetchPromise;
  cache.fetchPromise = null;
  if (!loadedOk) return false;
  return registerCachedThaiFontToDoc(doc);
}

// Category labels from server
const categoriesLabel = window.categoriesLabel || {};

// ========================================
// Initialization
// ========================================
document.addEventListener('DOMContentLoaded', async function() {
  await loadReportsData();
});

// ========================================
// Data Loading
// ========================================

/**
 * โหลดข้อมูลรายงานจาก API
 */
async function loadReportsData() {
  try {
    showLoading();
    
    // Get current filters
    const observationId = document.getElementById('filterObservation')?.value || '';
    const yearLevel = document.getElementById('filterYear')?.value || '';
    const evaluationNum = document.getElementById('filterAttempt')?.value || '';
    
    // Build query params
    const params = new URLSearchParams();
    if (observationId) params.append('observationId', observationId);
    if (yearLevel) params.append('yearLevel', yearLevel);
    if (evaluationNum) params.append('evaluationNum', evaluationNum);
    
    const url = `/api/reports/evaluation-summary?${params.toString()}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'ไม่สามารถโหลดข้อมูลได้');
    }
    
    reportsData = data.data;
    filteredStudents = [...reportsData.students];
    currentTablePage = 1;
    
    // Check if we have data
    if (reportsData.students.length === 0) {
      showEmpty();
      return;
    }
    
    // Populate filters
    populateObservationFilter();
    
    // Render everything
    renderStats();
    renderYearDistribution();
    renderCharts();
    renderTable();
    renderCategoryAnalysis();
    
    showContent();
    
  } catch (error) {
    console.error('Error loading reports data:', error);
    Swal.fire({
      icon: 'error',
      title: 'เกิดข้อผิดพลาด',
      text: error.message || 'ไม่สามารถโหลดข้อมูลได้'
    });
    showEmpty();
  }
}

function getTableTotalPages() {
  const total = filteredStudents.length;
  return Math.max(1, Math.ceil(total / tablePageSize));
}

function updateTablePaginationUI() {
  const total = filteredStudents.length;
  const totalPages = getTableTotalPages();
  currentTablePage = Math.min(Math.max(currentTablePage, 1), totalPages);

  const start = total === 0 ? 0 : (currentTablePage - 1) * tablePageSize + 1;
  const end = total === 0 ? 0 : Math.min(currentTablePage * tablePageSize, total);

  const infoEl = document.getElementById('tablePaginationInfo');
  const indicatorEl = document.getElementById('tablePageIndicator');
  const prevBtn = document.getElementById('tablePrevPage');
  const nextBtn = document.getElementById('tableNextPage');

  if (infoEl) infoEl.textContent = `แสดง ${start}-${end} จาก ${total} รายการ`;
  if (indicatorEl) indicatorEl.textContent = `หน้า ${currentTablePage} / ${totalPages}`;
  if (prevBtn) prevBtn.disabled = currentTablePage <= 1;
  if (nextBtn) nextBtn.disabled = currentTablePage >= totalPages;
}

function setTablePage(page) {
  currentTablePage = page;
  renderTable();
}

window.prevTablePage = function() {
  setTablePage(Math.max(1, currentTablePage - 1));
};

window.nextTablePage = function() {
  setTablePage(Math.min(getTableTotalPages(), currentTablePage + 1));
};

/**
 * เติม dropdown สำหรับงวดการสังเกต
 */
function populateObservationFilter() {
  const select = document.getElementById('filterObservation');
  if (!select || !reportsData.observations) return;
  
  // Clear existing options except first
  select.innerHTML = '<option value="">ทุกงวด (ภาพรวม)</option>';
  
  // Add observations
  reportsData.observations.forEach(obs => {
    const option = document.createElement('option');
    option.value = obs.id;
    option.textContent = `${obs.name} (${obs.academicYear} - ปี ${obs.yearLevel})`;
    select.appendChild(option);
  });
}

// ========================================
// UI State Management
// ========================================

function showLoading() {
  document.getElementById('loadingState').style.display = 'block';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('reportContent').style.display = 'none';
}

function showEmpty() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('emptyState').style.display = 'block';
  document.getElementById('reportContent').style.display = 'none';
}

function showContent() {
  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('reportContent').style.display = 'block';
}

// ========================================
// Render Functions
// ========================================

/**
 * แสดงสถิติภาพรวม
 */
function renderStats() {
  if (!reportsData) return;
  
  const stats = reportsData.stats;
  
  document.getElementById('statTotalStudents').textContent = stats.totalStudents || '0';
  document.getElementById('statTotalEvaluations').textContent = stats.totalEvaluations || '0';
  document.getElementById('statGrandAverage').textContent = stats.grandAverage || '0.00';
  document.getElementById('statExcellent').textContent = stats.excellentCount || '0';
}

/**
 * แสดงการกระจายตามชั้นปี
 */
function renderYearDistribution() {
  if (!reportsData) return;
  
  const container = document.getElementById('yearDistributionContainer');
  const distribution = reportsData.yearDistribution;
  
  container.innerHTML = '';
  
  for (let year = 1; year <= 4; year++) {
    const count = distribution[year] || 0;
    const div = document.createElement('div');
    div.className = 'year-badge';
    div.style.cssText = 'background:var(--color-bg);padding:12px;border-radius:8px;text-align:center;';
    div.innerHTML = `
      <div style="font-size:1.5rem;font-weight:600;color:var(--color-primary);">${count}</div>
      <div style="font-size:0.9rem;color:var(--color-muted);">ชั้นปีที่ ${year}</div>
    `;
    container.appendChild(div);
  }
}

/**
 * แสดงตาราง
 */
function renderTable() {
  if (!reportsData) return;
  
  const tbody = document.getElementById('tableBody');
  const tfoot = document.getElementById('tableFoot');

  const totalPages = getTableTotalPages();
  currentTablePage = Math.min(Math.max(currentTablePage, 1), totalPages);
  const startIndex = (currentTablePage - 1) * tablePageSize;
  const endIndex = Math.min(startIndex + tablePageSize, filteredStudents.length);
  const pageStudents = filteredStudents.slice(startIndex, endIndex);
  const colCount = 4 + Object.keys(categoriesLabel).length + 3;
  
  // Render body
  if (pageStudents.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${colCount}" style="text-align:center;color:var(--color-muted);padding:18px;">ไม่พบข้อมูล</td>
      </tr>
    `;
  } else {
    tbody.innerHTML = pageStudents.map(student => {
    const evalData = student.evaluationData;
    const values = Object.values(evalData).filter(v => v > 0);
    const studentAvg = values.length > 0
      ? values.reduce((sum, val) => sum + val, 0) / values.length
      : 0;
    
    const gradeText = studentAvg >= 4.5 ? 'ดีมาก' : studentAvg >= 4 ? 'ดี' : studentAvg >= 3.5 ? 'ปานกลาง' : studentAvg >= 3 ? 'พอใช้' : 'ปรับปรุง';
    const gradeClass = studentAvg >= 4.5 ? 'grade-excellent' : studentAvg >= 4 ? 'grade-verygood' : studentAvg >= 3.5 ? 'grade-good' : studentAvg >= 3 ? 'grade-fair' : 'grade-poor';
    
    const scoreCells = Object.keys(categoriesLabel).map(key => {
      const score = evalData[key] || 0;
      const scoreClass = score >= 4.5 ? 'score-excellent' : score >= 4 ? 'score-verygood' : score >= 3.5 ? 'score-good' : score >= 3 ? 'score-fair' : 'score-poor';
      return `<td style="text-align:center;" class="${scoreClass}-cell">${score > 0 ? score.toFixed(1) : '-'}</td>`;
    }).join('');
    
    const countTotal = (student.evaluationCountTotal !== undefined && student.evaluationCountTotal !== null)
      ? Number(student.evaluationCountTotal)
      : Number(student.evaluationCount || 0);

    return `
      <tr class="student-row" data-student-id="${student.id}" data-year="${student.year || ''}" data-avg="${studentAvg.toFixed(2)}">
        <td><strong>${student.id || '-'}</strong></td>
        <td>${(student.firstName || '')} ${(student.lastName || '')}</td>
        <td style="text-align:center;"><span class="year-badge-sm">ปี ${student.year || '-'}</span></td>
        <td style="text-align:center;"><span class="year-badge-sm">${Number.isFinite(countTotal) ? countTotal : 0}/9</span></td>
        ${scoreCells}
        <td style="text-align:center;background:#f0f9ff;font-weight:700;font-size:1.05rem;">
          ${studentAvg > 0 ? studentAvg.toFixed(2) : '-'}
        </td>
        <td style="text-align:center;"><span class="grade-badge ${gradeClass}">${gradeText}</span></td>
        <td style="text-align:center;">
          <button type="button" class="btn btn--secondary" style="padding:6px 10px;font-size:0.85rem;" onclick="openStudentReport('${student.id}')">รายงาน</button>
        </td>
      </tr>
    `;
    }).join('');
  }
  
  // Render footer (averages)
  const categoryAvgs = reportsData.categoryAverages;
  const avgCells = Object.keys(categoriesLabel).map(key => {
    return `<td style="text-align:center;">${categoryAvgs[key] || '0.00'}</td>`;
  }).join('');
  
  tfoot.innerHTML = `
    <tr style="background:var(--color-primary);color:white;font-weight:600;">
      <td colspan="4" style="text-align:center;">ค่าเฉลี่ยรวมทุกคน</td>
      ${avgCells}
      <td style="text-align:center;background:#1e40af;">${reportsData.grandAverage || '0.00'}</td>
      <td></td>
      <td></td>
    </tr>
  `;

  updateTablePaginationUI();
}

async function fetchStudentReportDetail(studentId) {
  const filters = getCurrentFilterState();
  const params = new URLSearchParams();
  params.append('studentId', studentId);
  if (filters.observationId) params.append('observationId', filters.observationId);
  if (filters.evaluationNum) params.append('evaluationNum', filters.evaluationNum);

  const resp = await fetch(`/api/reports/student-evaluation-detail?${params.toString()}`);
  const json = await resp.json();
  if (!json.success) throw new Error(json.message || 'ไม่สามารถโหลดรายงานรายบุคคลได้');
  return json.data;
}

function buildQuestionRowsFromAttempt(attempt) {
  const answers = attempt?.answers || {};
  const questionKeys = Object.keys(answers)
    .filter(k => /^q\d+$/.test(k))
    .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));

  return questionKeys.map((qKey, idx) => {
    const raw = answers[qKey];
    const scoreNum = raw === undefined || raw === null || raw === '' ? null : Number(raw);
    const score = Number.isFinite(scoreNum) ? scoreNum : null;
    return {
      no: idx + 1,
      section: getQuestionSectionTitle(qKey),
      questionKey: qKey,
      question: getQuestionText(qKey),
      score,
      rating: score ? getRatingText(score) : '-'
    };
  });
}

window.openStudentReport = function(studentId) {
  (async () => {
    try {
      Swal.fire({
        title: 'กำลังโหลดรายงานรายบุคคล...',
        html: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      const detail = await fetchStudentReportDetail(studentId);
      const studentName = `${detail.student?.firstName || ''} ${detail.student?.lastName || ''}`.trim() || studentId;

      Swal.close();

      const result = await Swal.fire({
        icon: 'question',
        title: `Export รายงาน: ${studentName}`,
        html: 'เลือกรูปแบบเอกสารที่ต้องการ',
        showCancelButton: true,
        cancelButtonText: 'ยกเลิก',
        showDenyButton: true,
        confirmButtonText: 'PDF',
        denyButtonText: 'Excel',
        footer: '<button type="button" class="swal2-confirm swal2-styled" style="background:#2563eb;" id="btnExportJson">JSON</button>'
      });

      // JSON button handler
      const jsonBtn = document.getElementById('btnExportJson');
      if (jsonBtn) {
        jsonBtn.onclick = () => {
          try {
            exportStudentToJSON(detail);
            Swal.close();
          } catch (e) {
            Swal.fire({ icon: 'error', title: 'Export JSON ไม่สำเร็จ', text: e.message || 'เกิดข้อผิดพลาด' });
          }
        };
      }

      if (result.isConfirmed) {
        await exportStudentToPDF(detail);
      } else if (result.isDenied) {
        exportStudentToExcel(detail);
      }
    } catch (error) {
      console.error('openStudentReport error:', error);
      Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: error.message || 'ไม่สามารถสร้างรายงานได้' });
    }
  })();
}

async function exportStudentToPDF(detail) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('ไม่พบ jsPDF');

  Swal.fire({
    title: 'กำลังสร้าง PDF รายบุคคล...',
    html: 'กรุณารอสักครู่',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    putOnlyUsedFonts: true,
    compress: true
  });
  const thaiOk = await ensureThaiFont(doc);
  if (thaiOk) doc.setFont('THSarabunNew', 'normal');
  else doc.setFont('helvetica', 'normal');
  if (typeof doc.autoTable !== 'function') throw new Error('ไม่พบปลั๊กอินตาราง PDF (autoTable)');

  const student = detail.student || {};
  const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
  const sid = student.id || '-';
  const yearText = student.year ? `ปี ${student.year}` : '-';
  const emailText = student.email || '-';
  const filters = detail.filters || {};
  const filterText = [
    filters.observationId ? `งวด: ${filters.observationId}` : 'งวด: ทุกงวด',
    filters.evaluationNum ? `ครั้งที่: ${filters.evaluationNum}` : 'ครั้งที่: 1-9'
  ].join(' | ');

  const dateStr = new Date().toISOString().split('T')[0];
  doc.setFontSize(18);
  doc.text('รายงานผลการประเมินรายบุคคล', 14, 14);
  doc.setFontSize(12);
  doc.text(`วันที่ออกรายงาน: ${dateStr}`, 14, 22);
  doc.text(`รหัสนักศึกษา: ${sid}`, 14, 29);
  doc.text(`ชื่อ-นามสกุล: ${studentName || '-'}`, 14, 36);
  doc.text(`ชั้นปี: ${yearText}`, 14, 43);
  doc.text(`อีเมล: ${emailText}`, 14, 50);
  doc.text(filterText, 14, 57);

  let cursorY = 65;
  const records = Array.isArray(detail.records) ? detail.records : [];
  if (!records.length) {
    doc.setFontSize(12);
    doc.text('ไม่พบข้อมูลการประเมินสำหรับนักศึกษารายนี้ ตามตัวกรองที่เลือก', 14, cursorY);
    doc.save(`รายงานรายบุคคล_${sid}_${dateStr}.pdf`);
    Swal.close();
    Swal.fire({ icon: 'success', title: 'Export PDF สำเร็จ', timer: 1200, showConfirmButton: false });
    return;
  }

  for (const rec of records) {
    const obsName = rec.observationName || 'ไม่ระบุชื่อ';
    const totals = rec.totals || {};

    doc.setFontSize(14);
    doc.text(`งวดการสังเกต: ${obsName}`, 14, cursorY);
    cursorY += 6;
    doc.setFontSize(11);
    doc.text(`จำนวนครั้งที่ส่งแล้ว: ${totals.attemptsSubmitted || 0}`, 14, cursorY);
    doc.text(`คะแนนเฉลี่ยรวม (หมวด): ${totals.overallAverage || 0}`, 90, cursorY);
    cursorY += 6;

    const attempts = Array.isArray(rec.attempts) ? rec.attempts : [];
    for (const at of attempts) {
      const atDate = formatThaiDate(getAttemptDate(at));
      const header = `ครั้งที่ ${at.evaluationNum || '-'} | สัปดาห์ ${at.week || '-'} | วันที่ ${atDate} | เฉลี่ย ${at.overallAverage || 0}`;

      doc.setFontSize(12);
      doc.text(header, 14, cursorY);
      cursorY += 3;

      const rows = buildQuestionRowsFromAttempt(at);
      const body = rows.map(r => [
        String(r.no),
        r.section || '-',
        r.question,
        r.score !== null && r.score !== undefined ? String(r.score) : '-',
        r.rating
      ]);

      doc.autoTable({
        head: [[ '#', 'หมวด', 'หัวข้อคำถาม', 'คะแนน', 'ระดับ' ]],
        body,
        startY: cursorY + 2,
        theme: 'grid',
        styles: {
          font: thaiOk ? 'THSarabunNew' : 'helvetica',
          fontSize: thaiOk ? 11 : 9,
          cellPadding: 2,
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [46, 48, 148],
          textColor: 255,
          font: thaiOk ? 'THSarabunNew' : 'helvetica',
          fontStyle: 'normal'
        },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 35 },
          2: { cellWidth: 105 },
          3: { cellWidth: 12, halign: 'center' },
          4: { cellWidth: 20 }
        },
        margin: { left: 14, right: 14 },
        didDrawPage: () => {
          // no-op
        }
      });

      cursorY = doc.lastAutoTable ? (doc.lastAutoTable.finalY + 8) : (cursorY + 10);
      if (cursorY > 260) {
        doc.addPage();
        cursorY = 14;
      }
    }

    cursorY += 2;
    if (cursorY > 260) {
      doc.addPage();
      cursorY = 14;
    }
  }

  doc.save(`รายงานรายบุคคล_${sid}_${dateStr}.pdf`);
  Swal.close();
  Swal.fire({ icon: 'success', title: 'Export PDF สำเร็จ', timer: 1200, showConfirmButton: false });
}

function exportStudentToExcel(detail) {
  if (typeof XLSX === 'undefined') {
    Swal.fire({ icon: 'error', title: 'Export Excel ไม่สำเร็จ', text: 'ไม่พบไลบรารี XLSX' });
    return;
  }

  const student = detail.student || {};
  const sid = student.id || 'unknown';
  const dateStr = new Date().toISOString().split('T')[0];

  const header = [
    'รหัสนักศึกษา',
    'ชื่อ-นามสกุล',
    'ชั้นปี',
    'งวดการสังเกต',
    'ครั้งที่ประเมิน',
    'สัปดาห์',
    'วันที่ส่ง',
    'หมวด',
    'ข้อ',
    'หัวข้อคำถาม',
    'คะแนน',
    'ระดับ'
  ];

  const rows = [];
  const records = Array.isArray(detail.records) ? detail.records : [];
  records.forEach(rec => {
    const obsName = rec.observationName || 'ไม่ระบุชื่อ';
    const attempts = Array.isArray(rec.attempts) ? rec.attempts : [];
    attempts.forEach(at => {
      const atDate = getAttemptDate(at);
      const qRows = buildQuestionRowsFromAttempt(at);
      qRows.forEach(q => {
        rows.push([
          sid,
          `${student.firstName || ''} ${student.lastName || ''}`.trim(),
          student.year || '',
          obsName,
          at.evaluationNum || '',
          at.week || '',
          atDate || '',
          q.section || '',
          q.questionKey,
          q.question,
          q.score !== null && q.score !== undefined ? q.score : '',
          q.rating
        ]);
      });
    });
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'รายงานรายบุคคล');
  XLSX.writeFile(wb, `รายงานรายบุคคล_${sid}_${dateStr}.xlsx`);
  Swal.fire({ icon: 'success', title: 'Export Excel สำเร็จ', timer: 1200, showConfirmButton: false });
}

function exportStudentToJSON(detail) {
  const student = detail.student || {};
  const sid = student.id || 'unknown';
  const dateStr = new Date().toISOString().split('T')[0];
  const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `รายงานรายบุคคล_${sid}_${dateStr}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * แสดงวิเคราะห์แต่ละหมวดหมู่
 */
function renderCategoryAnalysis() {
  if (!reportsData) return;
  
  const container = document.getElementById('categoryAnalysisContainer');
  container.innerHTML = '';
  
  Object.entries(categoriesLabel).forEach(([key, label]) => {
    const scores = filteredStudents.map(s => s.evaluationData[key] || 0).filter(s => s > 0);
    
    if (scores.length === 0) {
      return; // Skip if no data
    }
    
    const avg = (scores.reduce((sum, val) => sum + val, 0) / scores.length).toFixed(2);
    const min = Math.min(...scores).toFixed(1);
    const max = Math.max(...scores).toFixed(1);
    const excellent = scores.filter(s => s >= 4.5).length;
    const needImprovement = scores.filter(s => s < 3.5).length;
    
    const card = document.createElement('div');
    card.className = 'category-card';
    card.innerHTML = `
      <div class="category-header">
        <h4>${label}</h4>
        <div class="category-avg">${avg}</div>
      </div>
      <div class="category-stats">
        <div class="stat-row">
          <span class="stat-label">สูงสุด:</span>
          <span class="stat-value" style="color:#16A34A;">${max}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">ต่ำสุด:</span>
          <span class="stat-value" style="color:#DC2626;">${min}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">ดีมาก:</span>
          <span class="stat-value">${excellent} คน</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">ต้องพัฒนา:</span>
          <span class="stat-value">${needImprovement} คน</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// ========================================
// Charts Rendering
// ========================================

/**
 * สร้างกราฟทั้งหมด
 */
function renderCharts() {
  if (!reportsData) return;
  
  // Destroy existing charts
  Object.values(allCharts).forEach(chart => {
    if (chart) chart.destroy();
  });
  allCharts = {};
  
  // Configure Chart.js defaults
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.color = '#0F1724';
  }
  
  renderOverallBarChart();
  renderDistributionPieChart();
  renderSkillsRadarChart();
  renderYearComparisonChart();
  renderPerformanceDoughnutChart();
  renderStudentScatterChart();
}

/**
 * กราฟแท่ง: คะแนนเฉลี่ยแต่ละด้าน
 */
function renderOverallBarChart() {
  const ctx = document.getElementById('overallBarChart');
  if (!ctx || typeof Chart === 'undefined') return;
  
  const categoryAvgs = reportsData.categoryAverages;
  
  allCharts.overallBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.values(categoriesLabel),
      datasets: [{
        label: 'คะแนนเฉลี่ย',
        data: Object.values(categoryAvgs).map(v => parseFloat(v)),
        backgroundColor: ['#2E3094', '#FBB425', '#16A34A', '#DC2626', '#0EA5E9', '#F59E0B', '#8B5CF6', '#EC4899'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `คะแนน: ${context.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, max: 5, title: { display: true, text: 'คะแนนเฉลี่ย' } },
        x: { ticks: { maxRotation: 45, minRotation: 45 } }
      }
    }
  });
}

/**
 * กราฟวงกลม: การกระจายระดับคะแนน
 */
function renderDistributionPieChart() {
  const ctx = document.getElementById('distributionPieChart');
  if (!ctx || typeof Chart === 'undefined') return;
  
  const allScores = filteredStudents.flatMap(s => Object.values(s.evaluationData).filter(v => v > 0));
  const excellent = allScores.filter(s => s >= 4.5).length;
  const veryGood = allScores.filter(s => s >= 4 && s < 4.5).length;
  const good = allScores.filter(s => s >= 3.5 && s < 4).length;
  const fair = allScores.filter(s => s >= 3 && s < 3.5).length;
  const poor = allScores.filter(s => s < 3).length;
  
  allCharts.distributionPie = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['ดีมาก', 'ดี', 'ปานกลาง', 'พอใช้', 'ปรับปรุง'],
      datasets: [{
        data: [excellent, veryGood, good, fair, poor],
        backgroundColor: ['#16A34A', '#3B82F6', '#FBB425', '#F59E0B', '#DC2626'],
        borderWidth: 3,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (context) => {
              const total = allScores.length;
              const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : '0.0';
              return `${context.label}: ${context.parsed} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

/**
 * กราฟ Radar: เปรียบเทียบทักษะทั้งหมด
 */
function renderSkillsRadarChart() {
  const ctx = document.getElementById('skillsRadarChart');
  if (!ctx || typeof Chart === 'undefined') return;
  
  const categoryAvgs = reportsData.categoryAverages;
  
  allCharts.skillsRadar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: Object.values(categoriesLabel),
      datasets: [{
        label: 'คะแนนเฉลี่ยรวม',
        data: Object.values(categoryAvgs).map(v => parseFloat(v)),
        borderColor: '#2E3094',
        backgroundColor: 'rgba(46, 48, 148, 0.2)',
        pointBackgroundColor: '#2E3094',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#2E3094'
      }, {
        label: 'เป้าหมาย',
        data: Array(Object.keys(categoryAvgs).length).fill(5),
        borderColor: '#FBB425',
        backgroundColor: 'rgba(251, 180, 37, 0.1)',
        pointBackgroundColor: '#FBB425',
        borderDash: [5, 5]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        r: {
          beginAtZero: true,
          max: 5,
          ticks: { stepSize: 1 }
        }
      }
    }
  });
}

/**
 * กราฟแท่ง: เปรียบเทียบตามชั้นปี
 */
function renderYearComparisonChart() {
  const ctx = document.getElementById('yearComparisonChart');
  if (!ctx || typeof Chart === 'undefined') return;
  
  const yearData = {};
  for (let year = 1; year <= 4; year++) {
    const yearStudents = filteredStudents.filter(s => s.year === year);
    if (yearStudents.length > 0) {
      const yearAvg = yearStudents.reduce((sum, s) => {
        const values = Object.values(s.evaluationData).filter(v => v > 0);
        const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        return sum + avg;
      }, 0) / yearStudents.length;
      yearData[year] = yearAvg;
    }
  }
  
  allCharts.yearComparison = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(yearData).map(y => `ชั้นปีที่ ${y}`),
      datasets: [{
        label: 'คะแนนเฉลี่ย',
        data: Object.values(yearData),
        backgroundColor: ['#2E3094', '#FBB425', '#16A34A', '#DC2626'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, max: 5, title: { display: true, text: 'คะแนนเฉลี่ย' } }
      }
    }
  });
}

/**
 * กราฟ Doughnut: สัดส่วนผลการประเมิน
 */
function renderPerformanceDoughnutChart() {
  const ctx = document.getElementById('performanceDoughnutChart');
  if (!ctx || typeof Chart === 'undefined') return;
  
  const studentAvgs = filteredStudents.map(s => {
    const values = Object.values(s.evaluationData).filter(v => v > 0);
    return values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
  });
  
  const excellent = studentAvgs.filter(a => a >= 4.5).length;
  const veryGood = studentAvgs.filter(a => a >= 4 && a < 4.5).length;
  const good = studentAvgs.filter(a => a >= 3.5 && a < 4).length;
  const needImprovement = studentAvgs.filter(a => a < 3.5).length;
  
  allCharts.performanceDoughnut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['ดีมาก', 'ดี', 'ปานกลาง', 'ต้องพัฒนา'],
      datasets: [{
        data: [excellent, veryGood, good, needImprovement],
        backgroundColor: ['#16A34A', '#3B82F6', '#FBB425', '#DC2626'],
        borderWidth: 3,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: (context) => `${context.label}: ${context.parsed} คน`
          }
        }
      }
    }
  });
}

/**
 * กราฟ Scatter: การกระจายคะแนนนักศึกษา
 */
function renderStudentScatterChart() {
  const ctx = document.getElementById('studentScatterChart');
  if (!ctx || typeof Chart === 'undefined') return;
  
  const scatterData = filteredStudents.map((student, idx) => {
    const values = Object.values(student.evaluationData).filter(v => v > 0);
    const avg = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    return {
      x: idx + 1,
      y: avg,
      label: `${student.firstName} ${student.lastName}`
    };
  });
  
  allCharts.studentScatter = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'คะแนนเฉลี่ยนักศึกษา',
        data: scatterData,
        backgroundColor: '#2E3094',
        borderColor: '#2E3094',
        pointRadius: 8,
        pointHoverRadius: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => `${context.raw.label}: ${context.parsed.y.toFixed(2)}`
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'ลำดับนักศึกษา' } },
        y: { title: { display: true, text: 'คะแนนเฉลี่ย' }, min: 0, max: 5 }
      }
    }
  });
}

// ========================================
// Filter Functions
// ========================================

/**
 * ใช้ filters (reload data from API)
 */
async function applyFilters() {
  await loadReportsData();
}

/**
 * กรองตารางตาม search และ sort (client-side)
 */
function filterTable() {
  const searchText = (document.getElementById('searchStudent').value || '').toLowerCase();
  const scoreFilter = document.getElementById('filterScore').value;
  const evalCountFilter = document.getElementById('filterEvalCount')?.value || '';
  const sortBy = document.getElementById('sortBy').value;
  
  // Filter students
  filteredStudents = reportsData.students.filter(student => {
    // Search filter
    const matchSearch = !searchText || 
      (student.firstName || '').toLowerCase().includes(searchText) ||
      (student.lastName || '').toLowerCase().includes(searchText) ||
      String(student.id || '').toLowerCase().includes(searchText);
    
    // Score filter
    let matchScore = true;
    if (scoreFilter) {
      const values = Object.values(student.evaluationData).filter(v => v > 0);
      const avg = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
      switch (scoreFilter) {
        case 'excellent': matchScore = avg >= 4.5; break;
        case 'verygood': matchScore = avg >= 4 && avg < 4.5; break;
        case 'good': matchScore = avg >= 3.5 && avg < 4; break;
        case 'fair': matchScore = avg >= 3 && avg < 3.5; break;
        case 'poor': matchScore = avg < 3; break;
      }
    }

    // Evaluation count filter (total submitted attempts, 0..9)
    let matchEvalCount = true;
    if (evalCountFilter !== '') {
      const expected = Number(evalCountFilter);
      const countTotal = (student.evaluationCountTotal !== undefined && student.evaluationCountTotal !== null)
        ? Number(student.evaluationCountTotal)
        : Number(student.evaluationCount || 0);
      matchEvalCount = Number.isFinite(expected) ? countTotal === expected : true;
    }
    
    return matchSearch && matchScore && matchEvalCount;
  });
  
  // Sort students
  filteredStudents.sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return (a.firstName || '').localeCompare((b.firstName || ''), 'th');
      case 'id':
        return String(a.id || '').localeCompare(String(b.id || ''));
      case 'year':
        return (a.year || 0) - (b.year || 0);
      case 'score-desc': {
        const valuesA = Object.values(a.evaluationData).filter(v => v > 0);
        const valuesB = Object.values(b.evaluationData).filter(v => v > 0);
        const avgA = valuesA.length ? valuesA.reduce((sum, val) => sum + val, 0) / valuesA.length : 0;
        const avgB = valuesB.length ? valuesB.reduce((sum, val) => sum + val, 0) / valuesB.length : 0;
        return avgB - avgA;
      }
      case 'score-asc': {
        const valuesA = Object.values(a.evaluationData).filter(v => v > 0);
        const valuesB = Object.values(b.evaluationData).filter(v => v > 0);
        const avgA = valuesA.length ? valuesA.reduce((sum, val) => sum + val, 0) / valuesA.length : 0;
        const avgB = valuesB.length ? valuesB.reduce((sum, val) => sum + val, 0) / valuesB.length : 0;
        return avgA - avgB;
      }
      default:
        return 0;
    }
  });

  currentTablePage = 1;
  
  // Re-render table only
  renderTable();
  renderCategoryAnalysis();
}

// ========================================
// Action Functions
// ========================================

window.refreshData = async function() {
  await loadReportsData();
}

window.printReport = function() {
  window.print();
}

window.openExportModal = function() {
  document.getElementById('exportModal').style.display = 'flex';
}

window.closeExportModal = function() {
  document.getElementById('exportModal').style.display = 'none';
}

window.exportToPDF = function() {
  (async () => {
    try {
      const students = getExportStudents();
      if (!students.length) {
        Swal.fire({ icon: 'info', title: 'ไม่มีข้อมูล', text: 'ไม่มีข้อมูลสำหรับ Export ตามตัวกรองปัจจุบัน' });
        return;
      }

      Swal.fire({
        title: 'กำลังสร้าง PDF...',
        html: 'กรุณารอสักครู่',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });

      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) throw new Error('ไม่พบ jsPDF');

      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
        putOnlyUsedFonts: true,
        compress: true
      });
      const thaiOk = await ensureThaiFont(doc);
      if (thaiOk) doc.setFont('THSarabunNew', 'normal');
      else doc.setFont('helvetica', 'normal');

      if (typeof doc.autoTable !== 'function') {
        throw new Error('ไม่พบปลั๊กอินตาราง PDF (autoTable)');
      }

      const filters = getCurrentFilterState();
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];

      doc.setFontSize(18);
      doc.text('รายงานผลการประเมินการฝึกประสบการณ์', 14, 14);

      doc.setFontSize(11);
      const infoLines = [
        `วันที่ออกรายงาน: ${dateStr}`,
        `งวดการสังเกต: ${filters.observationText || 'ทุกงวด (ภาพรวม)'}`,
        `ชั้นปี: ${filters.yearText || 'ทุกชั้นปี'}`,
        `ค้นหา: ${filters.searchText || '-'}`,
        `ช่วงคะแนน: ${filters.scoreFilterText || 'ทุกระดับ'}`,
        `เรียงตาม: ${filters.sortByText || '-'}`
      ];
      doc.text(infoLines, 14, 22);

      const categoryKeys = Object.keys(categoriesLabel);
      const head = [[
        'รหัสนักศึกษา',
        'ชื่อ-นามสกุล',
        'ชั้นปี',
        ...categoryKeys.map(k => categoriesLabel[k] || k),
        'เฉลี่ย',
        'ระดับ'
      ]];

      const body = students.map(s => {
        const avg = computeStudentAverage(s);
        const grade = computeGrade(avg);
        return [
          s.id || '-',
          `${s.firstName || ''} ${s.lastName || ''}`.trim() || '-',
          s.year ? `ปี ${s.year}` : '-',
          ...categoryKeys.map(k => {
            const v = (s.evaluationData || {})[k] || 0;
            return v > 0 ? Number(v).toFixed(2) : '-';
          }),
          avg > 0 ? avg.toFixed(2) : '-',
          avg > 0 ? grade.text : '-'
        ];
      });

      doc.autoTable({
        head,
        body,
        startY: 45,
        theme: 'grid',
        styles: {
          font: thaiOk ? 'THSarabunNew' : 'helvetica',
          fontSize: thaiOk ? 11 : 9,
          cellPadding: 2,
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [46, 48, 148],
          textColor: 255,
          font: thaiOk ? 'THSarabunNew' : 'helvetica',
          fontStyle: 'normal',
          fontSize: thaiOk ? 12 : 10
        },
        alternateRowStyles: { fillColor: [245, 247, 255] }
      });

      doc.save(`รายงานผลการประเมิน_${dateStr}.pdf`);

      closeExportModal();
      Swal.fire({ icon: 'success', title: 'Export PDF สำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (error) {
      console.error('Export PDF error:', error);
      Swal.fire({ icon: 'error', title: 'Export PDF ไม่สำเร็จ', text: error.message || 'เกิดข้อผิดพลาด' });
    }
  })();
}

window.exportToExcel = function() {
  try {
    const students = getExportStudents();
    if (!students.length) {
      Swal.fire({ icon: 'info', title: 'ไม่มีข้อมูล', text: 'ไม่มีข้อมูลสำหรับ Export ตามตัวกรองปัจจุบัน' });
      return;
    }

    if (typeof XLSX === 'undefined') {
      throw new Error('ไม่พบไลบรารี XLSX');
    }

    const categoryKeys = Object.keys(categoriesLabel);
    const header = [
      'รหัสนักศึกษา',
      'ชื่อ',
      'นามสกุล',
      'ชั้นปี',
      'จำนวนการประเมิน',
      ...categoryKeys.map(k => categoriesLabel[k] || k),
      'คะแนนเฉลี่ย',
      'ระดับ'
    ];

    const rows = students.map(s => {
      const avg = computeStudentAverage(s);
      const grade = computeGrade(avg);
      const countTotal = (s.evaluationCountTotal !== undefined && s.evaluationCountTotal !== null)
        ? Number(s.evaluationCountTotal)
        : Number(s.evaluationCount || 0);
      return [
        s.id || '-',
        s.firstName || '',
        s.lastName || '',
        s.year || '',
        Number.isFinite(countTotal) ? countTotal : 0,
        ...categoryKeys.map(k => {
          const v = (s.evaluationData || {})[k] || 0;
          return v > 0 ? Number(v) : '';
        }),
        avg > 0 ? Number(avg.toFixed(2)) : '',
        avg > 0 ? grade.text : ''
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'รายงาน');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `รายงานผลการประเมิน_${dateStr}.xlsx`);

    closeExportModal();
    Swal.fire({ icon: 'success', title: 'Export Excel สำเร็จ', timer: 1500, showConfirmButton: false });
  } catch (error) {
    console.error('Export Excel error:', error);
    Swal.fire({ icon: 'error', title: 'Export Excel ไม่สำเร็จ', text: error.message || 'เกิดข้อผิดพลาด' });
  }
}

window.exportToCSV = function() {
  try {
    const students = getExportStudents();
    if (!students.length) {
      Swal.fire({ icon: 'info', title: 'ไม่มีข้อมูล', text: 'ไม่มีข้อมูลสำหรับ Export ตามตัวกรองปัจจุบัน' });
      return;
    }

    const categoryKeys = Object.keys(categoriesLabel);
    const escapeCsv = (value) => {
      const s = String(value ?? '');
      if (/[\n\r",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const header = [
      'รหัสนักศึกษา',
      'ชื่อ-นามสกุล',
      'ชั้นปี',
      'จำนวนการประเมิน',
      ...categoryKeys.map(k => categoriesLabel[k] || k),
      'คะแนนเฉลี่ย',
      'ระดับ'
    ];

    let csv = '\ufeff' + header.map(escapeCsv).join(',') + '\n';

    students.forEach(s => {
      const avg = computeStudentAverage(s);
      const grade = computeGrade(avg);
      const countTotal = (s.evaluationCountTotal !== undefined && s.evaluationCountTotal !== null)
        ? Number(s.evaluationCountTotal)
        : Number(s.evaluationCount || 0);
      const row = [
        s.id || '-',
        `${s.firstName || ''} ${s.lastName || ''}`.trim() || '-',
        s.year ? `ปี ${s.year}` : '-',
        Number.isFinite(countTotal) ? countTotal : 0,
        ...categoryKeys.map(k => {
          const v = (s.evaluationData || {})[k] || 0;
          return v > 0 ? Number(v).toFixed(2) : '';
        }),
        avg > 0 ? avg.toFixed(2) : '',
        avg > 0 ? grade.text : ''
      ];
      csv += row.map(escapeCsv).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `รายงานผลการประเมิน_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    closeExportModal();
    Swal.fire({ icon: 'success', title: 'Export CSV สำเร็จ', timer: 1500, showConfirmButton: false });
  } catch (error) {
    console.error('Export CSV error:', error);
    Swal.fire({ icon: 'error', title: 'Export CSV ไม่สำเร็จ', text: error.message || 'เกิดข้อผิดพลาด' });
  }
}

window.exportToJSON = function() {
  try {
    const students = getExportStudents();
    if (!students.length) {
      Swal.fire({ icon: 'info', title: 'ไม่มีข้อมูล', text: 'ไม่มีข้อมูลสำหรับ Export ตามตัวกรองปัจจุบัน' });
      return;
    }

    const filters = getCurrentFilterState();
    const dataToExport = {
      exportDate: new Date().toISOString(),
      filters,
      totals: {
        totalStudents: students.length,
        totalEvaluations: reportsData?.stats?.totalEvaluations || 0,
        grandAverage: reportsData?.grandAverage || '0.00',
        categoryAverages: reportsData?.categoryAverages || {}
      },
      categoriesLabel,
      students: students.map(s => {
        const avg = computeStudentAverage(s);
        const grade = computeGrade(avg);
        return {
          ...s,
          average: avg > 0 ? Number(avg.toFixed(2)) : 0,
          grade: avg > 0 ? grade.text : ''
        };
      })
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `รายงานผลการประเมิน_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    closeExportModal();
    Swal.fire({ icon: 'success', title: 'Export JSON สำเร็จ', timer: 1500, showConfirmButton: false });
  } catch (error) {
    console.error('Export JSON error:', error);
    Swal.fire({ icon: 'error', title: 'Export JSON ไม่สำเร็จ', text: error.message || 'เกิดข้อผิดพลาด' });
  }
}

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('exportModal');
  if (event.target === modal) {
    closeExportModal();
  }
}
 
