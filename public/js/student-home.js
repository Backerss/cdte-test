/**
 * student-home.js
 * JavaScript สำหรับหน้า Dashboard นักศึกษา
 * ดึงข้อมูลจริงจาก Firebase ผ่าน API
 */

// Global state
let dashboardData = null;

/**
 * โหลดข้อมูล Dashboard หลัก
 */
async function loadStudentDashboard() {
  try {
    showLoading();

    const response = await fetch('/api/student/dashboard');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'ไม่สามารถโหลดข้อมูลได้');
    }

    dashboardData = result.data;
    

    // Render ทุกส่วน
    renderGreeting(dashboardData.user);
    renderActiveObservation(dashboardData.activeObservation);
    renderPracticeHistory(dashboardData.practiceHistory);
    renderEvaluationSummary(dashboardData.evaluationData);
    renderLessonPlans(dashboardData.lessonPlans, dashboardData.canUploadLessonPlan);
    renderStats(dashboardData.stats);

    hideLoading();
  } catch (error) {
    console.error('Error loading student dashboard:', error);
    showError('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + error.message);
  }
}

/**
 * แสดง Loading state
 */
function showLoading() {
  const container = document.getElementById('studentDashboardContent');
  if (container) {
    container.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p>กำลังโหลดข้อมูล...</p>
      </div>
    `;
  }
}

/**
 * ซ่อน Loading state
 */
function hideLoading() {
  // ล้างสถานะ loading ใน container หลัก ถ้ามี เพื่อให้ส่วนอื่นที่ render ไว้แสดงแทน
  const container = document.getElementById('studentDashboardContent');
  if (container) {
    container.innerHTML = '';
  }
}

/**
 * แสดง Error
 */
function showError(message) {
  const container = document.getElementById('studentDashboardContent');
  if (container) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❌</div>
        <h3>เกิดข้อผิดพลาด</h3>
        <p>${message}</p>
        <button class="btn btn--primary" onclick="loadStudentDashboard()" style="margin-top:16px">
          ลองใหม่อีกครั้ง
        </button>
      </div>
    `;
  }
}

/**
 * Render Greeting Section
 */
