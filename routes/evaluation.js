const express = require('express');
const router = express.Router();
const { db, admin, storage } = require('../config/firebaseAdmin');
const multer = require('multer');
const path = require('path');

// ตั้งค่า multer สำหรับอัพโหลดไฟล์ (เก็บในหน่วยความจำเพื่อส่งต่อขึ้น Firebase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  },
  fileFilter: function (req, file, cb) {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('ไฟล์ต้องเป็น PDF, Word หรือ PowerPoint เท่านั้น'));
    }
  }
});

// Middleware: ต้องเข้าสู่ระบบ
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  next();
}

// Middleware: ต้องมี studentId (ไม่ใช่ pure admin)
function requireStudent(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  // Respect explicit role, otherwise infer from user_id prefix
  let role = req.session.user.role;
  if (!role) {
    const uid = req.session.user.user_id || req.session.user.id || req.session.user.studentId || '';
    const prefix = String(uid).charAt(0).toUpperCase();
    if (prefix === 'T') role = 'teacher';
    else if (prefix === 'A') role = 'admin';
    else role = 'student';
  }
  if (role !== 'student') {
    console.warn('[requireStudent] access denied, session.user=', req.session.user, 'inferredRole=', role);
    return res.status(403).json({ success: false, message: 'เฉพาะนักศึกษาเท่านั้น' });
  }
  next();
}

/**
 * GET /api/evaluation/my-data
 * ดึงข้อมูลการประเมินทั้งหมดของนักศึกษาในรอบที่เลือก
 */
