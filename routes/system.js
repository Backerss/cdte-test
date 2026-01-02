const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebaseAdmin');

// Academic year collections (snapshots are additive, do not alter existing data)
const ACADEMIC_YEAR_COLLECTION = 'academic_year_snapshots';

function getAcademicYearInfo(now = new Date()) {
  const thaiYear = now.getFullYear() + 543;
  const month = now.getMonth() + 1; // 1-12
  // ปีการศึกษาเริ่ม 1 พ.ค. (เดือน 5) จบ 31 มี.ค. ปีถัดไป
  const academicYear = month < 5 ? thaiYear - 1 : thaiYear;
  const gregYearStart = academicYear - 543;
  const gregYearEnd = gregYearStart + 1;
  const startDate = new Date(Date.UTC(gregYearStart, 4, 1)); // May = 4
  const endDate = new Date(Date.UTC(gregYearEnd, 2, 31, 23, 59, 59, 999)); // March = 2
  return { academicYear, startDate, endDate };
}

// Middleware: ตรวจสอบว่าผู้ใช้ต้องเข้าสู่ระบบ
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  next();
}

// Middleware: ตรวจสอบว่าเป็น admin เท่านั้น
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึง - เฉพาะผู้ดูแลระบบเท่านั้น' });
  }
  next();
}

/**
 * GET /api/system/status
 * ดึงสถานะของระบบปัจจุบัน
 */
