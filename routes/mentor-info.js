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
 * GET /api/mentor-info/check-eligibility
 * ตรวจสอบว่านักศึกษาสามารถกรอกข้อมูลได้หรือไม่ (ต้องมีข้อมูลโรงเรียนก่อน)
 */
router.get('/api/mentor-info/check-eligibility', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.user_id || req.session.user.studentId || req.session.user.id;
    
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
          // ตรวจสอบว่ามีข้อมูลโรงเรียนหรือไม่ (เช็คจาก studentIds array)
          const schoolSnapshot = await db.collection('schools')
            .where('studentIds', 'array-contains', studentId)
            .where('observationId', '==', obsDoc.id)
            .limit(1)
            .get();
          
          if (schoolSnapshot.empty) {
            return res.json({
              success: true,
              eligible: false,
              message: 'กรุณากรอกข้อมูลโรงเรียนก่อน จึงจะสามารถกรอกข้อมูลครูพี่เลี้ยงได้',
              needSchoolInfo: true
            });
          }
          
          const schoolData = schoolSnapshot.docs[0].data();
          
          eligibleObservation = {
            id: obsDoc.id,
            name: obsData.name,
            startDate: startDate.toISOString(),
            daysPassed: daysPassed,
            daysRemaining: 15 - daysPassed,
            schoolId: schoolSnapshot.docs[0].id,
            schoolName: schoolData.name
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
    console.error('Error checking eligibility:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/**
 * GET /api/mentor-info/search-mentors?schoolName=xxx
 * ค้นหาครูพี่เลี้ยงจากโรงเรียนเดียวกัน (auto-suggest)
 */
router.get('/api/mentor-info/search-mentors', requireAuth, async (req, res) => {
  try {
    const studentId = req.session.user.user_id || req.session.user.studentId || req.session.user.id;
    const query = (req.query.query || '').trim();
    
    if (!query || query.length < 2) {
      return res.json({ success: true, mentors: [] });
    }
    
    // หาโรงเรียนของนักศึกษา (เช็คจาก studentIds array)
    const schoolSnapshot = await db.collection('schools')
      .where('studentIds', 'array-contains', studentId)
      .limit(1)
      .get();
    
    if (schoolSnapshot.empty) {
      return res.json({ success: true, mentors: [] });
    }
    
    const schoolName = schoolSnapshot.docs[0].data().name;
    
    // ค้นหาครูพี่เลี้ยงที่มีชื่อหรือนามสกุลคล้ายกัน และอยู่ในโรงเรียนเดียวกัน
    const mentorsSnapshot = await db.collection('mentors')
      .where('schoolName', '==', schoolName)
      .get();
    
    const mentors = [];
    mentorsSnapshot.forEach(doc => {
      const data = doc.data();
      const fullName = `${data.firstName || ''} ${data.lastName || ''}`.toLowerCase();
      
      if (fullName.includes(query.toLowerCase())) {
        mentors.push({
          id: doc.id,
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          position: data.position || '',
          phone: data.phone || '',
          email: data.email || '',
          education: data.education || [],
          experience: data.experience || 0,
          department: data.department || '',
          teachingSubjects: data.teachingSubjects || [],
          lastUpdatedBy: data.lastUpdatedBy || null,
          lastUpdatedAt: data.lastUpdatedAt || null
        });
      }
    });
    
    res.json({ success: true, mentors: mentors.slice(0, 10) });
  } catch (error) {
    console.error('Error searching mentors:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/**
 * POST /api/mentor-info/save
 * บันทึกข้อมูลครูพี่เลี้ยง
 */
router.post('/api/mentor-info/save', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.user_id || req.session.user.studentId || req.session.user.id;
    const mentorData = req.body;
    
    // ตรวจสอบความสมบูรณ์ของข้อมูล (บังคับเฉพาะชื่อ-นามสกุล)
    if (!mentorData.firstName || !mentorData.lastName) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกชื่อและนามสกุลครูพี่เลี้ยง'
      });
    }
    
    // ตรวจสอบสิทธิ์และข้อมูลโรงเรียน
    const eligibilityCheck = await checkEligibility(studentId);
    if (!eligibilityCheck.eligible) {
      return res.status(403).json({
        success: false,
        message: eligibilityCheck.message,
        needSchoolInfo: eligibilityCheck.needSchoolInfo
      });
    }
    
    const now = admin.firestore.FieldValue.serverTimestamp();
    
    // ตรวจสอบว่านักศึกษาคนนี้เคยกรอกข้อมูลครูพี่เลี้ยงในรอบนี้แล้วหรือไม่
    const myMentorSnapshot = await db.collection('mentors')
      .where('studentId', '==', studentId)
      .where('observationId', '==', eligibilityCheck.observationId)
      .limit(1)
      .get();
    
    let mentorId;
    let isNewMentor = myMentorSnapshot.empty;
    
    if (isNewMentor) {
      // ตรวจสอบว่าครูพี่เลี้ยงชื่อนี้มีนักศึกษาในรอบนี้แล้วหรือยัง (1 ครู : 1 นักศึกษา ต่อรอบ)
      const mentorInCurrentObservation = await db.collection('mentors')
        .where('schoolName', '==', eligibilityCheck.schoolName)
        .where('firstName', '==', mentorData.firstName.trim())
        .where('lastName', '==', mentorData.lastName.trim())
        .where('observationId', '==', eligibilityCheck.observationId)
        .limit(1)
        .get();
      
      if (!mentorInCurrentObservation.empty) {
        const existingMentor = mentorInCurrentObservation.docs[0].data();
        
        // ครูพี่เลี้ยงคนนี้มีนักศึกษาอยู่แล้วในการฝึกประสบการณ์วิชาชีพครูนี้
        return res.status(400).json({
          success: false,
          message: `ครูพี่เลี้ยงท่านนี้มีนักศึกษาดูแลอยู่แล้วในการฝึกประสบการณ์วิชาชีพครูนี้ (นักศึกษา ${existingMentor.studentId}) กรุณาเลือกครูพี่เลี้ยงท่านอื่น`,
          mentorOccupied: true,
          occupiedBy: existingMentor.studentId
        });
      }
      
      // สร้างครูพี่เลี้ยงใหม่สำหรับนักศึกษาคนนี้
      const newMentorRef = await db.collection('mentors').add({
        firstName: mentorData.firstName.trim(),
        lastName: mentorData.lastName.trim(),
        position: mentorData.position || '',
        phone: mentorData.phone || '',
        email: mentorData.email || '',
        education: mentorData.education || [],
        experience: parseInt(mentorData.experience) || 0,
        department: mentorData.department || '',
        teachingSubjects: mentorData.teachingSubjects || [],
        
        // ข้อมูลการติดตาม
        schoolId: eligibilityCheck.schoolId,
        schoolName: eligibilityCheck.schoolName,
        observationId: eligibilityCheck.observationId,
        studentId: studentId,
        
        createdAt: now,
        createdBy: studentId,
        lastUpdatedAt: now,
        lastUpdatedBy: studentId
      });
      mentorId = newMentorRef.id;
    } else {
      // อัปเดตข้อมูลครูพี่เลี้ยงของตัวเอง
      mentorId = myMentorSnapshot.docs[0].id;
      
      await db.collection('mentors').doc(mentorId).update({
        firstName: mentorData.firstName.trim(),
        lastName: mentorData.lastName.trim(),
        position: mentorData.position || '',
        phone: mentorData.phone || '',
        email: mentorData.email || '',
        education: mentorData.education || [],
        experience: parseInt(mentorData.experience) || 0,
        department: mentorData.department || '',
        teachingSubjects: mentorData.teachingSubjects || [],
        
        lastUpdatedAt: now,
        lastUpdatedBy: studentId
      });
    }
    
    res.json({
      success: true,
      message: isNewMentor 
        ? 'บันทึกข้อมูลครูพี่เลี้ยงใหม่สำเร็จ' 
        : 'อัปเดตข้อมูลครูพี่เลี้ยงสำเร็จ',
      mentorId: mentorId,
      isNewMentor: isNewMentor
    });
    
  } catch (error) {
    console.error('Error saving mentor info:', error);
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' 
    });
  }
});