router.get('/api/evaluation/my-data', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.user_id || req.session.user.studentId || req.session.user.id;
    const { observationId } = req.query;

      if (!observationId) {
        return res.status(400).json({ success: false, message: 'ต้องระบุ observationId' });
      }

    // ดึงข้อมูลการประเมินของนักศึกษาในรอบนี้
      const evaluationSnapshot = await db.collection('evaluations')
      .where('studentId', '==', studentId)
      .where('observationId', '==', observationId)
      .limit(1)
      .get();

    if (evaluationSnapshot.empty) {
      return res.json({
        success: true,
        hasData: false,
        data: null
      });
    }

    const evalDoc = evaluationSnapshot.docs[0];
    const evalData = evalDoc.data();

    res.json({
      success: true,
      hasData: true,
      data: {
        id: evalDoc.id,
        ...evalData
      }
    });

  } catch (error) {
    console.error('Error loading evaluation data:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/**
 * POST /api/evaluation/save-week
 * บันทึกข้อมูลการประเมินรายสัปดาห์
 */
router.post('/api/evaluation/save-week', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.user_id || req.session.user.studentId || req.session.user.id;
    const { observationId, week, evaluationNum, answers } = req.body;

    // Validation
    if (!observationId || !week || !evaluationNum || !answers) {
      return res.status(400).json({
        success: false,
        message: 'ข้อมูลไม่ครบถ้วน'
      });
    }

    if (week < 1 || week > 3) {
      return res.status(400).json({
        success: false,
        message: 'สัปดาห์ต้องอยู่ระหว่าง 1-3'
      });
    }

    if (evaluationNum < 1 || evaluationNum > 9) {
      return res.status(400).json({
        success: false,
        message: 'ครั้งที่ประเมินต้องอยู่ระหว่าง 1-9'
      });
    }

    // ตรวจสอบว่ามีข้อมูลการประเมินอยู่แล้วหรือยัง
    const evaluationSnapshot = await db.collection('evaluations')
      .where('studentId', '==', studentId)
      .where('observationId', '==', observationId)
      .limit(1)
      .get();

    const now = admin.firestore.FieldValue.serverTimestamp();

    if (evaluationSnapshot.empty) {
      // สร้างเอกสารใหม่
      const newEval = {
        studentId: studentId,
        observationId: observationId,
        year: req.session.user.year || 3,
        evaluations: {
          [evaluationNum]: {
            week: week,
            answers: answers,
            submitted: true,
            date: new Date().toISOString(),
            submittedAt: now
          }
        },
        weekStatus: {
          [week]: {
            count: 1,
            lastUpdated: now
          }
        },
        createdAt: now,
        lastUpdatedAt: now
      };

      await db.collection('evaluations').add(newEval);
    } else {
      // อัปเดตเอกสารที่มีอยู่
      const evalDocId = evaluationSnapshot.docs[0].id;
      const currentData = evaluationSnapshot.docs[0].data();
      
      const evaluations = currentData.evaluations || {};
      const weekStatus = currentData.weekStatus || {};

      // ตรวจสอบว่าครั้งนี้เคยส่งแล้วหรือยัง
      if (evaluations[evaluationNum] && evaluations[evaluationNum].submitted) {
        return res.status(400).json({
          success: false,
          message: 'คุณส่งแบบประเมินครั้งนี้ไปแล้ว ไม่สามารถแก้ไขได้'
        });
      }

      evaluations[evaluationNum] = {
        week: week,
        answers: answers,
        submitted: true,
        date: new Date().toISOString(),
        submittedAt: now
      };

      // อัปเดตสถานะสัปดาห์
      const currentWeekCount = weekStatus[week]?.count || 0;
      weekStatus[week] = {
        count: currentWeekCount + 1,
        lastUpdated: now
      };

      await db.collection('evaluations').doc(evalDocId).update({
        evaluations: evaluations,
        weekStatus: weekStatus,
        lastUpdatedAt: now
      });
    }

    res.json({
      success: true,
      message: 'บันทึกการประเมินสำเร็จ'
    });

  } catch (error) {
    console.error('Error saving evaluation:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/**
 * POST /api/evaluation/submit-lesson-plan
 * บันทึกการอัปโหลดแผนการจัดการเรียนรู้ (ปี 2-3)
 */
router.post('/api/evaluation/submit-lesson-plan', requireStudent, upload.single('lessonPlanFile'), async (req, res) => {
  try {
    const studentId = req.session.user.user_id || req.session.user.studentId || req.session.user.id;
    const userYear = req.session.user.year || 3;
    const { observationId } = req.body;

    // Validation: ต้องเป็นปี 2 หรือ 3
    if (userYear < 2 || userYear > 3) {
      return res.status(403).json({
        success: false,
        message: 'เฉพาะนักศึกษาปี 2-3 เท่านั้นที่ต้องส่งแผนการจัดการเรียนรู้'
      });
    }

    if (!observationId) {
      return res.status(400).json({
        success: false,
          message: 'ไม่พบข้อมูลการฝึกประสบการณ์วิชาชีพครู'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาเลือกไฟล์แผนการจัดการเรียนรู้'
      });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const submittedAtIso = new Date().toISOString();

    // ตรวจสอบว่ามีข้อมูลการประเมินอยู่แล้วหรือยัง
    const evaluationSnapshot = await db.collection('evaluations')
      .where('studentId', '==', studentId)
      .where('observationId', '==', observationId)
      .limit(1)
      .get();

    // ตรวจสอบว่าเคยส่งแผนการสอนแล้วหรือยัง
    if (!evaluationSnapshot.empty) {
      const currentData = evaluationSnapshot.docs[0].data();
      if (currentData.lessonPlan && currentData.lessonPlan.uploaded) {
        return res.status(400).json({
          success: false,
          message: 'คุณส่งแผนการจัดการเรียนรู้ไปแล้ว ไม่สามารถแก้ไขได้',
          alreadySubmitted: true
        });
      }
    }

    // อัปโหลดไฟล์ขึ้น Firebase Storage
    const bucket = storage.bucket();
    const ext = path.extname(req.file.originalname).toLowerCase();
    const timestamp = new Date();
    const stamp = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, '0')}${String(timestamp.getDate()).padStart(2, '0')}_${String(timestamp.getHours()).padStart(2, '0')}${String(timestamp.getMinutes()).padStart(2, '0')}${String(timestamp.getSeconds()).padStart(2, '0')}`;
    const objectName = `lesson_plans/แผนการจัดการเรียนการสอน_${studentId}_${stamp}${ext}`;

    const file = bucket.file(objectName);
    await new Promise((resolve, reject) => {
      const stream = file.createWriteStream({
        metadata: {
          contentType: req.file.mimetype,
          metadata: {
            studentId,
            observationId,
            uploadedAt: submittedAtIso
          }
        },
        resumable: false
      });

      stream.on('error', reject);
      stream.on('finish', resolve);
      stream.end(req.file.buffer);
    });

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/prac-cdte.firebasestorage.app/${objectName}`;

    const lessonPlanData = {
      uploaded: true,
      fileName: req.file.originalname,
      storagePath: objectName,
      fileUrl: publicUrl,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      submittedDate: submittedAtIso,
      uploadedAt: now
    };

    if (evaluationSnapshot.empty) {
      // สร้างเอกสารใหม่
      await db.collection('evaluations').add({
        studentId: studentId,
        observationId: observationId,
        year: userYear,
        lessonPlan: lessonPlanData,
        evaluations: {},
        weekStatus: {},
        createdAt: now,
        lastUpdatedAt: now
      });
    } else {
      // อัปเดตเอกสารที่มีอยู่
      const evalDocId = evaluationSnapshot.docs[0].id;
      await db.collection('evaluations').doc(evalDocId).update({
        lessonPlan: lessonPlanData,
        lastUpdatedAt: now
      });
    }

    // บันทึก log
    try {
      await db.collection('system_logs').add({
        level: 'info',
        category: 'lesson_plan_upload',
        message: `Lesson plan uploaded by ${studentId}`,
        userId: studentId,
        observationId,
        fileName: req.file.originalname,
        storagePath: objectName,
        fileUrl: publicUrl,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (logErr) {
      console.warn('Failed to log lesson plan upload', logErr);
    }

    res.json({
      success: true,
      message: 'บันทึกแผนการจัดการเรียนรู้สำเร็จ',
      data: {
        fileName: req.file.originalname,
        fileUrl: publicUrl,
        submittedDate: submittedAtIso,
        storagePath: objectName
      }
    });

  } catch (error) {
    console.error('Error submitting lesson plan:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด: ' + error.message });
  }
});

/**
 * POST /api/evaluation/submit-video
 * บันทึกลิงก์วิดีโอการสอน (เฉพาะปี 3)
 */
router.post('/api/evaluation/submit-video', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.user_id || req.session.user.studentId || req.session.user.id;
    const userYear = req.session.user.year || 3;
    const { observationId, videoUrl } = req.body;

    // Validation: ต้องเป็นปี 3 เท่านั้น
    if (userYear !== 3) {
      return res.status(403).json({
        success: false,
        message: 'เฉพาะนักศึกษาปี 3 เท่านั้นที่ต้องส่งคลิปวิดีโอการสอน'
      });
    }

    if (!observationId || !videoUrl) {
      return res.status(400).json({
        success: false,
        message: 'ข้อมูลไม่ครบถ้วน'
      });
    }

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+(&.*)?$/;
    if (!youtubeRegex.test(videoUrl)) {
      return res.status(400).json({
        success: false,
        message: 'ลิงก์ YouTube ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง'
      });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();

    // ตรวจสอบว่ามีข้อมูลการประเมินอยู่แล้วหรือยัง
    const evaluationSnapshot = await db.collection('evaluations')
      .where('studentId', '==', studentId)
      .where('observationId', '==', observationId)
      .limit(1)
      .get();

    const videoData = {
      url: videoUrl,
      submitted: true,
      submittedAt: now
    };

    if (evaluationSnapshot.empty) {
      // สร้างเอกสารใหม่
      await db.collection('evaluations').add({
        studentId: studentId,
        observationId: observationId,
        year: userYear,
        videoLink: videoData,
        evaluations: {},
        weekStatus: {},
        createdAt: now,
        lastUpdatedAt: now
      });
    } else {
      // อัปเดตเอกสารที่มีอยู่
      const evalDocId = evaluationSnapshot.docs[0].id;
      const currentData = evaluationSnapshot.docs[0].data();

      // ตรวจสอบว่าเคยส่งวิดีโอแล้วหรือยัง
      if (currentData.videoLink && currentData.videoLink.submitted) {
        return res.status(400).json({
          success: false,
          message: 'คุณส่งลิงก์วิดีโอไปแล้ว ไม่สามารถแก้ไขได้'
        });
      }

      await db.collection('evaluations').doc(evalDocId).update({
        videoLink: videoData,
        lastUpdatedAt: now
      });
    }

    res.json({
      success: true,
      message: 'บันทึกลิงก์วิดีโอสำเร็จ'
    });

  } catch (error) {
    console.error('Error submitting video:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาด' });
  }
});

/**
 * POST /api/evaluation/validate-video-url
 * ตรวจสอบความถูกต้องของ YouTube URL
 */
router.post('/api/evaluation/validate-video-url', requireStudent, async (req, res) => {
  try {
    const { videoUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        success: false,
        message: 'กรุณาระบุ URL'
      });
    }

    // Validate YouTube URL format
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+(&.*)?$/;
    
    if (!youtubeRegex.test(videoUrl)) {
      return res.json({
        success: false,
        valid: false,
        message: 'ลิงก์ YouTube ไม่ถูกต้อง กรุณาใช้รูปแบบ:\n• https://www.youtube.com/watch?v=xxxxx\n• https://youtu.be/xxxxx'
      });
    }

    // Extract video ID
    let videoId = null;
    if (videoUrl.includes('youtube.com')) {
      const urlParams = new URL(videoUrl).searchParams;
      videoId = urlParams.get('v');
    } else if (videoUrl.includes('youtu.be')) {
      videoId = videoUrl.split('/').pop().split('?')[0];
    }

    if (!videoId) {
      return res.json({
        success: false,
        valid: false,
        message: 'ไม่สามารถระบุ Video ID ได้'
      });
    }

    res.json({
      success: true,
      valid: true,
      videoId: videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      message: 'ลิงก์ถูกต้อง! พร้อมส่งได้เลย'
    });

  } catch (error) {
    console.error('Error validating video URL:', error);
    res.json({
      success: false,
      valid: false,
      message: 'ไม่สามารถตรวจสอบลิงก์ได้ กรุณาลองใหม่'
    });
  }
});

/**
 * GET /api/evaluation/lesson-plan-stats
 * ดึงสถิติแผนการสอนของนักศึกษา
 */
router.get('/api/evaluation/lesson-plan-stats', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.user_id || req.session.user.studentId || req.session.user.id;
    const userYear = req.session.user.year || 3;

    // ดึงข้อมูลทุกรอบการสังเกตของนักศึกษา
    const evaluationsSnapshot = await db.collection('evaluations')
      .where('studentId', '==', studentId)
      .get();

    if (evaluationsSnapshot.empty) {
      return res.json({
        success: true,
        needLessonPlan: userYear >= 2 && userYear <= 3,
        stats: {
          total: 0,
          submitted: 0,
          pending: 0,
          byObservation: []
        }
      });
    }

    let total = 0;
    let submitted = 0;
    const byObservation = [];

    // วนลูปดึงข้อมูลแต่ละรอบ
    for (const doc of evaluationsSnapshot.docs) {
      const data = doc.data();
      
      // ดึงข้อมูล observation
      const observationId = data.observationId;
      let observationName = 'ไม่ระบุชื่อ';
      
      try {
        const obsSnapshot = await db.collection('observations')
          .where('id', '==', observationId)
          .limit(1)
          .get();
        
        if (!obsSnapshot.empty) {
          observationName = obsSnapshot.docs[0].data().name || observationName;
        }
      } catch (error) {
        console.error('Error fetching observation:', error);
      }

      total++;

      const lessonPlan = data.lessonPlan || {};
      const hasSubmitted = lessonPlan.uploaded === true;
      
      if (hasSubmitted) {
        submitted++;
      }

      byObservation.push({
        observationId: observationId,
        observationName: observationName,
        year: data.year || userYear,
        submitted: hasSubmitted,
        fileName: lessonPlan.fileName || null,
        fileUrl: lessonPlan.fileUrl || null,
        submittedDate: lessonPlan.submittedDate || null,
        uploadedAt: lessonPlan.uploadedAt || null
      });
    }

    res.json({
      success: true,
      needLessonPlan: userYear >= 2 && userYear <= 3,
      stats: {
        total: total,
        submitted: submitted,
        pending: total - submitted,
        submissionRate: total > 0 ? Math.round((submitted / total) * 100) : 0,
        byObservation: byObservation.sort((a, b) => {
          // เรียงตามวันที่ส่ง (ล่าสุดก่อน)
          if (a.submittedDate && b.submittedDate) {
            return new Date(b.submittedDate) - new Date(a.submittedDate);
          }
          return a.submitted ? -1 : 1;
        })
      }
    });

  } catch (error) {
    console.error('Error fetching lesson plan stats:', error);
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาด: ' + error.message 
    });
  }
});

