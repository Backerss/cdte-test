/**
 * evaluation.js
 * Evaluation page logic: manage evaluation periods, forms, and submissions
 */

// Global state
const isPureAdminClient = window.evalPageConfig?.isPureAdmin || false;
const hasPractice = window.evalPageConfig?.hasPractice || false;
const hasActive = window.evalPageConfig?.hasActive || false;
const userYear = window.evalPageConfig?.userYear || 3;

let currentEvalPeriod = null;
let evaluationPracticeHistory = [];
let currentEvalNum = null;
let mainLessonPlanFile = null;

// Ensure each evaluation period has the structure we expect before rendering/accessing it
function ensureEvaluationStructure(period) {
  if (!period || typeof period !== 'object') return null;
  if (!period.evaluations || typeof period.evaluations !== 'object') {
    period.evaluations = {};
  }
  if (typeof period.evaluationCount !== 'number') {
    period.evaluationCount = 9;
  }
  return period;
}

// Helper to get ms from various date formats (Firestore Timestamp or ISO string)
function getMillis(val) {
  try {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val._seconds) return val._seconds * 1000;
    if (typeof val === 'string') return new Date(val).getTime();
    return null;
  } catch (e) {
    return null;
  }
}

// Check if within practice period
function isWithinPracticePeriod() {
  if (!currentEvalPeriod) return false;
  const now = Date.now();
  const start = getMillis(currentEvalPeriod.startDate);
  const end = getMillis(currentEvalPeriod.endDate);
  return start && end && now >= start && now <= end;
}

// Format Thai date
function formatThaiDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// Update form availability based on current period and server flags
function updateFormAvailability() {
  if (isPureAdminClient) {
    document.querySelectorAll('input, select, button, textarea').forEach(el => {
      if (!el.classList.contains('modal-close')) el.disabled = true;
    });
    return;
  }

  const nowMs = Date.now();
  const startMs = getMillis(currentEvalPeriod?.startDate);
  const endMs = getMillis(currentEvalPeriod?.endDate);
  const withinDates = startMs && endMs ? (nowMs >= startMs && nowMs <= endMs) : false;
  const periodIsActive = currentEvalPeriod && (currentEvalPeriod.status === 'active' || withinDates);

  const currentContent = document.getElementById('evalCurrentContent');
  if (!currentContent) return;

  if (periodIsActive) {
    currentContent.querySelectorAll('input,textarea,button,select').forEach(el => {
      if (!el.classList.contains('modal-close')) el.disabled = false;
    });
  } else {
    currentContent.querySelectorAll('input,textarea,button,select').forEach(el => el.disabled = true);
  }
}

// Change evaluation period
function changeEvalPeriod() {
  const selector = document.getElementById('evalPeriodSelector');
  const selectedId = selector && selector.value !== undefined ? selector.value : null;
  // Support IDs as number or string coming from server/DOM
  const selectedPeriod = evaluationPracticeHistory.find(p => String(p.id) === String(selectedId));
  currentEvalPeriod = ensureEvaluationStructure(selectedPeriod);
  
  if (!currentEvalPeriod) {
    console.warn('No evaluation period found with id:', selectedId);
    return;
  }

  const nowMs = Date.now();
  const startMs = getMillis(currentEvalPeriod.startDate);
  const endMs = getMillis(currentEvalPeriod.endDate);
  const withinDates = startMs && endMs ? (nowMs >= startMs && nowMs <= endMs) : false;
  const isActive = currentEvalPeriod.status === 'active' || withinDates;
  
  if (isActive) {
    document.getElementById('evalHistoryView').style.display = 'none';
    document.getElementById('evalCurrentContent').style.display = 'block';
    loadCurrentPeriodData();
    updateFormAvailability();
  } else {
    document.getElementById('evalCurrentContent').style.display = 'none';
    document.getElementById('evalHistoryView').style.display = 'block';
    displayEvalHistory();
  }
}

