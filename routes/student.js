/**
 * routes/student.js
 * API สำหรับข้อมูลนักศึกษา (ดึงจาก Firebase)
 * - ประวัติการฝึกประสบการณ์
 * - ข้อมูลการสังเกต
 * - สรุปผลการประเมิน
 * - แผนการสอน
 */

const express = require('express');
const router = express.Router();
const { db, admin, storage } = require('../config/firebaseAdmin');

// Middleware: ตรวจสอบการเข้าสู่ระบบ
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  next();
}

// Middleware: ตรวจสอบว่าเป็นนักศึกษา
function requireStudent(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  if (req.session.user.role !== 'student') {
    return res.status(403).json({ success: false, message: 'เฉพาะนักศึกษาเท่านั้น' });
  }
  next();
}

/**
 * GET /api/student/dashboard
 * ดึงข้อมูลภาพรวมสำหรับหน้า Dashboard นักศึกษา
 * - ข้อมูลผู้ใช้
 * - การสังเกตปัจจุบัน (active)
 * - ประวัติการสังเกต (completed)
 * - สถิติการประเมิน
 */
router.get('/api/student/dashboard', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.studentId;
    const userYear = req.session.user.year || 1;

    console.log(`📊 Loading student dashboard for: ${studentId} (Year ${userYear})`);

    // 1. ดึงข้อมูล user จาก Firestore
    const userSnapshot = await db.collection('users')
      .where('studentId', '==', studentId)
      .limit(1)
      .get();

    let userData = null;
    if (!userSnapshot.empty) {
      userData = userSnapshot.docs[0].data();
    }

    // 2. ดึงข้อมูลการสังเกตที่นักศึกษามีส่วนร่วม
    const studentObsSnapshot = await db.collection('observation_students')
      .where('studentId', '==', studentId)
      .get();

    const observationIds = [];
    const studentObsMap = {}; // เก็บข้อมูลสถานะของนักศึกษาใน observation

    studentObsSnapshot.forEach(doc => {
      const data = doc.data();
      observationIds.push(data.observationId);
      studentObsMap[data.observationId] = {
        docId: doc.id,
        ...data
      };
    });

    console.log(`📋 Found ${observationIds.length} observations for student`);

    // 3. ดึงข้อมูล observations ที่เกี่ยวข้อง
    let activeObservation = null;
    const practiceHistory = [];

    for (const obsId of observationIds) {
      const obsDoc = await db.collection('observations').doc(obsId).get();

      if (obsDoc.exists) {
        const obsData = obsDoc.data();
        const studentObs = studentObsMap[obsId] || {};

        // Normalize date fields to ISO strings when possible
        const normalizeDate = (val) => {
          try {
            if (!val) return null;
            if (typeof val.toDate === 'function') return val.toDate().toISOString();
            if (val._seconds) return new Date(val._seconds * 1000).toISOString();
            return typeof val === 'string' ? val : JSON.stringify(val);
          } catch (e) {
            return String(val);
          }
        };

        const observationInfo = {
          id: obsId,
          name: obsData.name || '-',
          academicYear: obsData.academicYear || null,
          yearLevel: obsData.yearLevel || null,
          startDate: normalizeDate(obsData.startDate),
          endDate: normalizeDate(obsData.endDate),
          status: obsData.status || 'unknown',
          description: obsData.description || '',
          // ข้อมูลสถานะของนักศึกษาใน observation นี้
          studentStatus: studentObs.status || 'unknown',
          evaluationsCompleted: studentObs.evaluationsCompleted || 0,
          lessonPlanSubmitted: studentObs.lessonPlanSubmitted || false,
          notes: studentObs.notes || ''
        };

        // แยก active และ completed
        if (obsData.status === 'active' && studentObs.status === 'active') {
          activeObservation = observationInfo;
        } else {
          practiceHistory.push(observationInfo);
        }
      } else {
        console.warn(`Observation document not found: ${obsId}`);
      }
    }

    // 4. ดึงข้อมูลโรงเรียนฝึกสอน (ถ้ามี activeObservation)
    let schoolInfo = null;
    if (activeObservation) {
      // ดึงจาก collection schools ที่มี observationId ตรงกับ observation ที่ active
      // และมี studentIds array ที่มี studentId ของนักศึกษา
      const schoolsSnapshot = await db.collection('schools')
        .where('observationId', '==', activeObservation.id)
        .get();

      if (!schoolsSnapshot.empty) {
        // หา school ที่มี studentId อยู่ใน array
        for (const doc of schoolsSnapshot.docs) {
          const data = doc.data();
          if (data.studentIds && Array.isArray(data.studentIds) && data.studentIds.includes(studentId)) {
            schoolInfo = {
              id: doc.id,
              name: data.name,
              province: data.province,
              amphoe: data.amphoe,
              district: data.district,
              affiliation: data.affiliation,
              observationId: data.observationId
            };
            break;
          }
        }
      }
    }

    // 5. ดึงข้อมูลครูพี่เลี้ยง (ถ้ามี activeObservation)
    let mentorInfo = null;
    if (activeObservation) {
      console.log(`🔍 Looking for mentor with studentId: ${studentId}, observationId: ${activeObservation.id}`);
      
      // ดึงจาก collection mentors ที่มี studentId และ observationId ตรงกัน
      const mentorSnapshot = await db.collection('mentors')
        .where('studentId', '==', studentId)
        .where('observationId', '==', activeObservation.id)
        .limit(1)
        .get();

      console.log(`📋 Mentor query result: ${mentorSnapshot.empty ? 'NOT FOUND' : 'FOUND'}`);

      if (!mentorSnapshot.empty) {
        const mentorData = mentorSnapshot.docs[0].data();
        
        // รวม firstName และ lastName เป็น name
        const fullName = `${mentorData.firstName || ''} ${mentorData.lastName || ''}`.trim();
        
        console.log(`✅ Mentor data:`, {
          firstName: mentorData.firstName,
          lastName: mentorData.lastName,
          fullName: fullName,
          position: mentorData.position,
          observationId: mentorData.observationId
        });
        
        mentorInfo = {
          id: mentorSnapshot.docs[0].id,
          name: fullName, // รวม firstName + lastName
          firstName: mentorData.firstName || '',
          lastName: mentorData.lastName || '',
          position: mentorData.position || '',
          department: mentorData.department || '',
          phone: mentorData.phone || '',
          email: mentorData.email || '',
          teachingSubjects: mentorData.teachingSubjects || [],
          observationId: mentorData.observationId
        };
      } else {
        console.log(`⚠️ No mentor found for studentId: ${studentId}, observationId: ${activeObservation.id}`);
      }
    } else {
      console.log(`ℹ️ No active observation - skipping mentor lookup`);
    }

    // 6. ดึงผลการประเมิน (ถ้ามี)
    let evaluationData = null;
    const evalSnapshot = await db.collection('evaluations')
      .where('studentId', '==', studentId)
      .get();

    if (!evalSnapshot.empty) {
      const evaluations = [];
      evalSnapshot.forEach(doc => {
        const d = doc.data();
        // normalize createdAt if present
        if (d.createdAt && typeof d.createdAt.toDate === 'function') d.createdAt = d.createdAt.toDate().toISOString();
        evaluations.push({
          id: doc.id,
          ...d
        });
      });
      evaluationData = evaluations;
    }

    // 7. ดึงแผนการสอน (ปี 2-3 เท่านั้น)
    let lessonPlans = [];
    if (userYear >= 2 && userYear <= 3) {
      const plansSnapshot = await db.collection('lesson_plans')
        .where('studentId', '==', studentId)
        .get();

      plansSnapshot.forEach(doc => {
        const d = doc.data();
        if (d.createdAt && typeof d.createdAt.toDate === 'function') d.createdAt = d.createdAt.toDate().toISOString();
        lessonPlans.push({
          id: doc.id,
          ...d
        });
      });
      
      // Sort ฝั่ง code แทน (เพื่อหลีกเลี่ยง composite index)
      lessonPlans.sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });
    }

    // 8. คำนวณสถิติ - นับการประเมินที่เกี่ยวกับ active observation
    let completedEvaluations = 0;
    if (activeObservation && evaluationData) {
      completedEvaluations = evaluationData.filter(
        ev => ev.observationId === activeObservation.id
      ).length;
    }

    const stats = {
      totalObservations: observationIds.length,
      completedObservations: practiceHistory.length,
      totalEvaluations: evaluationData ? evaluationData.length : 0,
      completedEvaluations: completedEvaluations, // การประเมินที่เสร็จในงวดปัจจุบัน
      totalLessonPlans: lessonPlans.length
    };

    // Response
    res.json({
      success: true,
      data: {
        user: {
          studentId,
          firstName: userData?.firstName || req.session.user.firstName,
          lastName: userData?.lastName || req.session.user.lastName,
          year: userYear,
          email: userData?.email || req.session.user.email
        },
        activeObservation,
        practiceHistory,
        schoolInfo,
        mentorInfo,
        evaluationData,
        lessonPlans,
        stats,
        // Feature flags
        canUploadLessonPlan: userYear >= 2 && userYear <= 3
      }
    });

  } catch (error) {
    console.error('Error loading student dashboard:', error);
    // Return error message for easier debugging (remove or hide in production)
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการโหลดข้อมูล',
      error: error.message || String(error)
    });
  }
});

