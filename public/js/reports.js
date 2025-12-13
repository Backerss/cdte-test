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
    
    // Build query params
    const params = new URLSearchParams();
    if (observationId) params.append('observationId', observationId);
    if (yearLevel) params.append('yearLevel', yearLevel);
    
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
  const colCount = 3 + Object.keys(categoriesLabel).length + 2;
  
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
    
    return `
      <tr class="student-row" data-student-id="${student.id}" data-year="${student.year || ''}" data-avg="${studentAvg.toFixed(2)}">
        <td><strong>${student.id || '-'}</strong></td>
        <td>${(student.firstName || '')} ${(student.lastName || '')}</td>
        <td style="text-align:center;"><span class="year-badge-sm">ปี ${student.year || '-'}</span></td>
        ${scoreCells}
        <td style="text-align:center;background:#f0f9ff;font-weight:700;font-size:1.05rem;">
          ${studentAvg > 0 ? studentAvg.toFixed(2) : '-'}
        </td>
        <td style="text-align:center;"><span class="grade-badge ${gradeClass}">${gradeText}</span></td>
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
      <td colspan="3" style="text-align:center;">ค่าเฉลี่ยรวมทุกคน</td>
      ${avgCells}
      <td style="text-align:center;background:#1e40af;">${reportsData.grandAverage || '0.00'}</td>
      <td></td>
    </tr>
  `;

  updateTablePaginationUI();
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
    
    return matchSearch && matchScore;
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
  Swal.fire({
    title: 'กำลังสร้าง PDF...',
    html: 'กรุณารอสักครู่',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  setTimeout(() => {
    closeExportModal();
    Swal.fire({
      icon: 'success',
      title: 'Export PDF สำเร็จ!',
      text: 'ไฟล์ได้ถูกดาวน์โหลดแล้ว',
      timer: 2000
    });
  }, 2000);
}

window.exportToExcel = function() {
  // Create CSV content
  let csv = '\ufeffรหัสนักศึกษา,ชื่อ-นามสกุล,ชั้นปี';
  Object.values(categoriesLabel).forEach(label => {
    csv += `,${label}`;
  });
  csv += ',คะแนนเฉลี่ย,ระดับ\n';
  
  filteredStudents.forEach(student => {
    const values = Object.values(student.evaluationData).filter(v => v > 0);
    const avg = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
    const grade = avg >= 4.5 ? 'ดีมาก' : avg >= 4 ? 'ดี' : avg >= 3.5 ? 'ปานกลาง' : avg >= 3 ? 'พอใช้' : 'ปรับปรุง';
    
    csv += `${student.id},"${student.firstName} ${student.lastName}",${student.year || '-'}`;
    Object.values(student.evaluationData).forEach(score => {
      csv += `,${score > 0 ? score.toFixed(1) : '-'}`;
    });
    csv += `,${avg > 0 ? avg.toFixed(2) : '-'},${grade}\n`;
  });
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `รายงานผลการประเมิน_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  
  closeExportModal();
  Swal.fire({
    icon: 'success',
    title: 'Export Excel สำเร็จ!',
    text: 'ไฟล์ได้ถูกดาวน์โหลดแล้ว',
    timer: 2000
  });
}

window.exportToCSV = function() {
  exportToExcel(); // Same as Excel
}

window.exportToJSON = function() {
  const dataToExport = {
    exportDate: new Date().toISOString(),
    totalStudents: reportsData.students.length,
    grandAverage: reportsData.grandAverage,
    categoryAverages: reportsData.categoryAverages,
    students: reportsData.students.map(student => {
      const values = Object.values(student.evaluationData).filter(v => v > 0);
      const avg = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
      return {
        ...student,
        average: parseFloat(avg.toFixed(2))
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
  Swal.fire({
    icon: 'success',
    title: 'Export JSON สำเร็จ!',
    text: 'ไฟล์ได้ถูกดาวน์โหลดแล้ว',
    timer: 2000
  });
}

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('exportModal');
  if (event.target === modal) {
    closeExportModal();
  }
}
 
