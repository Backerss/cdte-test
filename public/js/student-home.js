/**
 * ===============================================
 * STUDENT HOME DASHBOARD
 * ===============================================
 * 
 * ไฟล์: student-home.js
 * วัตถุประสงค์: JavaScript สำหรับหน้า Dashboard นักศึกษา
 * 
 * คุณสมบัติหลัก:
 * • ดึงข้อมูลจริงจาก Firebase ผ่าน API endpoints
 * • แสดงกราฟการประเมินหลายรูปแบบ (Pie, Radar, Progress bars)
 * • จัดการสีผ่าน CSS variables (ไม่ใช้ hardcoded colors)
 * • รองรับข้อมูลการประเมินที่ไม่เรียงลำดับ (non-sequential keys)
 * • แสดงประวัติการฝึก, สถิติ, และแผนการสอน
 * 
 * โครงสร้างโค้ด:
 * 1. Color System (ระบบสี)
 * 2. Global State & Initialization (สถานะและการเริ่มต้น)
 * 3. Main Rendering Functions (ฟังก์ชันแสดงผลหลัก)
 * 4. Chart Drawing Functions (ฟังก์ชันวาดกราฟ)
 * 5. Helper Functions (ฟังก์ชันช่วยงาน)
 * 6. Utility Functions (ฟังก์ชันอรรถประโยชน์)
 * 7. Event Handlers (ตัวจัดการเหตุการณ์)
 * 
 * การใช้งาน:
 * - เรียกใช้ loadStudentDashboard() เมื่อโหลดหน้าเว็บ
 * - ระบบจะดึงข้อมูลและแสดงผลอัตโนมัติ
 * 
 * ===============================================
 */

/**
 * ===============================================
 * ระบบสีที่ใช้ในการแสดงผล (COLOR SYSTEM)
 * ===============================================
 * ดึงค่าสีจาก colors.css เพื่อความสอดคล้องและง่ายต่อการบำรุงรักษา
 * หลีกเลี่ยงการใช้สี hardcode เพื่อป้องกันความไม่สอดคล้องและ bugs
 * 
 * หลักการ:
 * • ใช้ CSS custom properties (--color-*) แทน hex codes
 * • จัดกลุ่มสีตามการใช้งาน (primary, score-based, utilities)
 * • รองรับการเปลี่ยนธีมในอนาคต
 */
const CHART_COLORS = {
  // สีหลัก (Primary Colors)
  primary: 'var(--color-primary)',      // #2E3094 - สีหลัก (น้ำเงิน)
  secondary: 'var(--color-secondary)',  // #FBB425 - สีรอง (เหลือง)
  
  // สีสำหรับระดับคะแนน (Score-based Colors)
  success: 'var(--color-success)',      // #16A34A - สีเขียว (ดีเยี่ยม 4.5-5.0)
  successLight: '#22c55e',              // สีเขียวอ่อน (ดี 3.5-4.49)
  warning: 'var(--color-warning)',      // #F59E0B - สีเหลือง (พอใช้ 2.5-3.49)  
  warningLight: '#eab308',              // สีเหลืองอ่อน
  danger: 'var(--color-danger)',        // #DC2626 - สีแดง (ต้องปรับปรุง <2.5)
  dangerLight: '#ef4444',               // สีแดงอ่อน
  orange: '#f97316',                    // สีส้ม (กลาง)
  
  // สีพื้นฐาน (Base Colors)
  info: 'var(--color-info)',            // #3B82F6 - สีน้ำเงินอ่อน
  light: 'var(--color-light)',          // #F8FAFC - พื้นหลังอ่อน
  dark: 'var(--color-dark)',            // #1E293B - ข้อความเข้มม
  muted: '#6b7280',                     // สีเทา (ข้อความรอง)
  
  // สีพิเศษ (Special Use)  
  lime: '#84cc16',                      // สีเขียวมะนาว
  background: '#f3f4f6'                 // พื้นหลัง chart
};

/**
 * ===============================================
 * GLOBAL STATE & INITIALIZATION (สถานะและการเริ่มต้น)
 * ===============================================
 */

// ตัวแปรเก็บข้อมูล Dashboard ทั้งหมดที่ได้จาก API
let dashboardData = null;

/**
 * ฟังก์ชันหลักสำหรับโหลดข้อมูล Dashboard ทั้งหมด
 * @description เรียก API เพื่อดึงข้อมูลนักศึกษาและแสดงผลทุกส่วน
 * @async
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
    await renderEvaluationSummary(); // ใช้ฟังก์ชันใหม่ที่ดึงข้อมูลจาก API เอง
    renderLessonPlans(dashboardData.canUploadLessonPlan); // ดึงข้อมูลเองจาก API
    renderStats(dashboardData.stats);

    hideLoading();
  } catch (error) {
    console.error('Error loading student dashboard:', error);
    showError('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + error.message);
  }
}

/**
 * ===============================================
 * UI STATE MANAGEMENT (จัดการสถานะ UI)
 * ===============================================
 */

/**
 * แสดงสถานะการโหลด
 * @description แสดง loading spinner และข้อความรอ
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
 * ซ่อนสถานะการโหลด
 * @description ล้าง loading state เพื่อให้ส่วนอื่นแสดงแทน
 */
function hideLoading() {
  const container = document.getElementById('studentDashboardContent');
  if (container) {
    container.innerHTML = '';
  }
}

/**
 * แสดงข้อผิดพลาด
 * @param {string} message - ข้อความผิดพลาดที่จะแสดง
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
 * ===============================================
 * MAIN RENDERING FUNCTIONS (ฟังก์ชันแสดงผลหลัก)
 * ===============================================
 */

/**
 * แสดงส่วนทักทาย (Greeting Section)
 * @param {Object} user - ข้อมูลผู้ใช้
 * @description แสดงชื่อ, ปีการศึกษา, และสถานะการฝึกงาน
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
            <div style="width:${progressPercentage}%;height:100%;background:${CHART_COLORS.success};transition:width 0.5s ease;"></div>
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
                <span style="background:rgba(22,163,74,0.2);color:${CHART_COLORS.success};padding:4px 12px;border-radius:6px;font-size:0.75rem;font-weight:600;">
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
              <div style="display:flex;align-items:center;gap:8px;color:${CHART_COLORS.success};">
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
 * ดึงข้อมูลการประเมินจาก API และแสดงเป็นกราฟหลายรูปแบบ
 */
