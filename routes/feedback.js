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

module.exports = router;
