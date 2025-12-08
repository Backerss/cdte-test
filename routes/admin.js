const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

const db = admin.firestore();

// Helper function: Log system activities
async function logSystemActivity(level, category, message, userId, userEmail, metadata = {}) {
  try {
    await db.collection('system_logs').add({
      level,
      category,
      message,
      userId,
      userEmail,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata
    });
  } catch (error) {
    console.error('Error logging system activity:', error);
  }
}

// Middleware: check if user is admin or teacher
function requireAdminOrTeacher(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  if (req.session.user.role !== 'admin' && req.session.user.role !== 'teacher') {
    return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  next();
}

// GET /api/admin/users - List all users with optional filters
router.get('/api/admin/users', requireAdminOrTeacher, async (req, res) => {
  try {
    const { search, role, yearLevel, status } = req.query;
    
    let query = db.collection('users');
    
    // Apply filters
    if (role) {
      query = query.where('role', '==', role);
    }
    if (yearLevel) {
      query = query.where('year', '==', parseInt(yearLevel));
    }
    if (status) {
      query = query.where('status', '==', status);
    }
    
    const snapshot = await query.get();
    let users = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      // Don't send passwords to client
      delete data.password;
      users.push({
        id: doc.id,
        docId: doc.id,
        ...data
      });
    });
    
    // Apply search filter on client-fetched data (Firestore doesn't support complex text search natively)
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(user => {
        const searchableText = [
          user.firstName || '',
          user.lastName || '',
          user.user_id || '',
          user.email || ''
        ].join(' ').toLowerCase();
        return searchableText.includes(searchLower);
      });
    }
    
    // Sort by role (student, teacher, admin) and then by name
    users.sort((a, b) => {
      const roleOrder = { student: 1, teacher: 2, admin: 3 };
      const roleA = roleOrder[a.role] || 999;
      const roleB = roleOrder[b.role] || 999;
      if (roleA !== roleB) return roleA - roleB;
      return (a.firstName || '').localeCompare(b.firstName || '');
    });
    
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้' });
  }
});