/**
 * GET /api/student/evaluations
 * ดึงผลการประเมินทั้งหมดของนักศึกษา
 */
router.get('/api/student/evaluations', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.studentId;

    const evalSnapshot = await db.collection('evaluations')
      .where('studentId', '==', studentId)
      .get();

    const evaluations = [];
    evalSnapshot.forEach(doc => {
      const data = doc.data();
      evaluations.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || null
      });
    });
    
    // Sort ฝั่ง code แทน (เพื่อหลีกเลี่ยง composite index)
    evaluations.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    res.json({
      success: true,
      evaluations
    });

  } catch (error) {
    console.error('Error fetching evaluations:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลการประเมิน'
    });
  }
});

/**
 * GET /api/student/lesson-plans
 * ดึงแผนการสอนทั้งหมดของนักศึกษา (ปี 2-3 เท่านั้น)
 */
router.get('/api/student/lesson-plans', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.studentId;
    const userYear = req.session.user.year || 1;

    // เฉพาะปี 2-3 เท่านั้น
    if (userYear < 2 || userYear > 3) {
      return res.json({
        success: true,
        lessonPlans: [],
        message: 'แผนการสอนสำหรับนักศึกษาปี 2-3 เท่านั้น'
      });
    }

    const plansSnapshot = await db.collection('lesson_plans')
      .where('studentId', '==', studentId)
      .get();

    const lessonPlans = [];
    plansSnapshot.forEach(doc => {
      const data = doc.data();
      lessonPlans.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || null
      });
    });
    
    // Sort ฝั่ง code แทน (เพื่อหลีกเลี่ยง composite index)
    lessonPlans.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    res.json({
      success: true,
      lessonPlans
    });

  } catch (error) {
    console.error('Error fetching lesson plans:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลแผนการสอน'
    });
  }
});

