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

        // ตรวจสอบความยาวรหัสนักศึกษา (ต้องเป็น 11 หลัก)
        if (studentId.length !== 11) {
            return res.status(400).json({
                success: false,
                message: 'รหัสนักศึกษาต้องมี 11 หลัก'
            });
        }

        // ตรวจสอบความยาวรหัสผ่าน
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
            });
        }

        // คำนวณชั้นปีตามปีการศึกษา (พ.ศ.) โดยปีการศึกษาเริ่มใหม่หลังสิ้นสุดเดือนมีนาคม
        // ตัวอย่าง: ปีการศึกษา 2568 = 1 เม.ย. 2568 - 31 มี.ค. 2569 (เลื่อนชั้นหลัง 31 มี.ค.)
        const studentYear = computeStudentYearFromId(studentId);

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

        // สร้างข้อมูลผู้ใช้ใหม่ (ทุกคนที่สมัครเป็นนักศึกษา)
        const userData = {
            user_id: studentId, // Unified ID field for all roles
            password: hashedPassword,
            role: 'student', // ผู้ใช้ทุกคนที่สมัครเป็นนักศึกษา
            year: studentYear, // ชั้นปีที่คำนวณจากรหัส
            faculty: 'คณะครุศาสตร์', // Faculty locked for students
            firstName: '',
            lastName: '',
            major: '',
            email: '',
            phone: '',
            room: '',
            avatar: '',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // บันทึกลง Firestore โดยใช้ user_id เป็น document ID (immutable)
        await userRef.set(userData);

        // บันทึก Activity Log
        await logActivity(
            'register',
            'ลงทะเบียนผู้ใช้ใหม่',
            `นักศึกษารหัส ${studentId} (ชั้นปีที่ ${studentYear}) ได้ลงทะเบียนเข้าสู่ระบบ`,
            studentId,
            `นักศึกษา ${studentId}`,
            { user_id: studentId, year: studentYear, role: 'student' }
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

        // Use user_id directly as document ID (numeric=student, T*=teacher, A*=admin)
        const identifier = String(studentId).trim();
        
        // Direct document lookup using user_id as document ID
        const userRef = db.collection('users').doc(identifier);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            return res.status(401).json({
                success: false,
                message: 'รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
            });
        }
        
        // Verify role matches prefix for security
        const userData = userSnap.data();
        const expectedRole = detectRoleFromUserId(identifier);
        if (userData.role && userData.role !== expectedRole) {
            console.warn(`[auth] Role mismatch: user_id=${identifier} has role=${userData.role}, expected=${expectedRole}`);
        }


        // ตรวจสอบรหัสผ่าน
        const isPasswordValid = await bcrypt.compare(password, userData.password || '');

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'
            });
        }

        // Build session user object dynamically from Firestore document (exclude password)
        const sessionUser = Object.assign({ id: userSnap.id }, (userData || {}));
        // Remove password/hash from the session object if present
        if (sessionUser.password) delete sessionUser.password;
        // Ensure role has a sensible default so other code can rely on it
        if (!sessionUser.role) sessionUser.role = 'student';

        // Normalize user data based on role - ensure required fields exist
        const normalizedData = await normalizeUserDataByRole(userSnap.id, sessionUser);
        Object.assign(sessionUser, normalizedData);

    
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
                user_id: sessionUser.user_id,
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
            user.user_id || user.id,
            `${user.firstName} ${user.lastName}`,
            { role: user.role }
        );
        
        await logSystem('info', 'auth', `User logged out: ${user.user_id} (${user.role})`, user.user_id);
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

/**
 * Detect role from user_id prefix
 * T* = teacher, A* = admin, numeric = student
 */
function detectRoleFromUserId(userId) {
    if (!userId) return 'student';
    const firstChar = userId.charAt(0).toUpperCase();
    if (firstChar === 'T') return 'teacher';
    if (firstChar === 'A') return 'admin';
    return 'student';
}

// คืนค่าปีการศึกษาปัจจุบัน (พ.ศ.) โดยปีการศึกษาเริ่มหลังสิ้นสุดเดือนมีนาคม
// ช่วง 1 เม.ย.-31 มี.ค. => ปีการศึกษาเดียวกัน (เลื่อนชั้นหลัง 31 มี.ค.)
function getCurrentAcademicYear(now = new Date()) {
    const thaiYear = now.getFullYear() + 543;
    const month = now.getMonth() + 1; // 1-12
    // หากยังไม่พ้นเดือนมีนาคม ให้ถือว่ายังอยู่ปีการศึกษาก่อนหน้า
    return month < 4 ? thaiYear - 1 : thaiYear;
}