// GET /api/admin/users/:id - Get single user detail
router.get('/api/admin/users/:id', requireAdminOrTeacher, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Direct lookup by user_id (document ID)
    let userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
    }
    
    const userData = userDoc.data();
    delete userData.password;
    
    // Fetch practice history if student (caught to avoid index errors)
    let practiceHistory = [];
    if (userData.role === 'student') {
      try {
        // Simplified query without orderBy to avoid composite index requirement
        const practiceSnapshot = await db.collection('practiceHistory')
          .where('user_id', '==', userData.user_id)
          .get();

        practiceHistory = practiceSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Sort in memory instead
        practiceHistory.sort((a, b) => {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        });
      } catch (err) {
        // If Firestore complains about missing composite index (or other query errors),
        // log it but return an empty practiceHistory so the endpoint doesn't fail.
        console.error('Warning: failed to fetch practiceHistory for user', userData.user_id, err);
        practiceHistory = [];
      }
    }
    
    res.json({
      success: true,
      user: {
        id: userDoc.id,
        docId: userDoc.id,
        ...userData,
        practiceHistory
      }
    });
  } catch (error) {
    console.error('Error fetching user detail:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

// POST /api/admin/users - Create new user (user_id is document ID)
router.post('/api/admin/users', requireAdminOrTeacher, async (req, res) => {
  try {
    const { firstName, lastName, email, role, yearLevel, user_id, password } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !email || !role || !user_id || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'กรุณากรอกข้อมูลให้ครบถ้วน' 
      });
    }
    
    // Validate role
    if (!['student', 'teacher', 'admin'].includes(role)) {
      return res.status(400).json({ 
        success: false, 
        message: 'บทบาทไม่ถูกต้อง' 
      });
    }
    
    // Validate user_id format based on role
    const userId = String(user_id).trim();
    
    if (role === 'student') {
      // Student: 11-digit numeric
      if (!/^\d{11}$/.test(userId)) {
        return res.status(400).json({
          success: false,
          message: 'รหัสนักศึกษาต้องเป็นตัวเลข 11 หลัก'
        });
      }
    } else if (role === 'teacher') {
      // Teacher: T + 11 chars (generator uses YYMMDDHHM S pattern producing 11 chars after prefix)
      if (!/^T[a-zA-Z0-9]{11}$/.test(userId)) {
        return res.status(400).json({
          success: false,
          message: 'รหัสอาจารย์ต้องขึ้นต้นด้วย T ตามด้วย 11 ตัวอักษร (รวม 12 ตัว)'
        });
      }
    } else if (role === 'admin') {
      // Admin: A + 11 chars
      if (!/^A[a-zA-Z0-9]{11}$/.test(userId)) {
        return res.status(400).json({
          success: false,
          message: 'รหัสผู้ดูแลต้องขึ้นต้นด้วย A ตามด้วย 11 ตัวอักษร (รวม 12 ตัว)'
        });
      }
    }
    
    // Check if user_id already exists
    const docRef = db.collection('users').doc(userId);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      return res.status(400).json({
        success: false,
        message: 'รหัสนี้ถูกใช้งานแล้ว'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Prepare user data
    const userData = {
      user_id: userId,
      firstName,
      lastName,
      email,
      role,
      password: hashedPassword,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Add role-specific fields
    if (role === 'student') {
      userData.faculty = 'คณะครุศาสตร์';
      userData.year = yearLevel ? parseInt(yearLevel) : 1;
      userData.room = '';
      userData.major = '';
    } else if (role === 'teacher') {
      userData.faculty = 'คณะครุศาสตร์';
      userData.academicPosition = '';
    }
    // Admin: no additional fields needed
    
    // Create user document with user_id as document ID
    await docRef.set(userData);
    
    // บันทึก log การสร้างผู้ใช้ใหม่
    await logSystemActivity(
      'info',
      'user_management',
      `สร้างผู้ใช้ใหม่ ${firstName} ${lastName} (${userId})`,
      req.session.user.email,
      req.session.user.email,
      {
        newUserId: userId,
        newUserName: `${firstName} ${lastName}`,
        newUserRole: role,
        newUserEmail: email,
        createdBy: `${req.session.user.firstName || ''} ${req.session.user.lastName || ''}`,
        createdByRole: req.session.user.role,
        timestamp: new Date().toISOString(),
        ipAddress: req.ip || req.connection.remoteAddress
      }
    );
    
    // Return created user (without password)
    delete userData.password;
    
    res.json({
      success: true,
      message: 'เพิ่มผู้ใช้สำเร็จ',
      user: {
        id: userId,
        docId: userId,
        ...userData
      }
    });
  } catch (error) {
    console.error('Error creating user:', error, error && error.stack);
    
    // บันทึก error log
    await logSystemActivity(
      'error',
      'user_management',
      `ล้มเหลวในการสร้างผู้ใช้ใหม่: ${error.message}`,
      req.session.user?.email || 'unknown',
      req.session.user?.email || 'unknown',
      {
        attemptedData: { firstName, lastName, email, role, user_id },
        error: error.message,
        createdBy: `${req.session.user?.firstName || ''} ${req.session.user?.lastName || ''}`,
        timestamp: new Date().toISOString()
      }
    );
    
    res.status(500).json({ 
      success: false, 
      message: error && error.message ? error.message : 'เกิดข้อผิดพลาดในการเพิ่มผู้ใช้' 
    });
  }
});

// PUT /api/admin/users/:id - Update user (อาจารย์และผู้ดูแลระบบสามารถแก้ไขได้ไม่จำกัด)
router.put('/api/admin/users/:id', requireAdminOrTeacher, async (req, res) => {
  try {
    const userId = req.params.id;
    const { firstName, lastName, email, yearLevel, status, major, academicPosition, phone, room, role, studentId, password } = req.body;
    const currentUser = req.session.user;
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
    }
    
    const currentData = userDoc.data();
    const originalData = { ...currentData }; // เก็บข้อมูลเดิมเพื่อ log
    
    const updateData = {
      updatedAt: new Date().toISOString(),
      lastModifiedBy: currentUser.email,
      lastModifiedAt: new Date().toISOString()
    };
    
    // อาจารย์และผู้ดูแลระบบสามารถแก้ไขได้ทั้งหมด (ไม่มีข้อจำกัด)

    // อัปเดตข้อมูลพื้นฐาน - อาจารย์และผู้ดูแลระบบสามารถแก้ไขได้ทั้งหมด
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email; // อนุญาตให้เปลี่ยนได้
    if (role !== undefined) updateData.role = role; // อนุญาตให้เปลี่ยนบทบาทได้
    if (status !== undefined) updateData.status = status;
    
    // ตรวจสอบเบอร์โทรศัพท์ (ถ้ามี)
    if (phone !== undefined) {
      const phoneStr = String(phone || '').trim();
      if (phoneStr && !/^0\d{9}$/.test(phoneStr)) {
        return res.status(400).json({ success: false, message: 'เบอร์โทรต้องเป็นจำนวน 10 หลัก เริ่มต้นด้วย 0' });
      }
      updateData.phone = phoneStr;
    }

    // Password change: hash and store if provided
    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
      }
      const hashed = await bcrypt.hash(password, 10);
      updateData.password = hashed;
    }
    
    // จัดการข้อมูลตามบทบาทใหม่ (ถ้ามีการเปลี่ยนบทบาท)
    const finalRole = updateData.role || currentData.role;
    
    // อัปเดตข้อมูลตามบทบาท
    if (finalRole === 'student') {
      updateData.faculty = 'คณะครุศาสตร์';
      if (yearLevel !== undefined) updateData.year = parseInt(yearLevel) || 1;
      
      // ตรวจสอบสาขา
      const allowedMajors = ['เทคโนโลยีดิจิทัลเพื่อการศึกษา', 'คอมพิวเตอร์ศึกษา'];
      if (major !== undefined) {
        if (major && !allowedMajors.includes(major)) {
          return res.status(400).json({ success: false, message: 'สาขาไม่ถูกต้อง' });
        }
        updateData.major = major || '';
      }
      
      // ห้อง: อนุญาตไม่เกิน 2 ห้อง
      if (room !== undefined) {
        const roomStr = String(room || '').trim();
        if (roomStr) {
          const parts = roomStr.split(',').map(s => s.trim()).filter(Boolean);
          if (parts.length > 2) {
            return res.status(400).json({ success: false, message: 'เลือกได้ไม่เกิน 2 ห้อง' });
          }
          updateData.room = parts.join(',');
        } else {
          updateData.room = '';
        }
      }
    } else if (finalRole === 'teacher') {
      updateData.faculty = 'คณะครุศาสตร์';
      if (academicPosition !== undefined) updateData.academicPosition = academicPosition;
    } else if (finalRole === 'admin') {
      // ผู้ดูแลระบบไม่ต้องมีข้อมูลเพิ่มเติม
    }
    
    // อัปเดตข้อมูล
    await userRef.update(updateData);
    
    // สร้าง log การเปลี่ยนแปลง
    const changes = [];
    const changedFields = Object.keys(updateData).filter(key => 
      key !== 'updatedAt' && key !== 'lastModifiedBy' && key !== 'lastModifiedAt'
    );
    
    changedFields.forEach(field => {
      if (originalData[field] !== updateData[field]) {
        changes.push(`${field}: "${originalData[field] || ''}" → "${updateData[field] || ''}"`);
      }
    });
    
    // บันทึก log ลง system_logs
    await logSystemActivity(
      'info',
      'user_management',
      `แก้ไขข้อมูลผู้ใช้ ${originalData.firstName} ${originalData.lastName} (${userId})`,
      currentUser.email,
      currentUser.email,
      {
        targetUserId: userId,
        targetUserName: `${originalData.firstName} ${originalData.lastName}`,
        changes: changes.join(', '),
        modifiedBy: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`,
        modifiedByRole: currentUser.role,
        timestamp: new Date().toISOString(),
        ipAddress: req.ip || req.connection.remoteAddress
      }
    );
    
    res.json({
      success: true,
      message: 'อัปเดตข้อมูลผู้ใช้สำเร็จ',
      changes: changes.length
    });
  } catch (error) {
    console.error('Error updating user:', error);
    
    // บันทึก error log
    await logSystemActivity(
      'error',
      'user_management',
      `ล้มเหลวในการแก้ไขข้อมูลผู้ใช้ ${userId}: ${error.message}`,
      req.session.user?.email || 'unknown',
      req.session.user?.email || 'unknown',
      {
        targetUserId: userId,
        error: error.message,
        modifiedBy: `${req.session.user?.firstName || ''} ${req.session.user?.lastName || ''}`,
        timestamp: new Date().toISOString()
      }
    );
    
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล' 
    });
  }
});

// DELETE /api/admin/users/:id - Delete user (soft delete by setting status to inactive)
router.delete('/api/admin/users/:id', requireAdminOrTeacher, async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUser = req.session.user;
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
    }
    
    const userData = userDoc.data();
    
    // Soft delete - set status to inactive
    await userRef.update({
      status: 'inactive',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedBy: currentUser.email,
      deletedAt: new Date().toISOString()
    });
    
    // บันทึก log การลบ
    await logSystemActivity(
      'warning',
      'user_management',
      `ลบผู้ใช้ ${userData.firstName} ${userData.lastName} (${userId})`,
      currentUser.email,
      currentUser.email,
      {
        targetUserId: userId,
        targetUserName: `${userData.firstName} ${userData.lastName}`,
        targetUserRole: userData.role,
        deletedBy: `${currentUser.firstName || ''} ${currentUser.lastName || ''}`,
        deletedByRole: currentUser.role,
        timestamp: new Date().toISOString(),
        ipAddress: req.ip || req.connection.remoteAddress
      }
    );
    
    res.json({
      success: true,
      message: 'ลบผู้ใช้สำเร็จ'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    
    // บันทึก error log
    await logSystemActivity(
      'error',
      'user_management',
      `ล้มเหลวในการลบผู้ใช้ ${userId}: ${error.message}`,
      req.session.user?.email || 'unknown',
      req.session.user?.email || 'unknown',
      {
        targetUserId: userId,
        error: error.message,
        deletedBy: `${req.session.user?.firstName || ''} ${req.session.user?.lastName || ''}`,
        timestamp: new Date().toISOString()
      }
    );
    
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการลบผู้ใช้' 
    });
  }
});

// POST /api/admin/generate-user-id - Generate user_id for staff (T/A prefix)
router.post('/api/admin/generate-user-id', requireAdminOrTeacher, async (req, res) => {
  try {
    const { autoGenerate, manualCode, role } = req.body;
    
    if (!role || !['teacher', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ role (อาจารย์หรือผู้ดูแล)'
      });
    }
    
    if (!autoGenerate && !manualCode) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาเลือกสร้างอัตโนมัติหรือกรอกรหัสเอง'
      });
    }
    
    const prefix = role === 'teacher' ? 'T' : 'A';
    let userId = null;
    
    if (autoGenerate) {
      // Generate: prefix + YYMMDDHHMS (T/A + 10 chars = 11 total)
      const now = new Date();
      const thaiYear = (now.getFullYear() + 543).toString().slice(-2);
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).charAt(0); // 1 digit
      
      userId = `${prefix}${thaiYear}${month}${day}${hours}${minutes}${seconds}`;
    } else {
      userId = String(manualCode).trim().toUpperCase();
      
      // Validate manual code: prefix + 10 chars = 11 total
      const expectedPattern = role === 'teacher' ? /^T[a-zA-Z0-9]{10}$/ : /^A[a-zA-Z0-9]{10}$/;
      
      if (!expectedPattern.test(userId)) {
        return res.status(400).json({
          success: false,
          message: `รหัสต้องขึ้นต้นด้วย ${prefix} ตามด้วย 10 ตัวอักษร (รวม 11 ตัว)`
        });
      }
    }
    
    // Check uniqueness
    const docRef = db.collection('users').doc(userId);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      return res.status(400).json({
        success: false,
        message: 'รหัสนี้ถูกใช้งานแล้ว กรุณาสร้างใหม่หรือกรอกรหัสอื่น',
        duplicate: true
      });
    }
    
    res.json({
      success: true,
      user_id: userId
    });
    
  } catch (error) {
    console.error('Error generating staffCode:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการสร้างรหัส'
    });
  }
});

// POST /api/admin/change-role - Change user role (creates new document with new user_id)
router.post('/api/admin/change-role', requireAdminOrTeacher, async (req, res) => {
  try {
    const { currentUserId, newRole, newUserId, password } = req.body;
    
    // Validate inputs
    if (!currentUserId || !newRole || !newUserId) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกข้อมูลให้ครบถ้วน'
      });
    }
    
    if (!['student', 'teacher', 'admin'].includes(newRole)) {
      return res.status(400).json({
        success: false,
        message: 'บทบาทไม่ถูกต้อง'
      });
    }
    
    // Get current user data
    const currentRef = db.collection('users').doc(currentUserId);
    const currentSnap = await currentRef.get();
    
    if (!currentSnap.exists) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบผู้ใช้'
      });
    }
    
    const currentData = currentSnap.data();
    
    // Validate new user_id format based on role
    if (newRole === 'student') {
      if (!/^\d{11}$/.test(newUserId)) {
        return res.status(400).json({
          success: false,
          message: 'รหัสนักศึกษาต้องเป็นตัวเลข 11 หลัก'
        });
      }
    } else if (newRole === 'teacher') {
      if (!/^T[a-zA-Z0-9]{11}$/.test(newUserId)) {
        return res.status(400).json({
          success: false,
          message: 'รหัสอาจารย์ต้องขึ้นต้นด้วย T ตามด้วย 11 ตัวอักษร'
        });
      }
    } else if (newRole === 'admin') {
      if (!/^A[a-zA-Z0-9]{11}$/.test(newUserId)) {
        return res.status(400).json({
          success: false,
          message: 'รหัสผู้ดูแลต้องขึ้นต้นด้วย A ตามด้วย 11 ตัวอักษร'
        });
      }
    }
    
    // Check if new user_id already exists
    const newRef = db.collection('users').doc(newUserId);
    const newSnap = await newRef.get();
    
    if (newSnap.exists) {
      return res.status(400).json({
        success: false,
        message: 'รหัสนี้ถูกใช้งานแล้ว'
      });
    }
    
    // Prepare new user data (copy existing, update role and user_id)
    const newUserData = {
      ...currentData,
      user_id: newUserId,
      role: newRole,
      updatedAt: new Date().toISOString()
    };
    
    // Update role-specific fields
    if (newRole === 'student') {
      newUserData.faculty = 'คณะครุศาสตร์';
      // Compute year from user_id
      const currentYear = new Date().getFullYear() + 543;
      const yearPrefix = parseInt(newUserId.substring(0, 2));
      const admissionYear = 2500 + yearPrefix;
      const yearsSince = currentYear - admissionYear;
      let computedYear = yearsSince + 1;
      if (computedYear < 1) computedYear = 1;
      if (computedYear > 4) computedYear = 4;
      newUserData.year = computedYear;
      
      // Remove non-student fields
      delete newUserData.academicPosition;
    } else if (newRole === 'teacher') {
      newUserData.faculty = 'คณะครุศาสตร์';
      
      // Remove non-teacher fields
      delete newUserData.year;
      delete newUserData.room;
      delete newUserData.major;
    } else {
      // Admin - remove role-specific fields
      delete newUserData.faculty;
      delete newUserData.year;
      delete newUserData.room;
      delete newUserData.major;
      delete newUserData.academicPosition;
    }
    
    // If password provided, hash it; otherwise keep existing
    if (password && password.trim()) {
      const bcrypt = require('bcryptjs');
      newUserData.password = await bcrypt.hash(password.trim(), 10);
    }
    
    // Create new document with new user_id
    await newRef.set(newUserData);
    
    // Soft delete old document (set inactive)
    await currentRef.update({
      status: 'inactive',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      replacedBy: newUserId,
      replacedAt: new Date().toISOString()
    });
    
    // บันทึก log การเปลี่ยนบทบาท
    await logSystemActivity(
      'info',
      'user_management',
      `เปลี่ยนบทบาทผู้ใช้ ${currentData.firstName} ${currentData.lastName} จาก ${currentData.role} เป็น ${newRole}`,
      req.session.user.email,
      req.session.user.email,
      {
        oldUserId: currentUserId,
        newUserId: newUserId,
        userName: `${currentData.firstName} ${currentData.lastName}`,
        oldRole: currentData.role,
        newRole: newRole,
        changedBy: `${req.session.user.firstName || ''} ${req.session.user.lastName || ''}`,
        changedByRole: req.session.user.role,
        timestamp: new Date().toISOString(),
        ipAddress: req.ip || req.connection.remoteAddress
      }
    );
    
    res.json({
      success: true,
      message: 'เปลี่ยนบทบาทสำเร็จ',
      newUserId: newUserId
    });
    
  } catch (error) {
    console.error('Error changing role:', error);
    
    // บันทึก error log
    await logSystemActivity(
      'error',
      'user_management',
      `ล้มเหลวในการเปลี่ยนบทบาท ${currentUserId} เป็น ${newRole}: ${error.message}`,
      req.session.user?.email || 'unknown',
      req.session.user?.email || 'unknown',
      {
        currentUserId,
        newRole,
        newUserId,
        error: error.message,
        changedBy: `${req.session.user?.firstName || ''} ${req.session.user?.lastName || ''}`,
        timestamp: new Date().toISOString()
      }
    );
    
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการเปลี่ยนบทบาท'
    });
  }
});

module.exports = router;