/**
 * POST /api/student/lesson-plans
 * อัปโหลดแผนการสอนใหม่ (ปี 2-3 เท่านั้น)
 */
router.post('/api/student/lesson-plans', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.studentId;
    const userYear = req.session.user.year || 1;

    // เฉพาะปี 2-3 เท่านั้น
    if (userYear < 2 || userYear > 3) {
      return res.status(403).json({
        success: false,
        message: 'แผนการสอนสำหรับนักศึกษาปี 2-3 เท่านั้น'
      });
    }

    const { title, subject, grade, description, fileUrl, observationId } = req.body;

    if (!title || !subject) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกข้อมูลให้ครบถ้วน'
      });
    }

    const lessonPlanData = {
      studentId,
      title,
      subject,
      grade: grade || '',
      description: description || '',
      fileUrl: fileUrl || '',
      observationId: observationId || null,
      status: 'pending', // pending, approved, rejected
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('lesson_plans').add(lessonPlanData);

    res.json({
      success: true,
      message: 'อัปโหลดแผนการสอนสำเร็จ',
      lessonPlanId: docRef.id
    });

  } catch (error) {
    console.error('Error uploading lesson plan:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการอัปโหลดแผนการสอน'
    });
  }
});

/**
 * GET /api/student/school-info
 * ดึงข้อมูลสถานศึกษาปัจจุบัน
 */