// Load current period data
function loadCurrentPeriodData() {
  document.getElementById('practiceRange').textContent = 
    `${formatThaiDate(currentEvalPeriod.startDate)} - ${formatThaiDate(currentEvalPeriod.endDate)}`;

  loadEvaluationStates();
  loadLessonPlanStatus();

  if (!isWithinPracticePeriod()) {
    Swal.fire({
      icon: 'warning',
      title: 'นอกช่วงการฝึกประสบการณ์',
      html: 'ปัจจุบันอยู่นอกช่วงฝึกประสบการณ์<br>หากต้องการประเมินกรุณาติดต่อ:<br><strong>อาจารย์นิเทศ / อาจารย์ผู้ควบคุมรายวิชา</strong>',
      confirmButtonText: 'รับทราบ'
    });
  }
}

// Display evaluation history (Read-only)
function displayEvalHistory() {
  const container = document.getElementById('evalHistoryContent');
  
  let html = `
    <div class="readonly-section" style="margin-bottom:24px;padding:20px;background:var(--color-surface);border-radius:12px;border:1px solid var(--color-border)">
      <h3 class="readonly-title" style="color:var(--color-primary);margin:0 0 20px 0;display:flex;align-items:center;gap:10px">
        <span>📅</span>
        ข้อมูลงวดฝึกประสบการณ์
      </h3>
      <div class="readonly-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px">
        <div class="readonly-item">
          <span class="readonly-label">งวดฝึก:</span>
          <span class="readonly-value">${currentEvalPeriod.period}</span>
        </div>
        <div class="readonly-item">
          <span class="readonly-label">ชั้นปี:</span>
          <span class="readonly-value">ปี ${currentEvalPeriod.year}</span>
        </div>
        <div class="readonly-item">
          <span class="readonly-label">เริ่มต้น:</span>
          <span class="readonly-value">${formatThaiDate(currentEvalPeriod.startDate)}</span>
        </div>
        <div class="readonly-item">
          <span class="readonly-label">สิ้นสุด:</span>
          <span class="readonly-value">${formatThaiDate(currentEvalPeriod.endDate)}</span>
        </div>
      </div>
    </div>
  `;

  // Lesson Plan Status
  if (currentEvalPeriod.lessonPlan && currentEvalPeriod.lessonPlan.uploaded) {
    html += `
      <div class="readonly-section" style="margin-bottom:24px;padding:20px;background:var(--color-surface);border-radius:12px;border:1px solid var(--color-border)">
        <h3 class="readonly-title" style="color:var(--color-success);margin:0 0 16px 0;display:flex;align-items:center;gap:10px">
          <span>📋</span>
          แผนการจัดการเรียนรู้
        </h3>
        <div style="background:var(--color-bg);padding:16px;border-radius:8px;border:1px solid var(--color-border)">
          <div style="display:flex;align-items:center;gap:16px">
            <div style="font-size:3rem">📄</div>
            <div style="flex:1">
              <div style="font-weight:600;color:var(--color-text);margin-bottom:4px">${currentEvalPeriod.lessonPlan.fileName}</div>
              <div style="font-size:0.85rem;color:var(--color-muted)">
                วันที่ส่ง: ${formatThaiDate(currentEvalPeriod.lessonPlan.submittedDate)}
              </div>
              <div style="margin-top:8px">
                <span style="background:#d4edda;color:#155724;padding:4px 12px;border-radius:12px;font-size:0.8rem;font-weight:500">
                  ✓ ส่งแล้ว
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    html += `
      <div class="readonly-section" style="margin-bottom:24px;padding:20px;background:var(--color-surface);border-radius:12px;border:1px solid var(--color-border)">
        <h3 class="readonly-title" style="color:var(--color-warning);margin:0 0 16px 0;display:flex;align-items:center;gap:10px">
          <span>⚠️</span>
          แผนการจัดการเรียนรู้
        </h3>
        <div style="background:#fff3cd;padding:16px;border-radius:8px;text-align:center">
          <p style="margin:0;color:#856404">ไม่พบการส่งแผนการจัดการเรียนรู้ในงวดนี้</p>
        </div>
      </div>
    `;
  }

  // Evaluation Summary
  const totalEvals = currentEvalPeriod.evaluationCount || 9;
  const completedEvals = Object.values(currentEvalPeriod.evaluations || {}).filter(e => e.submitted).length;
  const progressPercent = (completedEvals / totalEvals * 100).toFixed(1);

  html += `
    <div class="readonly-section" style="margin-bottom:24px;padding:20px;background:var(--color-surface);border-radius:12px;border:1px solid var(--color-border)">
      <h3 class="readonly-title" style="color:var(--color-primary);margin:0 0 20px 0;display:flex;align-items:center;gap:10px">
        <span>📊</span>
        สรุปผลการประเมิน
      </h3>
      <div style="background:var(--color-bg);padding:20px;border-radius:8px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-weight:500;color:var(--color-text)">ความคืบหน้า</span>
          <span style="font-weight:600;color:var(--color-primary)">${completedEvals}/${totalEvals} ครั้ง</span>
        </div>
        <div style="background:#e9ecef;height:24px;border-radius:12px;overflow:hidden">
          <div style="background:var(--color-primary);height:100%;width:${progressPercent}%;transition:width 0.3s ease;display:flex;align-items:center;justify-content:center;color:white;font-size:0.75rem;font-weight:600">
            ${progressPercent}%
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
  `;

  // Evaluation Grid (Read-only)
  for (let week = 1; week <= 3; week++) {
    html += `
      <div style="grid-column:1/-1;margin-top:${week > 1 ? '24px' : '0'}">
        <h4 style="color:var(--color-primary);margin:0 0 16px 0;display:flex;align-items:center;gap:8px">
          <span>📌</span>
          สัปดาห์ที่ ${week}
        </h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
    `;
    
    for (let evalNum = 1; evalNum <= 3; evalNum++) {
      const globalNum = (week - 1) * 3 + evalNum;
      const evalData = currentEvalPeriod.evaluations[globalNum];
      
      const statusClass = evalData && evalData.submitted ? 'completed' : 'pending';
      const statusIcon = evalData && evalData.submitted ? '✅' : '⏳';
      const statusText = evalData && evalData.submitted ? 'เสร็จสิ้น' : 'ยังไม่ได้ทำ';
      const dateText = evalData && evalData.date ? formatThaiDate(evalData.date) : '-';
      const hasAnswers = evalData && evalData.answers && Object.keys(evalData.answers).length > 0;
      
      html += `
        <div style="background:var(--color-bg);border:2px solid var(--color-border);border-radius:12px;padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h4 style="margin:0;color:var(--color-text)">ครั้งที่ ${globalNum}</h4>
            <span class="eval-status ${statusClass}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:12px;font-size:0.85rem;font-weight:500">
              <span>${statusIcon}</span>
              <span>${statusText}</span>
            </span>
          </div>
          <div style="font-size:0.85rem;color:var(--color-muted);margin-bottom:12px">
            วันที่: ${dateText}
          </div>
          ${hasAnswers ? `
            <button class="btn btn--secondary" style="width:100%;font-size:0.9rem;padding:8px 12px" onclick="viewEvaluationDetails(${globalNum})">
              📊 ดูรายละเอียดคำตอบ
            </button>
          ` : ''}
        </div>
      `;
    }
    
    html += '</div></div>';
  }
  
  html += '</div></div>';
  container.innerHTML = html;
}

// Get question text by question name
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

// Get section info
function getQuestionSection(qName) {
  const num = parseInt(qName.substring(1));
  if (num >= 1 && num <= 4) return { title: 'ครู - พฤติกรรมด้านภาษา (Verbal Behaviors)', icon: '👨‍🏫', color: '#2E3094' };
  if (num >= 5 && num <= 9) return { title: 'ครู - พฤติกรรมที่ไม่ใช่ภาษา (Non-Verbal Behavior)', icon: '🎭', color: '#2E3094' };
  if (num >= 10 && num <= 15) return { title: 'นักเรียน - พฤติกรรมทางวิชาการของผู้เรียน', icon: '👨‍🎓', color: '#FBB425' };
  if (num >= 16 && num <= 18) return { title: 'นักเรียน - พฤติกรรมการทำงานของผู้เรียน', icon: '📚', color: '#FBB425' };
  if (num >= 19 && num <= 26) return { title: 'สิ่งแวดล้อมทางการเรียนรู้ - สภาพทางกายภาพของห้องเรียน', icon: '🏫', color: '#28a745' };
  return { title: 'อื่นๆ', icon: '📝', color: '#6c757d' };
}

// Get rating text
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

// Get rating color
function getRatingColor(score) {
  const colors = {
    1: '#dc3545',
    2: '#fd7e14',
    3: '#ffc107',
    4: '#28a745',
    5: '#2E3094'
  };
  return colors[score] || '#6c757d';
}

// View evaluation details
function viewEvaluationDetails(evalNum) {
  const evalData = currentEvalPeriod.evaluations[evalNum];
  if (!evalData || !evalData.answers) {
    Swal.fire({
      icon: 'warning',
      title: 'ไม่มีข้อมูล',
      text: 'ไม่พบข้อมูลการประเมินครั้งนี้',
      confirmButtonText: 'รับทราบ'
    });
    return;
  }

  document.getElementById('detailsEvalTitle').textContent = `ครั้งที่ ${evalNum}`;
  document.getElementById('detailsEvalDate').textContent = formatThaiDate(evalData.date);

  let html = '';
  const answers = evalData.answers;
  const totalQuestions = Object.keys(answers).length;
  
  let totalScore = 0;
  Object.values(answers).forEach(score => totalScore += parseInt(score));
  const avgScore = totalQuestions > 0 ? (totalScore / totalQuestions).toFixed(2) : 0;
  
  html += `
    <div style="background:var(--color-primary);color:white;padding:24px;border-radius:12px;margin-bottom:24px;box-shadow:0 4px 12px rgba(0,0,0,0.15)">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;text-align:center">
        <div>
          <div style="font-size:2.5rem;font-weight:700;margin-bottom:4px">${totalQuestions}</div>
          <div style="font-size:0.9rem;opacity:0.9">จำนวนข้อที่ตอบ</div>
        </div>
        <div>
          <div style="font-size:2.5rem;font-weight:700;margin-bottom:4px">${avgScore}</div>
          <div style="font-size:0.9rem;opacity:0.9">คะแนนเฉลี่ย</div>
        </div>
        <div>
          <div style="font-size:2.5rem;font-weight:700;margin-bottom:4px">${evalData.submitted ? '✅' : '⏳'}</div>
          <div style="font-size:0.9rem;opacity:0.9">${evalData.submitted ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</div>
        </div>
      </div>
    </div>
  `;

  const sections = {};
  Object.keys(answers).forEach(qName => {
    const section = getQuestionSection(qName);
    if (!sections[section.title]) {
      sections[section.title] = { ...section, questions: [] };
    }
    sections[section.title].questions.push({
      name: qName,
      text: getQuestionText(qName),
      score: answers[qName]
    });
  });

  Object.values(sections).forEach(section => {
    html += `
      <div style="margin-bottom:32px;background:var(--color-surface);border-radius:12px;overflow:hidden;border:2px solid var(--color-border)">
        <div style="background:${section.color};color:white;padding:16px;display:flex;align-items:center;gap:12px">
          <span style="font-size:1.5rem">${section.icon}</span>
          <h4 style="margin:0;font-size:1.1rem">${section.title}</h4>
        </div>
        <div style="padding:20px">
    `;
    
    section.questions.forEach((q, idx) => {
      const ratingText = getRatingText(q.score);
      const ratingColor = getRatingColor(q.score);
      
      html += `
        <div style="padding:16px;background:var(--color-bg);border-radius:8px;margin-bottom:${idx < section.questions.length - 1 ? '12px' : '0'}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
            <div style="flex:1;min-width:250px">
              <div style="font-weight:500;color:var(--color-text);margin-bottom:8px">
                ${q.text}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <div style="text-align:center">
                <div style="font-size:1.8rem;font-weight:700;color:${ratingColor}">${q.score}</div>
                <div style="font-size:0.75rem;color:var(--color-muted);margin-top:2px">คะแนน</div>
              </div>
              <div style="background:${ratingColor};color:white;padding:8px 16px;border-radius:20px;font-weight:600;font-size:0.9rem">
                ${ratingText}
              </div>
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div></div>';
  });

  document.getElementById('detailsContent').innerHTML = html;
  document.getElementById('evaluationDetailsModal').style.display = 'flex';
}

