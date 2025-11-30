const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../config/firebaseAdmin');
const { logActivity, logSystem } = require('./system');

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

        // บันทึก Activity Log
        await logActivity(
            'register',
            'ลงทะเบียนผู้ใช้ใหม่',
            `นักศึกษารหัส ${studentId} ได้ลงทะเบียนเข้าสู่ระบบ`,
            studentId,
            `นักศึกษา ${studentId}`,
            { studentId }
        );

        // บันทึก System Log
        await logSystem('info', 'auth', `New user registered: ${studentId}`, studentId);

        res.status(201).json({
            success: true,
            message: 'สมัครสมาชิกสำเร็จ กรุณาเข้าสู่ระบบ'
        });

    } catch (error) {
        console.error('Register error:', error);
        await logSystem('error', 'auth', `Registration failed: ${error.message}`, 'system');
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

        // Flexible user lookup:
        // - If identifier is numeric, prefer doc id or studentId field
        // - If identifier is alphanumeric, try doc id, then staffCode field
        const identifier = String(studentId).trim();
        let userSnap = null;

        // Try doc by id first (covers admin001, teacher001, or numeric student doc ids)
        const directRef = db.collection('users').doc(identifier);
        const directSnap = await directRef.get();
        if (directSnap.exists) {
            userSnap = directSnap;
        } else {
            // Not a direct doc id — try queries
            if (/^\d+$/.test(identifier)) {
                // numeric -> try searching by studentId field
                const q = await db.collection('users').where('studentId', '==', identifier).limit(1).get();
                if (!q.empty) userSnap = q.docs[0];
            } else {
                // non-numeric -> try staffCode field first
                const q1 = await db.collection('users').where('staffCode', '==', identifier).limit(1).get();
                if (!q1.empty) userSnap = q1.docs[0];

                // fallback: maybe stored under studentId field accidentally
                if (!userSnap) {
                    const q2 = await db.collection('users').where('studentId', '==', identifier).limit(1).get();
                    if (!q2.empty) userSnap = q2.docs[0];
                }
            }
        }

        if (!userSnap || !userSnap.exists) {
            return res.status(401).json({
                success: false,
                message: 'รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
            });
        }

        const userData = userSnap.data();

        // ตรวจสอบรหัสผ่าน
        const isPasswordValid = await bcrypt.compare(password, userData.password || '');

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
            });
        }

        // Build session user object (exclude password)
        const sessionUser = {
            id: userSnap.id,
            studentId: userData.studentId || null,
            staffCode: userData.staffCode || null,
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            major: userData.major || '',
            email: userData.email || '',
            avatar: userData.avatar || '',
            role: userData.role || 'student',
            year: userData.year || null,
            room: userData.room || null
        };

        // ตั้งค่า session
        req.session.userId = userSnap.id;
        req.session.user = sessionUser;
        req.session.createdAt = Date.now();
        req.session.lastActivity = Date.now();
        req.session.rememberMe = req.body.rememberMe || false;
        
        // ตั้งค่า session fingerprint เพื่อความปลอดภัย
        req.session.userAgent = req.headers['user-agent'];
        req.session.ipAddress = req.ip || req.connection.remoteAddress;

        // ตั้งค่า cookie maxAge ตาม remember me
        if (req.session.rememberMe) {
            req.session.cookie.maxAge = 15 * 24 * 60 * 60 * 1000; // 15 วัน
        } else {
            req.session.cookie.maxAge = 48 * 60 * 60 * 1000; // 48 ชั่วโมง
        }

        // บันทึก Activity Log
        await logActivity(
            'login',
            'เข้าสู่ระบบ',
            `${sessionUser.firstName} ${sessionUser.lastName} (${sessionUser.role}) เข้าสู่ระบบ${req.session.rememberMe ? ' (จดจำฉัน)' : ''}`,
            identifier,
            `${sessionUser.firstName} ${sessionUser.lastName}`,
            { 
                role: sessionUser.role,
                studentId: sessionUser.studentId,
                staffCode: sessionUser.staffCode,
                rememberMe: req.session.rememberMe,
                ipAddress: req.session.ipAddress
            }
        );

        // บันทึก System Log
        await logSystem('info', 'auth', `User logged in: ${identifier} (${sessionUser.role})${req.session.rememberMe ? ' [Remember Me]' : ''}`, identifier);

        res.json({
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ',
            redirectTo: '/dashboard',
            sessionExpiry: req.session.rememberMe ? '15 วัน' : '48 ชั่วโมง'
        });

    } catch (error) {
        console.error('Login error:', error);
        await logSystem('error', 'auth', `Login failed: ${error.message}`, identifier || 'unknown');
        res.status(500).json({
            success: false,
            message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ'
        });
    }
});

// POST /logout - ออกจากระบบ
router.post('/logout', async (req, res) => {
    const user = req.session.user;
    
    // บันทึก Activity Log ก่อนทำลาย session
    if (user) {
        await logActivity(
            'logout',
            'ออกจากระบบ',
            `${user.firstName} ${user.lastName} (${user.role}) ออกจากระบบ`,
            user.studentId || user.staffCode || user.id,
            `${user.firstName} ${user.lastName}`,
            { role: user.role }
        );
        
        await logSystem('info', 'auth', `User logged out: ${user.studentId || user.staffCode} (${user.role})`, user.studentId || user.staffCode);
    }
    
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
