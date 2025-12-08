const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebaseAdmin');

// Middleware: ต้องเข้าสู่ระบบ
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  next();
}

// Middleware: ต้องมี studentId (ไม่ใช่ pure admin)
function requireStudent(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  const user = req.session.user;
  const userId = user.user_id || user.studentId || user.id;
  let role = user.role;
  if (!role && userId) {
    const firstChar = String(userId).charAt(0).toUpperCase();
    if (firstChar === 'T') role = 'teacher';
    else if (firstChar === 'A') role = 'admin';
    else if (/^\d/.test(firstChar)) role = 'student';
  }
  if (role !== 'student') {
    return res.status(403).json({ success: false, message: 'เฉพาะนักศึกษาเท่านั้น' });
  }
  next();
}

/**
 * GET /api/school-info/check-eligibility
 * ตรวจสอบว่านักศึกษาสามารถกรอกข้อมูลได้หรือไม่
 */
router.get('/api/school-info/check-eligibility', requireStudent, async (req, res) => {
  try {
    const studentId = String(req.session.user.user_id || req.session.user.studentId || req.session.user.id || '');
    console.log('[school-info] check-eligibility requested by studentId=', studentId);
    
    // หา observation ที่ active และมีนักศึกษาคนนี้อยู่
    const observationsSnapshot = await db.collection('observations')
      .where('status', '==', 'active')
      .get();
    
    let eligibleObservation = null;
    
    for (const obsDoc of observationsSnapshot.docs) {
      const obsData = obsDoc.data();
      
      // ตรวจสอบว่ามีนักศึกษาคนนี้ใน observation_students หรือไม่
      const studentInObs = await db.collection('observation_students')
        .where('observationId', '==', obsDoc.id)
        .where('studentId', '==', studentId)
        .where('status', '==', 'active')
        .limit(1)
        .get();
      
      if (!studentInObs.empty) {
        // ตรวจสอบว่าอยู่ภายใน 15 วันหรือไม่
        const startDate = obsData.startDate?.toDate ? obsData.startDate.toDate() : new Date(obsData.startDate);
        const now = new Date();
        const daysPassed = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
        
        if (daysPassed <= 15) {
          eligibleObservation = {
            id: obsDoc.id,
            name: obsData.name,
            startDate: startDate.toISOString(),
            daysPassed: daysPassed,
            daysRemaining: 15 - daysPassed
          };
          break;
        }
      }
    }
    
    if (eligibleObservation) {
      res.json({
        success: true,
        eligible: true,
        observation: eligibleObservation
      });
    } else {
      res.json({
        success: true,
        eligible: false,
        message: 'ไม่พบการฝึกประสบการณ์วิชาชีพครูที่สามารถกรอกข้อมูลได้ (ต้องอยู่ในสถานะ active และภายใน 15 วัน)'
      });
    }
  } catch (error) {
    console.error('Error checking eligibility');
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/**
 * GET /api/school-info/search-schools?query=xxx
 * ค้นหาโรงเรียนจากฐานข้อมูล (auto-suggest)
 */
router.get('/api/school-info/search-schools', requireAuth, async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    console.log('[school-info] search-schools query=', query, 'from=', req.session && req.session.user ? req.session.user.user_id || req.session.user.id : 'unknown');
    
    if (!query || query.length < 2) {
      return res.json({ success: true, schools: [] });
    }
    
    // ค้นหาโรงเรียนที่มีชื่อคล้ายกัน
    const schoolsSnapshot = await db.collection('schools')
      .orderBy('name')
      .startAt(query)
      .endAt(query + '\uf8ff')
      .limit(10)
      .get();
    
    const schools = [];
    schoolsSnapshot.forEach(doc => {
      const data = doc.data();
      const studentIds = data.studentIds || [];
      schools.push({
        id: doc.id,
        name: data.name,
        affiliation: data.affiliation || '',
        address: data.address || '',
        districtArea: data.districtArea || '',
        subdistrict: data.subdistrict || '',
        amphoe: data.amphoe || '',
        province: data.province || '',
        postcode: data.postcode || '',
        gradeLevels: data.gradeLevels || [],
        principal: data.principal || '',
        studentCount: data.studentCount || 0,
        teacherCount: data.teacherCount || 0,
        staffCount: data.staffCount || 0,
        phone: data.phone || '',
        email: data.email || '',
        lastUpdatedBy: data.lastUpdatedBy || null,
        lastUpdatedAt: data.lastUpdatedAt || null,
        submittedByCount: studentIds.length // จำนวนนักศึกษาที่กรอกข้อมูลโรงเรียนนี้
      });
    });
    
    res.json({ success: true, schools });
  } catch (error) {
    console.error('Error searching schools');
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/**
 * POST /api/school-info/save
 * บันทึกข้อมูลโรงเรียน
 */
router.post('/api/school-info/save', requireStudent, async (req, res) => {
  try {
    const studentId = String(req.session.user.user_id || req.session.user.studentId || req.session.user.id || '');
    const schoolData = req.body;
    
    // ตรวจสอบความสมบูรณ์ของข้อมูล (ไม่บังคับผู้อำนวยการ สามารถกรอกทีหลังได้)
    if (!schoolData.name || !schoolData.affiliation || !schoolData.amphoe || 
        !schoolData.province || !schoolData.postcode || !schoolData.gradeLevels || 
        schoolData.gradeLevels.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกข้อมูลให้ครบถ้วน (ชื่อ, สังกัด, อำเภอ, จังหวัด, รหัสไปรษณีย์, ระดับชั้น)'
      });
    }
    
    // ตรวจสอบสิทธิ์
    const eligibilityCheck = await checkEligibility(studentId);
    if (!eligibilityCheck.eligible) {
      return res.status(403).json({
        success: false,
        message: eligibilityCheck.message
      });
    }
    
    const now = admin.firestore.FieldValue.serverTimestamp();
    
    // ตรวจสอบว่านักศึกษาเคยกรอกโรงเรียนไปแล้วหรือยัง (ใน observationId นี้)
    const existingSchoolSnapshot = await db.collection('schools')
      .where('studentIds', 'array-contains', studentId)
      .where('observationId', '==', eligibilityCheck.observationId)
      .limit(1)
      .get();
    
    let oldSchoolId = null;
    let oldSchoolName = null;
    let isChangingSchool = false;
    
    if (!existingSchoolSnapshot.empty) {
      // นักศึกษาเคยกรอกโรงเรียนไปแล้ว
      const oldSchoolDoc = existingSchoolSnapshot.docs[0];
      const oldSchoolData = oldSchoolDoc.data();
      oldSchoolId = oldSchoolDoc.id;
      oldSchoolName = oldSchoolData.name;
      
      // ตรวจสอบว่ากำลังจะเปลี่ยนโรงเรียนหรือไม่
      if (oldSchoolName !== schoolData.name.trim()) {
        isChangingSchool = true;
        
        // ตรวจสอบว่าผ่านมา 7 วันแล้วหรือยัง
        const createdAt = oldSchoolData.createdAt?.toDate ? oldSchoolData.createdAt.toDate() : new Date(oldSchoolData.createdAt);
        const now = new Date();
        const daysPassed = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        
        if (daysPassed > 7) {
          return res.status(403).json({
            success: false,
            message: `ไม่สามารถเปลี่ยนโรงเรียนได้ เนื่องจากข้อมูลถูกสร้างเมื่อ ${daysPassed} วันที่แล้ว (เกิน 7 วัน)`,
            cannotChange: true,
            daysPassed: daysPassed
          });
        }
        
        // ตรวจสอบว่ามีการประเมินใดๆ ในโรงเรียนเก่าหรือไม่
        const hasEvaluations = await checkStudentEvaluations(studentId, eligibilityCheck.observationId);
        
        if (hasEvaluations.hasData) {
          return res.status(400).json({
            success: false,
            message: 'คุณมีการประเมินในโรงเรียนเดิมอยู่ หากต้องการเปลี่ยนโรงเรียน ข้อมูลการประเมินทั้งหมดจะถูกลบ',
            requiresConfirmation: true,
            evaluationCount: hasEvaluations.count,
            oldSchoolName: oldSchoolName,
            newSchoolName: schoolData.name.trim()
          });
        }
      }
    }
    
    // ถ้ามีการเปลี่ยนโรงเรียนและมีการประเมิน ต้องได้รับการยืนยันจาก frontend
    if (isChangingSchool && schoolData.confirmChange === true && schoolData.deleteEvaluations === true) {
      // ลบข้อมูลการประเมินทั้งหมดของนักศึกษา
      await deleteStudentEvaluations(studentId, eligibilityCheck.observationId);
      
      // ลบ studentId ออกจากโรงเรียนเก่า
      await db.collection('schools').doc(oldSchoolId).update({
        studentIds: admin.firestore.FieldValue.arrayRemove(studentId)
      });
    } else if (isChangingSchool) {
      // ลบ studentId ออกจากโรงเรียนเก่า (ไม่มีการประเมิน)
      await db.collection('schools').doc(oldSchoolId).update({
        studentIds: admin.firestore.FieldValue.arrayRemove(studentId)
      });
    }
    
    // ค้นหาโรงเรียนจากชื่อ + observationId (1 โรงเรียน = 1 document)
    const targetSchoolSnapshot = await db.collection('schools')
      .where('name', '==', schoolData.name.trim())
      .where('observationId', '==', eligibilityCheck.observationId)
      .limit(1)
      .get();
    
    let schoolId;
    let isNewSchool = targetSchoolSnapshot.empty;
    let studentCount = 1;
    
    if (isNewSchool) {
      // สร้างโรงเรียนใหม่พร้อม studentIds เป็น array
      const newSchoolRef = await db.collection('schools').add({
        name: schoolData.name.trim(),
        affiliation: schoolData.affiliation,
        address: schoolData.address || '',
        districtArea: schoolData.districtArea || '',
        subdistrict: schoolData.subdistrict || '',
        amphoe: schoolData.amphoe,
        province: schoolData.province,
        postcode: schoolData.postcode,
        gradeLevels: schoolData.gradeLevels,
        
        // ข้อมูลที่นักศึกษากรอก
        principal: schoolData.principal || '',
        studentCount: parseInt(schoolData.studentCount) || 0,
        teacherCount: parseInt(schoolData.teacherCount) || 0,
        staffCount: parseInt(schoolData.staffCount) || 0,
        phone: schoolData.phone || '',
        email: schoolData.email || '',
        
        // ข้อมูลการติดตาม
        observationId: eligibilityCheck.observationId,
        studentIds: [studentId], // เก็บเป็น array
        
        createdAt: now,
        createdBy: studentId,
        lastUpdatedAt: now,
        lastUpdatedBy: studentId
      });
      schoolId = newSchoolRef.id;
    } else {
      // โรงเรียนมีอยู่แล้ว → อัปเดตข้อมูลและเพิ่ม studentId เข้า array (ถ้ายังไม่มี)
      schoolId = targetSchoolSnapshot.docs[0].id;
      const existingData = targetSchoolSnapshot.docs[0].data();
      const currentStudentIds = existingData.studentIds || [];
      
      // ตรวจสอบว่า studentId นี้มีอยู่ใน array แล้วหรือยัง
      const studentExists = currentStudentIds.includes(studentId);
      
      const updateData = {
        name: schoolData.name.trim(),
        affiliation: schoolData.affiliation,
        address: schoolData.address || '',
        districtArea: schoolData.districtArea || '',
        subdistrict: schoolData.subdistrict || '',
        amphoe: schoolData.amphoe,
        province: schoolData.province,
        postcode: schoolData.postcode,
        gradeLevels: schoolData.gradeLevels,
        
        // อัปเดตข้อมูลที่นักศึกษากรอก
        principal: schoolData.principal || '',
        studentCount: parseInt(schoolData.studentCount) || 0,
        teacherCount: parseInt(schoolData.teacherCount) || 0,
        staffCount: parseInt(schoolData.staffCount) || 0,
        phone: schoolData.phone || '',
        email: schoolData.email || '',
        
        lastUpdatedAt: now,
        lastUpdatedBy: studentId
      };
      
      // ถ้านักศึกษายังไม่มีใน array ให้เพิ่มเข้าไป
      if (!studentExists) {
        updateData.studentIds = admin.firestore.FieldValue.arrayUnion(studentId);
      }
      
      await db.collection('schools').doc(schoolId).update(updateData);
      studentCount = studentExists ? currentStudentIds.length : currentStudentIds.length + 1;
    }
    
    res.json({
      success: true,
      message: isNewSchool 
        ? 'บันทึกข้อมูลโรงเรียนใหม่สำเร็จ' 
        : 'อัปเดตข้อมูลโรงเรียนสำเร็จ',
      schoolId: schoolId,
      isNewSchool: isNewSchool,
      studentCount: studentCount // จำนวนนักศึกษาที่กรอกข้อมูลโรงเรียนนี้
    });
    
  } catch (error) {
    console.error('Error saving school info');
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' 
    });
  }
});