function closeDetailsModal() {
  document.getElementById('evaluationDetailsModal').style.display = 'none';
}

function loadEvaluationStates() {
  if (!currentEvalPeriod) return;
  const evaluations = (currentEvalPeriod && typeof currentEvalPeriod.evaluations === 'object')
    ? currentEvalPeriod.evaluations
    : {};

  for (let i = 1; i <= 9; i++) {
    const evalInfo = evaluations[i];
    const statusEl = document.getElementById(`status-${i}`);
    const dateEl = document.querySelector(`#date-${i} .date-value`);
    const btnEl = document.querySelector(`button[data-eval="${i}"]`);

    if (!statusEl || !dateEl || !btnEl) continue;

    if (evalInfo) {
      dateEl.textContent = formatThaiDate(evalInfo.date);
      
      if (evalInfo.submitted) {
        statusEl.className = 'eval-status completed';
        statusEl.innerHTML = '<span class="status-icon">✅</span><span class="status-text">เสร็จสิ้น</span>';
        btnEl.textContent = 'ดูผลการประเมิน';
        btnEl.disabled = false;
      } else {
        statusEl.className = 'eval-status pending';
        statusEl.innerHTML = '<span class="status-icon">⏳</span><span class="status-text">รอประเมิน</span>';
        btnEl.textContent = 'เริ่มประเมิน';
        btnEl.disabled = false;
      }
    } else {
      statusEl.className = 'eval-status pending';
      statusEl.innerHTML = '<span class="status-icon">⏳</span><span class="status-text">รอประเมิน</span>';
      dateEl.textContent = '-';
      btnEl.textContent = 'เริ่มประเมิน';
      btnEl.disabled = false;
    }
  }
}