function renderGreeting(user) {
  const container = document.getElementById('greetingSection');
  if (!container) return;

  const isActive = dashboardData.activeObservation !== null;
  
  container.innerHTML = `
    <div class="student-greeting card">
      <h2>สวัสดี, ${user.firstName} ${user.lastName} 👋</h2>
      <p style="color:var(--color-text);margin:0 0 8px 0;font-size:1.1rem">
        <span class="year-badge">นักศึกษาระดับชั้นปีที่ ${user.year}</span>
      </p>
      <div class="student-status-row">
        <span class="status-indicator">${isActive ? '🟢' : '🔵'}</span>
        <div>
          <strong style="color:var(--color-text)">สถานะ:</strong>
          ${isActive ? `
            <span class="status-text active">
              ขณะนี้อยู่ในช่วง ${dashboardData.activeObservation.name}
            </span><br>
            <span style="font-size:0.9rem;color:var(--color-muted)">
              (วันที่ ${formatThaiDate(dashboardData.activeObservation.startDate)} - ${formatThaiDate(dashboardData.activeObservation.endDate)})
            </span>
          ` : `
            <span class="status-text inactive">ไม่อยู่ในช่วงฝึกประสบการณ์</span><br>
            <span style="font-size:0.9rem;color:var(--color-muted)">กรุณารอการกำหนดงวดฝึกจากอาจารย์</span>
          `}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Active Observation Card
 * แสดงข้อมูลงวดการสังเกตที่กำลังดำเนินการ พร้อมข้อมูลโรงเรียน ครูพี่เลี้ยง และสถานะต่างๆ
 */
function renderActiveObservation(obs) {
  const container = document.getElementById('activeObservationSection');
  if (!container) return;
  
  // ถ้าไม่มีงวดที่ active ไม่แสดงอะไร
  if (!obs) {
    container.innerHTML = '';
    return;
  }
  
  const userYear = dashboardData.user.year || 1;
  
  // ตรวจสอบข้อมูล school และ mentor ที่ link กับ observation นี้
  // เช็คว่ามี object และมีข้อมูลสำคัญ (school ต้องมี name, mentor อาจมี position/department)
  const schoolInfo = dashboardData.schoolInfo && dashboardData.schoolInfo.name 
    ? dashboardData.schoolInfo 
    : null;
  
  // mentor ตรวจสอบว่ามี object และมี id (แม้ name จะว่างก็ถือว่ามีข้อมูล)
  const mentorInfo = dashboardData.mentorInfo && dashboardData.mentorInfo.id 
    ? dashboardData.mentorInfo 
    : null;
  
  // ใช้ completedEvaluations จาก stats ที่นับเฉพาะงวดปัจจุบัน
  const evaluationProgress = dashboardData.stats?.completedEvaluations || 0;
  const lessonPlanSubmitted = dashboardData.lessonPlans?.length > 0;
  
  // คำนวณความคืบหน้าการประเมิน
  const totalEvaluations = 9;
  const progressPercentage = Math.round((evaluationProgress / totalEvaluations) * 100);
  
  // ตรวจสอบว่าต้องส่งแผนการจัดการเรียนรู้หรือไม่ (ปี 2-3 เท่านั้น)
  const needLessonPlan = userYear >= 2 && userYear <= 3;
  
  container.innerHTML = `
    <div class="card" style="background:var(--color-primary);color:white;margin-bottom:24px;border:none;">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:20px;">
        <div>
          <h3 style="margin:0 0 8px 0;font-size:1.4rem;display:flex;align-items:center;gap:10px;color:white;">
            <span>🎯</span>
            ${obs.name}
          </h3>
          <p style="margin:0;opacity:0.9;font-size:0.95rem;color:white;">
            📅 ${formatThaiDate(obs.startDate)} - ${formatThaiDate(obs.endDate)}
          </p>
        </div>
        <span style="background:rgba(255,255,255,0.15);padding:6px 16px;border-radius:6px;font-size:0.85rem;font-weight:600;color:white;">
          🟢 กำลังดำเนินการ
        </span>
      </div>

      <!-- ข้อมูลโรงเรียนและครูพี่เลี้ยง -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-bottom:20px;">
        ${schoolInfo ? `
          <div style="background:rgba(255,255,255,0.1);padding:16px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <span style="font-size:1.3rem;">🏫</span>
              <strong style="font-size:1rem;color:white;">สถานศึกษา</strong>
            </div>
            <div style="font-size:1.05rem;font-weight:600;margin-bottom:6px;color:white;">${schoolInfo.name}</div>
            <div style="font-size:0.85rem;opacity:0.85;color:white;">
              ${schoolInfo.amphoe || ''} ${schoolInfo.province ? 'จ.' + schoolInfo.province : ''}
            </div>
            ${schoolInfo.affiliation ? `
              <div style="font-size:0.8rem;opacity:0.75;margin-top:4px;color:white;">
                ${schoolInfo.affiliation}
              </div>
            ` : ''}
          </div>
        ` : `
          <div style="background:rgba(220,38,38,0.2);padding:16px;border-radius:8px;border:1px solid rgba(220,38,38,0.3);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <span style="font-size:1.3rem;">⚠️</span>
              <strong style="font-size:1rem;color:white;">ยังไม่มีข้อมูลสถานศึกษา</strong>
            </div>
            <p style="margin:0 0 12px 0;font-size:0.85rem;opacity:0.9;color:white;">
              กรุณากรอกข้อมูลสถานศึกษาก่อนเริ่มการประเมิน
            </p>
            <a href="/dashboard/school-info" class="btn btn--sm" style="background:white;color:var(--color-primary);padding:6px 14px;text-decoration:none;border-radius:6px;font-size:0.85rem;display:inline-block;font-weight:600;">
              กรอกข้อมูลตอนนี้ →
            </a>
          </div>
        `}

        ${mentorInfo ? `
          <div style="background:rgba(255,255,255,0.1);padding:16px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <span style="font-size:1.3rem;">👨‍🏫</span>
              <strong style="font-size:1rem;color:white;">ครูพี่เลี้ยง</strong>
            </div>
            <div style="font-size:1.05rem;font-weight:600;margin-bottom:6px;color:white;">
              ${mentorInfo.name || 'ยังไม่ระบุชื่อ'}
            </div>
            <div style="font-size:0.85rem;opacity:0.85;color:white;">
              ${mentorInfo.position || '-'}
            </div>
            ${mentorInfo.department ? `
              <div style="font-size:0.8rem;opacity:0.75;margin-top:4px;color:white;">
                ${mentorInfo.department}
              </div>
            ` : ''}
          </div>
        ` : schoolInfo ? `
          <div style="background:rgba(251,180,37,0.2);padding:16px;border-radius:8px;border:1px solid rgba(251,180,37,0.3);">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <span style="font-size:1.3rem;">⚠️</span>
              <strong style="font-size:1rem;color:white;">ยังไม่มีข้อมูลครูพี่เลี้ยง</strong>
            </div>
            <p style="margin:0 0 12px 0;font-size:0.85rem;opacity:0.9;color:white;">
              กรุณากรอกข้อมูลครูพี่เลี้ยงก่อนเริ่มการประเมิน
            </p>
            <a href="/dashboard/mentor-info" class="btn btn--sm" style="background:white;color:var(--color-primary);padding:6px 14px;text-decoration:none;border-radius:6px;font-size:0.85rem;display:inline-block;font-weight:600;">
              กรอกข้อมูลตอนนี้ →
            </a>
          </div>
        ` : ''}
      </div>

      <!-- สถานะการดำเนินงาน -->
      <div style="background:rgba(255,255,255,0.1);padding:20px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);">
        <h4 style="margin:0 0 16px 0;font-size:1rem;display:flex;align-items:center;gap:8px;color:white;">
          <span>📊</span>
          สถานะการดำเนินงาน
        </h4>

        <!-- ความคืบหน้าการประเมิน -->
        <div style="margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span style="font-size:0.9rem;font-weight:500;color:white;">การประเมินการสังเกตการสอน</span>
            <span style="font-size:1.1rem;font-weight:700;color:white;">${evaluationProgress}/${totalEvaluations} ครั้ง</span>
          </div>
          <div style="background:rgba(255,255,255,0.2);height:12px;border-radius:6px;overflow:hidden;">
            <div style="width:${progressPercentage}%;height:100%;background:#16A34A;transition:width 0.5s ease;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
            <span style="font-size:0.75rem;opacity:0.85;color:white;">ความคืบหน้า ${progressPercentage}%</span>
            ${evaluationProgress < totalEvaluations ? `
              <a href="/dashboard/evaluation" style="color:white;font-size:0.75rem;text-decoration:underline;opacity:0.9;">
                เริ่มประเมิน →
              </a>
            ` : `
              <span style="font-size:0.75rem;opacity:0.9;color:white;">✅ เสร็จสมบูรณ์</span>
            `}
          </div>
        </div>

        ${needLessonPlan ? `
          <!-- สถานะการส่งแผนการจัดการเรียนรู้ (ปี 2-3) -->
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:0.9rem;font-weight:500;color:white;">📋 แผนการจัดการเรียนรู้</span>
              ${lessonPlanSubmitted ? `
                <span style="background:rgba(22,163,74,0.2);color:#16A34A;padding:4px 12px;border-radius:6px;font-size:0.75rem;font-weight:600;">
                  ✅ ส่งแล้ว
                </span>
              ` : `
                <span style="background:rgba(251,180,37,0.2);color:#FBB425;padding:4px 12px;border-radius:6px;font-size:0.75rem;font-weight:600;">
                  ⏳ รอส่ง
                </span>
              `}
            </div>
            <p style="margin:0;font-size:0.8rem;opacity:0.85;color:white;">
              ${lessonPlanSubmitted 
                ? `คุณได้ส่งแผนการจัดการเรียนรู้แล้ว ${dashboardData.lessonPlans.length} ไฟล์`
                : 'นักศึกษาชั้นปีที่ ' + userYear + ' จำเป็นต้องส่งแผนการจัดการเรียนรู้'
              }
            </p>
            ${!lessonPlanSubmitted ? `
              <a href="/dashboard/evaluation" style="color:white;font-size:0.75rem;text-decoration:underline;opacity:0.9;margin-top:4px;display:inline-block;">
                ส่งแผนการสอนตอนนี้ →
              </a>
            ` : ''}
          </div>
        ` : userYear === 1 ? `
          <!-- ข้อความสำหรับปี 1 -->
          <div style="padding:12px;background:rgba(46,48,148,0.2);border-radius:6px;border-left:3px solid var(--color-primary);">
            <div style="display:flex;align-items:center;gap:8px;">
              <span>ℹ️</span>
              <span style="font-size:0.85rem;opacity:0.9;color:white;">
                นักศึกษาชั้นปีที่ 1 ไม่ต้องส่งแผนการจัดการเรียนรู้
              </span>
            </div>
          </div>
        ` : ''}

        <!-- สรุปสถานะ -->
        <div style="margin-top:16px;padding:12px;background:rgba(255,255,255,0.08);border-radius:6px;">
          ${schoolInfo && mentorInfo ? `
            ${evaluationProgress === totalEvaluations && (!needLessonPlan || lessonPlanSubmitted) ? `
              <div style="display:flex;align-items:center;gap:8px;color:#16A34A;">
                <span style="font-size:1.2rem;">🎉</span>
                <span style="font-size:0.9rem;font-weight:600;">ดำเนินการครบถ้วนแล้ว!</span>
              </div>
            ` : `
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:1.2rem;">⚡</span>
                <span style="font-size:0.9rem;font-weight:500;color:white;">
                  ${evaluationProgress < totalEvaluations 
                    ? `เหลือการประเมินอีก ${totalEvaluations - evaluationProgress} ครั้ง`
                    : needLessonPlan && !lessonPlanSubmitted
                      ? 'เหลือส่งแผนการจัดการเรียนรู้'
                      : 'กำลังดำเนินการ'
                  }
                </span>
              </div>
            `}
          ` : `
            <div style="display:flex;align-items:center;gap:8px;color:#FBB425;">
              <span style="font-size:1.2rem;">⚠️</span>
              <span style="font-size:0.9rem;font-weight:500;">
                กรุณากรอกข้อมูล${!schoolInfo ? 'สถานศึกษา' : ''}${!schoolInfo && !mentorInfo ? 'และ' : ''}${!mentorInfo ? 'ครูพี่เลี้ยง' : ''}ก่อนเริ่มการประเมิน
              </span>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Practice History
 */
function renderPracticeHistory(history) {
  const container = document.getElementById('practiceHistorySection');
  if (!container) return;

  if (!history || history.length === 0) {
    container.innerHTML = `
      <div class="card practice-history-section">
        <div class="practice-history-header">
          <h3><span>📅</span> ประวัติการฝึกประสบการณ์วิชาชีพ</h3>
        </div>
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h3>ยังไม่มีประวัติการฝึก</h3>
          <p>กรุณากรอกข้อมูลสถานศึกษาและครูพี่เลี้ยงเพื่อเริ่มต้นการฝึก</p>
          <a href="/dashboard/school-info" class="btn btn--primary" style="margin-top:20px">
            เริ่มลงทะเบียน
          </a>
        </div>
      </div>
    `;
    return;
  }

  // สร้าง options สำหรับ selector
  const selectorOptions = history.map((record, idx) => `
    <option value="${record.id}">
      ${record.name} (ปี ${record.yearLevel})
      ${record.status === 'active' ? ' - ปัจจุบัน' : ''}
    </option>
  `).join('');

  // สร้าง timeline items
  const timelineItems = history.map(record => {
    const isActive = record.status === 'active' && record.studentStatus === 'active';
    const isCompleted = record.status === 'completed' || record.studentStatus === 'completed';

    return `
      <div class="timeline-item ${isActive ? 'timeline-active' : ''} ${isCompleted ? 'timeline-completed' : ''}">
        <div class="timeline-marker">
          ${isActive ? '<span>🟢</span>' : isCompleted ? '<span>✅</span>' : '<span>⏳</span>'}
        </div>
        <div class="timeline-content">
          <h4 class="timeline-title">
            ${record.name}
            <span class="year-tag">ชั้นปีที่ ${record.yearLevel}</span>
            ${isActive ? '<span class="current-tag">ปัจจุบัน</span>' : ''}
          </h4>
          <p class="timeline-date">
            📍 ${formatThaiDate(record.startDate)} - ${formatThaiDate(record.endDate)}
          </p>

          ${dashboardData.schoolInfo || dashboardData.mentorInfo ? `
            <div class="timeline-info-grid">
              ${dashboardData.schoolInfo ? `
                <div class="info-box">
                  <div class="info-box-header">
                    <span>🏫</span>
                    <strong>สถานศึกษา</strong>
                  </div>
                  <div class="info-box-value">${dashboardData.schoolInfo.name || '-'}</div>
                  <div class="info-box-sub">จ.${dashboardData.schoolInfo.province || '-'}</div>
                </div>
              ` : ''}
              ${dashboardData.mentorInfo ? `
                <div class="info-box">
                  <div class="info-box-header">
                    <span>👨‍🏫</span>
                    <strong>ครูพี่เลี้ยง</strong>
                  </div>
                  <div class="info-box-value">${dashboardData.mentorInfo.name || 'ยังไม่ระบุชื่อ'}</div>
                  <div class="info-box-sub">${dashboardData.mentorInfo.position || '-'}</div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${isCompleted && record.evaluationsCompleted > 0 ? `
            <div class="timeline-score-summary">
              <span style="color:var(--color-text);font-weight:600">📊 การประเมินที่เสร็จสิ้น:</span>
              <span style="font-size:1.3rem;font-weight:700;color:var(--color-success)">
                ${record.evaluationsCompleted}/9 รายการ
              </span>
            </div>
          ` : isActive ? `
            <div class="timeline-progress-info">
              <span>⚡</span>
              <span style="color:var(--color-text);font-weight:600">
                กำลังดำเนินการฝึกประสบการณ์... (${record.evaluationsCompleted}/9 รายการ)
              </span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card practice-history-section">
      <div class="practice-history-header">
        <h3><span>📅</span> ประวัติการฝึกประสบการณ์วิชาชีพ</h3>
        ${history.length > 1 ? `
          <select class="form-input filter-select" id="periodSelector" onchange="changePracticeView()">
            ${selectorOptions}
          </select>
        ` : ''}
      </div>
      <div class="practice-timeline">
        ${timelineItems}
      </div>
    </div>
  `;
}

/**
 * Render Evaluation Summary
 */
function renderEvaluationSummary(evaluations) {
  const container = document.getElementById('evaluationSummarySection');
  if (!container) return;

  if (!evaluations || evaluations.length === 0) {
    container.innerHTML = '';
    return;
  }

  // คำนวณคะแนนเฉลี่ย
  let totalScore = 0;
  let count = 0;
  
  evaluations.forEach(ev => {
    if (ev.score) {
      totalScore += ev.score;
      count++;
    }
  });

  const avgScore = count > 0 ? (totalScore / count).toFixed(2) : 0;
  const gradeText = getGradeText(avgScore);

  // สร้าง chart bars
  const chartBars = evaluations.map(ev => {
    const percentage = ev.total ? (ev.score / ev.total) * 100 : 0;
    const colorClass = getScoreColorClass(ev.score);

    return `
      <div class="chart-row">
        <div class="chart-row-header">
          <span class="chart-row-label">${ev.label || ev.title || 'รายการ'}</span>
          <span class="chart-row-score">${ev.score?.toFixed(1) || 0} / ${ev.total || 5}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill ${colorClass}" style="width:${percentage}%">
            <span>${percentage.toFixed(0)}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card evaluation-summary">
      <h3 style="margin-top:0;color:var(--color-text);display:flex;align-items:center;gap:10px">
        <span>📊</span>
        สรุปผลการประเมินโดยรวม
      </h3>
      <div class="evaluation-stats-grid">
        <div class="stat-box">
          <div class="stat-value">${avgScore}</div>
          <div class="stat-label">คะแนนเฉลี่ยโดยรวม</div>
          <div class="stat-grade">${gradeText}</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color:var(--color-success)">${evaluations.length}</div>
          <div class="stat-label">หัวข้อการประเมิน</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color:var(--color-secondary)">
            ${evaluations.filter(e => e.score >= 4.5).length}
          </div>
          <div class="stat-label">ด้านที่ได้คะแนนดีมาก</div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px">
      <h3 style="margin-top:0;color:var(--color-text);display:flex;align-items:center;gap:10px">
        <span>📈</span>
        กราฟแสดงผลการประเมินแต่ละด้าน
      </h3>
      <p style="margin:0 0 24px 0;font-size:0.9rem;color:var(--color-muted)">
        มาตรวัด: 1-1.99 (ปรับปรุง) | 2-2.99 (พอใช้) | 3-3.99 (ปานกลาง) | 4-4.49 (ดี) | 4.5-5 (ดีมาก)
      </p>
      <div class="evaluation-chart">
        ${chartBars}
      </div>
    </div>
  `;
}

/**
 * Render Lesson Plans (ปี 2-3 เท่านั้น)
 */
function renderLessonPlans(lessonPlans, canUpload) {
  const container = document.getElementById('lessonPlansSection');
  if (!container) return;

  // ถ้าไม่ใช่ปี 2-3 ไม่แสดงส่วนนี้
  if (!canUpload) {
    container.innerHTML = '';
    return;
  }

  const plansHtml = lessonPlans.length > 0 
    ? lessonPlans.map(plan => `
        <div class="lesson-plan-card">
          <h4 class="lesson-plan-title">${plan.title}</h4>
          <p class="lesson-plan-meta">
            📚 ${plan.subject} ${plan.grade ? `| 🎓 ${plan.grade}` : ''}
          </p>
          <span class="lesson-plan-status ${plan.status}">
            ${getStatusText(plan.status)}
          </span>
        </div>
      `).join('')
    : `
        <div class="empty-state" style="padding:40px">
          <div class="empty-state-icon">📄</div>
          <h3>ยังไม่มีแผนการสอน</h3>
          <p>เริ่มอัปโหลดแผนการสอนของคุณ</p>
        </div>
      `;

  container.innerHTML = `
    <div class="card lesson-plans-section">
      <div class="lesson-plans-header">
        <h3 style="margin:0;color:var(--color-text);display:flex;align-items:center;gap:10px">
          <span>📄</span>
          แผนการเรียนการสอน
        </h3>
        <button class="btn btn--primary btn--sm" onclick="openUploadLessonPlanModal()">
          + อัปโหลดแผนใหม่
        </button>
      </div>
      <div class="lesson-plans-grid">
        ${plansHtml}
      </div>
    </div>
  `;
}

/**
 * Render Stats Summary
 */
function renderStats(stats) {
  const container = document.getElementById('statsSection');
  if (!container) return;

  container.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0;margin-bottom:16px;color:var(--color-text)">สถิติ</h3>
      <div class="stats-summary-grid">
        <div class="stats-summary-item">
          <div class="stats-summary-value primary">${stats.totalObservations}</div>
          <div class="stats-summary-label">การสังเกตทั้งหมด</div>
        </div>
        <div class="stats-summary-item">
          <div class="stats-summary-value success">${stats.completedObservations}</div>
          <div class="stats-summary-label">สำเร็จแล้ว</div>
        </div>
        <div class="stats-summary-item">
          <div class="stats-summary-value secondary">${stats.totalEvaluations}</div>
          <div class="stats-summary-label">การประเมินทั้งหมด</div>
        </div>
        ${dashboardData.canUploadLessonPlan ? `
          <div class="stats-summary-item">
            <div class="stats-summary-value" style="color:#8B5CF6">${stats.totalLessonPlans}</div>
            <div class="stats-summary-label">แผนการสอน</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Helper: Format date to Thai format
 */
function formatThaiDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('th-TH', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    });
  } catch (e) {
    return dateStr;
  }
}

/**
 * Helper: Get grade text from score
 */
function getGradeText(score) {
  const s = parseFloat(score);
  if (s >= 4.5) return 'ดีมาก';
  if (s >= 4) return 'ดี';
  if (s >= 3.5) return 'ปานกลาง';
  if (s >= 3) return 'พอใช้';
  return 'ปรับปรุง';
}

/**
 * Helper: Get color class from score
 */
function getScoreColorClass(score) {
  const s = parseFloat(score) || 0;
  if (s >= 4.5) return 'score-excellent';
  if (s >= 4) return 'score-very-good';
  if (s >= 3.5) return 'score-good';
  if (s >= 3) return 'score-fair';
  return 'score-poor';
}

/**
 * Helper: Get status text
 */
function getStatusText(status) {
  switch (status) {
    case 'approved': return '✓ อนุมัติแล้ว';
    case 'rejected': return '✗ ไม่อนุมัติ';
    case 'pending': 
    default: return '⏳ รอตรวจสอบ';
  }
}

/**
 * Change practice view (when selector changes)
 */
function changePracticeView() {
  const selector = document.getElementById('periodSelector');
  if (!selector) return;
  
  const selectedId = selector.value;
  
  // Future: could highlight specific timeline item or load more details
}

/**
 * Open modal for uploading lesson plan
 */
function openUploadLessonPlanModal() {
  // ใช้ SweetAlert2 ถ้ามี หรือสร้าง modal เอง
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: 'อัปโหลดแผนการสอน',
      html: `
        <div style="text-align:left">
          <div class="form-group" style="margin-bottom:16px">
            <label style="display:block;margin-bottom:4px;font-weight:500">ชื่อแผนการสอน *</label>
            <input type="text" id="planTitle" class="swal2-input" style="width:100%;margin:0" placeholder="ระบุชื่อแผน">
          </div>
          <div class="form-group" style="margin-bottom:16px">
            <label style="display:block;margin-bottom:4px;font-weight:500">วิชา *</label>
            <input type="text" id="planSubject" class="swal2-input" style="width:100%;margin:0" placeholder="ระบุวิชา">
          </div>
          <div class="form-group" style="margin-bottom:16px">
            <label style="display:block;margin-bottom:4px;font-weight:500">ระดับชั้น</label>
            <input type="text" id="planGrade" class="swal2-input" style="width:100%;margin:0" placeholder="เช่น ป.1, ม.3">
          </div>
          <div class="form-group">
            <label style="display:block;margin-bottom:4px;font-weight:500">รายละเอียด</label>
            <textarea id="planDescription" class="swal2-textarea" style="width:100%;margin:0;min-height:80px" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"></textarea>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'บันทึก',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#2E3094',
      preConfirm: () => {
        const title = document.getElementById('planTitle').value;
        const subject = document.getElementById('planSubject').value;
        const grade = document.getElementById('planGrade').value;
        const description = document.getElementById('planDescription').value;

        if (!title || !subject) {
          Swal.showValidationMessage('กรุณากรอกชื่อแผนและวิชา');
          return false;
        }

        return { title, subject, grade, description };
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        await uploadLessonPlan(result.value);
      }
    });
  } else {
    alert('กรุณาใช้ปุ่มในหน้าแผนการสอนเพื่ออัปโหลด');
  }
}

/**
 * Upload lesson plan
 */
async function uploadLessonPlan(data) {
  try {
    const response = await fetch('/api/student/lesson-plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...data,
        observationId: dashboardData.activeObservation?.id || null
      })
    });

    const result = await response.json();

    if (result.success) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'success',
          title: 'สำเร็จ!',
          text: result.message,
          confirmButtonColor: '#2E3094'
        });
      }
      // Reload data
      loadStudentDashboard();
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Error uploading lesson plan:', error);
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: error.message,
        confirmButtonColor: '#2E3094'
      });
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', loadStudentDashboard);
