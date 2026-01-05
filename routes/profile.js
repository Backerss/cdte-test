const express = require('express');
const router = express.Router();
const { db, storage } = require('../config/firebaseAdmin');
const bcrypt = require('bcryptjs');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Multer memory storage config for Firebase Storage
const upload = multer({
  storage: multer.memoryStorage(),
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

    // don't send password back
    if (userData.password) delete userData.password;

    // compute derived fields; rely on stored year from DB only
    const derivedYear = (userData.year !== undefined && userData.year !== null && String(userData.year).trim() !== '')
      ? userData.year
      : null;

    const derived = {
      year: derivedYear,
      room: userData.room || null,
      emailLocked: !!(userData.email && userData.email.trim() !== ''),
      roomLocked: !!(userData.room && String(userData.room).trim() !== '')
    };

    // Ensure the role is present for the client UI to adapt based on role
    const role = userData.role || (req.session && req.session.user && req.session.user.role) || null;

    // Debug log for role detection and full document
    try {
      const safeUserData = Object.assign({}, userData);
      if (safeUserData.password) delete safeUserData.password;
    } catch (e) {
      // ignore logging errors
    }

    res.json({ success: true, data: { ...userData, role, ...derived } });
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

// Helper: extract object path (including folder) from Firebase Storage URL
function extractObjectPathFromUrl(url) {
  if (!url || !url.includes('storage.googleapis.com')) return null;
  try {
    const u = new URL(url);
    // Path looks like: /<bucket>/<folder>/<file>
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null; // need at least bucket + object
    parts.shift(); // drop bucket name
    return decodeURIComponent(parts.join('/'));
  } catch (e) {
    return null;
  }
}

// Helper function to delete old avatar from Firebase Storage
async function deleteOldAvatar(oldAvatarUrl) {
  if (!oldAvatarUrl || !oldAvatarUrl.includes('storage.googleapis.com')) return;
  
  try {
    const objectPath = extractObjectPathFromUrl(oldAvatarUrl);
    if (objectPath) {
      const bucket = storage.bucket();
      const file = bucket.file(objectPath);
      await file.delete();
      console.log(`Deleted old avatar: ${objectPath}`);
    }
  } catch (error) {
    console.error('Error deleting old avatar:', error);
    // Don't throw error - continue with upload even if deletion fails
  }
}

// POST /profile/avatar - อัพโหลดรูปโปรไฟล์ไปยัง Firebase Storage
router.post('/profile/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'ไม่พบไฟล์' });
    }

    const userId = req.session.userId;
    
    // Get current user data to check for existing avatar
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();
    const userData = userSnap.exists ? userSnap.data() : {};
    const oldAvatarUrl = userData.avatar;

    // Delete old avatar if exists
    if (oldAvatarUrl) {
      await deleteOldAvatar(oldAvatarUrl);
    }

    const bucket = storage.bucket();
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const fileName = `profile_images/${userId}-${uuidv4()}${fileExtension}`;
    
    const file = bucket.file(fileName);
    const stream = file.createWriteStream({
      metadata: {
        contentType: req.file.mimetype,
        metadata: {
          userId: userId,
          uploadedAt: new Date().toISOString()
        }
      },
      resumable: false
    });

    stream.on('error', (err) => {
      console.error('Firebase Storage upload error:', err);
      return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัพโหลดรูปภาพ' });
    });

    stream.on('finish', async () => {
      try {
        // Make the file publicly accessible
        await file.makePublic();
        
        // Get public URL
        const publicUrl = `https://storage.googleapis.com/prac-cdte.firebasestorage.app/${fileName}`;
        
        // Update user document avatar field
        await userRef.update({ avatar: publicUrl, updatedAt: new Date().toISOString() });

        // Update session
        req.session.user = { ...(req.session.user || {}), avatar: publicUrl };

        res.json({ success: true, message: 'อัพโหลดรูปภาพสำเร็จ', avatarUrl: publicUrl });
      } catch (updateError) {
        console.error('Database update error:', updateError);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' });
      }
    });

    // Write the buffer to Firebase Storage
    stream.end(req.file.buffer);

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