router.get('/api/student/school-info', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.studentId;

    const schoolSnapshot = await db.collection('student_schools')
      .where('studentId', '==', studentId)
      .get();

    if (schoolSnapshot.empty) {
      return res.json({
        success: true,
        schoolInfo: null
      });
    }

    // Sort ฝั่ง code แทน (เพื่อหลีกเลี่ยง composite index)
    const schools = schoolSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
    
    res.json({
      success: true,
      schoolInfo: schools[0]
    });

  } catch (error) {
    console.error('Error fetching school info:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถานศึกษา'
    });
  }
});

/**
 * GET /api/student/mentor-info
 * ดึงข้อมูลครูพี่เลี้ยงปัจจุบัน
 */
router.get('/api/student/mentor-info', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.studentId;

    const mentorSnapshot = await db.collection('student_mentors')
      .where('studentId', '==', studentId)
      .get();

    if (mentorSnapshot.empty) {
      return res.json({
        success: true,
        mentorInfo: null
      });
    }

    // Sort ฝั่ง code แทน (เพื่อหลีกเลี่ยง composite index)
    const mentors = mentorSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
    
    res.json({
      success: true,
      mentorInfo: mentors[0]
    });

  } catch (error) {
    console.error('Error fetching mentor info:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลครูพี่เลี้ยง'
    });
  }
});

/**
 * GET /api/student/observation/:id
 * ดึงรายละเอียดการสังเกตเฉพาะรอบ
 */
router.get('/api/student/observation/:id', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.studentId;
    const observationId = req.params.id;

    // ตรวจสอบว่านักศึกษาอยู่ในการสังเกตนี้หรือไม่
    const studentObsSnapshot = await db.collection('observation_students')
      .where('observationId', '==', observationId)
      .where('studentId', '==', studentId)
      .limit(1)
      .get();

    if (studentObsSnapshot.empty) {
      return res.status(403).json({
        success: false,
        message: 'ไม่พบข้อมูลหรือไม่มีสิทธิ์เข้าถึง'
      });
    }

    const studentObsData = studentObsSnapshot.docs[0].data();

    // ดึงข้อมูล observation
    const obsDoc = await db.collection('observations').doc(observationId).get();
    
    if (!obsDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลการสังเกต'
      });
    }

    const obsData = obsDoc.data();

    res.json({
      success: true,
      observation: {
        id: observationId,
        ...obsData,
        studentStatus: studentObsData.status,
        evaluationsCompleted: studentObsData.evaluationsCompleted || 0,
        lessonPlanSubmitted: studentObsData.lessonPlanSubmitted || false,
        notes: studentObsData.notes || ''
      }
    });

  } catch (error) {
    console.error('Error fetching observation detail:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
    });
  }
});

/**
 * GET /api/student/observations
 * ดึงรายการ observations ทั้งหมดที่นักศึกษามีสิทธิ์เข้าถึง
 * - กรองเฉพาะที่นักศึกษาลงทะเบียนไว้ (observation_students)
 * - แยก active และ completed
 * - ส่งกลับพร้อมข้อมูลสถานะของนักศึกษา
 */