router.get('/api/system/status', requireAdmin, async (req, res) => {
  try {
    const settingsRef = db.collection('system_settings').doc('main');
    const doc = await settingsRef.get();
    
    if (doc.exists) {
      const data = doc.data();
      res.json({ 
        success: true, 
        status: data.status || 'online',
        lastUpdate: data.lastUpdate || null
      });
    } else {
      // ถ้ายังไม่มี settings ให้สร้างค่าเริ่มต้น
      await settingsRef.set({
        status: 'online',
        lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({ 
        success: true, 
        status: 'online' 
      });
    }
  } catch (error) {
    console.error('Error fetching system status:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

/**
 * GET /api/system/academic-years
 * คืนปีการศึกษาปัจจุบัน (คำนวณอัตโนมัติ: พ.ค.-มี.ค.) และ snapshots ที่บันทึกไว้
 */
router.get('/api/system/academic-years', requireAdmin, async (req, res) => {
  try {
    const { academicYear, startDate, endDate } = getAcademicYearInfo();

    const snapshot = await db.collection(ACADEMIC_YEAR_COLLECTION)
      .orderBy('academicYear', 'desc')
      .get();

    const years = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      years.push({ id: doc.id, ...data });
    });

    res.json({
      success: true,
      current: {
        academicYear,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      snapshots: years
    });
  } catch (error) {
    console.error('Error fetching academic years:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงปีการศึกษา' });
  }
});

async function fetchCollectionData(collectionName, startDate, endDate, timestampFields = ['createdAt', 'timestamp', 'created_at']) {
  const docs = [];
  const snap = await db.collection(collectionName).get();
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  snap.forEach(d => {
    const data = d.data();
    let tsValue = null;
    for (const f of timestampFields) {
      if (data[f]) { tsValue = data[f]; break; }
    }
    let tsMs = null;
    if (tsValue) {
      if (typeof tsValue === 'string') tsMs = Date.parse(tsValue);
      else if (tsValue.toDate) tsMs = tsValue.toDate().getTime();
      else if (tsValue instanceof Date) tsMs = tsValue.getTime();
    }
    if (tsMs === null || (tsMs >= startMs && tsMs <= endMs)) {
      docs.push({ id: d.id, ...data });
    }
  });
  return docs;
}

/**
 * POST /api/system/academic-years/snapshot
 * สร้าง snapshot ปีการศึกษาปัจจุบัน (พ.ค.-มี.ค.) โดยไม่แตะต้องข้อมูลเดิม
 */
router.post('/api/system/academic-years/snapshot', requireAdmin, async (req, res) => {
  try {
    const { academicYear, startDate, endDate } = getAcademicYearInfo();

    // ดึงข้อมูลแต่ละ collection ภายในช่วงปีการศึกษา
    const usersSnapshot = await db.collection('users').get();
    const students = [];
    usersSnapshot.forEach(d => {
      const u = d.data();
      if (u.role === 'student') {
        let tsMs = null;
        if (u.createdAt) {
          if (typeof u.createdAt === 'string') tsMs = Date.parse(u.createdAt);
          else if (u.createdAt.toDate) tsMs = u.createdAt.toDate().getTime();
          else if (u.createdAt instanceof Date) tsMs = u.createdAt.getTime();
        }
        if (tsMs === null || (tsMs >= startDate.getTime() && tsMs <= endDate.getTime())) {
          students.push({
            id: d.id,
            firstName: u.firstName || '',
            lastName: u.lastName || '',
            year: u.year || null,
            major: u.major || '',
            room: u.room || '',
            status: u.status || '',
            createdAt: u.createdAt || null
          });
        }
      }
    });

    const evaluations = await fetchCollectionData('evaluations', startDate, endDate);
    const observations = await fetchCollectionData('observations', startDate, endDate);
    const observationStudents = await fetchCollectionData('observation_students', startDate, endDate);
    const schools = await fetchCollectionData('schools', startDate, endDate);
    const mentors = await fetchCollectionData('mentors', startDate, endDate);
    const systemLogs = await fetchCollectionData('system_logs', startDate, endDate, ['timestamp', 'createdAt']);
    const systemActivities = await fetchCollectionData('system_activities', startDate, endDate, ['timestamp', 'createdAt']);

    const payload = {
      academicYear,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      studentCount: students.length,
      students,
      evaluations,
      observations,
      observationStudents,
      schools,
      mentors,
      systemLogs,
      systemActivities,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: req.session.user.email
    };

    const docRef = db.collection(ACADEMIC_YEAR_COLLECTION).doc(String(academicYear));
    await docRef.set(payload, { merge: true });

    await logActivity(
      'system',
      'บันทึก Snapshot ปีการศึกษา',
      `บันทึกปีการศึกษา ${academicYear} (นักศึกษา ${students.length} คน)`,
      req.session.user.email,
      `${req.session.user.firstName} ${req.session.user.lastName}`,
      {
        academicYear,
        studentCount: students.length,
        evaluations: evaluations.length,
        observations: observations.length,
        observationStudents: observationStudents.length,
        schools: schools.length,
        mentors: mentors.length,
        systemLogs: systemLogs.length,
        systemActivities: systemActivities.length
      }
    );

    res.json({ success: true, message: 'สร้าง snapshot ปีการศึกษาปัจจุบันแล้ว', studentCount: students.length });
  } catch (error) {
    console.error('Error saving academic year snapshot:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการสร้าง snapshot' });
  }
});

/**
 * GET /api/system/academic-years/:year/export
 * ดึง snapshot ปีการศึกษา ถ้าไม่มี snapshot จะคำนวณสดจากช่วงวันที่อัตโนมัติ (พ.ค.-มี.ค.)
 * query: format=json|csv
 */
router.get('/api/system/academic-years/:year/export', requireAdmin, async (req, res) => {
  try {
    const { year } = req.params;
    const { format = 'json' } = req.query;

    // ลองใช้ snapshot ก่อน
    let data;
    const docRef = db.collection(ACADEMIC_YEAR_COLLECTION).doc(String(year));
    const doc = await docRef.get();
    if (doc.exists) {
      data = doc.data();
    } else {
      // คำนวณช่วงตามปีการศึกษา (พ.ค.-มี.ค.) และดึงข้อมูลสด
      const academicYear = parseInt(year, 10);
      if (isNaN(academicYear)) {
        return res.status(400).json({ success: false, message: 'ปีการศึกษาไม่ถูกต้อง' });
      }
      const startDate = new Date(Date.UTC(academicYear - 543, 4, 1));
      const endDate = new Date(Date.UTC(academicYear - 543 + 1, 2, 31, 23, 59, 59, 999));
      const usersSnapshot = await db.collection('users')
        .where('createdAt', '>=', startDate.toISOString())
        .where('createdAt', '<=', endDate.toISOString())
        .get();
      const students = [];
      usersSnapshot.forEach(d => {
        const u = d.data();
        if (u.role === 'student') {
          students.push({
            id: d.id,
            firstName: u.firstName || '',
            lastName: u.lastName || '',
            year: u.year || null,
            major: u.major || '',
            room: u.room || '',
            status: u.status || '',
            createdAt: u.createdAt || null
          });
        }
      });
      data = {
        academicYear,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        studentCount: students.length,
        students
      };
    }

    const students = data.students || [];
    const evaluations = data.evaluations || [];
    const observations = data.observations || [];
    const observationStudents = data.observationStudents || [];
    const schools = data.schools || [];
    const mentors = data.mentors || [];
    const systemLogs = data.systemLogs || [];
    const systemActivities = data.systemActivities || [];
    const exportPayload = {
      academicYear: data.academicYear,
      startDate: data.startDate,
      endDate: data.endDate,
      studentCount: students.length,
      students,
      evaluations,
      observations,
      observationStudents,
      schools,
      mentors,
      systemLogs,
      systemActivities
    };

    if (format === 'csv' || format === 'excel') {
      const headers = ['id', 'firstName', 'lastName', 'year', 'major', 'room', 'status', 'createdAt'];
      const csvLines = ['\uFEFF' + headers.join(',')].concat(
        students.map(s => headers.map(h => (s[h] !== undefined && s[h] !== null) ? String(s[h]).replace(/"/g, '""') : '').join(','))
      );
      const csv = csvLines.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="academic-year-${year}.csv"`);
      return res.send(csv);
    }

    res.json({ success: true, data: exportPayload });
  } catch (error) {
    console.error('Error exporting academic year:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการส่งออกข้อมูลปีการศึกษา' });
  }
});

/**
 * POST /api/system/status
 * เปลี่ยนสถานะของระบบ
 */
router.post('/api/system/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    
    // Validate status
    if (!['online', 'maintenance', 'offline'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: 'สถานะไม่ถูกต้อง' 
      });
    }
    
    const settingsRef = db.collection('system_settings').doc('main');
    
    await settingsRef.set({
      status,
      lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.session.user.email || 'admin'
    }, { merge: true });
    
    // บันทึก Activity Log
    await db.collection('system_activities').add({
      type: 'system',
      title: 'เปลี่ยนสถานะระบบ',
      description: `เปลี่ยนสถานะระบบเป็น "${status}" โดย ${req.session.user.firstName} ${req.session.user.lastName}`,
      userId: req.session.user.email,
      userName: `${req.session.user.firstName} ${req.session.user.lastName}`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {
        newStatus: status,
        userRole: req.session.user.role
      }
    });
    
    // บันทึก System Log
    await db.collection('system_logs').add({
      level: 'info',
      category: 'system',
      message: `System status changed to ${status}`,
      userId: req.session.user.email,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ 
      success: true, 
      message: 'เปลี่ยนสถานะระบบสำเร็จ',
      status 
    });
  } catch (error) {
    console.error('Error updating system status:', error);
    
    // บันทึก Error Log
    await db.collection('system_logs').add({
      level: 'error',
      category: 'system',
      message: `Failed to change system status: ${error.message}`,
      userId: req.session.user?.email || 'unknown',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ' });
  }
});

/**
 * GET /api/system/logs
 * ดึง System Logs
 */
router.get('/api/system/logs', requireAdmin, async (req, res) => {
  try {
    const { limit = 100, level, category } = req.query;
    
    let query = db.collection('system_logs')
      .orderBy('timestamp', 'desc')
      .limit(parseInt(limit));
    
    if (level) {
      query = query.where('level', '==', level);
    }
    
    if (category) {
      query = query.where('category', '==', category);
    }
    
    const snapshot = await query.get();
    const logs = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      logs.push({
        id: doc.id,
        level: data.level || 'info',
        category: data.category || 'system',
        message: data.message || '',
        userId: data.userId || '',
        timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : new Date().toISOString()
      });
    });
    
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Error fetching system logs:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล', logs: [] });
  }
});

/**
 * GET /api/system/activities
 * ดึงกิจกรรมล่าสุดของผู้ใช้
 */
router.get('/api/system/activities', requireAdmin, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const snapshot = await db.collection('system_activities')
      .orderBy('timestamp', 'desc')
      .limit(parseInt(limit))
      .get();
    
    const activities = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      activities.push({
        id: doc.id,
        type: data.type || 'system',
        title: data.title || '',
        description: data.description || '',
        userId: data.userId || '',
        userName: data.userName || '',
        timestamp: data.timestamp ? data.timestamp.toDate().toISOString() : new Date().toISOString(),
        metadata: data.metadata || {}
      });
    });
    
    res.json({ success: true, activities });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล', activities: [] });
  }
});

/**
 * Helper Function: บันทึก Activity Log
 * สามารถเรียกใช้จากที่อื่นได้
 */
async function logActivity(type, title, description, userId, userName, metadata = {}) {
  try {
    // sanitize metadata: Firestore rejects `undefined` values
    const cleanMetadata = {};
    if (metadata && typeof metadata === 'object') {
      Object.keys(metadata).forEach(k => {
        if (typeof metadata[k] !== 'undefined') cleanMetadata[k] = metadata[k];
      });
    }

    await db.collection('system_activities').add({
      type,
      title,
      description,
      userId,
      userName,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata: Object.keys(cleanMetadata).length ? cleanMetadata : undefined
    });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}

/**
 * POST /api/system/reset-database
 * Reset ข้อมูลฐานข้อมูลทั้งหมด (อันตรายมาก!)
 * มีระบบ Countdown 10 นาทีเพื่อความปลอดภัย
 */
router.post('/api/system/reset-database', requireAdmin, async (req, res) => {
  try {
    console.log('Reset database request received:', req.body);
    const { verificationCode, confirmed, timestamp } = req.body;
    
    console.log('Extracted parameters:', { verificationCode, confirmed, timestamp });
    
    if (!verificationCode || !confirmed) {
      console.log('Validation failed:', { verificationCode: !!verificationCode, confirmed: !!confirmed });
      return res.status(400).json({ 
        success: false, 
        message: 'ข้อมูลการยืนยันไม่ครบถ้วน' 
      });
    }
    
    const currentUser = req.session.user;
    
    // Log การพยายาม Reset (ก่อนการดำเนินการ)
    await logActivity(
      'system',
      'ร้องขอ Reset Database',
      `${currentUser.firstName} ${currentUser.lastName} ร้องขอ Reset Database ด้วยรหัสยืนยัน`,
      currentUser.email,
      `${currentUser.firstName} ${currentUser.lastName}`,
      {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      }
    );
    
    // ดำเนินการ Reset Database
    const resetResult = await performDatabaseReset(currentUser, req.ip);
    
    // Log การ Reset สำเร็จ
    await logActivity(
      'system',
      'Reset Database สำเร็จ',
      'ลบข้อมูลทั้งหมดและสร้าง Admin ใหม่แล้ว',
      currentUser.email,
      `${currentUser.firstName} ${currentUser.lastName}`,
      {
        resetResult: resetResult,
        ipAddress: req.ip,
        completedAt: new Date().toISOString()
      }
    );
    
    res.json({ 
      success: true, 
      message: 'Reset Database สำเร็จ',
      data: {
        deletedCollections: resetResult.deletedCollections,
        deletedDocuments: resetResult.deletedDocuments,
        newAdmin: {
          username: 'admin',
          password: 'admin123',
          note: 'รหัสผ่านนี้ควรเปลี่ยนทันทีหลังจากเข้าสู่ระบบ'
        }
      }
    });
    
  } catch (error) {
    console.error('Error resetting database:', error);
    
    // Log การ Reset ล้มเหลว
    try {
      await logActivity(
        'system',
        'Reset Database ล้มเหลว',
        `เกิดข้อผิดพลาด: ${error.message}`,
        req.session.user?.email || 'unknown',
        `${req.session.user?.firstName} ${req.session.user?.lastName}` || 'Unknown User',
        {
          error: error.message,
          stack: error.stack,
          ipAddress: req.ip,
          timestamp: new Date().toISOString()
        }
      );
    } catch (logError) {
      console.error('Error logging failed reset:', logError);
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการ Reset Database: ' + error.message 
    });
  }
});

/**
 * ฟังก์ชันสำหรับ Reset Database ทั้งหมด
 * ลบข้อมูลทั้งหมดและสร้าง Admin ใหม่
 */
async function performDatabaseReset(adminUser, ipAddress) {
  const collections = ['users', 'evaluations', 'observations', 'schools', 'mentors', 'system_activities'];
  let deletedDocuments = 0;
  const deletedCollections = [];
  
  try {
    console.log('🔥 Starting database reset process...');
    
    // วนลูปลบแต่ละ collection
    for (const collectionName of collections) {
      try {
        const snapshot = await db.collection(collectionName).get();
        const batch = db.batch();
        let batchCount = 0;
        
        snapshot.forEach(doc => {
          // ถ้าเป็น collection users ให้เก็บ admin ปัจจุบันไว้ก่อน
          if (collectionName === 'users' && doc.id === adminUser.id) {
            return; // ข้าม admin ปัจจุบัน
          }
          
          batch.delete(doc.ref);
          batchCount++;
          deletedDocuments++;
        });
        
        if (batchCount > 0) {
          await batch.commit();
          deletedCollections.push({
            name: collectionName,
            deletedCount: batchCount
          });
          console.log(`✅ Deleted ${batchCount} documents from ${collectionName}`);
        }
        
      } catch (collectionError) {
        console.warn(`⚠️ Error deleting collection ${collectionName}:`, collectionError.message);
        // ไม่หยุดการทำงาน แต่บันทึก error
      }
    }
    
    // สร้าง Admin ใหม่
    const newAdminRef = db.collection('users').doc();
    await newAdminRef.set({
      username: 'admin',
      password: 'admin123', // ในการใช้งานจริงควร hash password
      email: 'admin@system.local',
      firstName: 'System',
      lastName: 'Administrator',
      role: 'admin',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: 'system_reset',
      metadata: {
        resetBy: `${adminUser.firstName} ${adminUser.lastName}`,
        resetAt: new Date().toISOString(),
        resetFromIP: ipAddress
      }
    });
    
    console.log('✅ Created new admin user successfully');
    
    // Reset system settings
    await db.collection('system_settings').doc('main').set({
      status: 'online',
      lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
      lastReset: admin.firestore.FieldValue.serverTimestamp(),
      resetBy: `${adminUser.firstName} ${adminUser.lastName}`,
      resetFromIP: ipAddress
    });
    
    console.log('🎉 Database reset completed successfully');
    
    return {
      success: true,
      deletedCollections,
      deletedDocuments,
      newAdminCreated: true,
      resetTimestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('💥 Error during database reset:', error);
    throw new Error(`Database reset failed: ${error.message}`);
  }
}

/**
 * Helper Function: บันทึก System Log
 * สามารถเรียกใช้จากที่อื่นได้
 */
async function logSystem(level, category, message, userId = 'system') {
  try {
    await db.collection('system_logs').add({
      level,
      category,
      message,
      userId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Error logging system:', error);
  }
}

// Export helpers
module.exports = router;
module.exports.logActivity = logActivity;
module.exports.logSystem = logSystem;
