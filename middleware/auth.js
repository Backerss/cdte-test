// Middleware สำหรับตรวจสอบว่าผู้ใช้ login แล้วหรือยัง
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
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

// Middleware สำหรับเพิ่มข้อมูล user ใน locals สำหรับใช้ใน views
function addUserToLocals(req, res, next) {
  res.locals.user = req.session.user || null;
  res.locals.isAuthenticated = !!req.session.userId;
  next();
}

module.exports = {
  requireAuth,
  requireGuest,
  addUserToLocals
};
