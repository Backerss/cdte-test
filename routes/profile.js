const express = require('express');
const router = express.Router();
const { db } = require('../config/firebaseAdmin');
const bcrypt = require('bcryptjs');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'public', 'img', 'profile_img');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = `${req.session.userId}-${Date.now()}`;
    cb(null, safeBase + ext);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// GET /profile - ดึงข้อมูลโปรไฟล์
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return res.status(404).json({
        success: false,
        message: 'ไม่พบข้อมูลผู้ใช้'
      });
    }

    const userData = userSnap.data() || {};

    // Compute academic year from studentId (first two digits => Buddhist year 25xx)
    function computeStudentYear(studentId) {
      try {
        if (!studentId || studentId.length < 2) return 1;
        const prefix = studentId.slice(0,2);
        const yy = parseInt(prefix, 10);
        if (Number.isNaN(yy)) return 1;
        const enrollmentBuddhist = 2500 + yy; // e.g., '65' -> 2565
        const currentBuddhist = new Date().getFullYear() + 543;
        let year = (currentBuddhist - enrollmentBuddhist) + 1;
        if (year < 1) year = 1;
        if (year > 4) year = 4;
        return year;
      } catch (e) {
        return 1;
      }
    }

    // don't send password back
    if (userData.password) delete userData.password;

    // compute derived fields
    const derived = {
      year: computeStudentYear(userData.studentId || req.session.userId),
      room: userData.room || null,
      emailLocked: !!(userData.email && userData.email.trim() !== ''),
      roomLocked: !!(userData.room && String(userData.room).trim() !== '')
    };

    res.json({ success: true, data: { ...userData, ...derived } });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
    });
  }
});

// PUT /profile - อัพเดทข้อมูลโปรไฟล์
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { firstName, lastName, major, email, phone } = req.body;

    // Validation
    if (!firstName || !lastName || !major || !email) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    // อัพเดทข้อมูลใน Firestore
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้' });
    }

    const existing = userSnap.data() || {};

    // Email can be set only once. If user already has an email, do not allow changing it.
    if (existing.email && existing.email.trim() !== '' && existing.email !== email) {
      return res.status(403).json({ success: false, message: 'ไม่สามารถแก้ไขอีเมลได้อีก (แก้ไขได้เพียงครั้งเดียว)' });
    }

    // Room can be set only once by student. If existing.room exists and different, reject.
    const room = req.body.room;
    if (existing.room && String(existing.room).trim() !== '' && room && String(existing.room) !== String(room)) {
      return res.status(403).json({ success: false, message: 'ไม่สามารถแก้ไขห้องได้อีก (แก้ไขได้เพียงครั้งเดียว)' });
    }

    const updatePayload = {
      firstName,
      lastName,
      major,
      email,
      phone: phone || '',
      updatedAt: new Date().toISOString()
    };
    if (req.body.avatar) updatePayload.avatar = req.body.avatar;
    if (room && (!existing.room || String(existing.room).trim() === '')) updatePayload.room = room;

    await userRef.update(updatePayload);

    // อัพเดท session
    req.session.user = {
      ...req.session.user,
      firstName,
      lastName,
      major,
      email,
      ...(updatePayload.room ? { room: updatePayload.room } : {})
    };

    res.json({
      success: true,
      message: 'บันทึกข้อมูลสำเร็จ'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล'
    });
  }
});

// POST /profile/avatar - อัพโหลดรูปโปรไฟล์ (บันทึกไฟล์ลง public/img/profile_img)
router.post('/profile/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'ไม่พบไฟล์' });
    }

    const publicPath = `/img/profile_img/${req.file.filename}`;

    // Update user document avatar field
    const userRef = db.collection('users').doc(req.session.userId);
    await userRef.update({ avatar: publicPath, updatedAt: new Date().toISOString() });

    // Update session
    req.session.user = { ...(req.session.user || {}), avatar: publicPath };

    res.json({ success: true, message: 'อัพโหลดรูปภาพสำเร็จ', avatarUrl: publicPath });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัพโหลดรูปภาพ' });
  }
});

// POST /profile/change-password - เปลี่ยนรหัสผ่าน (ต้องส่ง currentPassword และ newPassword)
router.post('/profile/change-password', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลรหัสผ่านให้ครบถ้วน' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
    }

    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
    }

    const userData = userSnap.data();
    const hashed = userData.password || '';

    // ตรวจสอบรหัสผ่านปัจจุบัน
    const match = await bcrypt.compare(currentPassword, hashed);
    if (!match) {
      return res.status(401).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
    }

    const newHashed = await bcrypt.hash(newPassword, 10);
    await userRef.update({ password: newHashed, updatedAt: new Date().toISOString() });

    res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน' });
  }
});

module.exports = router;