async function renderEvaluationSummary() {
  const container = document.getElementById('evaluationSummarySection');
  if (!container) return;

  try {
    // ดึงข้อมูลการประเมินจาก API
    const activeObsId = dashboardData?.activeObservation?.id;
    const apiUrl = activeObsId 
      ? `/api/student/evaluation-summary?observationId=${activeObsId}`
      : '/api/student/evaluation-summary';
    
    console.log('Fetching evaluation data from:', apiUrl); // Debug log
    const response = await fetch(apiUrl);
    const result = await response.json();
    console.log('Evaluation data received:', result); // Debug log

    if (!result.success) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:40px;color:var(--color-muted);">
          <div style="font-size:3rem;margin-bottom:16px;">❌</div>
          <p>เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
          <p style="font-size:0.9rem;">${result.message || 'โปรดลองใหม่อีกครั้ง'}</p>
        </div>
      `;
      return;
    }

    if (!result.hasData) {
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:40px;color:var(--color-muted);">
          <div style="font-size:3rem;margin-bottom:16px;">📝</div>
          <h3 style="margin:0 0 12px 0;">ยังไม่มีข้อมูลการประเมิน</h3>
          <p style="margin:0 0 24px 0;">เริ่มทำแบบประเมินเพื่อดูผลการวิเคราะห์</p>
          <a href="/dashboard/evaluation" class="btn btn--primary">
            เริ่มประเมิน →
          </a>
        </div>
      `;
      return;
    }

    const summary = result.summary;
    const evaluations = summary.evaluationsByTopic || [];
    const scoreDistribution = summary.scoreDistribution || {};
    
    // คำนวณสถิติ
    const avgScore = summary.averageScore || 0;
    const gradeText = summary.gradeText || 'ยังไม่มีข้อมูล';
    const totalCompleted = summary.completedEvaluations || 0;
    const totalPossible = summary.totalEvaluations || 9;
    
    // สร้างกราฟต่างๆ
    const pieChartHTML = drawEvaluationPieChart(scoreDistribution);
    const radarChartHTML = drawRadarChart(evaluations);
    const progressBarsHTML = drawProgressBars(evaluations);
    const weeklyProgressHTML = drawWeeklyProgress(summary.weeklyProgress || {});

    container.innerHTML = `
      <div class="card evaluation-summary">
        <h3 style="margin-top:0;color:var(--color-text);display:flex;align-items:center;gap:10px">
          <span>📊</span>
          สรุปผลการประเมินโดยรวม
        </h3>
        <div class="evaluation-stats-grid">
          <div class="stat-box">
            <div class="stat-value">${avgScore.toFixed(2)}</div>
            <div class="stat-label">คะแนนเฉลี่ยโดยรวม</div>
            <div class="stat-grade">${gradeText}</div>
          </div>
          <div class="stat-box">
            <div class="stat-value" style="color:var(--color-success)">${totalCompleted}</div>
            <div class="stat-label">การประเมินที่เสร็จสิ้น</div>
            <div class="stat-subtext">จาก ${totalPossible} หัวข้อ (${summary.completionRate || 0}%)</div>
          </div>
          <div class="stat-box">
            <div class="stat-value" style="color:var(--color-secondary)">
              ${scoreDistribution.excellent || 0}
            </div>
            <div class="stat-label">ด้านที่ได้คะแนนดีเยี่ยม</div>
            <div class="stat-subtext">4.5+ คะแนน</div>
          </div>
          <div class="stat-box">
            <div class="stat-value" style="color:var(--color-warning)">
              ${scoreDistribution.needsImprovement || 0}
            </div>
            <div class="stat-label">ด้านที่ต้องพัฒนา</div>
            <div class="stat-subtext">ต่ำกว่า 2.5 คะแนน</div>
          </div>
        </div>
      </div>

      <!-- กราฟวิเคราะห์แบบต่างๆ -->
      <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:24px;margin-bottom:24px;">
        <!-- กราฟวงกลม (Pie Chart) -->
        <div class="chart-card">
          <h4 class="chart-title">
            <span>🥧</span>
            สัดส่วนระดับคะแนน
          </h4>
          <div style="padding:20px;">
            ${pieChartHTML}
          </div>
          <div class="chart-legend" style="padding:0 20px 20px;">
            <div class="legend-item"><span class="legend-color" style="background:${CHART_COLORS.success};"></span>ดีเยี่ยม (4.5+)</div>
            <div class="legend-item"><span class="legend-color" style="background:${CHART_COLORS.successLight};"></span>ดี (3.5-4.49)</div>
            <div class="legend-item"><span class="legend-color" style="background:${CHART_COLORS.warningLight};"></span>พอใช้ (2.5-3.49)</div>
            <div class="legend-item"><span class="legend-color" style="background:${CHART_COLORS.dangerLight};"></span>ต้องปรับปรุง (<2.5)</div>
          </div>
        </div>

        <!-- Radar Chart -->
        <div class="chart-card">
          <h4 class="chart-title">
            <span>🎯</span>
            ภาพรวมคะแนนทุกด้าน
          </h4>
          <div style="padding:20px;">
            ${radarChartHTML}
          </div>
        </div>
      </div>

      <!-- ความคืบหน้ารายสัปดาห์ -->
      <div class="chart-card" style="margin-bottom:24px;">
        <h4 class="chart-title">
          <span>📅</span>
          ความคืบหน้ารายสัปดาห์
        </h4>
        <div style="padding:20px;">
          ${weeklyProgressHTML}
        </div>
      </div>

      <!-- กราฟแท่งแนวนอน (Progress Bars) -->
      <div class="chart-card">
        <h4 class="chart-title">
          <span>📊</span>
          ผลการประเมินแต่ละหัวข้อ
        </h4>
        <p style="margin:16px 20px 24px;font-size:0.9rem;color:var(--color-muted)">
          มาตรวัด: 1-1.99 (ปรับปรุง) | 2-2.99 (พอใช้) | 3-3.99 (ดี) | 4-4.49 (ดีมาก) | 4.5-5 (ดีเยี่ยม)
        </p>
        <div style="padding:0 20px 20px;">
          ${progressBarsHTML}
        </div>
      </div>

      <!-- สรุปการวิเคราะห์ -->
      ${generateAnalysisSummary(evaluations, scoreDistribution)}
    `;

  } catch (error) {
    console.error('Error rendering evaluation summary:', error);
    container.innerHTML = `
      <div class="card" style="text-align:center;padding:40px;color:var(--color-muted);">
        <div style="font-size:3rem;margin-bottom:16px;">⚠️</div>
        <p>เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
        <p style="font-size:0.9rem;">กรุณาลองรีเฟรชหน้าใหม่</p>
      </div>
    `;
  }
}

