/**
 * School Info Management
 * Frontend JavaScript สำหรับจัดการข้อมูลโรงเรียน
 */

let selectedSchoolId = null;
let schoolSuggestions = [];
let debounceTimer = null;

// ตรวจสอบสิทธิ์เมื่อโหลดหน้า
async function checkEligibility() {
  try {
    const response = await fetch('/api/school-info/check-eligibility');
    const data = await response.json();
    
    if (!data.success || !data.eligible) {
      // ไม่มีสิทธิ์
      Swal.fire({
        icon: 'warning',
        title: 'ไม่สามารถกรอกข้อมูลได้',
        html: data.message || 'คุณไม่อยู่ในงวดการสังเกตที่สามารถกรอกข้อมูลได้<br>หรือเกิน 15 วันแล้ว',
        confirmButtonText: 'รับทราบ'
      });
      
      // ปิดการใช้งานฟอร์ม
      document.querySelectorAll('#currentForm input, #currentForm select, #currentForm button').forEach(el => {
        el.disabled = true;
      });
      
      return false;
    }
    
    // แสดงข้อมูลงวด
    if (data.observation) {
      const banner = document.createElement('div');
      banner.style.cssText = 'background:#d1ecf1;border-left:4px solid#17a2b8;padding:12px;border-radius:8px;margin-bottom:16px;color:#0c5460';
      banner.innerHTML = `
        ℹ️ <strong>งวดการสังเกต:</strong> ${data.observation.name}<br>
        <small>เริ่มเมื่อ: ${new Date(data.observation.startDate).toLocaleDateString('th-TH')} 
        (ผ่านไป ${data.observation.daysPassed} วัน, เหลืออีก ${data.observation.daysRemaining} วัน)</small>
      `;
      document.querySelector('.card').insertBefore(banner, document.querySelector('.card').children[1]);
    }
    
    // โหลดข้อมูลที่เคยกรอกไว้
    await loadMySubmission();
    
    return true;
    
  } catch (error) {
    console.error('Error checking eligibility:', error);
    return false;
  }
}

// โหลดข้อมูลที่เคยกรอกไว้
async function loadMySubmission() {
  try {
    const response = await fetch('/api/school-info/my-submission');
    const result = await response.json();
    
    if (result.success && result.hasSubmission) {
      const data = result.data;
      
      // กรอกข้อมูลในฟอร์ม
      const form = document.getElementById('currentForm');
      form.querySelector('input[type="text"]').value = data.name || '';
      document.getElementById('affiliationSelect').value = data.affiliation || '';
      form.querySelector('input[placeholder*="ถนน"]').value = data.address || '';
      document.getElementById('districtAreaInput').value = data.districtArea || '';
      document.getElementById('subdistrictInput').value = data.subdistrict || '';
      document.getElementById('amphoeInput').value = data.amphoe || '';
      document.getElementById('provinceInput').value = data.province || '';
      document.getElementById('postcodeInput').value = data.postcode || '';
      
      // โหลด grade levels
      if (data.gradeLevels && data.gradeLevels.length > 0) {
        selectedGrades = [...data.gradeLevels];
        document.querySelectorAll('#gradeLevelModal input[type="checkbox"]').forEach(cb => {
          cb.checked = selectedGrades.includes(cb.value);
        });
        updateGradeDisplay();
      }
      
      // โหลดสถิติ
      const statInputs = form.querySelectorAll('input[type="number"]');
      if (statInputs[0]) statInputs[0].value = data.studentCount || '';
      if (statInputs[1]) statInputs[1].value = data.teacherCount || '';
      if (statInputs[2]) statInputs[2].value = data.staffCount || '';
      
      // โหลดข้อมูลติดต่อ
      const phoneInput = form.querySelector('input[type="tel"]');
      const emailInput = form.querySelector('input[type="email"]');
      const principalInput = form.querySelectorAll('.form-section')[4].querySelector('input[type="text"]');
      
      if (phoneInput) phoneInput.value = data.phone || '';
      if (emailInput) emailInput.value = data.email || '';
      if (principalInput) principalInput.value = data.principal || '';
      
      console.log('✅ Loaded existing submission');
    }
  } catch (error) {
    console.error('Error loading submission:', error);
  }
}