function startEvaluation(evalNum) {
  currentEvalNum = evalNum;
  
  if (!isWithinPracticePeriod()) {
    Swal.fire({
      icon: 'error',
      title: 'ไม่สามารถประเมินได้',
      text: 'อยู่นอกช่วงฝึกประสบการณ์ กรุณาติดต่ออาจารย์นิเทศ',
      confirmButtonText: 'รับทราบ'
    });
    return;
  }

  const evalInfo = currentEvalPeriod.evaluations[evalNum];
  if (evalInfo && evalInfo.submitted) {
    viewEvaluation(evalNum);
    return;
  }

  if (!evalInfo) {
    currentEvalPeriod.evaluations[evalNum] = {
      date: new Date().toISOString().split('T')[0],
      answers: {},
      submitted: false
    };
    saveEvaluationData();
    loadEvaluationStates();
  }

  document.getElementById('evalTitle').textContent = `ครั้งที่ ${evalNum}`;
  document.getElementById('modalEvalDate').textContent = formatThaiDate(currentEvalPeriod.evaluations[evalNum].date);
  
  const form = document.getElementById('evaluationForm');
  form.reset();
  if (evalInfo && evalInfo.answers) {
    Object.keys(evalInfo.answers).forEach(qName => {
      const radio = form.querySelector(`input[name="${qName}"][value="${evalInfo.answers[qName]}"]`);
      if (radio) radio.checked = true;
    });
  }

  document.getElementById('evaluationModal').style.display = 'flex';
}