/**
 * Draw Evaluation Pie Chart
 */
function drawEvaluationPieChart(excellent, good, fair, needImprove) {
  const total = excellent + good + fair + needImprove;
  if (total === 0) return '<div style="color:#6b7280;text-align:center;padding:40px;">ไม่มีข้อมูล</div>';

  const excellentPercent = (excellent / total) * 100;
  const goodPercent = (good / total) * 100;
  const fairPercent = (fair / total) * 100;
  const needImprovePercent = (needImprove / total) * 100;

  // Calculate angles
  const excellentDeg = (excellentPercent / 100) * 360;
  const goodDeg = excellentDeg + (goodPercent / 100) * 360;
  const fairDeg = goodDeg + (fairPercent / 100) * 360;

  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:20px;">
      <div style="position:relative;width:200px;height:200px;">
        <div style="
          width:100%;
          height:100%;
          border-radius:50%;
          background:conic-gradient(
            ${CHART_COLORS.success} 0deg ${excellentDeg}deg,
            ${CHART_COLORS.successLight} ${excellentDeg}deg ${goodDeg}deg,
            ${CHART_COLORS.warningLight} ${goodDeg}deg ${fairDeg}deg,
            ${CHART_COLORS.orange} ${fairDeg}deg 360deg
          );
          box-shadow:0 4px 12px rgba(0,0,0,0.1);
        "></div>
        <div style="
          position:absolute;
          top:50%;
          left:50%;
          transform:translate(-50%, -50%);
          background:white;
          border-radius:50%;
          width:120px;
          height:120px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,0.1);
        ">
          <div style="font-size:2rem;font-weight:700;color:#1f2937;">${total}</div>
          <div style="font-size:0.85rem;color:#6b7280;">ด้านประเมิน</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;">
        ${excellent > 0 ? `
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:16px;height:16px;background:${CHART_COLORS.success};border-radius:4px;"></div>
            <div>
              <div style="font-size:0.75rem;color:${CHART_COLORS.muted};">ดีมาก</div>
              <div style="font-size:0.95rem;font-weight:700;color:${CHART_COLORS.success};">${excellent} (${excellentPercent.toFixed(0)}%)</div>
            </div>
          </div>
        ` : ''}
        ${good > 0 ? `
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:16px;height:16px;background:${CHART_COLORS.successLight};border-radius:4px;"></div>
            <div>
              <div style="font-size:0.75rem;color:${CHART_COLORS.muted};">ดี</div>
              <div style="font-size:0.95rem;font-weight:700;color:${CHART_COLORS.successLight};">${good} (${goodPercent.toFixed(0)}%)</div>
            </div>
          </div>
        ` : ''}
        ${fair > 0 ? `
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:16px;height:16px;background:#eab308;border-radius:4px;"></div>
            <div>
              <div style="font-size:0.75rem;color:#6b7280;">ปานกลาง</div>
              <div style="font-size:0.95rem;font-weight:700;color:#eab308;">${fair} (${fairPercent.toFixed(0)}%)</div>
            </div>
          </div>
        ` : ''}
        ${needImprove > 0 ? `
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:16px;height:16px;background:#f97316;border-radius:4px;"></div>
            <div>
              <div style="font-size:0.75rem;color:#6b7280;">ต้องพัฒนา</div>
              <div style="font-size:0.95rem;font-weight:700;color:#f97316;">${needImprove} (${needImprovePercent.toFixed(0)}%)</div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Draw Enhanced Pie Chart with Score Distribution
 */
function drawEvaluationPieChart(scoreDistribution) {
  const { excellent = 0, good = 0, fair = 0, needsImprovement = 0 } = scoreDistribution;
  const total = excellent + good + fair + needsImprovement;
  
  if (total === 0) {
    return '<div style="color:#6b7280;text-align:center;padding:40px;">ไม่มีข้อมูล</div>';
  }

  const excellentPercent = (excellent / total) * 100;
  const goodPercent = (good / total) * 100;
  const fairPercent = (fair / total) * 100;
  const needImprovePercent = (needsImprovement / total) * 100;

  // Calculate angles for conic-gradient
  const excellentDeg = (excellentPercent / 100) * 360;
  const goodDeg = excellentDeg + (goodPercent / 100) * 360;
  const fairDeg = goodDeg + (fairPercent / 100) * 360;

  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:20px;">
      <div style="position:relative;width:200px;height:200px;">
        <div style="
          width:100%;
          height:100%;
          border-radius:50%;
          background:conic-gradient(
            ${CHART_COLORS.success} 0deg ${excellentDeg}deg,
            ${CHART_COLORS.successLight} ${excellentDeg}deg ${goodDeg}deg,
            #eab308 ${goodDeg}deg ${fairDeg}deg,
            #ef4444 ${fairDeg}deg 360deg
          );
          box-shadow:0 4px 12px rgba(0,0,0,0.15);
        "></div>
        <div style="
          position:absolute;
          top:50%;
          left:50%;
          transform:translate(-50%, -50%);
          background:white;
          border-radius:50%;
          width:120px;
          height:120px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,0.1);
        ">
          <div style="font-size:2rem;font-weight:700;color:#1f2937;">${total}</div>
          <div style="font-size:0.85rem;color:#6b7280;">หัวข้อ</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:16px;height:16px;background:#16A34A;border-radius:4px;"></div>
          <div>
            <div style="font-size:0.75rem;color:#6b7280;">ดีเยี่ยม</div>
            <div style="font-size:0.95rem;font-weight:700;color:#16A34A;">${excellent} (${excellentPercent.toFixed(0)}%)</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:16px;height:16px;background:#22c55e;border-radius:4px;"></div>
          <div>
            <div style="font-size:0.75rem;color:#6b7280;">ดี</div>
            <div style="font-size:0.95rem;font-weight:700;color:#22c55e;">${good} (${goodPercent.toFixed(0)}%)</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:16px;height:16px;background:#eab308;border-radius:4px;"></div>
          <div>
            <div style="font-size:0.75rem;color:#6b7280;">พอใช้</div>
            <div style="font-size:0.95rem;font-weight:700;color:#eab308;">${fair} (${fairPercent.toFixed(0)}%)</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:16px;height:16px;background:${CHART_COLORS.dangerLight};border-radius:4px;"></div>
          <div>
            <div style="font-size:0.75rem;color:${CHART_COLORS.muted};">ต้องปรับปรุง</div>
            <div style="font-size:0.95rem;font-weight:700;color:${CHART_COLORS.dangerLight};">${needsImprovement} (${needImprovePercent.toFixed(0)}%)</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * ===============================================
 * วาดกราฟเรดาร์ (Radar Chart - Vertical Bars)
 * ===============================================
 * แสดงคะแนนการประเมินในรูปแบบแถบแนวตั้ง เพื่อให้อ่านง่ายและเปรียบเทียบได้
 * @param {Array} evaluations - ข้อมูลการประเมินที่จะแสดง
 * @returns {string} HTML สำหรับกราฟ
 */
function drawRadarChart(evaluations) {
  if (!evaluations || evaluations.length === 0) {
    return `<div style="color:${CHART_COLORS.muted};text-align:center;padding:40px;">ไม่มีข้อมูล</div>`;
  }

  /**
   * สร้างแถบแสดงคะแนนแต่ละหัวข้อแบบ vertical bars
   * จำกัดเฉพาะ 6 หัวข้อแรก เพื่อไม่ให้กราฟแอนเกินไป
   */
  const maxScore = 5;  // คะแนนสูงสุด
  const bars = evaluations.slice(0, 6).map((ev, idx) => {
    const score = typeof ev.score === 'number' ? ev.score : (parseFloat(ev.score) || 0);
    const percentage = Math.max(0, Math.min(100, (score / maxScore) * 100));
    
    // กำหนดสีตามระดับคะแนน - ใช้ CHART_COLORS
    let barColor = CHART_COLORS.dangerLight;     // คะแนนต่ำ (<2)
    if (score >= 4.5) {
      barColor = CHART_COLORS.success;           // ดีเยี่ยม (4.5+)
    } else if (score >= 4) {
      barColor = CHART_COLORS.successLight;      // ดีมาก (4.0-4.49)
    } else if (score >= 3.5) {
      barColor = CHART_COLORS.lime;              // ดี (3.5-3.99)
    } else if (score >= 3) {
      barColor = CHART_COLORS.warningLight;      // พอใช้ (3.0-3.49)
    } else if (score >= 2) {
      barColor = CHART_COLORS.orange;            // ปรับปรุง (2.0-2.99)
    }

    const labelText = (ev.topic || ev.label || ev.title || 'รายการ').toString();

    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;">
        <div style="font-size:1.3rem;font-weight:700;color:${barColor};">${score.toFixed(1)}</div>
        <div style="width:100%;height:150px;background:${CHART_COLORS.background};border-radius:8px;position:relative;overflow:hidden;">
          <div style="
            position:absolute;
            bottom:0;
            width:100%;
            height:${percentage}%;
            background:linear-gradient(180deg, ${barColor}, ${barColor}dd);
            transition:height 0.8s ease;
            border-radius:8px 8px 0 0;
          "></div>
          <div style="
            position:absolute;
            top:50%;
            left:50%;
            transform:translate(-50%, -50%);
            font-size:0.8rem;
            font-weight:600;
            color:white;
            text-shadow:1px 1px 2px rgba(0,0,0,0.5);
          ">${percentage.toFixed(0)}%</div>
        </div>
        <div style="font-size:0.75rem;color:${CHART_COLORS.muted};text-align:center;line-height:1.2;max-width:80px;">
          ${labelText.substring(0, 12)}${labelText.length > 12 ? '...' : ''}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="display:flex;gap:12px;align-items:flex-end;padding:20px 0;">
      ${bars}
    </div>
    <div style="text-align:center;margin-top:16px;font-size:0.8rem;color:${CHART_COLORS.muted};">
      แสดงเฉพาะ ${Math.min(evaluations.length, 6)} หัวข้อแรก
    </div>
  `;
}