/**
 * GET /api/student/evaluation-summary
 * ดึงข้อมูลสรุปการประเมินทั้งหมดของนักศึกษาสำหรับทำกราฟ
 */
router.get('/api/student/evaluation-summary', requireStudent, async (req, res) => {
  try {
    const studentId = req.session.user.user_id || req.session.user.studentId || req.session.user.id;
    const { observationId } = req.query;

    let evaluationsSnapshot;
    
    if (observationId) {
      // ดึงข้อมูลเฉพาะรอบที่เลือก
      evaluationsSnapshot = await db.collection('evaluations')
        .where('studentId', '==', studentId)
        .where('observationId', '==', observationId)
        .get();
    } else {
      // ดึงข้อมูลทุกรอบ
      evaluationsSnapshot = await db.collection('evaluations')
        .where('studentId', '==', studentId)
        .get();
    }

    if (evaluationsSnapshot.empty) {
      return res.json({
        success: true,
        hasData: false,
        summary: {
          totalEvaluations: 0,
          completedEvaluations: 0,
          averageScore: 0,
          evaluationsByTopic: [],
          scoreDistribution: { excellent: 0, good: 0, fair: 0, needsImprovement: 0 },
          weeklyProgress: { week1: 0, week2: 0, week3: 0 },
          observationSummary: []
        }
      });
    }

    // ประมวลผลข้อมูล
    let totalScore = 0;
    let totalCount = 0;
    const evaluationsByTopic = [];
    const scoreDistribution = { excellent: 0, good: 0, fair: 0, needsImprovement: 0 };
    const weeklyProgress = { week1: 0, week2: 0, week3: 0 };
    const observationSummary = [];

    /**
     * หัวข้อการประเมิน: แผนที่สำหรับแปลงเลขลำดับเป็นชื่อหัวข้อที่แสดงผล
     * ใช้ลำดับตามที่นักศึกษาทำการประเมินจริง (ไม่ใช่หมายเลขเดิมในระบบ)
     */
    const evaluationTopics = {
      1: 'การประเมินครั้งที่ 1',
      2: 'การประเมินครั้งที่ 2',
      3: 'การประเมินครั้งที่ 3',
      4: 'การประเมินครั้งที่ 4',
      5: 'การประเมินครั้งที่ 5',
      6: 'การประเมินครั้งที่ 6',
      7: 'การประเมินครั้งที่ 7',
      8: 'การประเมินครั้งที่ 8',
      9: 'การประเมินครั้งที่ 9'
    };

    for (const doc of evaluationsSnapshot.docs) {
      const data = doc.data();
      const evaluations = data.evaluations || {};
      const observationId = data.observationId;
      
      // ดึงข้อมูล observation name
      let observationName = 'ไม่ระบุชื่อ';
      try {
        const obsSnapshot = await db.collection('observations')
          .where('id', '==', observationId)
          .limit(1)
          .get();
        if (!obsSnapshot.empty) {
          observationName = obsSnapshot.docs[0].data().name || observationName;
        }
      } catch (error) {
        console.error('Error fetching observation name:', error);
      }

      let obsTotal = 0;
      let obsCount = 0;
      const obsWeekly = { week1: 0, week2: 0, week3: 0 };

      /**
       * ขั้นตอน 1: ดึงและจัดเรียงข้อมูลการประเมิน
       * - กรองเฉพาะการประเมินที่ส่งแล้ว (submitted = true)
       * - เรียงลำดับตามหมายเลขการประเมิน (1, 4, 7 → จะแสดงเป็น 1, 2, 3)
       */
      const submittedEvaluations = Object.keys(evaluations)
        .filter(key => evaluations[key] && evaluations[key].submitted && evaluations[key].answers)
        .map(key => ({ key: parseInt(key), data: evaluations[key] }))
        .sort((a, b) => a.key - b.key);

      /**
       * ขั้นตอน 2: ประมวลผลแต่ละการประเมิน
       * - คำนวณคะแนนเฉลี่ยจากคำถามทั้งหมด
       * - สร้างลำดับใหม่ให้ต่อเนื่อง (sequential numbering)
       */
      submittedEvaluations.forEach((evalItem, index) => {
        const evalData = evalItem.data;
        const originalNumber = evalItem.key;
        const sequentialNumber = index + 1; // เรียงลำดับใหม่เป็น 1, 2, 3...
        
        const answers = evalData.answers;
        let evalScore = 0;
        let answerCount = 0;

        /**
         * คำนวณคะแนนเฉลี่ยของการประเมินครั้งนี้
         * - ดึงคำตอบจากทุกคำถาม (q1, q2, ..., q26)
         * - แปลง string เป็น number (Firebase เก็บเป็น string)
         * - ตรวจสอบความถูกต้องของคะแนน (1-5 เท่านั้น)
         */
        Object.keys(answers).forEach(questionKey => {
          const answer = answers[questionKey];
          // แปลง string เป็น number สำหรับการคำนวณ
          const numericAnswer = typeof answer === 'string' ? parseInt(answer) : answer;
          
          // ตรวจสอบว่าคะแนนอยู่ในช่วงที่ถูกต้อง (1-5)
          if (typeof numericAnswer === 'number' && numericAnswer >= 1 && numericAnswer <= 5) {
            evalScore += numericAnswer;
            answerCount++;
          }
        });

        if (answerCount > 0) {
          const avgScore = evalScore / answerCount;
          
          // เก็บข้อมูลตามหัวข้อ (ใช้เลขลำดับใหม่)
          const topicName = evaluationTopics[sequentialNumber] || `การประเมินครั้งที่ ${sequentialNumber}`;
          evaluationsByTopic.push({
            topic: topicName,
            topicNumber: sequentialNumber,
            originalNumber: originalNumber, // เก็บเลขเดิมไว้อ้างอิง
            score: parseFloat(avgScore.toFixed(2)),
            week: evalData.week || 1,
            observationName: observationName,
            submittedAt: evalData.submittedAt || evalData.date,
            totalQuestions: answerCount
          });

          // รวมคะแนนทั้งหมด
          totalScore += avgScore;
          totalCount++;
          obsTotal += avgScore;
          obsCount++;

          // แบ่งตามระดับคะแนน
          if (avgScore >= 4.5) {
            scoreDistribution.excellent++;
          } else if (avgScore >= 3.5) {
            scoreDistribution.good++;
          } else if (avgScore >= 2.5) {
            scoreDistribution.fair++;
          } else {
            scoreDistribution.needsImprovement++;
          }

          // นับตามสัปดาห์
          const week = evalData.week || 1;
          if (week === 1) obsWeekly.week1++;
          else if (week === 2) obsWeekly.week2++;
          else if (week === 3) obsWeekly.week3++;
        }
      });

      // สรุปตาม observation
      observationSummary.push({
        observationId: observationId,
        observationName: observationName,
        totalEvaluations: obsCount,
        averageScore: obsCount > 0 ? parseFloat((obsTotal / obsCount).toFixed(2)) : 0,
        weeklyProgress: obsWeekly,
        year: data.year || 3
      });

      // รวม weekly progress
      weeklyProgress.week1 += obsWeekly.week1;
      weeklyProgress.week2 += obsWeekly.week2;
      weeklyProgress.week3 += obsWeekly.week3;
    }

    const averageScore = totalCount > 0 ? parseFloat((totalScore / totalCount).toFixed(2)) : 0;

    res.json({
      success: true,
      hasData: totalCount > 0,
      summary: {
        totalEvaluations: 9, // จำนวนหัวข้อการประเมินทั้งหมด
        completedEvaluations: totalCount,
        averageScore: averageScore,
        evaluationsByTopic: evaluationsByTopic.sort((a, b) => a.topicNumber - b.topicNumber),
        scoreDistribution: scoreDistribution,
        weeklyProgress: weeklyProgress,
        observationSummary: observationSummary,
        gradeText: getGradeFromScore(averageScore),
        completionRate: Math.round((totalCount / 9) * 100), // เปอร์เซ็นต์ความสมบูรณ์
        highestScore: totalCount > 0 ? Math.max(...evaluationsByTopic.map(e => e.score)) : 0,
        lowestScore: totalCount > 0 ? Math.min(...evaluationsByTopic.map(e => e.score)) : 0
      }
    });

  } catch (error) {
    console.error('Error fetching evaluation summary:', error);
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาด: ' + error.message 
    });
  }
});

/**
 * Helper Function: แปลงคะแนนตัวเลขเป็นข้อความเกรด
 * @param {number} score - คะแนนในช่วง 1-5
 * @returns {string} - ข้อความเกรดภาษาไทย
 */
function getGradeFromScore(score) {
  // ตรวจสอบคะแนนและคืนค่าเกรดที่เหมาะสม
  if (score >= 4.5) return 'ดีเยี่ยม';    // คะแนน 4.5-5.0
  if (score >= 3.5) return 'ดี';         // คะแนน 3.5-4.49
  if (score >= 2.5) return 'พอใช้';      // คะแนน 2.5-3.49
  if (score >= 1.5) return 'ปรับปรุง';   // คะแนน 1.5-2.49
  return 'ต้องปรับปรุงมาก';              // คะแนน 1.0-1.49
}

module.exports = router;