function viewEvaluation(evalNum) {
  currentEvalNum = evalNum;
  const evalInfo = currentEvalPeriod.evaluations[evalNum];
  if (!evalInfo) return;

  document.getElementById('evalTitle').textContent = `ครั้งที่ ${evalNum}`;
  document.getElementById('modalEvalDate').textContent = formatThaiDate(evalInfo.date);

  const form = document.getElementById('evaluationForm');
  if (form) form.reset();
  if (evalInfo.answers && form) {
    Object.keys(evalInfo.answers).forEach(qName => {
      const radio = form.querySelector(`input[name="${qName}"][value="${evalInfo.answers[qName]}"]`);
      if (radio) radio.checked = true;
    });
  }

  document.getElementById('evaluationModal').style.display = 'flex';
  document.querySelectorAll('#evaluationForm input').forEach(input => input.disabled = true);
  const submitBtn = document.querySelector('.modal-footer .btn--primary');
  if (submitBtn) submitBtn.style.display = 'none';
}

function closeEvaluationModal() {
  if (currentEvalNum && currentEvalPeriod.evaluations[currentEvalNum] && !currentEvalPeriod.evaluations[currentEvalNum].submitted) {
    saveProgress();
  }
  document.getElementById('evaluationModal').style.display = 'none';
  currentEvalNum = null;
  
  document.querySelectorAll('#evaluationForm input').forEach(input => input.disabled = false);
  const submitBtn = document.querySelector('.modal-footer .btn--primary');
  if (submitBtn) submitBtn.style.display = 'block';
}