router.get('/api/student/observations', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.studentId;

    console.log(`📋 Loading observations list for student: ${studentId}`);

    // 1. ดึง observation IDs ที่นักศึกษามีสิทธิ์
    const studentObsSnapshot = await db.collection('observation_students')
      .where('studentId', '==', studentId)
      .get();

    if (studentObsSnapshot.empty) {
      return res.json({
        success: true,
        observations: [],
        activeObservation: null,
        completedObservations: [],
        message: 'ยังไม่มีงวดการฝึกประสบการณ์'
      });
    }

    const observationIds = [];
    const studentObsMap = {}; // เก็บสถานะของนักศึกษาในแต่ละ observation

    studentObsSnapshot.forEach(doc => {
      const data = doc.data();
      observationIds.push(data.observationId);
      studentObsMap[data.observationId] = {
        docId: doc.id,
        studentStatus: data.status,
        evaluationsCompleted: data.evaluationsCompleted || 0,
        lessonPlanSubmitted: data.lessonPlanSubmitted || false,
        notes: data.notes || ''
      };
    });

    console.log(`  → Found ${observationIds.length} observation(s) for student`);

    // 2. ดึงข้อมูล observations ทั้งหมดที่เกี่ยวข้อง
    const observations = [];
    let activeObservation = null;
    const completedObservations = [];

    // Helper to normalize timestamps to ms
    const getMillis = (val) => {
      try {
        if (!val) return null;
        if (typeof val.toDate === 'function') return val.toDate().getTime();
        if (val._seconds) return val._seconds * 1000;
        if (typeof val === 'string') return new Date(val).getTime();
        return null;
      } catch (e) {
        return null;
      }
    };

    const nowMs = Date.now();

    for (const obsId of observationIds) {
      const obsDoc = await db.collection('observations').doc(obsId).get();

      if (!obsDoc.exists) {
        console.warn(`  ⚠️ Observation document not found: ${obsId}`);
        continue;
      }

      const obsData = obsDoc.data();
      const studentObsData = studentObsMap[obsId];

      // Normalize date fields
      const normalizeDate = (val) => {
        try {
          if (!val) return null;
          if (typeof val.toDate === 'function') return val.toDate().toISOString();
          if (val._seconds) return new Date(val._seconds * 1000).toISOString();
          return typeof val === 'string' ? val : JSON.stringify(val);
        } catch (e) {
          return String(val);
        }
      };

      const observationInfo = {
        id: obsId,
        name: obsData.name || '-',
        academicYear: obsData.academicYear || null,
        yearLevel: obsData.yearLevel || null,
        startDate: normalizeDate(obsData.startDate),
        endDate: normalizeDate(obsData.endDate),
        status: obsData.status || 'unknown', // status ของ observation เอง
        description: obsData.description || '',
        // ข้อมูลสถานะของนักศึกษาใน observation นี้
        studentStatus: studentObsData.studentStatus || 'unknown',
        evaluationsCompleted: studentObsData.evaluationsCompleted,
        lessonPlanSubmitted: studentObsData.lessonPlanSubmitted,
        notes: studentObsData.notes
      };

      observations.push(observationInfo);

      // Determine active by explicit status OR by date range (fallback)
      const startMs = getMillis(obsData.startDate);
      const endMs = getMillis(obsData.endDate);
      const withinDates = startMs && endMs ? (nowMs >= startMs && nowMs <= endMs) : false;

      if ((obsData.status === 'active' || withinDates) && studentObsData.studentStatus === 'active') {
        activeObservation = observationInfo;
      } else if (obsData.status === 'completed' || studentObsData.studentStatus === 'completed') {
        completedObservations.push(observationInfo);
      }
    }

    // 3. Sort completed observations by startDate (newest first)
    completedObservations.sort((a, b) => {
      const aTime = new Date(a.startDate || 0).getTime();
      const bTime = new Date(b.startDate || 0).getTime();
      return bTime - aTime;
    });

    console.log(`  ✅ Active: ${activeObservation ? 1 : 0}, Completed: ${completedObservations.length}`);

    res.json({
      success: true,
      observations, // ทั้งหมด
      activeObservation, // ปัจจุบัน (active)
      completedObservations, // ที่เสร็จสิ้นแล้ว
      total: observations.length
    });

  } catch (error) {
    console.error('Error fetching student observations:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลงวดฝึก',
      error: error.message || String(error)
    });
  }
});

module.exports = router;