// Auto-suggest ชื่อโรงเรียน
function setupSchoolNameAutocomplete() {
  const nameInput = document.querySelector('#currentForm input[type="text"]');
  if (!nameInput) return;
  
  // สร้าง suggestion container
  const suggestionContainer = document.createElement('div');
  suggestionContainer.id = 'schoolSuggestions';
  suggestionContainer.className = 'suggestion-box';
  suggestionContainer.style.display = 'none';
  nameInput.parentElement.style.position = 'relative';
  nameInput.parentElement.appendChild(suggestionContainer);
  
  nameInput.addEventListener('input', function() {
    const query = this.value.trim();
    
    clearTimeout(debounceTimer);
    
    if (!query || query.length < 2) {
      suggestionContainer.style.display = 'none';
      selectedSchoolId = null;
      return;
    }
    
    debounceTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/school-info/search-schools?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        if (data.success && data.schools.length > 0) {
          schoolSuggestions = data.schools;
          showSchoolSuggestions(data.schools, suggestionContainer);
        } else {
          suggestionContainer.style.display = 'none';
          selectedSchoolId = null;
        }
      } catch (error) {
        console.error('Error searching schools:', error);
      }
    }, 300);
  });
  
  // ปิด suggestions เมื่อคลิกนอก
  document.addEventListener('click', (e) => {
    if (e.target !== nameInput && !suggestionContainer.contains(e.target)) {
      suggestionContainer.style.display = 'none';
    }
  });
}

// แสดง suggestions
function showSchoolSuggestions(schools, container) {
  container.innerHTML = '';
  
  schools.forEach(school => {
    const item = document.createElement('div');
    item.className = 'suggestion-item-school';
    item.style.cssText = 'padding:12px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.05);transition:background 0.2s';
    
    const updatedInfo = school.lastUpdatedAt 
      ? `<small style="color:#6c757d;display:block;margin-top:4px;">
           อัปเดตล่าสุด: ${new Date(school.lastUpdatedAt._seconds * 1000).toLocaleDateString('th-TH')}
           ${school.lastUpdatedBy ? ' โดยนักศึกษา ' + school.lastUpdatedBy : ''}
         </small>`
      : '';
    
    item.innerHTML = `
      <div style="font-weight:600;color:#2E3094;">${school.name}</div>
      <div style="font-size:0.85rem;color:#6c757d;">${school.affiliation || '-'}</div>
      <div style="font-size:0.85rem;color:#6c757d;">${school.amphoe || ''} ${school.province || ''}</div>
      ${updatedInfo}
    `;
    
    item.addEventListener('mousedown', function(e) {
      e.preventDefault();
      selectSchool(school);
      container.style.display = 'none';
    });
    
    item.addEventListener('mouseenter', function() {
      this.style.background = 'var(--color-bg)';
    });
    
    item.addEventListener('mouseleave', function() {
      this.style.background = 'transparent';
    });
    
    container.appendChild(item);
  });
  
  container.style.display = 'block';
}

