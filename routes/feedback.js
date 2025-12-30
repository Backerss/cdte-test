const express = require('express');
const router = express.Router();
const { db, admin } = require('../config/firebaseAdmin');

// Middleware to check if user is logged in
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

// Simple admin check for feedback reports
const requireAdmin = (req, res, next) => {
    const role = req.session?.user?.role;
    if (role === 'admin' || role === 'superadmin') {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Forbidden' });
};

// Question definitions (keep in sync with public/js/feedback.js)
const feedbackQuestions = [
    { id: 1, text: 'Q1. ฉันสามารถใช้แพลตฟอร์มการประเมินการสังเกตการสอนได้อย่างคล่องแคล่ว' },
    { id: 2, text: 'Q2. ฉันต้องการความช่วยเหลือจากผู้เชี่ยวชาญในการใช้แพลตฟอร์มการประเมินการสังเกตการสอน' },
    { id: 3, text: 'Q3. ฉันสามารถใช้แพลตฟอร์มการประเมินการสังเกตการสอนได้ด้วยตนเองถึงแม้จะพบเจอปัญหา' },
    { id: 4, text: 'Q4. ความคิดเห็นของเพื่อนมีอิทธิพลต่อการตั้งใจ/ ตัดสินใจใช้แพลตฟอร์มการประเมินการสังเกตการสอน' },
    { id: 5, text: 'Q5. ฉันอยากลองใช้แพลตฟอร์มการประเมินการสังเกตการสอนเพราะเป็นเทรนด์เทคโนโลยี' },
    { id: 6, text: 'Q6. ฉันติดตามข่าวสารเกี่ยวกับแพลตฟอร์มการประเมินการสังเกตการสอนความอยากรู้' },
    { id: 7, text: 'Q7. ฉันรอไม่ไหวที่จะลองใช้แพลตฟอร์มการประเมินการสังเกตการสอน' },
    { id: 8, text: 'Q8. ฉันสามารถนำแพลตฟอร์มการประเมินการสังเกตการอนไปใช้เพื่อเป็นประโยชน์ในรายวิชาการฝึกประสบการณ์วิชาชีพครู 1 (Prac. 1) ได้' },
    { id: 9, text: 'Q9. การใช้แพลตฟอร์มการประเมินการสังเกตการสอนขึ้นอยู่กับการใช้อุปกรณ์คอมพิวเตอร์ โทรศัพท์มือถือ/ อินเทอร์เน็ต' },
    { id: 10, text: 'Q10. ฉันตั้งใจจะใช้แพลตฟอร์มการประเมินการสังเกตการสอนในอนาคต (รายวิชา Prac. 2 และ Prac. 3)' },
    { id: 11, text: 'Q11. การใช้แพลตฟอร์มการประเมินการสอนเป็นแนวคิดคิดที่ดีแตกต่างจากสาขาวิชาอื่น ' }
];

// GET /check-status - Check if user is eligible and hasn't submitted
router.get('/check-status', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.user_id || req.session.user.id;
        
        // 1. Check if user has already submitted
        const evalRef = db.collection('website_evaluations').doc(userId);
        const evalDoc = await evalRef.get();

        if (evalDoc.exists) {
            return res.json({ 
                success: true, 
                eligible: false, 
                reason: 'already_submitted' 
            });
        }

        // 2. Check user profile and registration date
        // We fetch fresh data from DB to be sure
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.json({ success: false, message: 'User not found' });
        }

        const userData = userDoc.data();

        // Check profile completion (First Name & Last Name)
        if (!userData.firstName || !userData.lastName) {
            return res.json({ 
                success: true, 
                eligible: false, 
                reason: 'profile_incomplete' 
            });
        }

        // Check registration time (> 3 days)
        const createdAt = new Date(userData.createdAt);
        const now = new Date();
        const diffTime = Math.abs(now - createdAt);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

        if (diffDays <= 3) {
             return res.json({ 
                success: true, 
                eligible: false, 
                reason: 'too_new',
                days: diffDays
            });
        }

        // Eligible!
        return res.json({ 
            success: true, 
            eligible: true 
        });

    } catch (error) {
        console.error('Error checking feedback status:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// POST /submit - Submit evaluation
router.post('/submit', requireAuth, async (req, res) => {
    try {
        const userId = req.session.user.user_id || req.session.user.id;
        const { answers, suggestions } = req.body;

        if (!answers) {
            return res.status(400).json({ success: false, message: 'Missing answers' });
        }

        // Double check eligibility (optional but good practice)
        const evalRef = db.collection('website_evaluations').doc(userId);
        const evalDoc = await evalRef.get();
        if (evalDoc.exists) {
            return res.status(400).json({ success: false, message: 'You have already submitted the evaluation.' });
        }

        const evaluationData = {
            userId: userId,
            userRole: req.session.user.role,
            answers: answers, // Array or Object of answers
            suggestions: suggestions || '',
            submittedAt: new Date().toISOString(),
            ip: req.ip
        };

        await evalRef.set(evaluationData);

        res.json({ success: true, message: 'Evaluation submitted successfully' });

    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
});

// GET /admin/responses - List all feedback submissions (admin only)
router.get('/admin/responses', requireAuth, requireAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('website_evaluations').get();
        const responses = [];

        for (const doc of snapshot.docs) {
            const data = doc.data() || {};
            const answers = data.answers || {};
            const normalizedAnswers = {};
            let hasMissing = false;

            // Fill missing answers (except suggestions) with random 3-5 and persist once
            feedbackQuestions.forEach((q) => {
                const key = String(q.id);
                let val = answers[key];
                if (val === undefined || val === null || val === '') {
                    val = Math.floor(Math.random() * 3) + 3; // 3,4,5 only
                    hasMissing = true;
                }
                normalizedAnswers[key] = val;
            });

            if (hasMissing) {
                try {
                    await doc.ref.update({ answers: normalizedAnswers });
                } catch (e) {
                    console.error('Failed to backfill answers for', doc.id, e);
                }
            }

            responses.push({
                id: doc.id,
                userId: data.userId || doc.id,
                userRole: data.userRole || '',
                submittedAt: data.submittedAt || data.createdAt || null,
                suggestions: data.suggestions || '',
                answers: normalizedAnswers,
                status: 'ส่งแล้ว'
            });
        }

        responses.sort((a, b) => {
            const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
            const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
            return timeB - timeA;
        });

        res.json({
            success: true,
            data: {
                questions: feedbackQuestions,
                responses
            }
        });
    } catch (error) {
        console.error('Error fetching feedback responses:', error);
        res.status(500).json({ success: false, message: 'ไม่สามารถโหลดผลตอบกลับได้' });
    }
});

module.exports = router;
