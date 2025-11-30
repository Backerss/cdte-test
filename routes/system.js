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
    await db.collection('system_activities').add({
      type,
      title,
      description,
      userId,
      userName,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata
    });
  } catch (error) {
    console.error('Error logging activity:', error);
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
