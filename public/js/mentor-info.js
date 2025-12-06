/**
 * Mentor Info Management
 * Frontend JavaScript สำหรับจัดการข้อมูลครูพี่เลี้ยง
 */

let selectedMentorId = null;
let teachingSubjects = [];
let debounceTimer = null;

// ตรวจสอบสิทธิ์เมื่อโหลดหน้า
async function checkMentorEligibility() {
  try {
    const response = await fetch('/api/mentor-info/check-eligibility');
    const data = await response.json();
    
    if (!data.success || !data.eligible) {
      let message = data.message || 'ไม่สามารถกรอกข้อมูลได้';

      // If the reason is missing school info, show a full modal with action
      if (data.needSchoolInfo) {
        const htmlMessage = '<div style="text-align:left"><strong>⚠️ ไม่สามารถกรอกข้อมูลครูพี่เลี้ยงได้</strong><br><br>' +
                  'กรุณากรอก<strong>ข้อมูลโรงเรียน</strong>ก่อน จึงจะสามารถกรอกข้อมูลครูพี่เลี้ยงได้<br><br>' +
                  '<a href="/dashboard/school-info" class="btn btn--primary" style="display:inline-block;margin-top:8px">📋 ไปกรอกข้อมูลโรงเรียน</a></div>';

        Swal.fire({
          icon: 'error',
          title: 'ไม่สามารถกรอกข้อมูลได้',
          html: htmlMessage,
          confirmButtonText: 'รับทราบ'
        });

      } else {
        // For general "no eligible observation" show a non-blocking toast at top-end
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'warning',
          title: message,
          showConfirmButton: false,
          timer: 5000,
          timerProgressBar: true
        });
      }

      // Disable the form to prevent input
      const form = document.getElementById('mentorCurrentForm');
      if (form) {
        form.querySelectorAll('input, select, button, textarea').forEach(el => {
          if (!el.classList.contains('modal-close')) {
            el.disabled = true;
          }
        });
      }

      return false;
    }
    
    // แสดงข้อมูลการฝึกประสบการณ์วิชาชีพครูและโรงเรียน
    if (data.observation) {
      const banner = document.createElement('div');
      banner.style.cssText = 'background:#d1ecf1;border-left:4px solid#17a2b8;padding:12px;border-radius:8px;margin-bottom:16px;color:#0c5460';
      banner.innerHTML = `
        ℹ️ <strong>การฝึกประสบการณ์วิชาชีพครู:</strong> ${data.observation.name}<br>
        <strong>โรงเรียน:</strong> ${data.observation.schoolName}<br>
        <small>เริ่มเมื่อ: ${new Date(data.observation.startDate).toLocaleDateString('th-TH')} 
        (ผ่านไป ${data.observation.daysPassed} วัน, เหลืออีก ${data.observation.daysRemaining} วัน)</small>
      `;
      const card = document.querySelector('.card');
      if (card) {
        card.insertBefore(banner, card.children[1]);
      }
    }
    
    // โหลดข้อมูลที่เคยกรอกไว้
    await loadMyMentorSubmission();
    
    return true;
    
  } catch (error) {
    console.error('Error checking eligibility:', error);
    return false;
  }
}

// โหลดข้อมูลที่เคยกรอกไว้
async function loadMyMentorSubmission() {
  try {
    const response = await fetch('/api/mentor-info/my-submission');
    const result = await response.json();
    
    if (result.success && result.hasSubmission) {
      const data = result.data;
      loadMentorDataToForm(data);
      
    }
  } catch (error) {
    console.error('Error loading mentor submission:', error);
  }
}

// Auto-suggest ชื่อครูพี่เลี้ยง
function setupMentorNameAutocomplete() {
  const firstNameInput = document.querySelector('#mentorCurrentForm input[type="text"]');
  if (!firstNameInput) return;
  
  // สร้าง suggestion container
  const suggestionContainer = document.createElement('div');
  suggestionContainer.id = 'mentorSuggestions';
  suggestionContainer.className = 'suggestion-box';
  suggestionContainer.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:white;border:1px solid #ddd;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-height:300px;overflow-y:auto;z-index:1500;display:none';
  firstNameInput.parentElement.style.position = 'relative';
  firstNameInput.parentElement.appendChild(suggestionContainer);
  
  firstNameInput.addEventListener('input', function() {
    const query = this.value.trim();
    
    clearTimeout(debounceTimer);
    
    if (!query || query.length < 2) {
      suggestionContainer.style.display = 'none';
      selectedMentorId = null;
      return;
    }
    
    debounceTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/mentor-info/search-mentors?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.success && data.mentors && data.mentors.length > 0) {
          showMentorSuggestions(data.mentors, suggestionContainer);
        } else {
          suggestionContainer.style.display = 'none';
        }
      } catch (error) {
        console.error('Error searching mentors:', error);
      }
    }, 300);
  });
  
  // ปิด suggestions เมื่อคลิกนอก
  document.addEventListener('click', (e) => {
    if (e.target !== firstNameInput && !suggestionContainer.contains(e.target)) {
      suggestionContainer.style.display = 'none';
    }
  });
}

