const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');
const observationsRoutes = require('./routes/observations');
const systemRoutes = require('./routes/system');
const { requireAuth, requireGuest, addUserToLocals } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 3000;

// In-memory storage (replace with database in production)
const resetTokens = new Map(); // token -> { email, expires, used }

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
// Disable view cache during development to pick up template changes immediately
app.set('view cache', false);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: 'your-secret-key-change-this-in-production', // TODO: ใช้ค่าจาก .env
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // ตั้งเป็น true ถ้าใช้ HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 ชั่วโมง
  }
}));

// Add user to locals for all views
app.use(addUserToLocals);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
	res.render('index', { title: 'Home' });
});

// Auth routes
app.use('/', authRoutes);
app.use('/api', profileRoutes);
app.use('/', adminRoutes);
app.use('/', observationsRoutes);
app.use('/', systemRoutes);

// Register routes
app.get('/register', requireGuest, (req, res) => {
	res.render('auth/register');
});

// Login routes
app.get('/login', requireGuest, (req, res) => {
	res.render('auth/login');
});

// Forgot password routes
app.get('/forgot-password', (req, res) => {
	res.render('auth/forgot-password');
});

app.post('/forgot-password', (req, res) => {
	const { email } = req.body;

	// Validate email format
	if (!email || !email.endsWith('@nsru.ac.th')) {
		return res.status(400).json({
			success: false,
			message: 'กรุณาใช้อีเมลสถานศึกษาที่ลงท้ายด้วย @nsru.ac.th'
		});
	}

	// TODO: Check if email exists in database
	// For now, accept any @nsru.ac.th email

	// Generate reset token
	const token = crypto.randomBytes(32).toString('hex');
	const expires = Date.now() + 30 * 60 * 1000; // 30 minutes

	resetTokens.set(token, {
		email: email.toLowerCase(),
		expires,
		used: false
	});

	// TODO: Send email with reset link
	const resetLink = `http://localhost:${port}/reset-password/${token}`;
	console.log('Password reset requested for:', email);
	console.log('Reset link:', resetLink);
	console.log('Token expires in 30 minutes');

	res.json({
		success: true,
		message: 'ลิงก์รีเซ็ตรหัสผ่านถูกส่งไปที่อีเมลของคุณแล้ว',
		// For development only - remove in production
		_devResetLink: resetLink
	});
});

// Reset password routes
app.get('/reset-password/:token', (req, res) => {
	const { token } = req.params;

	// Check if token exists
	const resetData = resetTokens.get(token);

	if (!resetData) {
		return res.render('auth/reset-password', {
			token: '',
			tokenValid: false,
			error: 'ลิงก์ไม่ถูกต้อง'
		});
	}

	// Check if token expired
	if (Date.now() > resetData.expires) {
		return res.render('auth/reset-password', {
			token: '',
			tokenValid: false,
			error: 'ลิงก์หมดอายุแล้ว (เกิน 30 นาที)'
		});
	}

	// Check if token already used
	if (resetData.used) {
		return res.render('auth/reset-password', {
			token: '',
			tokenValid: false,
			error: 'ลิงก์นี้ถูกใช้งานไปแล้ว'
		});
	}

	// Token is valid
	res.render('auth/reset-password', {
		token,
		tokenValid: true
	});
});

app.post('/reset-password', (req, res) => {
	const { token, password } = req.body;

	// Validate input
	if (!token || !password) {
		return res.status(400).json({
			success: false,
			message: 'กรุณากรอกข้อมูลให้ครบถ้วน'
		});
	}

	if (password.length < 6) {
		return res.status(400).json({
			success: false,
			message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
		});
	}

	// Check if token exists
	const resetData = resetTokens.get(token);

	if (!resetData) {
		return res.status(400).json({
			success: false,
			message: 'ลิงก์ไม่ถูกต้อง'
		});
	}

	// Check if token expired
	if (Date.now() > resetData.expires) {
		return res.status(400).json({
			success: false,
			message: 'ลิงก์หมดอายุแล้ว กรุณาขอลิงก์ใหม่'
		});
	}

	// Check if token already used
	if (resetData.used) {
		return res.status(400).json({
			success: false,
			message: 'ลิงก์นี้ถูกใช้งานไปแล้ว'
		});
	}

	// Mark token as used
	resetData.used = true;

	// TODO: Find user by email and update password in database
	// For now, just log the action
	console.log('Password reset for:', resetData.email);
	console.log('New password length:', password.length);

	// TODO: Update user password
	// users.forEach((user, studentId) => {
	//   if (user.email === resetData.email) {
	//     user.password = password; // TODO: Hash in production
	//   }
	// });

	res.json({
		success: true,
		message: 'เปลี่ยนรหัสผ่านสำเร็จ'
	});
});

// Dashboard routes with authentication
// Helper to render a dashboard view into the layout once
function renderIntoLayout(req, res, view, opts = {}) {
	const userData = req.user || req.session.user || {};
	res.render(`dashboard/${view}`, { user: userData }, (err, html) => {
		if (err) {
			console.error('Error rendering view', view, err);
			return res.status(500).send('Error rendering page');
		}

		res.render('layouts/dashboard', {
			title: opts.title || 'Dashboard',
			currentPage: opts.currentPage || '',
			user: userData,
			body: html
		});
	});
}

app.get('/dashboard', requireAuth, (req, res) => {
	renderIntoLayout(req, res, 'home', { title: 'หน้าหลัก', currentPage: 'home' });
});

app.get('/dashboard/school-info', requireAuth, (req, res) => {
	renderIntoLayout(req, res, 'school-info', { title: 'ข้อมูลสถานศึกษา', currentPage: 'school-info' });
});

app.get('/dashboard/mentor-info', requireAuth, (req, res) => {
	renderIntoLayout(req, res, 'mentor-info', { title: 'ข้อมูลครูพี่เลี้ยง', currentPage: 'mentor-info' });
});

app.get('/dashboard/evaluation', requireAuth, (req, res) => {
	renderIntoLayout(req, res, 'evaluation', { title: 'การประเมิน', currentPage: 'evaluation' });
});

app.get('/dashboard/profile', requireAuth, (req, res) => {
	renderIntoLayout(req, res, 'profile', { title: 'โปรไฟล์', currentPage: 'profile' });
});

// Admin dashboard routes
app.get('/dashboard/admin/observations', requireAuth, (req, res) => {
	renderIntoLayout(req, res, 'admin/observations', { title: 'จัดการสังเกตุ', currentPage: 'admin-observations' });
});

app.get('/dashboard/admin/users', requireAuth, (req, res) => {
	renderIntoLayout(req, res, 'admin/users', { title: 'จัดการบัญชีผู้ใช้', currentPage: 'admin-users' });
});

app.get('/dashboard/admin/system', requireAuth, (req, res) => {
	renderIntoLayout(req, res, 'admin/system', { title: 'จัดการระบบ', currentPage: 'admin-system' });
});

app.get('/dashboard/admin/reports', requireAuth, (req, res) => {
	renderIntoLayout(req, res, 'admin/reports', { title: 'รายงานผลการสังเกตุ', currentPage: 'admin-reports' });
});

// Logout route
app.get('/logout', requireAuth, (req, res) => {
	req.session.destroy((err) => {
		if (err) {
			console.error('Logout error:', err);
		}
		res.redirect('/login');
	});
});

app.listen(port, () => {
	console.log(`Server running on http://localhost:${port}`);
});