// คำนวณชั้นปีจากรหัสนักศึกษา 2 หลักแรก (พ.ศ.เข้าเรียน) โดยอิงปีการศึกษาแบบ เม.ย.-มี.ค.
function computeStudentYearFromId(studentId, referenceDate = new Date()) {
    if (!/^\d{11}$/.test(studentId)) return null;

    const studentYearPrefix = parseInt(studentId.substring(0, 2), 10);
    const studentAdmissionYear = 2500 + studentYearPrefix; // 66 -> 2566
    const academicYear = getCurrentAcademicYear(referenceDate);
    const yearsSinceAdmission = academicYear - studentAdmissionYear;

    let computedYear = yearsSinceAdmission + 1;
    if (computedYear < 1) computedYear = 1;
    if (computedYear > 4) computedYear = 4;

    return computedYear;
}

/**
 * Normalize user data based on role
 * Ensures required fields exist and user_id field is consistent
 */
async function normalizeUserDataByRole(userId, userData) {
    const role = userData.role || detectRoleFromUserId(userId);
    const updates = {};
    let needsUpdate = false;

    // Ensure user_id field matches document ID
    if (!userData.user_id || userData.user_id !== userId) {
        updates.user_id = userId;
        needsUpdate = true;
    }

    // Ensure role matches user_id prefix
    const expectedRole = detectRoleFromUserId(userId);
    if (!userData.role || userData.role !== expectedRole) {
        updates.role = expectedRole;
        needsUpdate = true;
    }

    if (role === 'student') {
        // Student required fields: user_id (numeric 11 digits), faculty, year, room
        
        // Set faculty (locked)
        if (!userData.faculty || userData.faculty !== 'คณะครุศาสตร์') {
            updates.faculty = 'คณะครุศาสตร์';
            needsUpdate = true;
        }

        // Set year only if missing (initial registration). Do not overwrite stored year.
        const hasStoredYear = userData.year !== undefined && userData.year !== null && String(userData.year).trim() !== '';
        if (!hasStoredYear && userId.length >= 2 && /^\d{11}$/.test(userId)) {
            const computedYear = computeStudentYearFromId(userId);
            if (computedYear) {
                updates.year = computedYear;
                needsUpdate = true;
            }
        }

    } else if (role === 'teacher') {
        // Teacher required: user_id (T + 10 chars), faculty
        if (!userData.faculty || userData.faculty !== 'คณะครุศาสตร์') {
            updates.faculty = 'คณะครุศาสตร์';
            needsUpdate = true;
        }
    }
    // Admin: user_id (A + 10 chars), no additional required fields

    // Set createdAt if missing
    if (!userData.createdAt) {
        updates.createdAt = new Date().toISOString();
        needsUpdate = true;
    }

    // Update Firestore if needed
    if (needsUpdate) {
        try {
            const userRef = db.collection('users').doc(userId);
            // Filter out undefined values before writing
            const cleanUpdates = {};
            Object.keys(updates).forEach(key => {
                if (typeof updates[key] !== 'undefined') {
                    cleanUpdates[key] = updates[key];
                }
            });
            if (Object.keys(cleanUpdates).length > 0) {
                cleanUpdates.updatedAt = new Date().toISOString();
                await userRef.update(cleanUpdates);
                console.log(`[auth] normalized user data for role=${role}, userId=${userId}`);
            }
        } catch (err) {
            console.error('[auth] failed to normalize user data:', err);
        }
    }

    return updates;
}

/**
 * Generate user_id for staff (teacher/admin) using Thai Buddhist calendar timestamp
 * Format: T/A + YYMMDDHHMS (prefix + 10 chars = 11 total)
 * 
 * @param {string} prefix - 'T' for teacher, 'A' for admin
 * @param {boolean} autoGenerate - If true, auto-generate; if false, return null
 * @returns {string|null} Generated user_id or null if manual
 */
function generateStaffUserId(prefix = 'T', autoGenerate = true) {
    if (!autoGenerate) return null;
    
    const now = new Date();
    const thaiYear = (now.getFullYear() + 543).toString().slice(-2); // YY
    const month = String(now.getMonth() + 1).padStart(2, '0'); // MM
    const day = String(now.getDate()).padStart(2, '0'); // DD
    const hours = String(now.getHours()).padStart(2, '0'); // HH
    const minutes = String(now.getMinutes()).padStart(2, '0'); // mm
    const seconds = String(now.getSeconds()).charAt(0); // S (1 digit)
    
    // prefix + YYMMDDHHMS = T/A + 10 chars = 11 total
    return `${prefix.toUpperCase()}${thaiYear}${month}${day}${hours}${minutes}${seconds}`;
}

/**
 * Check if user_id already exists in database
 */
async function isUserIdUnique(userId) {
    const docSnap = await db.collection('users').doc(userId).get();
    return !docSnap.exists;
}

module.exports = router;
module.exports.generateStaffUserId = generateStaffUserId;
module.exports.isUserIdUnique = isUserIdUnique;
module.exports.detectRoleFromUserId = detectRoleFromUserId;