// แสดง suggestions
function showMentorSuggestions(mentors, container) {
  container.innerHTML = '';
  
  mentors.forEach(mentor => {
    const item = document.createElement('div');
    item.className = 'suggestion-item-mentor';
    item.style.cssText = 'padding:12px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.05);transition:background 0.2s';
    
    const updatedInfo = mentor.lastUpdatedAt 
      ? `<small style="color:#6c757d;display:block;margin-top:4px;">
           อัปเดตล่าสุด: ${new Date(mentor.lastUpdatedAt._seconds * 1000).toLocaleDateString('th-TH')}
           ${mentor.lastUpdatedBy ? ' โดยนักศึกษา ' + mentor.lastUpdatedBy : ''}
         </small>`
      : '';
    
    item.innerHTML = `
      <div style="font-weight:600;color:#2E3094;">${mentor.firstName} ${mentor.lastName}</div>
      <div style="font-size:0.85rem;color:#6c757d;">${mentor.position || '-'}</div>
      <div style="font-size:0.85rem;color:#6c757d;">${mentor.department || ''}</div>
      ${updatedInfo}
    `;
    
    item.addEventListener('mousedown', function(e) {
      e.preventDefault();
      selectMentor(mentor);
      container.style.display = 'none';
    });
    
    item.addEventListener('mouseenter', function() {
      this.style.background = '#f8f9fa';
    });
    
    item.addEventListener('mouseleave', function() {
      this.style.background = '';
    });
    
    container.appendChild(item);
  });
  
  container.style.display = 'block';
}

// เลือกครูพี่เลี้ยงจาก suggestion
function selectMentor(mentor) {
  selectedMentorId = mentor.id;
  
  Swal.fire({
    title: 'พบข้อมูลครูพี่เลี้ยงท่านนี้แล้ว',
    html: `
      <div style="text-align:left;padding:12px">
        <p><strong>ชื่อ:</strong> ${mentor.firstName} ${mentor.lastName}</p>
        <p><strong>วิทยฐานะ:</strong> ${mentor.position || '-'}</p>
        <p><strong>กลุ่มสาระ:</strong> ${mentor.department || '-'}</p>
        ${mentor.lastUpdatedBy ? `
          <div style="margin-top:16px;padding:12px;background:#fff3cd;border-radius:6px;">
            <strong>⚠️ ข้อมูลนี้มีการอัปเดตโดย:</strong><br>
            นักศึกษา ${mentor.lastUpdatedBy}<br>
            <small>${new Date(mentor.lastUpdatedAt._seconds * 1000).toLocaleString('th-TH')}</small>
          </div>
        ` : ''}
        <p style="margin-top:16px;color:#6c757d;font-size:0.9rem;">
          ระบบจะกรอกข้อมูลให้อัตโนมัติ คุณสามารถแก้ไขได้ตามต้องการ
        </p>
      </div>
    `,
    icon: 'info',
    showCancelButton: true,
    confirmButtonText: 'ใช้ข้อมูลนี้',
    cancelButtonText: 'ยกเลิก'
  }).then((result) => {
    if (result.isConfirmed) {
      loadMentorDataToForm(mentor);
    } else {
      selectedMentorId = null;
    }
  });
}

