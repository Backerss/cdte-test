const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// In-memory storage (replace with database in production)
const users = new Map(); // studentId -> { studentId, password, email }
const resetTokens = new Map(); // token -> { email, expires, used }

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
	res.render('index', { title: 'Home' });
});

// Register routes
app.get('/register', (req, res) => {
	res.render('auth/register');
});

app.post('/register', (req, res) => {
	const { studentId, password } = req.body;

	// Basic validation
	if (!studentId || !password) {
		return res.status(400).json({
			success: false,
			message: 'กรุณากรอกข้อมูลให้ครบถ้วน'
		});
	}

	if (!/^\d+$/.test(studentId)) {
		return res.status(400).json({
			success: false,
			message: 'รหัสนักศึกษาต้องเป็นตัวเลขเท่านั้น'
		});
	}

	if (password.length < 6) {
		return res.status(400).json({
			success: false,
			message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
		});
	}

	// TODO: Save to database
	// For now, just store in memory
	users.set(studentId, {
		studentId,
		password, // TODO: Hash password in production
		email: null,
		firstName: 'นักศึกษา',
		lastName: 'ใหม่',
		createdAt: new Date()
	});

	console.log('Registration attempt:', { studentId, passwordLength: password.length });

	res.json({
		success: true,
		message: 'สมัครสมาชิกสำเร็จ!'
	});
});

// Login routes
app.get('/login', (req, res) => {
	res.render('auth/login');
});

app.post('/login', (req, res) => {
	const { studentId, password } = req.body;

	// Basic validation
	if (!studentId || !password) {
		return res.status(400).json({
			success: false,
			message: 'กรุณากรอกข้อมูลให้ครบถ้วน'
		});
	}

	// Check if user exists
	const user = users.get(studentId);
	
	if (!user) {
		return res.status(401).json({
			success: false,
			message: 'ไม่พบรหัสนักศึกษานี้ในระบบ'
		});
	}

	// Verify password (TODO: use bcrypt in production)
	if (user.password !== password) {
		return res.status(401).json({
			success: false,
			message: 'รหัสผ่านไม่ถูกต้อง'
		});
	}

	// TODO: Create session
	console.log('Login successful:', { studentId });

	res.json({
		success: true,
		message: 'เข้าสู่ระบบสำเร็จ',
		redirectTo: '/dashboard'
	});
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

// Dashboard routes (with mock authentication middleware)
// TODO: Implement proper session-based authentication
const requireAuth = (req, res, next) => {
	// Mock authentication - in production, check session/JWT
	// For now, use a mock user
	req.user = {
		studentId: '6414421001',
		firstName: 'สมชาย',
		lastName: 'ใจดี',
		email: 'student@nsru.ac.th',
		year: 3, // ชั้นปี
		avatar: null
	};
	next();
};

// Helper to render a dashboard view into the layout once
function renderIntoLayout(req, res, view, opts = {}) {
	res.render(`dashboard/${view}`, { user: req.user }, (err, html) => {
		if (err) {
			console.error('Error rendering view', view, err);
			return res.status(500).send('Error rendering page');
		}

		res.render('layouts/dashboard', {
			title: opts.title || 'Dashboard',
			currentPage: opts.currentPage || '',
			user: req.user,
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
app.get('/logout', (req, res) => {
	// TODO: Destroy session
	res.redirect('/login');
});

app.listen(port, () => {
	console.log(`Server running on http://localhost:${port}`);
});