// เลือกโรงเรียนจาก suggestion
function selectSchool(school) {
  selectedSchoolId = school.id;
  
  Swal.fire({
    title: 'พบข้อมูลโรงเรียนนี้แล้ว',
    html: `
      <div style="text-align:left;padding:12px">
        <p><strong>ชื่อ:</strong> ${school.name}</p>
        <p><strong>สังกัด:</strong> ${school.affiliation || '-'}</p>
        <p><strong>ที่อยู่:</strong> ${school.amphoe || ''} ${school.province || ''} ${school.postcode || ''}</p>
        ${school.lastUpdatedBy ? `
          <div style="margin-top:16px;padding:12px;background:#fff3cd;border-radius:6px;">
            <strong>⚠️ ข้อมูลนี้มีการอัปเดตโดย:</strong><br>
            นักศึกษา ${school.lastUpdatedBy}<br>
            <small>${new Date(school.lastUpdatedAt._seconds * 1000).toLocaleString('th-TH')}</small>
          </div>
        ` : ''}
        <p style="margin-top:16px;color:#6c757d;font-size:0.9rem;">
          ระบบจะกรอกข้อมูลพื้นฐานให้อัตโนมัติ<br>
          คุณเพียงกรอก <strong>ผู้อำนวยการ</strong> และ <strong>จำนวนนักเรียน/ครู/บุคลากร</strong>
        </p>
      </div>
    `,
    icon: 'info',
    showCancelButton: true,
    confirmButtonText: 'ใช้ข้อมูลนี้',
    cancelButtonText: 'ยกเลิก'
  }).then((result) => {
    if (result.isConfirmed) {
      fillFormWithSchoolData(school);
    } else {
      selectedSchoolId = null;
    }
  });
}

// กรอกข้อมูลโรงเรียนในฟอร์ม
function fillFormWithSchoolData(school) {
  const form = document.getElementById('currentForm');
  
  // กรอกข้อมูลพื้นฐาน
  form.querySelector('input[type="text"]').value = school.name;
  document.getElementById('affiliationSelect').value = school.affiliation || '';
  form.querySelector('input[placeholder*="ถนน"]').value = school.address || '';
  document.getElementById('districtAreaInput').value = school.districtArea || '';
  document.getElementById('subdistrictInput').value = school.subdistrict || '';
  document.getElementById('amphoeInput').value = school.amphoe || '';
  document.getElementById('provinceInput').value = school.province || '';
  document.getElementById('postcodeInput').value = school.postcode || '';
  
  // กรอก grade levels
  if (school.gradeLevels && school.gradeLevels.length > 0) {
    selectedGrades = [...school.gradeLevels];
    document.querySelectorAll('#gradeLevelModal input[type="checkbox"]').forEach(cb => {
      cb.checked = selectedGrades.includes(cb.value);
    });
    updateGradeDisplay();
  }
  
  // กรอกข้อมูลที่นักศึกษากรอกเอง
  const statInputs = form.querySelectorAll('input[type="number"]');
  if (statInputs[0]) statInputs[0].value = school.studentCount || '';
  if (statInputs[1]) statInputs[1].value = school.teacherCount || '';
  if (statInputs[2]) statInputs[2].value = school.staffCount || '';
  
  const phoneInput = form.querySelector('input[type="tel"]');
  const emailInput = form.querySelector('input[type="email"]');
  const principalInput = form.querySelectorAll('.form-section')[4].querySelector('input[type="text"]');
  
  if (phoneInput) phoneInput.value = school.phone || '';
  if (emailInput) emailInput.value = school.email || '';
  if (principalInput) principalInput.value = school.principal || '';
  
  // แจ้งเตือนว่ากรอกข้อมูลแล้ว
  Swal.fire({
    icon: 'success',
    title: 'กรอกข้อมูลแล้ว',
    text: 'ข้อมูลจากโรงเรียนนี้ถูกกรอกในฟอร์มเรียบร้อยแล้ว',
    timer: 2000,
    showConfirmButton: false
  });
}

// ฟังก์ชันเก่าที่ไม่ใช้แล้ว (เก็บไว้เผื่อมีปัญหา)
function highlightRequiredFields_OLD() {
  const form = document.getElementById('currentForm');
  const statInputs = form.querySelectorAll('input[type="number"]');
  const phoneInput = form.querySelector('input[type="tel"]');
  const emailInput = form.querySelector('input[type="email"]');
  const principalInput = form.querySelectorAll('.form-section')[4].querySelector('input[type="text"]');
  
  [statInputs[0], statInputs[1], statInputs[2], phoneInput, emailInput, principalInput].forEach(el => {
    if (el) {
      el.style.border = '2px solid #ffc107';
      el.style.background = '#fff3cd';
      setTimeout(() => {
        el.style.border = '';
        el.style.background = '';
      }, 3000);
    }
  });
  
  Swal.fire({
    icon: 'success',
    title: 'กรอกข้อมูลพื้นฐานแล้ว',
    text: 'กรุณากรอกข้อมูลผู้อำนวยการและสถิติโรงเรียน',
    timer: 2000,
    showConfirmButton: false
  });
}

