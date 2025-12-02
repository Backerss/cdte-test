const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebaseAdmin');

// Middleware: ตรวจสอบว่าผู้ใช้ต้องเข้าสู่ระบบ
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  next();
}

// Middleware: ตรวจสอบว่าเป็น admin หรือ teacher
function requireAdminOrTeacher(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  if (req.session.user.role !== 'admin' && req.session.user.role !== 'teacher') {
    return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  next();
}

/**
 * GET /api/observations
 * ดึงรายการ observations ทั้งหมด (พร้อม filter)
 * Query params: academicYear, yearLevel, status
 */
router.get('/api/observations', requireAuth, async (req, res) => {
  try {
    const { academicYear, yearLevel, status } = req.query;
    
    // เริ่มต้นด้วย query พื้นฐาน (ไม่ใช้ orderBy ก่อน เพื่อหลีกเลี่ยง composite index)
    let query = db.collection('observations');
    
    // Apply filters (ถ้ามี filter จะไม่ orderBy เพื่อหลีกเลี่ยง composite index requirement)
    const hasFilters = academicYear || yearLevel || status;
    
    if (academicYear) {
      query = query.where('academicYear', '==', academicYear);
    }
    if (yearLevel) {
      query = query.where('yearLevel', '==', parseInt(yearLevel));
    }
    if (status) {
      query = query.where('status', '==', status);
    }
    
    // ถ้าไม่มี filter เลย ให้ orderBy ได้ (simple query)
    if (!hasFilters) {
      query = query.orderBy('createdAt', 'desc');
    }
    
    const snapshot = await query.get();
    let observations = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // นับจำนวนนักศึกษาในการสังเกตุนี้
      const studentsSnapshot = await db.collection('observation_students')
        .where('observationId', '==', doc.id)
        .get();

      // คำนวณความคืบหน้า
      let completedEvaluations = 0;
      let submittedLessonPlans = 0;

      studentsSnapshot.forEach(studentDoc => {
        const studentData = studentDoc.data();
        if (studentData.evaluationsCompleted >= 9) {
          completedEvaluations++;
        }
        if (studentData.lessonPlanSubmitted) {
          submittedLessonPlans++;
        }
      });

      // ใช้ Date.now() สำหรับข้อมูลที่ยังไม่มี createdAt
      let timestamp = Date.now();
      if (data.createdAt) {
        if (typeof data.createdAt.toMillis === 'function') {
          timestamp = data.createdAt.toMillis();
        } else if (data.createdAt._seconds) {
          timestamp = data.createdAt._seconds * 1000;
        }
      }

      observations.push({
        id: doc.id,
        ...data,
        totalStudents: studentsSnapshot.size,
        completedEvaluations,
        submittedLessonPlans,
        // เพิ่ม timestamp สำหรับ sort ฝั่ง server/client
        createdAtTimestamp: timestamp
      });
    }

    // Sort in-memory (จากใหม่ไปเก่า) เพราะ Firestore query ไม่สามารถ orderBy + where หลายตัวได้โดยไม่มี composite index
    observations.sort((a, b) => b.createdAtTimestamp - a.createdAtTimestamp);

    res.json({ success: true, observations });
  } catch (error) {
    console.error('Error fetching observations:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

/**
 * GET /api/observations/:id
 * ดึงข้อมูล observation และนักศึกษาในรอบนั้น
 */
router.get('/api/observations/:id', requireAuth, async (req, res) => {
  try {
    const observationId = req.params.id;
    
    // ดึงข้อมูล observation
    const observationDoc = await db.collection('observations').doc(observationId).get();
    
    if (!observationDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลการสังเกตุ' });
    }
    
    const observationData = observationDoc.data();
    
    // ดึงรายชื่อนักศึกษาในการสังเกตุนี้
    const studentsSnapshot = await db.collection('observation_students')
      .where('observationId', '==', observationId)
      .get();
    
    const students = [];
    for (const studentDoc of studentsSnapshot.docs) {
      const studentData = studentDoc.data();
      
      // ดึงข้อมูลนักศึกษาจาก users collection
      const userSnapshot = await db.collection('users')
        .where('studentId', '==', studentData.studentId)
        .limit(1)
        .get();
      
      let userName = 'ไม่ทราบชื่อ';
      if (!userSnapshot.empty) {
        const userData = userSnapshot.docs[0].data();
        userName = `${userData.firstName} ${userData.lastName}`;
      }
      
      students.push({
        id: studentDoc.id,
        studentId: studentData.studentId,
        name: userName,
        status: studentData.status,
        evaluationsCompleted: studentData.evaluationsCompleted || 0,
        lessonPlanSubmitted: studentData.lessonPlanSubmitted || false,
        notes: studentData.notes || ''
      });
    }
    
    // คำนวณความคืบหน้า
    const completedEvaluations = students.filter(s => s.evaluationsCompleted >= 9).length;
    const submittedLessonPlans = students.filter(s => s.lessonPlanSubmitted).length;
    
    res.json({
      success: true,
      observation: {
        id: observationDoc.id,
        ...observationData,
        totalStudents: students.length,
        completedEvaluations,
        submittedLessonPlans,
        students
      }
    });
  } catch (error) {
    console.error('Error fetching observation detail:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

/**
 * POST /api/observations
 * สร้าง observation ใหม่
 */
router.post('/api/observations', requireAdminOrTeacher, async (req, res) => {
  try {
    const { name, academicYear, yearLevel, startDate, endDate, description, studentIds } = req.body;
    
    // Validate ข้อมูล
    if (!name || !academicYear || !yearLevel || !startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        message: 'กรุณากรอกข้อมูลให้ครบถ้วน' 
      });
    }
    
    if (!studentIds || studentIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'กรุณาเลือกนักศึกษาอย่างน้อย 1 คน' 
      });
    }
    
    // ตรวจสอบว่ามีการสังเกตุซ้ำหรือไม่ (academicYear + yearLevel)
    const existingObservation = await db.collection('observations')
      .where('academicYear', '==', academicYear)
      .where('yearLevel', '==', parseInt(yearLevel))
      .where('status', '==', 'active')
      .limit(1)
      .get();
    
    if (!existingObservation.empty) {
      return res.status(409).json({ 
        success: false, 
        message: 'มีการสังเกตุสำหรับชั้นปีนี้ในปีการศึกษานี้แล้ว' 
      });
    }
    
    // สร้าง observation document
    const observationData = {
      name,
      academicYear,
      yearLevel: parseInt(yearLevel),
      startDate,
      endDate,
      description: description || '',
      status: 'active',
      createdBy: req.session.user.email || 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const observationRef = await db.collection('observations').add(observationData);
    
    // เพิ่มนักศึกษาเข้าในการสังเกตุ (batch write)
    const batch = db.batch();
    
    for (const studentId of studentIds) {
      const studentDocRef = db.collection('observation_students').doc();
      batch.set(studentDocRef, {
        observationId: observationRef.id,
        studentId: studentId,
        status: 'active',
        evaluationsCompleted: 0,
        lessonPlanSubmitted: false,
        notes: '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    await batch.commit();
    
    res.json({
      success: true,
      message: `สร้างการสังเกตุสำเร็จ (${studentIds.length} คน)`,
      observationId: observationRef.id
    });
  } catch (error) {
    console.error('Error creating observation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการสร้างการสังเกตุ' 
    });
  }
});

/**
 * PATCH /api/observations/:id
 * อัปเดตสถานะหรือข้อมูล observation
 */
router.patch('/api/observations/:id', requireAdminOrTeacher, async (req, res) => {
  try {
    const observationId = req.params.id;
    const { status, name, description } = req.body;
    
    const observationRef = db.collection('observations').doc(observationId);
    const observationDoc = await observationRef.get();
    
    if (!observationDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลการสังเกตุ' });
    }
    
    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (status) updateData.status = status;
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    
    await observationRef.update(updateData);
    
    res.json({
      success: true,
      message: 'อัปเดตข้อมูลการสังเกตุสำเร็จ'
    });
  } catch (error) {
    console.error('Error updating observation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล' 
    });
  }
});

/**
 * PATCH /api/observations/:observationId/students/:studentDocId
 * อัปเดตสถานะนักศึกษาในการสังเกตุ (ยุติ/เปิดใหม่)
 */
router.patch('/api/observations/:observationId/students/:studentDocId', requireAdminOrTeacher, async (req, res) => {
  try {
    const { observationId, studentDocId } = req.params;
    const { status, evaluationsCompleted, lessonPlanSubmitted, notes } = req.body;
    
    const studentRef = db.collection('observation_students').doc(studentDocId);
    const studentDoc = await studentRef.get();
    
    if (!studentDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลนักศึกษา' });
    }
    
    // ตรวจสอบว่า studentDoc เป็นของ observationId ที่ระบุหรือไม่
    if (studentDoc.data().observationId !== observationId) {
      return res.status(400).json({ success: false, message: 'ข้อมูลไม่ตรงกัน' });
    }
    
    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (status) updateData.status = status;
    if (evaluationsCompleted !== undefined) updateData.evaluationsCompleted = evaluationsCompleted;
    if (lessonPlanSubmitted !== undefined) updateData.lessonPlanSubmitted = lessonPlanSubmitted;
    if (notes !== undefined) updateData.notes = notes;
    
    await studentRef.update(updateData);
    
    res.json({
      success: true,
      message: 'อัปเดตสถานะนักศึกษาสำเร็จ'
    });
  } catch (error) {
    console.error('Error updating student status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการอัปเดตสถานะ' 
    });
  }
});

/**
 * GET /api/students
 * ดึงรายชื่อนักศึกษาทั้งหมด (สำหรับเลือกเวลาสร้าง observation)
 */
router.get('/api/students', requireAuth, async (req, res) => {
  try {
    const { yearLevel, search } = req.query;
    
    let query = db.collection('users').where('role', '==', 'student');
    
    if (yearLevel) {
      query = query.where('year', '==', parseInt(yearLevel));
    }
    
    const snapshot = await query.get();
    let students = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      students.push({
        id: data.studentId,
        studentId: data.studentId,
        name: `${data.firstName} ${data.lastName}`,
        yearLevel: data.year,
        status: data.status
      });
    });
    
    // Filter by search (ฝั่ง client-side เพราะ Firestore ไม่รองรับ full-text search)
    if (search) {
      const searchLower = search.toLowerCase();
      students = students.filter(s => {
        const searchableText = `${s.studentId} ${s.name}`.toLowerCase();
        return searchableText.includes(searchLower);
      });
    }
    
    // Sort by studentId
    students.sort((a, b) => a.studentId.localeCompare(b.studentId));
    
    res.json({ success: true, students });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลนักศึกษา' });
  }
});

/**
 * GET /api/observations/:id/available-students
 * ดึงรายชื่อนักศึกษาที่ยังไม่ได้เข้าร่วมการสังเกตนี้
 */
router.get('/api/observations/:id/available-students', requireAdminOrTeacher, async (req, res) => {
  try {
    const observationId = req.params.id;
    
    // ดึงข้อมูล observation จาก document id โดยตรง
    const obsDoc = await db.collection('observations').doc(observationId).get();
    
    if (!obsDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบการสังเกตนี้' });
    }
    
    const observation = obsDoc.data();
    
    // รวบรวมรหัสนักศึกษาที่มีอยู่แล้วจากทั้ง 2 แหล่ง
    const existingStudentIds = new Set();
    
    // จาก observation.students array
    if (Array.isArray(observation.students)) {
      observation.students.forEach(studentEntry => {
        if (!studentEntry) return;
        const existingId = typeof studentEntry === 'string'
          ? studentEntry
          : (studentEntry.studentId || studentEntry.id);
        if (existingId) {
          existingStudentIds.add(String(existingId).trim());
        }
      });
    }
    
    // จาก observation_students collection
    const observationStudentsSnapshot = await db.collection('observation_students')
      .where('observationId', '==', observationId)
      .get();
    
    observationStudentsSnapshot.forEach(studentDoc => {
      const data = studentDoc.data();
      if (data?.studentId) {
        existingStudentIds.add(String(data.studentId).trim());
      }
    });
    
    // ดึงนักศึกษาทั้งหมด (ไม่ล็อคชั้นปี - ให้เลือกได้ทุกคน)
    const studentsSnapshot = await db.collection('users')
      .where('role', '==', 'student')
      .get();
    
    console.log(`🔍 [Available Students] Found ${studentsSnapshot.size} total students`);
    console.log(`🔍 [Available Students] Observation yearLevel: ${observation.yearLevel}`);
    console.log(`🔍 [Available Students] Existing student IDs:`, Array.from(existingStudentIds));
    
    const availableStudents = [];
    const currentYear = new Date().getFullYear(); // 2025
    
    studentsSnapshot.forEach(doc => {
      const data = doc.data();
      const studentId = String(data.studentId || '').trim();
      const firstName = String(data.firstName || '').trim();
      const lastName = String(data.lastName || '').trim();
      
      // เงื่อนไขในการแสดง:
      // 1. ต้องมี studentId (11 หลัก)
      // 2. ต้องมีชื่อและนามสกุลครบถ้วน (ข้อมูลสมบูรณ์)
      // 3. ยังไม่ได้อยู่ในการสังเกตนี้ (เช็คจาก observation_students)
      
      if (!studentId || studentId.length !== 11) {
        console.log(`  ❌ Skipped - Invalid studentId: ${studentId} (length: ${studentId.length})`);
        return;
      }
      
      if (!firstName || !lastName) {
        console.log(`  ❌ Skipped - Incomplete profile: firstName="${firstName}", lastName="${lastName}"`);
        return;
      }
      
      if (existingStudentIds.has(studentId)) {
        console.log(`  ❌ Skipped - Already in observation: ${studentId}`);
        return;
      }
      
      // กำหนดชั้นปี: ใช้จากฐานข้อมูลก่อน (data.year) ถ้าไม่มีค่อยคำนวณจากรหัส
      let displayYear;
      let yearCategory;
      
      if (data.year && Number.isInteger(data.year)) {
        // มี year ในฐานข้อมูลแล้ว - ใช้ตามนั้นเลย
        displayYear = data.year;
        yearCategory = data.year <= 4 ? data.year : '4+';
        console.log(`  ℹ️ Using existing year from database: ${data.year}`);
      } else {
        // ไม่มี year - คำนวณจากรหัสนักศึกษา (2 หลักแรก)
        const yearPrefix = parseInt(studentId.substring(0, 2));
        const studentAdmitYear = 2500 + yearPrefix; // เช่น 65 -> 2565
        const calculatedYear = (currentYear - studentAdmitYear) + 1;
        displayYear = calculatedYear;
        yearCategory = calculatedYear <= 4 ? calculatedYear : '4+';
        console.log(`  ℹ️ Calculated year from studentId: ${calculatedYear}`);
      }
      
      // เปรียบเทียบกับชั้นปีของ observation
      const isDifferentYear = displayYear !== observation.yearLevel;
      
      console.log(`  ✅ Added: ${studentId}, displayYear: ${displayYear}, observationYear: ${observation.yearLevel}, different: ${isDifferentYear}`);
      
      // นักศึกษาที่ผ่านเงื่อนไขทั้งหมด
      availableStudents.push({
        id: studentId,
        studentId: studentId,
        name: `${firstName} ${lastName}`,
        yearLevel: displayYear,
        yearCategory: String(yearCategory),
        firstName: firstName,
        lastName: lastName,
        isDifferentYear: isDifferentYear,
        observationYearLevel: observation.yearLevel
      });
    });
    
    // เรียงตามรหัสนักศึกษา
    availableStudents.sort((a, b) => a.studentId.localeCompare(b.studentId));
    
    res.json({ 
      success: true, 
      students: availableStudents,
      totalAvailable: availableStudents.length,
      totalExisting: existingStudentIds.size
    });
  } catch (error) {
    console.error('Error fetching available students:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

/**
 * POST /api/observations/:id/add-students
 * เพิ่มนักศึกษาเข้าร่วมการสังเกต
 * Body: { studentIds: ['6609999999', '6609999998'] }
 */
router.post('/api/observations/:id/add-students', requireAdminOrTeacher, async (req, res) => {
  try {
    const observationId = req.params.id;
    const { studentIds } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุรายชื่อนักศึกษา' });
    }

    // ดึงข้อมูล observation
    const obsDocRef = db.collection('observations').doc(observationId);
    const obsDoc = await obsDocRef.get();

    if (!obsDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบการสังเกตนี้' });
    }

    const observation = obsDoc.data();

    // ตรวจสอบสิทธิ์ตามเงื่อนไขเวลา
    const now = new Date();
    const startDate = observation.startDate?.toDate ? observation.startDate.toDate() : new Date(observation.startDate);
    const daysPassed = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));

    if (Number.isFinite(daysPassed) && daysPassed > 5) {
      return res.status(403).json({
        success: false,
        message: 'ไม่สามารถเพิ่มนักศึกษาได้ เนื่องจากเกิน 5 วันแล้ว'
      });
    }

    // เก็บรหัสนักศึกษาที่มีอยู่แล้ว (ทั้งจาก observations.students และ observation_students collection)
    const existingStudentIds = new Set();

    if (Array.isArray(observation.students)) {
      observation.students.forEach(studentEntry => {
        if (!studentEntry) return;
        const existingId = typeof studentEntry === 'string'
          ? studentEntry
          : (studentEntry.studentId || studentEntry.id);
        if (existingId) {
          existingStudentIds.add(String(existingId).trim());
        }
      });
    }

    const observationStudentsSnapshot = await db.collection('observation_students')
      .where('observationId', '==', observationId)
      .get();

    observationStudentsSnapshot.forEach(studentDoc => {
      const data = studentDoc.data();
      if (data?.studentId) {
        existingStudentIds.add(String(data.studentId).trim());
      }
    });

    const studentsToAdd = [];
    const studentDocWrites = [];
    let skippedDuplicates = 0;

    for (const rawStudentId of studentIds) {
      const studentId = String(rawStudentId || '').trim();
      if (!studentId) continue;

      if (existingStudentIds.has(studentId)) {
        skippedDuplicates++;
        continue;
      }

      const userSnapshot = await db.collection('users')
        .where('role', '==', 'student')
        .where('studentId', '==', studentId)
        .limit(1)
        .get();

      if (userSnapshot.empty) {
        continue;
      }

      const userData = userSnapshot.docs[0].data();
      const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ').trim();

      const studentEntry = {
        id: studentId,
        studentId,
        name: fullName || studentId,
        status: 'active',
        addedAt: admin.firestore.Timestamp.now(),
        evaluationsCompleted: 0,
        lessonPlanSubmitted: false,
        notes: ''
      };

      studentsToAdd.push(studentEntry);

      const studentDocRef = db.collection('observation_students').doc();
      studentDocWrites.push({
        ref: studentDocRef,
        data: {
          observationId,
          studentId,
          status: 'active',
          evaluationsCompleted: 0,
          lessonPlanSubmitted: false,
          notes: '',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      });

      existingStudentIds.add(studentId);
    }

    if (studentsToAdd.length === 0) {
      const message = skippedDuplicates > 0
        ? 'นักศึกษาที่เลือกมีอยู่แล้วในรายการ'
        : 'ไม่มีนักศึกษาที่ต้องเพิ่ม (อาจมีอยู่แล้วหรือไม่พบข้อมูล)';
      return res.json({ success: false, message, addedCount: 0, duplicatesSkipped: skippedDuplicates });
    }

    const batch = db.batch();

    studentDocWrites.forEach(({ ref, data }) => {
      batch.set(ref, data);
    });

    batch.update(obsDocRef, {
      students: admin.firestore.FieldValue.arrayUnion(...studentsToAdd),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    res.json({
      success: true,
      message: `เพิ่มนักศึกษา ${studentsToAdd.length} คนเรียบร้อยแล้ว`,
      addedCount: studentsToAdd.length,
      duplicatesSkipped: skippedDuplicates
    });
  } catch (error) {
    console.error('Error adding students to observation:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเพิ่มนักศึกษา' });
  }
});

module.exports = router;
