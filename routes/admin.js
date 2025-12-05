const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

const db = admin.firestore();

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
          user.studentId || '',
          user.staffCode || '',
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
    
    // Try to find user by doc ID first
    let userDoc = await db.collection('users').doc(userId).get();
    
    // If not found by doc ID, try by studentId or staffCode
    if (!userDoc.exists) {
      const querySnapshot = await db.collection('users')
        .where('studentId', '==', userId)
        .limit(1)
        .get();
      
      if (!querySnapshot.empty) {
        userDoc = querySnapshot.docs[0];
      } else {
        const staffSnapshot = await db.collection('users')
          .where('staffCode', '==', userId)
          .limit(1)
          .get();
        
        if (!staffSnapshot.empty) {
          userDoc = staffSnapshot.docs[0];
        }
      }
    }
    
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
          .where('studentId', '==', userData.studentId)
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
        console.error('Warning: failed to fetch practiceHistory for user', userData.studentId, err);
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

// POST /api/admin/users - Create new user
router.post('/api/admin/users', requireAdminOrTeacher, async (req, res) => {
  try {
    const { firstName, lastName, email, role, yearLevel, studentId, staffCode, password } = req.body;
    
    // Validate required fields
    if (!firstName || !lastName || !email || !role || !password) {
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
    
    // Validate student has studentId and yearLevel
    if (role === 'student') {
      if (!studentId || !/^\d+$/.test(studentId) || String(studentId).length !== 11) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุรหัสนักศึกษา 11 หลักสำหรับนักศึกษา'
        });
      }
      if (!yearLevel) {
        return res.status(400).json({ 
          success: false, 
          message: 'กรุณาระบุชั้นปีสำหรับนักศึกษา' 
        });
      }
    }
    
    // Check for duplicate studentId or staffCode
    if (studentId) {
      const existingStudent = await db.collection('users')
        .where('studentId', '==', studentId)
        .limit(1)
        .get();
      
      if (!existingStudent.empty) {
        return res.status(400).json({ 
          success: false, 
          message: 'มีรหัสนักศึกษานี้ในระบบแล้ว' 
        });
      }
    }
    
    // If staffCode provided, check duplicate. If not provided for non-student, we'll auto-generate.
    if (staffCode) {
      const existingStaff = await db.collection('users')
        .where('staffCode', '==', staffCode)
        .limit(1)
        .get();
      
      if (!existingStaff.empty) {
        return res.status(400).json({ 
          success: false, 
          message: 'มีรหัสเจ้าหน้าที่นี้ในระบบแล้ว' 
        });
      }
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Prepare user data
    const userData = {
      firstName,
      lastName,
      email,
      role,
      password: hashedPassword,
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Add role-specific fields (only set properties when values provided)
    if (role === 'student') {
      userData.studentId = studentId;
      userData.year = yearLevel ? parseInt(yearLevel) : null;
      userData.room = null;
    } else {
      // For staff/admin: if staffCode not provided, auto-generate one using Thai year suffix + random digits
      if (staffCode) {
        userData.staffCode = staffCode;
      } else {
        // generate unique staffCode: YY + 9 digits -> total 11 characters
        const prefix = String((new Date().getFullYear() + 543) % 100).padStart(2, '0');
        let generated = null;
        for (let attempt = 0; attempt < 10; attempt++) {
          const rand = Math.floor(Math.random() * 1e9).toString().padStart(9, '0');
          const candidate = prefix + rand;
          const q = await db.collection('users').where('staffCode', '==', candidate).limit(1).get();
          if (q.empty) { generated = candidate; break; }
        }
        if (!generated) {
          throw new Error('ไม่สามารถสร้างรหัสเจ้าหน้าที่ใหม่ได้ โปรดลองอีกครั้ง');
        }
        userData.staffCode = generated;
      }
    }
    
    // Create user document
    const docRef = await db.collection('users').add(userData);
    
    // Return created user (without password)
    delete userData.password;
    
    res.json({
      success: true,
      message: 'เพิ่มผู้ใช้สำเร็จ',
      user: {
        id: docRef.id,
        docId: docRef.id,
        ...userData
      }
    });
  } catch (error) {
    console.error('Error creating user:', error, error && error.stack);
    // Return the error message to the client for debugging (remove or sanitize in production)
    res.status(500).json({ 
      success: false, 
      message: error && error.message ? error.message : 'เกิดข้อผิดพลาดในการเพิ่มผู้ใช้' 
    });
  }
});

// PUT /api/admin/users/:id - Update user
router.put('/api/admin/users/:id', requireAdminOrTeacher, async (req, res) => {
  try {
    const userId = req.params.id;
    const { firstName, lastName, email, role, yearLevel, status, staffCode, studentId } = req.body;
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
    }
    
    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (status) updateData.status = status;
    if (yearLevel && role === 'student') updateData.year = parseInt(yearLevel);
    // Allow updating staffCode or studentId (ensure uniqueness)
    if (staffCode) {
      // check duplicate staffCode in other docs
      const q = await db.collection('users').where('staffCode', '==', staffCode).limit(1).get();
      if (!q.empty && q.docs[0].id !== userId) {
        return res.status(400).json({ success: false, message: 'มีรหัสเจ้าหน้าที่นี้ในระบบแล้ว' });
      }
      updateData.staffCode = staffCode;
    }
    if (studentId && role === 'student') {
      if (!/^\d+$/.test(studentId) || String(studentId).length !== 11) {
        return res.status(400).json({ success: false, message: 'รหัสนักศึกษาต้องเป็นตัวเลข 11 หลัก' });
      }
      const q2 = await db.collection('users').where('studentId', '==', studentId).limit(1).get();
      if (!q2.empty && q2.docs[0].id !== userId) {
        return res.status(400).json({ success: false, message: 'มีรหัสนักศึกษานี้ในระบบแล้ว' });
      }
      updateData.studentId = studentId;
    }
    
    await userRef.update(updateData);
    
    res.json({
      success: true,
      message: 'อัปเดตข้อมูลผู้ใช้สำเร็จ'
    });
  } catch (error) {
    console.error('Error updating user:', error);
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
    
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
    }
    
    // Soft delete - set status to inactive
    await userRef.update({
      status: 'inactive',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({
      success: true,
      message: 'ลบผู้ใช้สำเร็จ'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในการลบผู้ใช้' 
    });
  }
});

module.exports = router;
