const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../config/firebaseAdmin');

// POST /register - สมัครสมาชิก
router.post('/register', async (req, res) => {
  try {
    const { studentId, password } = req.body;

    // Validation
    if (!studentId || !password) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกรหัสนักศึกษาและรหัสผ่าน'
      });
    }

    // ตรวจสอบว่ารหัสนักศึกษาเป็นตัวเลขเท่านั้น
    if (!/^\d+$/.test(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'รหัสนักศึกษาต้องเป็นตัวเลขเท่านั้น'
      });
    }

    // ตรวจสอบความยาวรหัสผ่าน
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
      });
    }

    // ตรวจสอบว่ามีรหัสนักศึกษานี้ในระบบแล้วหรือไม่
    const userRef = db.collection('users').doc(studentId);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      return res.status(400).json({
        success: false,
        message: 'รหัสนักศึกษานี้ถูกใช้งานแล้ว'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // สร้างข้อมูลผู้ใช้ใหม่
    const userData = {
      studentId: studentId,
      password: hashedPassword,
      firstName: '',
      lastName: '',
      major: '',
      email: '',
      phone: '',
      avatar: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // บันทึกลง Firestore โดยใช้ studentId เป็น document ID
    await userRef.set(userData);

    res.status(201).json({
      success: true,
      message: 'สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ'
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการสมัครสมาชิก'
    });
  }
});

// POST /login - เข้าสู่ระบบ
router.post('/login', async (req, res) => {
  try {
    const { studentId, password } = req.body;

    // Validation
    if (!studentId || !password) {
      return res.status(400).json({
        success: false,
        message: 'กรุณากรอกรหัสนักศึกษาและรหัสผ่าน'
      });
    }

    // ค้นหาผู้ใช้จาก Firestore
    const userRef = db.collection('users').doc(studentId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(401).json({
        success: false,
        message: 'รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง'
      });
    }

    const userData = userSnap.data();

    // ตรวจสอบรหัสผ่าน
    const isPasswordValid = await bcrypt.compare(password, userData.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง'
      });
    }

    // สร้าง session
    req.session.userId = studentId;
    req.session.user = {
      studentId: userData.studentId,
      firstName: userData.firstName,
      lastName: userData.lastName,
      major: userData.major,
      email: userData.email,
      avatar: userData.avatar
    };

    res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      redirectTo: '/dashboard'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'
    });
  }
});

// POST /logout - ออกจากระบบ
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        success: false,
        message: 'เกิดข้อผิดพลาดในการออกจากระบบ'
      });
    }
    res.json({
      success: true,
      message: 'ออกจากระบบสำเร็จ',
      redirectTo: '/login'
    });
  });
});

module.exports = router;