// โหลดข้อมูลครูพี่เลี้ยงลงฟอร์ม
function loadMentorDataToForm(data) {
  const form = document.getElementById('mentorCurrentForm');
  if (!form) return;
  
  // ข้อมูลส่วนตัว
  const inputs = form.querySelectorAll('input[type="text"]');
  if (inputs[0]) inputs[0].value = data.firstName || '';
  if (inputs[1]) inputs[1].value = data.lastName || '';
  
  // วิทยฐานะ
  const positionSelect = form.querySelector('select');
  if (positionSelect && data.position) {
    positionSelect.value = data.position;
  }
  
  // โทรศัพท์และอีเมล
  const telInput = form.querySelector('input[type="tel"]');
  const emailInput = form.querySelector('input[type="email"]');
  if (telInput) telInput.value = data.phone || '';
  if (emailInput) emailInput.value = data.email || '';
  
  // วุฒิการศึกษา
  const eduContainer = document.getElementById('educationContainer');
  if (eduContainer && data.education && data.education.length > 0) {
    eduContainer.innerHTML = '';
    data.education.forEach((edu, idx) => {
      const entry = document.createElement('div');
      entry.className = 'education-entry';
      entry.style.cssText = 'margin-bottom:20px;padding:16px;background:var(--color-bg);border-radius:8px;border:1px solid var(--color-border)';
      
      // รองรับทั้งรูปแบบเก่า (string) และรูปแบบใหม่ (object)
      const isOldFormat = typeof edu === 'string';
      const degree = isOldFormat ? edu : (edu.degree || '');
      const year = isOldFormat ? '' : (edu.year || '');
      const university = isOldFormat ? '' : (edu.university || '');
      const province = isOldFormat ? '' : (edu.province || '');
      
      entry.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <label class="form-label" style="margin:0;font-weight:600;color:var(--color-primary)">วุฒิการศึกษาที่ ${idx + 1}</label>
          <button type="button" class="btn btn--danger btn--icon" onclick="removeEducation(this)" style="padding:6px 12px;font-size:0.9rem">✕ ลบ</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:0.9rem">ระดับการศึกษา <span class="required">*</span></label>
            <input type="text" class="form-input education-degree" placeholder="เช่น ค.บ., ศศ.บ., กศ.ม." value="${degree}" required>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:0.9rem">ปีที่จบ <span class="required">*</span></label>
            <input type="number" class="form-input education-year" placeholder="เช่น 2560" min="2500" max="2570" value="${year}" required>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:0.9rem">มหาวิทยาลัย <span class="required">*</span></label>
            <input type="text" class="form-input education-university" placeholder="เช่น มหาวิทยาลัยราชภัฏนครสวรรค์" value="${university}" required>
          </div>
          <div class="form-group" style="margin:0">
            <label class="form-label" style="font-size:0.9rem">จังหวัด <span class="required">*</span></label>
            <input type="text" class="form-input education-province" placeholder="เช่น นครสวรรค์" value="${province}" required>
          </div>
        </div>
      `;
      eduContainer.appendChild(entry);
    });
  }
  
  // ประสบการณ์การสอน
  const expInput = form.querySelector('input[type="number"]');
  if (expInput) expInput.value = data.experience || '';
  
  // กลุ่มสาระ
  const deptSelect = form.querySelectorAll('select')[1];
  if (deptSelect) deptSelect.value = data.department || '';
  
  // รายวิชาที่สอน
  if (data.teachingSubjects && Array.isArray(data.teachingSubjects)) {
    teachingSubjects = [...data.teachingSubjects];
    updateTeachingDisplay();
  }
  
  Swal.fire({
    icon: 'success',
    title: 'กรอกข้อมูลแล้ว',
    text: 'ข้อมูลครูพี่เลี้ยงถูกกรอกในฟอร์มเรียบร้อยแล้ว',
    timer: 2000,
    showConfirmButton: false
  });
}

// บันทึกข้อมูล
async function saveMentorInfo(event) {
  event.preventDefault();
  
  const form = document.getElementById('mentorCurrentForm');
  const inputs = form.querySelectorAll('input[type="text"]');
  
  // รวบรวมวุฒิการศึกษา
  const education = [];
  form.querySelectorAll('.education-entry').forEach(entry => {
    const degree = entry.querySelector('.education-degree')?.value.trim();
    const year = entry.querySelector('.education-year')?.value.trim();
    const university = entry.querySelector('.education-university')?.value.trim();
    const province = entry.querySelector('.education-province')?.value.trim();
    
    // ตรวจสอบว่ามีการกรอกข้อมูลอย่างน้อย 1 ฟิลด์
    if (degree || year || university || province) {
      education.push({
        degree: degree,
        year: year,
        university: university,
        province: province
      });
    }
  });
  
  const formData = {
    firstName: inputs[0].value.trim(),
    lastName: inputs[1].value.trim(),
    position: form.querySelector('select').value,
    phone: form.querySelector('input[type="tel"]').value.trim(),
    email: form.querySelector('input[type="email"]').value.trim(),
    education: education,
    experience: form.querySelector('input[type="number"]').value,
    department: form.querySelectorAll('select')[1].value,
    teachingSubjects: teachingSubjects
  };
  
  // ยืนยันก่อนบันทึก
  const confirmResult = await Swal.fire({
    title: 'ยืนยันการบันทึกข้อมูล',
    html: `
      <div style="text-align:left;padding:12px">
        <p><strong>ครูพี่เลี้ยง:</strong> ${formData.firstName} ${formData.lastName}</p>
        <p><strong>วิทยฐานะ:</strong> ${formData.position || '(ไม่ระบุ)'}</p>
        <p><strong>กลุ่มสาระ:</strong> ${formData.department || '(ไม่ระบุ)'}</p>
        <hr style="margin:16px 0">
        <p style="color:#6c757d;font-size:0.9rem;">
          ข้อมูลนี้จะถูกบันทึกในระบบและสามารถแก้ไขได้ในภายหลัง
        </p>
      </div>
    `,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันบันทึก',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#2E3094'
  });
  
  if (!confirmResult.isConfirmed) {
    return false;
  }
  
  // แสดง loading
  Swal.fire({
    title: 'กำลังบันทึกข้อมูล...',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });
  
  try {
    const response = await fetch('/api/mentor-info/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      await Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ!',
        text: result.message,
        confirmButtonText: 'รับทราบ'
      });
      
      // โหลดข้อมูลใหม่
      await loadMyMentorSubmission();
    } else {
      // ตรวจสอบว่าครูพี่เลี้ยงมีนักศึกษาดูแลอยู่แล้วหรือไม่
      if (result.mentorOccupied) {
        await Swal.fire({
          icon: 'error',
          title: 'ไม่สามารถเลือกครูพี่เลี้ยงท่านนี้ได้',
          html: `
            <div style="text-align:left;padding:12px">
              <p style="margin-bottom:12px">${result.message}</p>
                <div style="background:#fff3cd;padding:12px;border-radius:6px;border-left:4px solid #ffc107;">
                <strong>📌 กฎการเลือกครูพี่เลี้ยง:</strong><br>
                <small>• 1 ครูพี่เลี้ยง สามารถดูแลได้ 1 นักศึกษา ต่อ 1 การฝึกประสบการณ์วิชาชีพครู<br>
                • กรุณาเลือกครูพี่เลี้ยงท่านอื่นในโรงเรียน<br>
                • เมื่อจบการฝึกประสบการณ์วิชาชีพครูแล้ว ครูพี่เลี้ยงท่านนี้จะสามารถเลือกได้อีกครั้ง</small>
              </div>
            </div>
          `,
          confirmButtonText: 'รับทราบ'
        });
      } else {
        Swal.fire({
          icon: 'error',
          title: 'เกิดข้อผิดพลาด',
          text: result.message
        });
      }
    }
  } catch (error) {
    console.error('Error saving:', error);
    Swal.fire({
      icon: 'error',
      title: 'เกิดข้อผิดพลาด',
      text: 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่'
    });
  }
  
  return false;
}

// Initialize เมื่อโหลดหน้า
document.addEventListener('DOMContentLoaded', function() {
  // If server indicates there is no active mentor period, show a non-blocking toast
  if (typeof window.serverHasActiveMentor !== 'undefined' && window.serverHasActiveMentor === false) {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'warning',
      title: 'ยังไม่มีการฝึกประสบการณ์วิชาชีพครูที่ถูกตั้งค่าเป็น "ปัจจุบัน" — ไม่สามารถกรอกข้อมูลได้',
      showConfirmButton: false,
      timer: 6000,
      timerProgressBar: true
    });

    // Disable the form to prevent input
    const form = document.getElementById('mentorCurrentForm');
    if (form) {
      form.querySelectorAll('input, select, button, textarea').forEach(el => {
        if (!el.classList.contains('modal-close')) {
          el.disabled = true;
        }
      });
    }

    // Still set up autocomplete so the UI is hydrated if needed
    setupMentorNameAutocomplete();
    return;
  }

  // ตรวจสอบสิทธิ์
  checkMentorEligibility();

  // Setup auto-suggest
  setupMentorNameAutocomplete();
});