// บันทึกข้อมูล
async function saveSchoolInfo(event) {
  event.preventDefault();
  
  const form = document.getElementById('currentForm');
  const formData = {
    name: form.querySelector('input[type="text"]').value.trim(),
    affiliation: document.getElementById('affiliationSelect').value,
    address: form.querySelector('input[placeholder*="ถนน"]').value.trim(),
    districtArea: document.getElementById('districtAreaInput').value.trim(),
    subdistrict: document.getElementById('subdistrictInput').value.trim(),
    amphoe: document.getElementById('amphoeInput').value.trim(),
    province: document.getElementById('provinceInput').value.trim(),
    postcode: document.getElementById('postcodeInput').value.trim(),
    gradeLevels: selectedGrades,
    
    // ข้อมูลที่นักศึกษากรอกเอง
    principal: form.querySelectorAll('.form-section')[4].querySelector('input[type="text"]').value.trim(),
    studentCount: form.querySelectorAll('input[type="number"]')[0].value,
    teacherCount: form.querySelectorAll('input[type="number"]')[1].value,
    staffCount: form.querySelectorAll('input[type="number"]')[2].value,
    phone: form.querySelector('input[type="tel"]').value.trim(),
    email: form.querySelector('input[type="email"]').value.trim()
  };
  
  // ยืนยันก่อนบันทึก
  const confirmResult = await Swal.fire({
    title: 'ยืนยันการบันทึกข้อมูล',
    html: `
      <div style="text-align:left;padding:12px">
        <p><strong>โรงเรียน:</strong> ${formData.name}</p>
        <p><strong>สังกัด:</strong> ${formData.affiliation}</p>
        <p><strong>ผู้อำนวยการ:</strong> ${formData.principal || '(ไม่ระบุ)'}</p>
        <hr style="margin:16px 0">
        <p style="color:#6c757d;font-size:0.9rem;">
          ข้อมูลนี้จะถูกบันทึกในระบบและสามารถแก้ไขได้ในภายหลัง<br>
          ${selectedSchoolId ? '<strong>⚠️ ข้อมูลโรงเรียนนี้มีอยู่แล้ว จะทำการอัปเดตข้อมูล</strong>' : ''}
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
    const response = await fetch('/api/school-info/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      // ตรวจสอบว่ามีคนอัปเดตไปก่อนหรือไม่
      if (result.updateWarning) {
        const updateDate = new Date(result.updateWarning.lastUpdatedAt);
        await Swal.fire({
          icon: 'info',
          title: 'บันทึกสำเร็จ',
          html: `
            <p>${result.message}</p>
            <hr style="margin:16px 0">
            <div style="background:#fff3cd;padding:12px;border-radius:6px;text-align:left">
              <strong>⚠️ ข้อมูลโรงเรียนนี้เคยถูกอัปเดตโดย:</strong><br>
              นักศึกษา ${result.updateWarning.lastUpdatedBy}<br>
              <small>${updateDate.toLocaleString('th-TH')}</small>
            </div>
          `,
          confirmButtonText: 'รับทราบ'
        });
      } else {
        await Swal.fire({
          icon: 'success',
          title: 'บันทึกสำเร็จ!',
          text: result.message,
          confirmButtonText: 'รับทราบ'
        });
      }
      
      // โหลดข้อมูลใหม่
      await loadMySubmission();
    } else {
      Swal.fire({
        icon: 'error',
        title: 'เกิดข้อผิดพลาด',
        text: result.message
      });
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

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  // ตรวจสอบสิทธิ์
  checkEligibility();
  
  // Setup auto-suggest
  setupSchoolNameAutocomplete();
});