/**
 * GET /api/mentor-info/my-submission
 * ดึงข้อมูลครูพี่เลี้ยงที่นักศึกษาเคยกรอกไว้
 */
router.get('/api/mentor-info/my-submission', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.user_id || req.session.user.studentId || req.session.user.id;
    
    // ตรวจสอบสิทธิ์
    const eligibilityCheck = await checkEligibility(studentId);
    if (!eligibilityCheck.eligible) {
      return res.json({ success: true, hasSubmission: false });
    }
    
    // หาครูพี่เลี้ยงที่นักศึกษาคนนี้กรอกในรอบนี้
    const mentorSnapshot = await db.collection('mentors')
      .where('studentId', '==', studentId)
      .where('observationId', '==', eligibilityCheck.observationId)
      .limit(1)
      .get();
    
    if (mentorSnapshot.empty) {
      return res.json({ success: true, hasSubmission: false });
    }
    
    const mentorData = mentorSnapshot.docs[0].data();
    
    res.json({
      success: true,
      hasSubmission: true,
      data: {
        firstName: mentorData.firstName || '',
        lastName: mentorData.lastName || '',
        position: mentorData.position || '',
        phone: mentorData.phone || '',
        email: mentorData.email || '',
        education: mentorData.education || [],
        experience: mentorData.experience || 0,
        department: mentorData.department || '',
        teachingSubjects: mentorData.teachingSubjects || [],
        
        lastUpdatedBy: mentorData.lastUpdatedBy || null,
        lastUpdatedAt: mentorData.lastUpdatedAt || null
      }
    });
    
  } catch (error) {
    console.error('Error fetching mentor submission:', error);
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
        // ตรวจสอบว่ามีข้อมูลโรงเรียนหรือไม่ (เช็คจาก studentIds array และ observationId ที่ตรงกัน)
        const schoolSnapshot = await db.collection('schools')
          .where('studentIds', 'array-contains', studentId)
          .where('observationId', '==', obsDoc.id)
          .limit(1)
          .get();
        
        if (schoolSnapshot.empty) {
          return {
            eligible: false,
            message: 'กรุณากรอกข้อมูลโรงเรียนก่อน',
            needSchoolInfo: true
          };
        }
        
        const schoolData = schoolSnapshot.docs[0].data();
        
        return {
          eligible: true,
          observationId: obsDoc.id,
          schoolId: schoolSnapshot.docs[0].id,
          schoolName: schoolData.name,
          daysPassed: daysPassed
        };
      }
    }
  }
  
  return {
    eligible: false,
    message: 'ไม่พบรอบการสังเกตที่สามารถกรอกข้อมูลได้'
  };
}

module.exports = router;