/**
 * GET /api/school-info/my-submission
 * ดึงข้อมูลที่นักศึกษาเคยกรอกไว้
 */
router.get('/api/school-info/my-submission', requireStudent, async (req, res) => {
  try {
    const studentId = String(req.session.user.user_id || req.session.user.studentId || req.session.user.id || '');
    console.log('[school-info] my-submission requested by studentId=', studentId);
    
    // หา observation ที่ active
    const eligibilityCheck = await checkEligibility(studentId);
    if (!eligibilityCheck.eligible) {
      return res.json({ success: true, hasSubmission: false });
    }
    
    // หาโรงเรียนที่นักศึกษาคนนี้กรอกในงวดนี้ (ค้นหาจาก studentIds array)
    const schoolSnapshot = await db.collection('schools')
      .where('studentIds', 'array-contains', studentId)
      .where('observationId', '==', eligibilityCheck.observationId)
      .limit(1)
      .get();
    
    console.log('[school-info] my-submission - schools found=', schoolSnapshot.size);
    if (schoolSnapshot.empty) {
      return res.json({ success: true, hasSubmission: false });
    }
    
    const schoolData = schoolSnapshot.docs[0].data();
    
    res.json({
      success: true,
      hasSubmission: true,
      data: {
        name: schoolData.name || '',
        affiliation: schoolData.affiliation || '',
        address: schoolData.address || '',
        districtArea: schoolData.districtArea || '',
        subdistrict: schoolData.subdistrict || '',
        amphoe: schoolData.amphoe || '',
        province: schoolData.province || '',
        postcode: schoolData.postcode || '',
        gradeLevels: schoolData.gradeLevels || [],
        
        principal: schoolData.principal || '',
        studentCount: schoolData.studentCount || 0,
        teacherCount: schoolData.teacherCount || 0,
        staffCount: schoolData.staffCount || 0,
        phone: schoolData.phone || '',
        email: schoolData.email || '',
        
        lastUpdatedBy: schoolData.lastUpdatedBy || null,
        lastUpdatedAt: schoolData.lastUpdatedAt || null
      }
    ,
      observationId: eligibilityCheck.observationId
    });
    
  } catch (error) {
    console.error('Error fetching submission');
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

// Helper function
async function checkEligibility(studentId) {
  const observationsSnapshot = await db.collection('observations')
    .where('status', '==', 'active')
    .get();
  
  for (const obsDoc of observationsSnapshot.docs) {
    const obsData = obsDoc.data();
    
    const studentInObs = await db.collection('observation_students')
      .where('observationId', '==', obsDoc.id)
      .where('studentId', '==', studentId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (!studentInObs.empty) {
      const startDate = obsData.startDate?.toDate ? obsData.startDate.toDate() : new Date(obsData.startDate);
      const now = new Date();
      const daysPassed = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
      
      if (daysPassed <= 15) {
        return {
          eligible: true,
          observationId: obsDoc.id,
          daysPassed: daysPassed
        };
      }
    }
  }
  
  return {
    eligible: false,
    message: 'ไม่พบการฝึกประสบการณ์วิชาชีพครูที่สามารถกรอกข้อมูลได้'
  };
}

/**
 * ตรวจสอบว่านักศึกษามีการประเมินใดๆ ในงวดนี้หรือไม่
 */
async function checkStudentEvaluations(studentId, observationId) {
  try {
    // ตรวจสอบใน collection ที่เกี่ยวข้องกับการประเมิน
    // (ปรับตาม collection จริงในระบบ)
    
    // ตัวอย่าง: ตรวจสอบใน mentors collection
    const mentorsSnapshot = await db.collection('mentors')
      .where('studentId', '==', studentId)
      .where('observationId', '==', observationId)
      .get();
    
    if (!mentorsSnapshot.empty) {
      return { hasData: true, count: mentorsSnapshot.size };
    }
    
    // TODO: เพิ่มการตรวจสอบ collection อื่นๆ เช่น evaluations, observations_data, etc.
    
    return { hasData: false, count: 0 };
  } catch (error) {
    console.error('Error checking evaluations');
    return { hasData: false, count: 0 };
  }
}

/**
 * ลบข้อมูลการประเมินทั้งหมดของนักศึกษาในงวดนี้
 */
async function deleteStudentEvaluations(studentId, observationId) {
  try {
    // ลบข้อมูลครูพี่เลี้ยง
    const mentorsSnapshot = await db.collection('mentors')
      .where('studentId', '==', studentId)
      .where('observationId', '==', observationId)
      .get();
    
    const deletePromises = [];
    mentorsSnapshot.forEach(doc => {
      deletePromises.push(db.collection('mentors').doc(doc.id).delete());
    });
    
    // TODO: เพิ่มการลบข้อมูลจาก collection อื่นๆ เช่น evaluations, observations_data, etc.
    
    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Error deleting evaluations');
    throw error;
  }
}

module.exports = router;
