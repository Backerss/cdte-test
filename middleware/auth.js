// Middleware สำหรับตรวจสอบว่าผู้ใช้ login แล้วหรือยัง พร้อมตรวจสอบอายุ session
function requireAuth(req, res, next) {
  // ตรวจสอบว่ามี session หรือไม่
  if (!req.session.userId) {
    return res.redirect('/login?error=session_required');
  }

  // ตรวจสอบว่า session หมดอายุหรือไม่
  const now = Date.now();
  const sessionCreatedAt = req.session.createdAt || now;
  const sessionMaxAge = req.session.rememberMe 
    ? 15 * 24 * 60 * 60 * 1000  // 15 วัน (ถ้า remember me)
    : 48 * 60 * 60 * 1000;       // 48 ชั่วโมง (ปกติ)
  
  const sessionAge = now - sessionCreatedAt;

  // ถ้า session หมดอายุแล้ว
  if (sessionAge > sessionMaxAge) {
    // ทำลาย session
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
    });
    return res.redirect('/login?error=session_expired');
  }

  // ตรวจสอบการเข้าถึงครั้งล่าสุด (Last Activity)
  const lastActivity = req.session.lastActivity || now;
  const inactiveTime = now - lastActivity;
  const maxInactiveTime = 2 * 60 * 60 * 1000; // 2 ชั่วโมงไม่มีกิจกรรม

  // ถ้าไม่มีกิจกรรมนานเกิน  2 ชั่วโมง (เฉพาะถ้าไม่ remember me)
  if (!req.session.rememberMe && inactiveTime > maxInactiveTime) {
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
    });
    return res.redirect('/login?error=session_inactive');
  }

  // อัปเดตเวลา last activity
  req.session.lastActivity = now;

  // Attach user data to req.user for use in routes
  req.user = req.session.user || { studentId: req.session.userId };
  next();
}

// Middleware สำหรับตรวจสอบว่าผู้ใช้ยังไม่ได้ login (สำหรับหน้า login/register)
function requireGuest(req, res, next) {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  next();
}

// Middleware สำหรับตรวจสอบ Security Fingerprint (ป้องกัน Session Hijacking)
function checkSessionSecurity(req, res, next) {
  // ข้ามการตรวจสอบถ้าไม่ได้ login
  if (!req.session.userId) {
    return next();
  }
  // ตรวจสอบ User-Agent (Browser Fingerprint)
  const currentUserAgent = req.headers['user-agent'] || '';
  const sessionUserAgent = req.session.userAgent || '';

  // Helper: หาคร่าว ๆ ว่าเป็น browser family ไหน (ไม่ละเอียด แต่พอแยก Edge/Chrome/Firefox/Safari)
  function getBrowserFamily(ua) {
    if (!ua) return 'unknown';
    if (ua.includes('Edg/')) return 'edge';
    if (ua.includes('OPR/') || ua.includes('Opera')) return 'opera';
    if (ua.includes('Chrome/')) return 'chrome';
    if (ua.includes('Firefox/')) return 'firefox';
    if (ua.includes('Safari/') && ua.includes('Version/')) return 'safari';
    return 'other';
  }

  if (sessionUserAgent && currentUserAgent !== sessionUserAgent) {
    const sessionBrowser = getBrowserFamily(sessionUserAgent);
    const currentBrowser = getBrowserFamily(currentUserAgent);

    // ถ้าเป็น browser family เดียวกัน => อัปเดต UA ใน session และยอมรับ
    if (sessionBrowser === currentBrowser) {
      // อัปเดต UA เพื่อรับการเปลี่ยนแปลงเล็กน้อย (เช่น Edg token, version changes)
      req.session.userAgent = currentUserAgent;
    } else {
      // ถ้า family ต่างกันจริง ๆ ให้บันทึกเป็น security alert แต่ไม่ทำลาย session ทันที
      console.warn('Security Alert: User-Agent mismatch', {
        userId: req.session.userId,
        expected: sessionUserAgent,
        received: currentUserAgent
      });

      // เก็บเหตุการณ์เตือนไว้ใน session เพื่อการตรวจสอบภายหลัง
      req.session.securityAlerts = req.session.securityAlerts || [];
      req.session.securityAlerts.push({
        type: 'ua_mismatch',
        expected: sessionUserAgent,
        received: currentUserAgent,
        time: Date.now(),
        ip: req.ip || req.connection && req.connection.remoteAddress
      });

      // หาก alert ซ้ำหลายครั้งภายใน session -> อาจมีความเสี่ยงสูง ให้ทำลาย session
      if (req.session.securityAlerts.length >= 3) {
        req.session.destroy((err) => {
          if (err) console.error('Session destroy error:', err);
        });
        return res.redirect('/login?error=security_violation');
      }
    }
  }

  // ตรวจสอบ IP Address (เตือนถ้าเปลี่ยนมาก)
  const currentIP = req.ip || req.connection.remoteAddress;
  const sessionIP = req.session.ipAddress;

  if (sessionIP && currentIP !== sessionIP) {
    console.warn('Security Alert: IP Address changed', {
      userId: req.session.userId,
      expected: sessionIP,
      received: currentIP
    });

    // ไม่ทำลาย session ทันที เพราะ IP อาจเปลี่ยนได้ (เช่น Mobile Network)
    // แค่บันทึก log ไว้เพื่อการตรวจสอบ
    
    // อัปเดต IP ใหม่
    req.session.ipAddress = currentIP;
  }

  next();
}

// Middleware สำหรับเพิ่มข้อมูล user ใน locals สำหรับใช้ใน views
function addUserToLocals(req, res, next) {
  res.locals.user = req.session.user || null;
  res.locals.isAuthenticated = !!req.session.userId;
  next();
}

module.exports = {
  requireAuth,
  requireGuest,
  addUserToLocals,
  checkSessionSecurity
};