/**
 * ===============================================
 * วาดแถบความคืบหน้า (Horizontal Progress Bars)
 * ===============================================
 * แสดงคะแนนการประเมินแต่ละหัวข้อในรูปแบบแถบความคืบหน้า
 * พร้อมรายละเอียดและคะแนนของแต่ละหัวข้อ
 * @param {Array} evaluations - ข้อมูลการประเมินที่จะแสดง
 * @returns {string} HTML สำหรับแถบความคืบหน้า
 */
function drawProgressBars(evaluations) {
  if (!evaluations || evaluations.length === 0) {
    return `<div style="color:${CHART_COLORS.muted};text-align:center;padding:40px;">ไม่มีข้อมูล</div>`;
  }

  return evaluations.map((ev, idx) => {
    const score = typeof ev.score === 'number' ? ev.score : (parseFloat(ev.score) || 0);
    const percentage = (score / 5) * 100;  // แปลงคะแนนเป็นเปอร์เซ็นต์
    
    // กำหนดสีตามระดับคะแนน - ใช้ CHART_COLORS
    let barColor = CHART_COLORS.dangerLight;     // คะแนนต่ำ (<2)
    if (score >= 4.5) {
      barColor = CHART_COLORS.success;           // ดีเยี่ยม (4.5+)
    } else if (score >= 4) {
      barColor = CHART_COLORS.successLight;      // ดีมาก (4.0-4.49)
    } else if (score >= 3.5) {
      barColor = CHART_COLORS.lime;              // ดี (3.5-3.99)
    } else if (score >= 3) {
      barColor = CHART_COLORS.warningLight;      // พอใช้ (3.0-3.49)
    } else if (score >= 2) {
      barColor = CHART_COLORS.orange;            // ปรับปรุง (2.0-2.99)
    }

    const topicName = ev.topic || `การประเมินครั้งที่ ${ev.topicNumber || idx + 1}`;
    const gradeText = getGradeText(score);
    const weekText = ev.week ? `สัปดาห์ที่ ${ev.week}` : '';
    const totalQuestions = ev.totalQuestions || 'N/A';

    return `
      <div class="progress-bar-row" style="margin-bottom:${idx < evaluations.length - 1 ? '24px' : '0'};">
        <div class="progress-bar-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div>
            <span class="progress-bar-label" style="font-weight:600;color:var(--color-text);font-size:0.95rem;">
              ${topicName}
            </span>
            <div style="font-size:0.8rem;color:var(--color-muted);margin-top:2px;">
              ${weekText} • ${totalQuestions} คำถาม
              ${ev.originalNumber ? ` (เดิม #${ev.originalNumber})` : ''}
            </div>
          </div>
          <span class="progress-bar-score" style="color:${barColor};font-weight:700;font-size:1.1rem;">
            ${score.toFixed(1)} / 5.0
          </span>
        </div>
        <div class="progress-bar-wrapper" style="width:100%;height:24px;background:${CHART_COLORS.background};border-radius:12px;overflow:hidden;position:relative;">
          <div class="progress-bar-fill" style="
            width:${percentage}%;
            height:100%;
            background:linear-gradient(90deg, ${barColor}, ${barColor}aa);
            transition:width 0.8s ease;
            border-radius:12px;
            position:relative;
          ">
            <div style="
              position:absolute;
              right:8px;
              top:50%;
              transform:translateY(-50%);
              color:white;
              font-size:0.75rem;
              font-weight:600;
              text-shadow:1px 1px 2px rgba(0,0,0,0.5);
            ">${percentage.toFixed(0)}%</div>
          </div>
        </div>
        <div class="progress-bar-grade" style="text-align:right;margin-top:4px;font-size:0.8rem;color:${barColor};font-weight:500;">
          ${gradeText}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Draw Weekly Progress Chart
 */
function drawWeeklyProgress(weeklyData) {
  const week1 = weeklyData.week1 || 0;
  const week2 = weeklyData.week2 || 0;
  const week3 = weeklyData.week3 || 0;
  const maxValue = Math.max(week1, week2, week3, 3); // min scale = 3

  return `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">
      <div class="week-progress-item" style="text-align:center;">
        <div style="font-size:1.5rem;font-weight:700;color:#3b82f6;margin-bottom:8px;">${week1}</div>
        <div style="height:120px;background:#f3f4f6;border-radius:8px;position:relative;overflow:hidden;margin-bottom:12px;">
          <div style="
            position:absolute;
            bottom:0;
            width:100%;
            height:${(week1 / maxValue) * 100}%;
            background:linear-gradient(180deg, #3b82f6, #60a5fa);
            transition:height 0.8s ease;
            border-radius:8px 8px 0 0;
          "></div>
        </div>
        <div style="font-weight:600;color:#1f2937;margin-bottom:4px;">สัปดาห์ที่ 1</div>
        <div style="font-size:0.8rem;color:#6b7280;">การประเมิน</div>
      </div>
      
      <div class="week-progress-item" style="text-align:center;">
        <div style="font-size:1.5rem;font-weight:700;color:#10b981;margin-bottom:8px;">${week2}</div>
        <div style="height:120px;background:#f3f4f6;border-radius:8px;position:relative;overflow:hidden;margin-bottom:12px;">
          <div style="
            position:absolute;
            bottom:0;
            width:100%;
            height:${(week2 / maxValue) * 100}%;
            background:linear-gradient(180deg, #10b981, #34d399);
            transition:height 0.8s ease;
            border-radius:8px 8px 0 0;
          "></div>
        </div>
        <div style="font-weight:600;color:#1f2937;margin-bottom:4px;">สัปดาห์ที่ 2</div>
        <div style="font-size:0.8rem;color:#6b7280;">การประเมิน</div>
      </div>
      
      <div class="week-progress-item" style="text-align:center;">
        <div style="font-size:1.5rem;font-weight:700;color:#f59e0b;margin-bottom:8px;">${week3}</div>
        <div style="height:120px;background:#f3f4f6;border-radius:8px;position:relative;overflow:hidden;margin-bottom:12px;">
          <div style="
            position:absolute;
            bottom:0;
            width:100%;
            height:${(week3 / maxValue) * 100}%;
            background:linear-gradient(180deg, #f59e0b, #fbbf24);
            transition:height 0.8s ease;
            border-radius:8px 8px 0 0;
          "></div>
        </div>
        <div style="font-weight:600;color:#1f2937;margin-bottom:4px;">สัปดาห์ที่ 3</div>
        <div style="font-size:0.8rem;color:#6b7280;">การประเมิน</div>
      </div>
    </div>
  `;
}

/**
 * ===============================================
 * สร้างสรุปการวิเคราะห์ผลการประเมิน (ANALYSIS SUMMARY)
 * ===============================================
 * แสดงจุดแข็งและจุดที่ควรพัฒนา พร้อมสถิติและข้อเสนอแนะ
 * @param {Array} evaluations - ข้อมูลการประเมินทั้งหมด
 * @param {Object} scoreDistribution - การกระจายของคะแนน
 * @returns {string} HTML สำหรับการวิเคราะห์
 */
function generateAnalysisSummary(evaluations, scoreDistribution) {
  const total = scoreDistribution.excellent + scoreDistribution.good + scoreDistribution.fair + scoreDistribution.needsImprovement;
  const excellentPercentage = total > 0 ? (scoreDistribution.excellent / total) * 100 : 0;
  const needImprovementPercentage = total > 0 ? (scoreDistribution.needsImprovement / total) * 100 : 0;
  
  // หาหัวข้อที่ได้คะแนนสูงสุด (จุดแข็ง)
  const topScorers = evaluations
    .filter(ev => ev.score >= 4.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
    
  // หาหัวข้อที่ควรปรับปรุง (จุดอ่อน)
  const needImprovement = evaluations
    .filter(ev => ev.score < 2.5)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px;">
      ${topScorers.length > 0 ? `
        <div class="chart-card" style="border-left:4px solid ${CHART_COLORS.success};">
          <h4 class="chart-title" style="color:${CHART_COLORS.success};">
            <span>🌟</span>
            จุดแข็ง (${excellentPercentage.toFixed(0)}% ของทั้งหมด)
          </h4>
          <div style="padding:20px;">
            ${topScorers.map(ev => `
              <div style="padding:12px;background:rgba(22,163,74,0.1);border-radius:8px;margin-bottom:12px;border:1px solid ${CHART_COLORS.successLight};">
                <div style="font-weight:600;color:${CHART_COLORS.success};margin-bottom:4px;">${ev.topic}</div>
                <div style="font-size:1.2rem;font-weight:700;color:${CHART_COLORS.success};">${ev.score.toFixed(1)} / 5.0</div>
                <div style="font-size:0.8rem;color:${CHART_COLORS.success};margin-top:4px;">คะแนนดีเยี่ยม ควรคงความเป็นเลิศ</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      ${needImprovement.length > 0 ? `
        <div class="chart-card" style="border-left:4px solid ${CHART_COLORS.dangerLight};">
          <h4 class="chart-title" style="color:${CHART_COLORS.dangerLight};">
            <span>📈</span>
            จุดพัฒนา (${needImprovementPercentage.toFixed(0)}% ของทั้งหมด)
          </h4>
          <div style="padding:20px;">
            ${needImprovement.map(ev => `
              <div style="padding:12px;background:rgba(239,68,68,0.1);border-radius:8px;margin-bottom:12px;border:1px solid ${CHART_COLORS.dangerLight};">
                <div style="font-weight:600;color:${CHART_COLORS.dangerLight};margin-bottom:4px;">${ev.topic}</div>
                <div style="font-size:1.2rem;font-weight:700;color:${CHART_COLORS.dangerLight};">${ev.score.toFixed(1)} / 5.0</div>
                <div style="font-size:0.8rem;color:${CHART_COLORS.danger};margin-top:4px;">ต้องปรับปรุง ควรให้ความสำคัญเป็นพิเศษ</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Open PDF Viewer Modal
 */
function openPDFViewer(fileUrl, fileName) {
  const modal = document.createElement('div');
  modal.id = 'pdfViewerModal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  `;

  const isPDF = fileUrl.toLowerCase().endsWith('.pdf');

  modal.innerHTML = `
    <div style="background:white;border-radius:12px;width:100%;max-width:1200px;height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="padding:20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h3 style="margin:0;font-size:1.2rem;color:#1f2937;">${fileName}</h3>
          <p style="margin:4px 0 0 0;font-size:0.85rem;color:#6b7280;">แผนการจัดการเรียนรู้</p>
        </div>
        <button onclick="closePDFViewer()" style="background:#ef4444;color:white;border:none;border-radius:8px;padding:10px 20px;cursor:pointer;font-weight:600;font-size:0.9rem;transition:background 0.2s;" onmouseover="this.style.background='#dc2626'" onmouseout="this.style.background='#ef4444'">
          ✕ ปิด
        </button>
      </div>
      <div style="flex:1;overflow:hidden;position:relative;background:#f9fafb;">
        ${isPDF ? `
          <iframe src="${fileUrl}" style="width:100%;height:100%;border:none;"></iframe>
        ` : `
          <div style="height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:40px;">
            <div style="font-size:4rem;margin-bottom:20px;">📄</div>
            <h3 style="margin:0 0 12px 0;color:#1f2937;">ไม่สามารถแสดงตัวอย่างได้</h3>
            <p style="margin:0 0 24px 0;color:#6b7280;text-align:center;">ไฟล์นี้ไม่ใช่ PDF กรุณาดาวน์โหลดเพื่อเปิดด้วยโปรแกรมที่เหมาะสม</p>
            <a href="${fileUrl}" download="${fileName}" style="background:#3b82f6;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">
              📥 ดาวน์โหลดไฟล์
            </a>
          </div>
        `}
      </div>
      <div style="padding:16px;border-top:1px solid #e5e7eb;background:#f9fafb;border-radius:0 0 12px 12px;text-align:center;">
        <a href="${fileUrl}" download="${fileName}" style="color:#3b82f6;text-decoration:none;font-weight:600;font-size:0.9rem;">
          📥 ดาวน์โหลดไฟล์
        </a>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closePDFViewer();
    }
  });
}

/**
 * Close PDF Viewer Modal
 */
function closePDFViewer() {
  const modal = document.getElementById('pdfViewerModal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = '';
  }
}

/**
 * Draw Pie Chart for Lesson Plans
 */
function drawLessonPlanPieChart(submitted, pending) {
  const total = submitted + pending;
  if (total === 0) return '<div style="color:#6b7280;text-align:center;padding:40px;">ไม่มีข้อมูล</div>';

  const submittedPercent = (submitted / total) * 100;
  const pendingPercent = (pending / total) * 100;

  // Calculate angles for pie chart (using conic-gradient)
  const submittedDeg = (submittedPercent / 100) * 360;

  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:20px;">
      <div style="position:relative;width:200px;height:200px;">
        <div style="
          width:100%;
          height:100%;
          border-radius:50%;
          background:conic-gradient(
            #16A34A 0deg ${submittedDeg}deg,
            #FBB425 ${submittedDeg}deg 360deg
          );
          box-shadow:0 4px 12px rgba(0,0,0,0.1);
        "></div>
        <div style="
          position:absolute;
          top:50%;
          left:50%;
          transform:translate(-50%, -50%);
          background:white;
          border-radius:50%;
          width:120px;
          height:120px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          box-shadow:0 2px 8px rgba(0,0,0,0.1);
        ">
          <div style="font-size:2rem;font-weight:700;color:#1f2937;">${total}</div>
          <div style="font-size:0.85rem;color:#6b7280;">งวดทั้งหมด</div>
        </div>
      </div>
      <div style="display:flex;gap:24px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:16px;height:16px;background:#16A34A;border-radius:4px;"></div>
          <div>
            <div style="font-size:0.85rem;color:#6b7280;">ส่งแล้ว</div>
            <div style="font-size:1.1rem;font-weight:700;color:#16A34A;">${submitted} (${submittedPercent.toFixed(0)}%)</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:16px;height:16px;background:#FBB425;border-radius:4px;"></div>
          <div>
            <div style="font-size:0.85rem;color:#6b7280;">รอส่ง</div>
            <div style="font-size:1.1rem;font-weight:700;color:#FBB425;">${pending} (${pendingPercent.toFixed(0)}%)</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render Lesson Plans (ปี 2-3 เท่านั้น)
 * แสดงรายการแผนการสอนที่ส่งแล้ว (ไม่มีกราฟ แค่แสดงสถานะและดูไฟล์)
 */
async function renderLessonPlans(canUpload) {
  const container = document.getElementById('lessonPlansSection');
  if (!container) return;

  // ถ้าไม่ใช่ปี 2-3 ไม่แสดงส่วนนี้
  if (!canUpload) {
    container.innerHTML = '';
    return;
  }

  // แสดง loading
  container.innerHTML = `
    <div class="card lesson-plans-section">
      <h3 style="margin:0 0 20px 0;color:var(--color-text);display:flex;align-items:center;gap:10px">
        <span>📄</span>
        แผนการจัดการเรียนรู้
      </h3>
      <div style="text-align:center;padding:40px;">
        <div class="loading-spinner" style="margin:0 auto 16px;"></div>
        <p style="color:var(--color-muted);">กำลังโหลดข้อมูล...</p>
      </div>
    </div>
  `;

  try {
    // เรียก API ดึงสถิติแผนการสอน
    const response = await fetch('/api/evaluation/lesson-plan-stats');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'ไม่สามารถโหลดข้อมูลได้');
    }

    const stats = result.stats;
    const byObservation = stats.byObservation || [];
    const submissionRate = stats.submissionRate || 0;

    // สร้าง HTML แบบเรียบง่าย - ไม่มีกราฟ
    const hasData = byObservation.length > 0;

    container.innerHTML = `
      <div class="card lesson-plans-section">
        <div class="lesson-plans-header">
          <h3 style="margin:0;color:var(--color-text);display:flex;align-items:center;gap:10px">
            <span>📄</span>
            แผนการจัดการเรียนรู้
          </h3>
          <a href="/dashboard/evaluation" class="btn btn--primary btn--sm">
            ส่งแผนการสอน →
          </a>
        </div>

        ${hasData ? `
          <!-- สถิติสรุป -->
          <div style="background:var(--color-bg);padding:20px;border-radius:10px;margin:20px 0;display:flex;justify-content:space-around;align-items:center;">
            <div style="text-align:center;">
              <div style="font-size:2rem;font-weight:700;color:var(--color-primary);">${stats.total}</div>
              <div style="font-size:0.9rem;color:var(--color-muted);">งวดทั้งหมด</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:2rem;font-weight:700;color:var(--color-success);">${stats.submitted}</div>
              <div style="font-size:0.9rem;color:var(--color-muted);">ส่งแล้ว</div>
            </div>
            <div style="text-align:center;">
              <div style="font-size:2rem;font-weight:700;color:var(--color-warning);">${stats.pending}</div>
              <div style="font-size:0.9rem;color:var(--color-muted);">รอส่ง</div>
            </div>
          </div>

          <!-- รายการแผนการสอน -->
          ${stats.submitted > 0 ? `
            <div style="background:var(--color-surface);padding:20px;border-radius:10px;border:1px solid var(--color-border);">
              <h4 style="margin:0 0 16px 0;font-size:1rem;color:var(--color-text);display:flex;align-items:center;gap:8px;">
                <span>📚</span>
                แผนการสอนที่ส่งแล้ว
              </h4>
              <div class="lesson-plans-list">
                ${byObservation.filter(obs => obs.submitted).map(obs => `
                  <div style="padding:16px;background:white;border-radius:8px;margin-bottom:12px;border:1px solid var(--color-border);cursor:pointer;transition:all 0.2s ease;" 
                       onclick="openPDFViewer('${obs.fileUrl}', '${obs.fileName || 'แผนการสอน.pdf'}')"
                       onmouseover="this.style.borderColor='var(--color-primary)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'"
                       onmouseout="this.style.borderColor='var(--color-border)';this.style.boxShadow='none'">
                    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;">
                      <div style="flex:1;">
                        <h5 style="margin:0 0 4px 0;color:var(--color-primary);font-size:0.95rem;">
                          ${obs.observationName}
                        </h5>
                        <p style="margin:0;font-size:0.85rem;color:var(--color-muted);">
                          📁 ${obs.fileName || 'ไฟล์แผนการสอน'}
                        </p>
                      </div>
                      <span style="background:rgba(22,163,74,0.1);color:#16A34A;padding:4px 12px;border-radius:6px;font-size:0.75rem;font-weight:600;">
                        ✅ ส่งแล้ว
                      </span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--color-border);">
                      <span style="font-size:0.8rem;color:var(--color-muted);">
                        📅 ${formatThaiDate(obs.submittedDate)}
                      </span>
                      <span style="font-size:0.8rem;color:var(--color-primary);font-weight:500;">
                        คลิกเพื่อดูไฟล์ →
                      </span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : `
            <div style="text-align:center;padding:40px;background:var(--color-bg);border-radius:10px;">
              <div style="font-size:3rem;margin-bottom:12px;">📄</div>
              <h4 style="margin:0 0 8px 0;color:var(--color-text);">ยังไม่มีแผนการสอน</h4>
              <p style="margin:0;color:var(--color-muted);font-size:0.9rem;">กรุณาส่งแผนการจัดการเรียนรู้ในหน้าประเมิน</p>
            </div>
          `}

        ` : `
          <!-- ไม่มีข้อมูล -->
          <div class="empty-state" style="padding:60px 20px;">
            <div class="empty-state-icon">📄</div>
            <h3>ยังไม่มีแผนการสอน</h3>
            <p style="margin:0 0 20px 0;">คุณยังไม่ได้อยู่ในงวดฝึกประสบการณ์</p>
            <a href="/dashboard/evaluation" class="btn btn--primary">
              ไปที่หน้าประเมิน →
            </a>
          </div>
        `}
      </div>
    `;

  } catch (error) {
    console.error('Error rendering lesson plans:', error);
    container.innerHTML = `
      <div class="card lesson-plans-section">
        <h3 style="margin:0 0 20px 0;color:var(--color-text);display:flex;align-items:center;gap:10px">
          <span>📄</span>
          แผนการเรียนการสอน
        </h3>
        <div style="text-align:center;padding:40px;background:#fff3cd;border-radius:8px;">
          <div style="font-size:2rem;margin-bottom:12px;">⚠️</div>
          <p style="color:#856404;margin:0;">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
          <button onclick="renderLessonPlans(true)" class="btn btn--secondary" style="margin-top:16px;">
            ลองอีกครั้ง
          </button>
        </div>
      </div>
    `;
  }
}

/**
 * ===============================================
 * แสดงสถิติสรุป (STATS SUMMARY)
 * ===============================================
 * แสดงข้อมูลสถิติภาพรวมของนักศึกษา เช่น จำนวนงวดทั้งหมด การประเมิน แผนการสอน
 * @param {Object} stats - ข้อมูลสถิติจาก API
 */
function renderStats(stats) {
  const container = document.getElementById('statsSection');
  if (!container) return;

  container.innerHTML = `
    <div class="card">
      <h3 style="margin-top:0;margin-bottom:16px;color:var(--color-text)">📊 สถิติการฝึกประสบการณ์</h3>
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
            <div class="stats-summary-value" style="color:${CHART_COLORS.info}">${stats.totalLessonPlans}</div>
            <div class="stats-summary-label">แผนการสอน</div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * ===============================================
 * UTILITY FUNCTIONS (ฟังก์ชันอรรถประโยชน์)
 * ===============================================
 */

/**
 * แปลงวันที่เป็นรูปแบบภาษาไทย
 * @param {string} dateStr - วันที่ในรูปแบบ ISO หรือ string
 * @returns {string} - วันที่ในรูปแบบไทย (เช่น "15 ม.ค. 2567")
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
    return dateStr; // คืนค่าเดิมถ้าแปลงไม่ได้
  }
}

/**
 * ===============================================
 * HELPER FUNCTIONS (ฟังก์ชันช่วยงาน)
 * ===============================================
 * ฟังก์ชันสำหรับช่วยในการแปลงค่าและจัดรูปแบบการแสดงผล
 */

/**
 * แปลงคะแนนเป็นข้อความเกรด
 * @param {number} score - คะแนนในช่วง 1-5
 * @returns {string} - ข้อความเกรดภาษาไทย
 */
function getGradeText(score) {
  const s = parseFloat(score);
  if (s >= 4.5) return 'ดีเยี่ยม';      // 4.5-5.0
  if (s >= 4) return 'ดีมาก';          // 4.0-4.49
  if (s >= 3.5) return 'ดี';           // 3.5-3.99
  if (s >= 3) return 'พอใช้';          // 3.0-3.49
  if (s >= 2.5) return 'ปรับปรุง';     // 2.5-2.99
  return 'ต้องปรับปรุงมาก';            // <2.5
}

/**
 * ดึงสีที่เหมาะสมตามคะแนน (ใช้ CSS variables)
 * @param {number} score - คะแนนในช่วง 1-5
 * @returns {string} - CSS color value
 */
function getScoreColor(score) {
  const s = parseFloat(score) || 0;
  if (s >= 4.5) return CHART_COLORS.success;       // ดีเยี่ยม
  if (s >= 4) return CHART_COLORS.successLight;    // ดีมาก
  if (s >= 3.5) return CHART_COLORS.lime;          // ดี
  if (s >= 3) return CHART_COLORS.warningLight;    // พอใช้
  if (s >= 2) return CHART_COLORS.orange;          // ปรับปรุง
  return CHART_COLORS.dangerLight;                 // ต้องปรับปรุงมาก
}

/**
 * Helper: Get CSS class from score (สำหรับใช้กับ CSS classes)
 * @param {number} score - คะแนนในช่วง 1-5
 * @returns {string} - CSS class name
 */
function getScoreColorClass(score) {
  const s = parseFloat(score) || 0;
  if (s >= 4.5) return 'score-excellent';    // ดีเยี่ยม
  if (s >= 4) return 'score-very-good';      // ดีมาก
  if (s >= 3.5) return 'score-good';         // ดี
  if (s >= 3) return 'score-fair';           // พอใช้
  return 'score-poor';                       // ต้องปรับปรุง
}

/**
 * แปลงสถานะเป็นข้อความและไอคอน
 * @param {string} status - สถานะ (approved, rejected, pending)
 * @returns {string} - ข้อความสถานะพร้อมไอคอน
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
 * ===============================================
 * EVENT HANDLERS (ตัวจัดการเหตุการณ์)
 * ===============================================
 */

/**
 * เปลี่ยนมุมมองประวัติการฝึก (เมื่อเปลี่ยน selector)
 * @description ฟังก์ชันสำหรับจัดการเมื่อผู้ใช้เปลี่ยนการเลือกงวดฝึกใน dropdown
 */
function changePracticeView() {
  const selector = document.getElementById('periodSelector');
  if (!selector) return;
  
  const selectedId = selector.value;
  
  // TODO: อาจจะเพิ่มการ highlight timeline item ที่เลือก หรือโหลดรายละเอียดเพิ่มเติม
  console.log('Selected practice period:', selectedId);
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
