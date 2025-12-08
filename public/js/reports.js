document.addEventListener('DOMContentLoaded', function() {
  // Data from server (passed via window.reportsData)
  const data = window.reportsData || {};
  const studentsData = data.studentsData || [];
  const categoriesLabel = data.categoriesLabel || {};
  const categoryAverages = data.categoryAverages || {};
  const grandAverage = data.grandAverage || 0;

  let filteredStudents = [...studentsData];

  // Chart.js Configuration
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.color = '#0F1724';
  }

  // 1. Overall Bar Chart
  const overallBarCtx = document.getElementById('overallBarChart');
  if (overallBarCtx && typeof Chart !== 'undefined') {
    new Chart(overallBarCtx, {
      type: 'bar',
      data: {
        labels: Object.values(categoriesLabel),
        datasets: [{
          label: 'คะแนนเฉลี่ย',
          data: Object.values(categoryAverages),
          backgroundColor: ['#2E3094', '#FBB425', '#16A34A', '#DC2626', '#0EA5E9', '#F59E0B', '#8B5CF6', '#EC4899'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `คะแนน: ${parseFloat(context.parsed.y).toFixed(2)}`
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

  // 2. Trend Line Chart
  const trendLineCtx = document.getElementById('trendLineChart');
  if (trendLineCtx && typeof Chart !== 'undefined') {
    new Chart(trendLineCtx, {
      type: 'line',
      data: {
        labels: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.'],
        datasets: [{
          label: 'คะแนนเฉลี่ยรายเดือน',
          data: [3.9, 4.0, 4.1, 4.15, 4.25, grandAverage],
          borderColor: '#2E3094',
          backgroundColor: 'rgba(46, 48, 148, 0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 6,
          pointBackgroundColor: '#2E3094',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: true, position: 'top' }
        },
        scales: {
          y: { beginAtZero: true, max: 5, title: { display: true, text: 'คะแนน' } }
        }
      }
    });
  }

  // 3. Distribution Pie Chart
  const distributionPieCtx = document.getElementById('distributionPieChart');
  if (distributionPieCtx && typeof Chart !== 'undefined') {
    const allScores = studentsData.flatMap(s => Object.values(s.evaluationData));
    const excellent = allScores.filter(s => s >= 4.5).length;
    const veryGood = allScores.filter(s => s >= 4 && s < 4.5).length;
    const good = allScores.filter(s => s >= 3.5 && s < 4).length;
    const fair = allScores.filter(s => s >= 3 && s < 3.5).length;
    const poor = allScores.filter(s => s < 3).length;

    new Chart(distributionPieCtx, {
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
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (context) => {
                const total = allScores.length;
                const percentage = ((context.parsed / total) * 100).toFixed(1);
                return `${context.label}: ${context.parsed} (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  // 4. Skills Radar Chart
  const skillsRadarCtx = document.getElementById('skillsRadarChart');
  if (skillsRadarCtx && typeof Chart !== 'undefined') {
    new Chart(skillsRadarCtx, {
      type: 'radar',
      data: {
        labels: Object.values(categoriesLabel),
        datasets: [{
          label: 'คะแนนเฉลี่ยรวม',
          data: Object.values(categoryAverages),
          borderColor: '#2E3094',
          backgroundColor: 'rgba(46, 48, 148, 0.2)',
          pointBackgroundColor: '#2E3094',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: '#2E3094'
        }, {
          label: 'เป้าหมาย',
          data: Array(Object.keys(categoryAverages).length).fill(5),
          borderColor: '#FBB425',
          backgroundColor: 'rgba(251, 180, 37, 0.1)',
          pointBackgroundColor: '#FBB425',
          borderDash: [5, 5]
        }]
      },
      options: {
        responsive: true,
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

  // 5. Year Comparison Chart
  const yearComparisonCtx = document.getElementById('yearComparisonChart');
  if (yearComparisonCtx && typeof Chart !== 'undefined') {
    const yearData = {};
    for (let year = 1; year <= 4; year++) {
      const yearStudents = studentsData.filter(s => s.year === year);
      if (yearStudents.length > 0) {
        const yearAvg = yearStudents.reduce((sum, s) => {
          const avg = Object.values(s.evaluationData).reduce((a, b) => a + b, 0) / Object.keys(s.evaluationData).length;
          return sum + avg;
        }, 0) / yearStudents.length;
        yearData[year] = yearAvg;
      }
    }

    new Chart(yearComparisonCtx, {
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
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, max: 5, title: { display: true, text: 'คะแนนเฉลี่ย' } }
        }
      }
    });
  }

  // 6. Performance Doughnut Chart
  const performanceDoughnutCtx = document.getElementById('performanceDoughnutChart');
  if (performanceDoughnutCtx && typeof Chart !== 'undefined') {
    const studentAvgs = studentsData.map(s => {
      return Object.values(s.evaluationData).reduce((sum, val) => sum + val, 0) / Object.keys(s.evaluationData).length;
    });

    const excellent = studentAvgs.filter(a => a >= 4.5).length;
    const veryGood = studentAvgs.filter(a => a >= 4 && a < 4.5).length;
    const good = studentAvgs.filter(a => a >= 3.5 && a < 4).length;
    const needImprovement = studentAvgs.filter(a => a < 3.5).length;

    new Chart(performanceDoughnutCtx, {
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

  // 7. Skills Area Chart
  const skillsAreaCtx = document.getElementById('skillsAreaChart');
  if (skillsAreaCtx && typeof Chart !== 'undefined') {
    new Chart(skillsAreaCtx, {
      type: 'line',
      data: {
        labels: Object.values(categoriesLabel),
        datasets: [{
          label: 'คะแนนเฉลี่ยปัจจุบัน',
          data: Object.values(categoryAverages),
          borderColor: '#2E3094',
          backgroundColor: 'rgba(46, 48, 148, 0.3)',
          fill: true,
          tension: 0.4
        }, {
          label: 'เกณฑ์ดี (4.0)',
          data: Array(Object.keys(categoryAverages).length).fill(4.0),
          borderColor: '#FBB425',
          backgroundColor: 'rgba(251, 180, 37, 0.1)',
          fill: true,
          borderDash: [5, 5]
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: { beginAtZero: true, max: 5 },
          x: { ticks: { maxRotation: 45, minRotation: 45 } }
        }
      }
    });
  }

  // 8. Student Scatter Chart
  const studentScatterCtx = document.getElementById('studentScatterChart');
  if (studentScatterCtx && typeof Chart !== 'undefined') {
    const scatterData = studentsData.map((student, idx) => {
      const avg = Object.values(student.evaluationData).reduce((sum, val) => sum + val, 0) / Object.keys(student.evaluationData).length;
      return {
        x: idx + 1,
        y: avg,
        label: `${student.firstName} ${student.lastName}`
      };
    });

    new Chart(studentScatterCtx, {
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

  // Filter Functions
  window.applyFilters = function() {
    const searchText = document.getElementById('searchStudent').value.toLowerCase();
    const yearFilter = document.getElementById('filterYear').value;
    const scoreFilter = document.getElementById('filterScore').value;
    const sortBy = document.getElementById('sortBy').value;

    // Filter students
    filteredStudents = studentsData.filter(student => {
      // Search filter
      const matchSearch = !searchText || 
        student.firstName.toLowerCase().includes(searchText) ||
        student.lastName.toLowerCase().includes(searchText) ||
        student.id.includes(searchText);
      
      // Year filter
      const matchYear = !yearFilter || student.year.toString() === yearFilter;
      
      // Score filter
      let matchScore = true;
      if (scoreFilter) {
        const avg = Object.values(student.evaluationData).reduce((sum, val) => sum + val, 0) / Object.keys(student.evaluationData).length;
        switch (scoreFilter) {
          case 'excellent': matchScore = avg >= 4.5; break;
          case 'verygood': matchScore = avg >= 4 && avg < 4.5; break;
          case 'good': matchScore = avg >= 3.5 && avg < 4; break;
          case 'fair': matchScore = avg >= 3 && avg < 3.5; break;
          case 'poor': matchScore = avg < 3; break;
        }
      }

      return matchSearch && matchYear && matchScore;
    });

    // Sort students
    filteredStudents.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.firstName.localeCompare(b.firstName, 'th');
        case 'id':
          return a.id.localeCompare(b.id);
        case 'year':
          return a.year - b.year;
        case 'score-desc':
          const avgA = Object.values(a.evaluationData).reduce((sum, val) => sum + val, 0) / Object.keys(a.evaluationData).length;
          const avgB = Object.values(b.evaluationData).reduce((sum, val) => sum + val, 0) / Object.keys(a.evaluationData).length;
          return avgB - avgA;
        case 'score-asc':
          const avgA2 = Object.values(a.evaluationData).reduce((sum, val) => sum + val, 0) / Object.keys(a.evaluationData).length;
          const avgB2 = Object.values(b.evaluationData).reduce((sum, val) => sum + val, 0) / Object.keys(a.evaluationData).length;
          return avgA2 - avgB2;
        default:
          return 0;
      }
    });

    updateTable();
  }

  function updateTable() {
    const tbody = document.getElementById('tableBody');
    const rows = tbody.querySelectorAll('.student-row');
    
    rows.forEach(row => {
      const studentId = row.dataset.studentId;
      const isVisible = filteredStudents.some(s => s.id === studentId);
      row.style.display = isVisible ? '' : 'none';
    });
  }

  window.refreshData = function() {
    Swal.fire({
      title: 'กำลังโหลดข้อมูลใหม่...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    setTimeout(() => {
      location.reload();
    }, 1000);
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
    let csv = 'รหัสนักศึกษา,ชื่อ-นามสกุล,ชั้นปี';
    Object.values(categoriesLabel).forEach(label => {
      csv += `,${label}`;
    });
    csv += ',คะแนนเฉลี่ย,ระดับ\n';

    studentsData.forEach(student => {
      const avg = Object.values(student.evaluationData).reduce((sum, val) => sum + val, 0) / Object.keys(student.evaluationData).length;
      const grade = avg >= 4.5 ? 'ดีมาก' : avg >= 4 ? 'ดี' : avg >= 3.5 ? 'ปานกลาง' : avg >= 3 ? 'พอใช้' : 'ปรับปรุง';
      
      csv += `${student.id},"${student.firstName} ${student.lastName}",${student.year}`;
      Object.values(student.evaluationData).forEach(score => {
        csv += `,${score.toFixed(1)}`;
      });
      csv += `,${avg.toFixed(2)},${grade}\n`;
    });

    const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
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
    exportToExcel(); // Same as Excel for now
  }

  window.exportToJSON = function() {
    const dataToExport = {
      exportDate: new Date().toISOString(),
      totalStudents: studentsData.length,
      grandAverage: grandAverage,
      categoryAverages: categoryAverages,
      students: studentsData.map(student => {
        const avg = Object.values(student.evaluationData).reduce((sum, val) => sum + val, 0) / Object.keys(student.evaluationData).length;
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

  // Initial table update
  updateTable();
});
