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

      // ดึงการประเมินทั้งหมดของรอบนี้ แล้วสร้าง map ของจำนวนการประเมินต่อ studentId
      const evalSnapshot = await db.collection('evaluations')
        .where('observationId', '==', doc.id)
        .get();
      const evalCounts = {};
      evalSnapshot.forEach(evDoc => {
        const ev = evDoc.data();
        const sid = ev.studentId || ev.student_id || '';
        if (!sid) return;
        evalCounts[sid] = (evalCounts[sid] || 0) + 1;
      });

      // คำนวณความคืบหน้า โดยอ้างอิงจากจำนวนการประเมินจริง
      let completedEvaluations = 0;
      let submittedLessonPlans = 0;

      studentsSnapshot.forEach(studentDoc => {
        const studentData = studentDoc.data();
        const sid = studentData.user_id || studentData.studentId || '';
        const count = evalCounts[sid] || 0;
        if (count >= 9) {
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
    
    // ดึงการประเมินทั้งหมดของรอบนี้ (เพื่อคำนวณจำนวนการประเมินต่อ student)
    const evalSnapshot = await db.collection('evaluations')
      .where('observationId', '==', observationId)
      .get();
    const evalCounts = {};
    evalSnapshot.forEach(evDoc => {
      const ev = evDoc.data();
      const sid = ev.studentId || ev.student_id || '';
      if (!sid) return;
      evalCounts[sid] = (evalCounts[sid] || 0) + 1;
    });

    const students = [];
    for (const studentDoc of studentsSnapshot.docs) {
      const studentData = studentDoc.data();
      
      // ดึงข้อมูลนักศึกษาจาก users collection
      // ใช้ canonical id (user_id) เป็นหลัก แล้ว fallback ไปยัง studentId แบบเดิม
      const sid = studentData.user_id || studentData.studentId || '';
      let userSnapshot = { empty: true };
      let userData = null;
      if (sid) {
        userSnapshot = await db.collection('users')
          .where('user_id', '==', sid)
          .limit(1)
          .get();
        if (userSnapshot.empty) {
          userSnapshot = await db.collection('users')
            .where('studentId', '==', sid)
            .limit(1)
            .get();
        }
        if (userSnapshot && !userSnapshot.empty) {
          userData = userSnapshot.docs[0].data();
        }
      }

      // หากไม่มีชื่อ-นามสกุล ให้ใช้ fallback จาก observation_students fields
      let userName = null;
      if (userData) {
        if (userData.firstName || userData.lastName) {
          userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
        }
      }
      if (!userName) {
        // try fallback to a name field from studentData
        userName = studentData.name || studentData.displayName || null;
      }

      if (!userName) {
        // still no name -> skip this entry
        console.warn(`Skipping student ${sid} in observation ${observationId} - missing name`);
        continue;
      }

      // determine yearLevel from user document when available
      const yearLevel = (userData && (userData.yearLevel || userData.year)) || null;

      students.push({
        id: studentDoc.id,
        // ส่ง canonical id กลับไปยัง client (user_id หรือ legacy studentId)
        studentId: sid,
        legacyStudentId: studentData.studentId || null,
        name: userName,
        status: studentData.status,
        evaluationsCompleted: evalCounts[sid] || 0,
        lessonPlanSubmitted: studentData.lessonPlanSubmitted || false,
        notes: studentData.notes || '',
        yearLevel
      });
    }
    
    // คำนวณความคืบหน้า โดยอิงจากจำนวนการประเมินจริงและสถานะแผนการสอน
    const completedEvaluations = students.filter(s => (s.evaluationsCompleted || 0) >= 9).length;
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
        // store both fields: legacy `studentId` and canonical `user_id` (client may send either)
        studentId: studentId,
        user_id: studentId,
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
 * DELETE /api/observations/:observationId/students/:studentDocId
 * เอานักศึกษาออกจากการสังเกต (ลบความสัมพันธ์ + sync ข้อมูลสรุป)
 */
router.delete('/api/observations/:observationId/students/:studentDocId', requireAdminOrTeacher, async (req, res) => {
  try {
    const { observationId, studentDocId } = req.params;

    const studentRef = db.collection('observation_students').doc(studentDocId);
    const studentDoc = await studentRef.get();

    if (!studentDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลนักศึกษาในรอบนี้' });
    }

    const studentData = studentDoc.data();

    // ตรวจสอบว่า studentDoc เป็นของ observation ที่ร้องขอหรือไม่
    if (studentData.observationId !== observationId) {
      return res.status(400).json({ success: false, message: 'ข้อมูลไม่ตรงกับรอบการสังเกต' });
    }

    // ใช้ canonical id สำหรับ sync ข้อมูล
    const canonicalId = String(studentData.user_id || studentData.studentId || '').trim();

    // ลบเอกสารความสัมพันธ์ observation_students
    await studentRef.delete();

    // อัปเดต summary ใน observations.students (ถ้ามี) ให้ตรงกัน
    const obsRef = db.collection('observations').doc(observationId);
    const obsDoc = await obsRef.get();

    if (obsDoc.exists) {
      const obsData = obsDoc.data();
      if (Array.isArray(obsData.students)) {
        const filtered = obsData.students.filter(entry => {
          const eid = typeof entry === 'string'
            ? entry
            : (entry.user_id || entry.studentId || entry.id || '');
          return String(eid || '').trim() !== canonicalId;
        });

        await obsRef.update({
          students: filtered,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        await obsRef.update({
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    res.json({
      success: true,
      message: 'ลบนักศึกษาออกจากรอบสังเกตแล้ว',
      removedStudentId: canonicalId || null
    });
  } catch (error) {
    console.error('Error removing student from observation:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบนักศึกษา' });
  }
});

/**
 * DELETE /api/observations/:observationId/students
 * ลบนักศึกษาหลายคนออกจากการสังเกต
 * Body: { studentDocIds: ['docId1', 'docId2', ...] }
 */
router.delete('/api/observations/:observationId/students', requireAdminOrTeacher, async (req, res) => {
  try {
    const { observationId } = req.params;
    const { studentDocIds } = req.body || {};

    if (!Array.isArray(studentDocIds) || studentDocIds.length === 0) {
      return res.status(400).json({ success: false, message: 'กรุณาระบุรายชื่อนักศึกษาที่ต้องการลบ' });
    }

    // ดึงเอกสารนักศึกษาที่ระบุ
    const docs = await Promise.all(
      studentDocIds.map(id => db.collection('observation_students').doc(id).get())
    );

    const validDocs = [];
    const canonicalIdsToRemove = new Set();
    const notFound = [];
    const mismatched = [];

    docs.forEach((docSnap, idx) => {
      if (!docSnap.exists) {
        notFound.push(studentDocIds[idx]);
        return;
      }
      const data = docSnap.data();
      if (data.observationId !== observationId) {
        mismatched.push(studentDocIds[idx]);
        return;
      }
      validDocs.push({ id: studentDocIds[idx], data });
      const cid = String(data.user_id || data.studentId || '').trim();
      if (cid) canonicalIdsToRemove.add(cid);
    });

    if (validDocs.length === 0) {
      return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลที่ตรงกับรอบนี้', notFound, mismatched });
    }

    const batch = db.batch();
    validDocs.forEach(({ id }) => {
      batch.delete(db.collection('observation_students').doc(id));
    });

    // sync observations.students
    const obsRef = db.collection('observations').doc(observationId);
    const obsDoc = await obsRef.get();
    if (obsDoc.exists) {
      const obsData = obsDoc.data();
      if (Array.isArray(obsData.students) && canonicalIdsToRemove.size > 0) {
        const filtered = obsData.students.filter(entry => {
          const eid = typeof entry === 'string'
            ? entry
            : (entry.user_id || entry.studentId || entry.id || '');
          return !canonicalIdsToRemove.has(String(eid || '').trim());
        });
        batch.update(obsRef, {
          students: filtered,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        batch.update(obsRef, {
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    await batch.commit();

    res.json({
      success: true,
      message: `ลบนักศึกษา ${validDocs.length} คนเรียบร้อย`,
      removed: validDocs.map(d => d.id),
      notFound,
      mismatched
    });
  } catch (error) {
    console.error('Error bulk removing students:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลบนักศึกษาแบบกลุ่ม' });
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
      // Use canonical user_id when available, otherwise fallback to legacy studentId
      const sid = String(data.user_id || data.studentId || doc.id || '').trim();
      // Skip records without full name
      const firstName = String(data.firstName || '').trim();
      const lastName = String(data.lastName || '').trim();
      if (!firstName || !lastName) return;

      students.push({
        id: sid,
        studentId: sid,
        name: `${firstName} ${lastName}`,
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
          : (studentEntry.user_id || studentEntry.studentId || studentEntry.id);
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
      const sid = String(data?.user_id || data?.studentId || '').trim();
      if (sid) existingStudentIds.add(sid);
    });
    
    // ดึงนักศึกษาทั้งหมด (ไม่ล็อคชั้นปี - ให้เลือกได้ทุกคน)
    const studentsSnapshot = await db.collection('users')
      .where('role', '==', 'student')
      .get();
    
    
    
    const availableStudents = [];
    const currentYear = new Date().getFullYear(); // 2025
    
    studentsSnapshot.forEach(doc => {
      const data = doc.data();
      const studentId = String(data.user_id || data.studentId || doc.id || '').trim();
      const firstName = String(data.firstName || '').trim();
      const lastName = String(data.lastName || '').trim();
      
      // เงื่อนไขในการแสดง:
      // 1. ต้องมี studentId (11 หลัก)
      // 2. ต้องมีชื่อและนามสกุลครบถ้วน (ข้อมูลสมบูรณ์)
      // 3. ยังไม่ได้อยู่ในการสังเกตนี้ (เช็คจาก observation_students)
      
      // Require a canonical id that looks like a student numeric id (11 digits)
      if (!studentId || !/^\d{11}$/.test(studentId)) {
        return;
      }
      
      if (!firstName || !lastName) {
        return;
      }
      
      if (existingStudentIds.has(studentId)) {
        return;
      }
      
      // กำหนดชั้นปี: ใช้จากฐานข้อมูลก่อน (data.year) ถ้าไม่มีค่อยคำนวณจากรหัส
      let displayYear;
      let yearCategory;
      
      if (data.year && Number.isInteger(data.year)) {
        // มี year ในฐานข้อมูลแล้ว - ใช้ตามนั้นเลย
        displayYear = data.year;
        yearCategory = data.year <= 4 ? data.year : '4+';
        
      } else {
        // ไม่มี year - คำนวณจากรหัสนักศึกษา (2 หลักแรก)
        const yearPrefix = parseInt(studentId.substring(0, 2));
        const studentAdmitYear = 2500 + yearPrefix; // เช่น 65 -> 2565
        const calculatedYear = (currentYear - studentAdmitYear) + 1;
        displayYear = calculatedYear;
        yearCategory = calculatedYear <= 4 ? calculatedYear : '4+';
        
      }
      
      // เปรียบเทียบกับชั้นปีของ observation
      const isDifferentYear = displayYear !== observation.yearLevel;
      
      
      
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
          : (studentEntry.user_id || studentEntry.studentId || studentEntry.id);
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
      // Normalize both possible id fields to avoid false positives
      if (data?.user_id) existingStudentIds.add(String(data.user_id).trim());
      if (data?.studentId) existingStudentIds.add(String(data.studentId).trim());
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

      // Try to resolve the canonical id from users collection. Some records store
      // canonical id in `user_id`, others in `studentId` – check both.
      let userSnapshot = await db.collection('users')
        .where('role', '==', 'student')
        .where('user_id', '==', studentId)
        .limit(1)
        .get();

      if (userSnapshot.empty) {
        userSnapshot = await db.collection('users')
          .where('role', '==', 'student')
          .where('studentId', '==', studentId)
          .limit(1)
          .get();
      }

      if (userSnapshot.empty) {
        // If not found by either field, skip this id (client may have sent bad id)
        continue;
      }

      const userData = userSnapshot.docs[0].data();
      const canonicalId = String(userData.user_id || userData.studentId || studentId).trim();
      const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(' ').trim();

      const studentEntry = {
        id: canonicalId,
        studentId: canonicalId,
        user_id: canonicalId,
        name: fullName || canonicalId,
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
          studentId: canonicalId,
          user_id: canonicalId,
          status: 'active',
          evaluationsCompleted: 0,
          lessonPlanSubmitted: false,
          notes: '',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      });

      existingStudentIds.add(canonicalId);
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

/**
 * GET /api/observations/:id/schools-summary
 * ดึงสรุปข้อมูลโรงเรียนทั้งหมดที่นักศึกษาในรอบสังเกตนี้เข้าไปสังเกต
 * พร้อมรายละเอียดครูพี่เลี้ยงและข้อมูลโรงเรียน
 */
router.get('/api/observations/:id/schools-summary', requireAuth, async (req, res) => {
  try {
    const observationId = req.params.id;
    
    // ดึงข้อมูล observation
    const observationDoc = await db.collection('observations').doc(observationId).get();
    
    if (!observationDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลการสังเกตุ' });
    }
    
    const observationData = observationDoc.data();
    
    // ดึงรายชื่อนักศึกษาในรอบนี้
    const studentsSnapshot = await db.collection('observation_students')
      .where('observationId', '==', observationId)
      .get();
    
    const studentIds = [];
    studentsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.studentId) {
        studentIds.push(String(data.studentId));
      }
    });
    
    if (studentIds.length === 0) {
      return res.json({
        success: true,
        observation: {
          id: observationDoc.id,
          ...observationData
        },
        schools: [],
        totalSchools: 0
      });
    }
    
    // ดึงข้อมูลโรงเรียนทั้งหมดที่นักศึกษาเหล่านี้เข้าไปสังเกต
    const schoolsSnapshot = await db.collection('schools')
      .where('observationId', '==', observationId)
      .get();
    
    const schoolsMap = new Map();
    
    for (const schoolDoc of schoolsSnapshot.docs) {
      const schoolData = schoolDoc.data();
      const schoolId = schoolDoc.id;
      
      // ดึงข้อมูลนักศึกษาที่เข้าโรงเรียนนี้
      const schoolStudentIds = schoolData.studentIds || [];
      const studentDetails = [];
      
      for (const sid of schoolStudentIds) {
        const sidStr = String(sid).trim();

        // พยายามค้นหา canonical user by user_id ก่อน แล้ว fallback ไปที่ studentId
        let userSnapshot = { empty: true };
        if (sidStr) {
          userSnapshot = await db.collection('users')
            .where('user_id', '==', sidStr)
            .limit(1)
            .get();

          if (userSnapshot.empty) {
            userSnapshot = await db.collection('users')
              .where('studentId', '==', sidStr)
              .limit(1)
              .get();
          }
        }

        let nameVal = null;
        let yearLevelVal = null;

        if (userSnapshot && !userSnapshot.empty) {
          const userData = userSnapshot.docs[0].data();
          // ถ้ามีชื่อ-นามสกุล ให้ใช้ หากไม่มี ใช้ fallback เป็น displayName หรือ studentId
          if (userData.firstName || userData.lastName) {
            nameVal = `${userData.firstName || ''} ${userData.lastName || ''}`.trim();
          } else if (userData.displayName) {
            nameVal = userData.displayName;
          }
          // รองรับทั้งฟิลด์ `year` และ `yearLevel` ใน users collection
          yearLevelVal = userData.year || userData.yearLevel || null;
        }

        // ถ้าไม่พบชื่อ ให้แสดงอย่างน้อยรหัสนักศึกษา
        if (!nameVal) nameVal = sidStr;

        studentDetails.push({
          studentId: sidStr,
          name: nameVal,
          yearLevel: yearLevelVal
        });
      }
      
      // ดึงข้อมูลครูพี่เลี้ยง (mentors)
      const mentorsSnapshot = await db.collection('mentors')
        .where('schoolId', '==', schoolId)
        .where('observationId', '==', observationId)
        .get();
      
      const mentors = [];
      mentorsSnapshot.forEach(mentorDoc => {
        const mentorData = mentorDoc.data();
        const mentorFullName = (mentorData.firstName || mentorData.lastName)
          ? `${mentorData.firstName || ''} ${mentorData.lastName || ''}`.trim()
          : (mentorData.name || mentorData.displayName || '-');

        // Normalize teaching subjects: accept array of strings or array of objects
        let subjectStr = '';
        if (Array.isArray(mentorData.teachingSubjects) && mentorData.teachingSubjects.length > 0) {
          const parts = mentorData.teachingSubjects.map(item => {
            if (!item && item !== 0) return '';
            if (typeof item === 'string') return item;
            if (typeof item === 'object') {
              // common keys to try
              return item.name || item.subject || item.title || (item.value ? String(item.value) : JSON.stringify(item));
            }
            return String(item);
          }).filter(Boolean);
          subjectStr = parts.join(', ');
        } else if (mentorData.subject) {
          // subject may itself be array/object/string
          if (Array.isArray(mentorData.subject)) {
            subjectStr = mentorData.subject.map(s => typeof s === 'string' ? s : (s.name || s.subject || String(s))).filter(Boolean).join(', ');
          } else if (typeof mentorData.subject === 'object') {
            subjectStr = mentorData.subject.name || mentorData.subject.subject || JSON.stringify(mentorData.subject);
          } else {
            subjectStr = String(mentorData.subject);
          }
        } else {
          subjectStr = '';
        }

        mentors.push({
          id: mentorDoc.id,
          firstName: mentorData.firstName || '',
          lastName: mentorData.lastName || '',
          name: mentorFullName,
          position: mentorData.position || mentorData.title || '',
          subject: subjectStr || '-',
          phone: mentorData.phone || '-',
          email: mentorData.email || '-',
          studentId: mentorData.studentId || null
        });
      });
      
      schoolsMap.set(schoolId, {
        id: schoolId,
        name: schoolData.name || '-',
        address: schoolData.address || '-',
        district: schoolData.district || '-',
        province: schoolData.province || '-',
        phone: schoolData.phone || '-',
        email: schoolData.email || '-',
        principalName: schoolData.principalName || '-',
        principalPhone: schoolData.principalPhone || '-',
        studentCount: schoolData.studentCount || 0,
        classroomCount: schoolData.classroomCount || 0,
        staffCount: schoolData.staffCount || 0,
        gradeLevels: schoolData.gradeLevels || [],
        students: studentDetails,
        mentors: mentors,
        totalStudents: studentDetails.length,
        totalMentors: mentors.length,
        createdAt: schoolData.createdAt
      });
    }
    
    const schoolsArray = Array.from(schoolsMap.values());
    
    // เรียงตามจำนวนนักศึกษามากไปน้อย
    schoolsArray.sort((a, b) => b.totalStudents - a.totalStudents);
    
    res.json({
      success: true,
      observation: {
        id: observationDoc.id,
        name: observationData.name,
        academicYear: observationData.academicYear,
        yearLevel: observationData.yearLevel,
        startDate: observationData.startDate,
        endDate: observationData.endDate,
        status: observationData.status
      },
      schools: schoolsArray,
      totalSchools: schoolsArray.length,
      totalStudentsInObservation: studentIds.length
    });
  } catch (error) {
    console.error('Error fetching schools summary:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

module.exports = router;