function saveProgress() {
  const form = document.getElementById('evaluationForm');
  const formData = new FormData(form);
  const answers = {};
  
  for (let [key, value] of formData.entries()) {
    answers[key] = value;
  }
  
  currentEvalPeriod.evaluations[currentEvalNum].answers = answers;
  saveEvaluationData();
}

function submitEvaluation() {
  const form = document.getElementById('evaluationForm');
  
  const totalQuestions = 26;
  const answeredQuestions = new FormData(form).entries();
  const count = Array.from(answeredQuestions).length;
  
  if (count < totalQuestions) {
    Swal.fire({
      icon: 'warning',
      title: 'กรุณาตอบคำถามให้ครบ',
      text: `คุณตอบไปแล้ว ${count} จาก ${totalQuestions} ข้อ`,
      confirmButtonText: 'รับทราบ'
    });
    return;
  }

  Swal.fire({
    icon: 'question',
    title: 'ยืนยันการส่งแบบประเมิน',
    html: `
      <p>คุณต้องการส่งแบบประเมิน<strong>ครั้งที่ ${currentEvalNum}</strong> หรือไม่?</p>
      <p style="color:var(--color-danger);margin-top:12px">
        <strong>⚠️ หมายเหตุ:</strong> เมื่อส่งแล้วจะไม่สามารถแก้ไขได้อีก
      </p>
    `,
    showCancelButton: true,
    confirmButtonText: 'ยืนยันส่ง',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#2E3094',
    cancelButtonColor: '#6c757d'
  }).then((result) => {
    if (result.isConfirmed) {
      saveProgress();
      
      currentEvalPeriod.evaluations[currentEvalNum].submitted = true;
      saveEvaluationData();
      loadEvaluationStates();
      showSuccessAndClose();
    }
  });
}

function showSuccessAndClose() {
  Swal.fire({
    icon: 'success',
    title: 'ส่งแบบประเมินสำเร็จ',
    text: `บันทึกผลการประเมินครั้งที่ ${currentEvalNum} เรียบร้อยแล้ว`,
    confirmButtonText: 'ตกลง'
  }).then(() => {
    const form = document.getElementById('evaluationForm');
    if (form) form.reset();
    closeEvaluationModal();
  });
}

// Lesson plan functions
function loadLessonPlanStatus() {
  const statusDiv = document.getElementById('lessonPlanStatus');
  const statusText = document.getElementById('lessonPlanStatusText');
  const fileNameEl = document.getElementById('mainLessonPlanFileName');
  const submitBtn = document.getElementById('submitLessonPlanBtn');
  
  if (!statusDiv || !statusText) return;
  
  if (currentEvalPeriod.lessonPlan && currentEvalPeriod.lessonPlan.uploaded) {
    statusDiv.style.display = 'block';
    statusDiv.style.background = '#d4edda';
    statusDiv.style.color = '#155724';
    statusText.textContent = `สถานะ: ส่งแผนการจัดการเรียนรู้เรียบร้อยแล้ว (${formatThaiDate(currentEvalPeriod.lessonPlan.submittedDate)})`;
    
    if (fileNameEl) {
      fileNameEl.textContent = currentEvalPeriod.lessonPlan.fileName;
      fileNameEl.style.color = 'var(--color-success)';
    }
    if (submitBtn) {
      submitBtn.textContent = '✅ ส่งแล้ว';
      submitBtn.disabled = true;
    }
  } else {
    statusDiv.style.display = 'block';
    statusText.textContent = 'สถานะ: รอส่งแผนการจัดการเรียนรู้';
    if (fileNameEl) {
      fileNameEl.textContent = 'ยังไม่ได้เลือกไฟล์';
      fileNameEl.style.color = 'var(--color-muted)';
    }
    if (submitBtn) {
      submitBtn.textContent = '📤 ส่งแผนการจัดการเรียนรู้';
      submitBtn.disabled = !mainLessonPlanFile;
    }
  }
}

function handleMainLessonPlanUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const maxSize = 20 * 1024 * 1024;
  if (file.size > maxSize) {
    Swal.fire({
      icon: 'error',
      title: 'ไฟล์ใหญ่เกินไป',
      text: 'กรุณาเลือกไฟล์ที่มีขนาดไม่เกิน 20MB',
      confirmButtonText: 'รับทราบ'
    });
    e.target.value = '';
    return;
  }

  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];
  
  if (!allowedTypes.includes(file.type)) {
    Swal.fire({
      icon: 'error',
      title: 'ไฟล์ไม่ถูกต้อง',
      text: 'กรุณาเลือกไฟล์ PDF, Word หรือ PowerPoint เท่านั้น',
      confirmButtonText: 'รับทราบ'
    });
    e.target.value = '';
    return;
  }

  mainLessonPlanFile = file;

  document.getElementById('mainLessonPlanFileName').textContent = file.name;
  document.getElementById('mainLessonPlanFileName').style.color = 'var(--color-primary)';
  
  document.getElementById('submitLessonPlanBtn').disabled = false;

  showMainLessonPlanPreview(file);
}

function showMainLessonPlanPreview(file) {
  const previewDiv = document.getElementById('mainLessonPlanPreview');
  const contentDiv = document.getElementById('mainLessonPlanPreviewContent');
  
  previewDiv.style.display = 'block';

  let icon = '📄';
  if (file.type.includes('pdf')) icon = '📕';
  else if (file.type.includes('word')) icon = '📘';
  else if (file.type.includes('presentation')) icon = '📙';

  const fileSizeKB = (file.size / 1024).toFixed(2);
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
  const displaySize = file.size > 1024 * 1024 ? `${fileSizeMB} MB` : `${fileSizeKB} KB`;

  contentDiv.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;padding:12px;background:var(--color-bg);border-radius:6px">
      <div style="font-size:3rem">${icon}</div>
      <div style="flex:1">
        <div style="font-weight:600;color:var(--color-text);margin-bottom:4px">${file.name}</div>
        <div style="font-size:0.85rem;color:var(--color-muted)">
          ขนาด: ${displaySize} | ประเภท: ${getFileTypeName(file.type)}
        </div>
        <div style="margin-top:8px">
          <span style="background:#d4edda;color:#155724;padding:4px 12px;border-radius:12px;font-size:0.8rem;font-weight:500">
            ✓ พร้อมส่ง
          </span>
        </div>
      </div>
    </div>
  `;

  if (file.type === 'application/pdf') {
    const reader = new FileReader();
    reader.onload = function(e) {
      contentDiv.innerHTML += `
        <div style="margin-top:16px;border:1px solid var(--color-border);border-radius:8px;overflow:hidden">
          <div style="background:var(--color-bg);padding:8px;font-weight:500;font-size:0.9rem">
            ตัวอย่าง PDF:
          </div>
          <iframe src="${e.target.result}" style="width:100%;height:400px;border:none"></iframe>
        </div>
      `;
    };
    reader.readAsDataURL(file);
  }
}

function getFileTypeName(mimeType) {
  const types = {
    'application/pdf': 'PDF',
    'application/msword': 'Word (DOC)',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (DOCX)',
    'application/vnd.ms-powerpoint': 'PowerPoint (PPT)',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint (PPTX)'
  };
  return types[mimeType] || 'ไม่ทราบประเภท';
}

function removeMainLessonPlan() {
  mainLessonPlanFile = null;
  document.getElementById('mainLessonPlanInput').value = '';
  document.getElementById('mainLessonPlanFileName').textContent = 'ยังไม่ได้เลือกไฟล์';
  document.getElementById('mainLessonPlanFileName').style.color = 'var(--color-muted)';
  document.getElementById('mainLessonPlanPreview').style.display = 'none';
  document.getElementById('submitLessonPlanBtn').disabled = true;
  
  Swal.fire({
    icon: 'success',
    title: 'ลบไฟล์สำเร็จ',
    timer: 1500,
    showConfirmButton: false
  });
}

function submitLessonPlan() {
  if (!mainLessonPlanFile) {
    Swal.fire({
      icon: 'warning',
      title: 'กรุณาเลือกไฟล์',
      text: 'กรุณาเลือกแผนการจัดการเรียนรู้ก่อนส่ง',
      confirmButtonText: 'รับทราบ'
    });
    return;
  }
  
  Swal.fire({
    icon: 'question',
    title: 'ยืนยันการส่งแผนการจัดการเรียนรู้',
    html: `
      <p>คุณต้องการส่งแผนการจัดการเรียนรู้หรือไม่?</p>
      <p style="color:var(--color-primary);font-weight:600">${mainLessonPlanFile.name}</p>
      <p style="color:var(--color-danger);margin-top:12px">
        <strong>⚠️ หมายเหตุ:</strong> เมื่อส่งแล้วจะไม่สามารถแก้ไขได้อีก
      </p>
    `,
    showCancelButton: true,
    confirmButtonText: 'ยืนยันส่ง',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#2E3094',
    cancelButtonColor: '#6c757d'
  }).then((result) => {
    if (result.isConfirmed) {
      currentEvalPeriod.lessonPlan = {
        uploaded: true,
        fileName: mainLessonPlanFile.name,
        submittedDate: new Date().toISOString().split('T')[0]
      };
      
      saveEvaluationData();
      loadLessonPlanStatus();
      
      Swal.fire({
        icon: 'success',
        title: 'ส่งแผนการจัดการเรียนรู้สำเร็จ',
        text: 'บันทึกแผนการจัดการเรียนรู้เรียบร้อยแล้ว',
        confirmButtonText: 'ตกลง'
      });
    }
  });
}

function saveEvaluationData() {
  localStorage.setItem('evaluationPracticeHistory_' + userYear, JSON.stringify(evaluationPracticeHistory));
  // TODO: send to server via API
}

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
  try {
    await window.ObservationUtils.populateObservationSelector('evalPeriodSelector', null, {
      includeEmpty: false,
      showActiveFirst: true
    });
    // Ensure local history is populated from ObservationUtils so other functions can find periods
    evaluationPracticeHistory = (window.ObservationUtils.data?.all || []).map(period => ensureEvaluationStructure(period));

    currentEvalPeriod = ensureEvaluationStructure(
      window.ObservationUtils.getActiveObservation() ||
      (evaluationPracticeHistory.length > 0 ? evaluationPracticeHistory[0] : null)
    );
    
    const activePeriod = window.ObservationUtils.getActiveObservation();
    if (activePeriod) {
      const banner = document.getElementById('noEvalActiveBanner');
      if (banner) banner.style.display = 'none';
    }
    
    if (currentEvalPeriod) {
      changeEvalPeriod();
      updateFormAvailability();
    } else {
      console.warn('No observations available');
    }
  } catch (error) {
    console.error('Error loading observations:', error);
  }

  const mainLessonPlanInput = document.getElementById('mainLessonPlanInput');
  if (mainLessonPlanInput) {
    mainLessonPlanInput.addEventListener('change', handleMainLessonPlanUpload);
  }

  document.getElementById('evaluationModal')?.addEventListener('click', function(e) {
    if (e.target === this) closeEvaluationModal();
  });

  document.getElementById('evaluationDetailsModal')?.addEventListener('click', function(e) {
    if (e.target === this) closeDetailsModal();
  });
});
