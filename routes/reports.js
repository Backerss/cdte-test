/**
 * routes/reports.js
 * API สำหรับรายงานผลการประเมิน
 * - สรุปผลการประเมินแบบรวมและแยกตามรอบ/ชั้นปี
 * - วิเคราะห์ข้อมูลเชิงลึก
 */

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebaseAdmin');

// Middleware: ตรวจสอบการเข้าสู่ระบบ
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  next();
}

// Middleware: ตรวจสอบว่าเป็น admin หรือ teacher
function requireAdminOrTeacher(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
  }
  if (req.session.user.role !== 'admin' && req.session.user.role !== 'teacher') {
    return res.status(403).json({ success: false, message: 'ไม่มีสิทธิ์เข้าถึง' });
  }
  next();
}

// GET /api/reports/observations
// Lightweight list for dropdowns (ไม่ดึง evaluations ทำให้โหลดเร็ว)
router.get('/api/reports/observations', requireAdminOrTeacher, async (_req, res) => {
  try {
    const snapshot = await db.collection('observations')
      .orderBy('createdAt', 'desc')
      .get();

    const observations = snapshot.docs.map(doc => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        name: data.name || 'ไม่ระบุชื่อ',
        academicYear: data.academicYear || '',
        yearLevel: data.yearLevel || '',
        status: data.status || '',
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null
      };
    });

    res.json({ success: true, data: observations });
  } catch (error) {
    console.error('Error loading observations list:', error);
    res.status(500).json({ success: false, message: 'โหลดรายการรอบการสังเกตไม่สำเร็จ', error: error.message });
  }
});

function normalizeObservationId(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val.id === 'string') return val.id.trim();
  if (val.path) return String(val.path.split('/').pop() || '').trim();
  return String(val).trim();
}

function normalizeStudentId(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val.id === 'string') return val.id.trim();
  if (val.path) return String(val.path.split('/').pop() || '').trim();
  return String(val).trim();
}

/**
 * GET /api/reports/evaluation-summary
 * ดึงข้อมูลสรุปผลการประเมินพร้อมตัวเลือกกรอง
 * Query params: observationId, yearLevel, studentId
 */
router.get('/api/reports/evaluation-summary', requireAdminOrTeacher, async (req, res) => {
  try {
    const { observationId, yearLevel, studentId, evaluationNum } = req.query;
    const observationFilter = (() => {
      const norm = normalizeObservationId(observationId);
      if (!norm || norm === '__all__') return null;
      return norm;
    })();

    async function loadObservationStudentIds(obsId) {
      const set = new Set();
      const obsRef = db.collection('observations').doc(obsId);
      const queries = [
        db.collection('observation_students').where('observationId', '==', obsId),
        db.collection('observation_students').where('observationId', '==', obsRef),
        db.collection('observation_students').where('observation_id', '==', obsId),
        db.collection('observation_students').where('observation_id', '==', obsRef)
      ];
      for (const q of queries) {
        try {
          const snap = await q.get();
          snap.docs.forEach(d => {
            const data = d.data() || {};
            const sid = normalizeStudentId(data.studentId || data.student_id || data.userId || data.user_id);
            if (sid) set.add(sid);
          });
        } catch (_) {
          // ignore individual query errors
        }
      }
      return set;
    }

    // Optional: filter/aggregate by a specific evaluation attempt (1..9)
    const evaluationNumInt = evaluationNum !== undefined && evaluationNum !== null && String(evaluationNum).trim() !== ''
      ? parseInt(String(evaluationNum), 10)
      : null;

    if (evaluationNumInt !== null && (!Number.isFinite(evaluationNumInt) || evaluationNumInt < 1 || evaluationNumInt > 9)) {
      return res.status(400).json({
        success: false,
        message: 'ค่า evaluationNum ต้องอยู่ระหว่าง 1 ถึง 9'
      });
    }

    // Report groups based on the actual evaluation form (q1-q26)
    const categoriesLabel = {
      teacherVerbal: 'ครู - พฤติกรรมด้านภาษา (Verbal Behaviors)',
      teacherNonVerbal: 'ครู - พฤติกรรมที่ไม่ใช่ภาษา (Non-Verbal Behavior)',
      studentAcademic: 'นักเรียน - พฤติกรรมทางวิชาการของผู้เรียน',
      studentWork: 'นักเรียน - พฤติกรรมการทำงานของผู้เรียน',
      environment: 'สิ่งแวดล้อมทางการเรียนรู้ - สภาพทางกายภาพของห้องเรียน'
    };

    const groupQuestions = {
      teacherVerbal: ['q1', 'q2', 'q3', 'q4'],
      teacherNonVerbal: ['q5', 'q6', 'q7', 'q8', 'q9'],
      studentAcademic: ['q10', 'q11', 'q12', 'q13', 'q14', 'q15'],
      studentWork: ['q16', 'q17', 'q18'],
      environment: ['q19', 'q20', 'q21', 'q22', 'q23', 'q24', 'q25', 'q26']
    };

    async function resolveStudentProfile(sid) {
      if (!sid) return null;

      // 1) docId lookup (common pattern)
      try {
        const docSnap = await db.collection('users').doc(String(sid)).get();
        if (docSnap.exists) {
          const u = docSnap.data() || {};
          return {
            id: sid,
            firstName: u.firstName || u.firstname || '',
            lastName: u.lastName || u.lastname || '',
            yearLevel: u.yearLevel || u.year || null,
            email: u.email || ''
          };
        }
      } catch (e) {
        // ignore and fallback to queries
      }

      // 2) field lookups
      let userSnapshot = await db.collection('users').where('user_id', '==', sid).limit(1).get();
      if (userSnapshot.empty) {
        userSnapshot = await db.collection('users').where('studentId', '==', sid).limit(1).get();
      }
      if (userSnapshot.empty) {
        userSnapshot = await db.collection('users').where('student_id', '==', sid).limit(1).get();
      }

      if (!userSnapshot.empty) {
        const u = userSnapshot.docs[0].data() || {};
        return {
          id: sid,
          firstName: u.firstName || u.firstname || '',
          lastName: u.lastName || u.lastname || '',
          yearLevel: u.yearLevel || u.year || null,
          email: u.email || ''
        };
      }

      return {
        id: sid,
        firstName: '',
        lastName: '',
        yearLevel: null,
        email: ''
      };
    }

    // 1. ดึงรายการ observations ทั้งหมด (สำหรับ filter dropdown)
    const observationsSnapshot = await db.collection('observations')
      .orderBy('createdAt', 'desc')
      .get();
    
    const observations = [];
    observationsSnapshot.forEach(doc => {
      const data = doc.data();
      observations.push({
        id: doc.id,
        name: data.name,
        academicYear: data.academicYear,
        yearLevel: data.yearLevel,
        status: data.status
      });
    });

    // 2. ดึง studentIds จาก observation_students (ถ้ามี observationFilter)
    let allowedStudentIds = null;
    if (observationFilter) {
      allowedStudentIds = await loadObservationStudentIds(observationFilter);
    }

    // 3. สร้าง query สำหรับ evaluations ตาม filters (รองรับทั้ง string และ DocumentReference)
    let evaluationDocs = [];

    if (observationFilter) {
      const obsRef = db.collection('observations').doc(observationFilter);
      const queries = [
        db.collection('evaluations').where('observationId', '==', observationFilter),
        db.collection('evaluations').where('observationId', '==', obsRef),
        db.collection('evaluations').where('observation_id', '==', observationFilter),
        db.collection('evaluations').where('observation_id', '==', obsRef)
      ];

      const docMap = new Map();
      for (const q of queries) {
        try {
          const snap = await q.get();
          snap.docs.forEach(d => docMap.set(d.id, d));
        } catch (e) {
          // ignore per query
        }
      }
      evaluationDocs = Array.from(docMap.values());
    } else {
      const snap = await db.collection('evaluations').get();
      evaluationDocs = snap.docs;
    }
    
    // 3. ดึงข้อมูลนักศึกษาและจัดกลุ่มการประเมิน
    // NOTE: ในระบบนี้ 1 เอกสาร evaluations ต่อ 1 นักศึกษา/1 รอบ และมี evaluations[n].answers (q1-q26)
    const studentMap = new Map(); // studentId -> student data
    const evaluationsByStudent = new Map(); // studentId -> evaluation docs[]
    
    for (const evalDoc of evaluationDocs) {
      const evalData = evalDoc.data();
      const evalObsId = normalizeObservationId(evalData.observationId || evalData.observation_id || null);

      // Manual filter สำหรับข้อมูลเก่าหรือประเภท reference
      if (observationFilter && evalObsId !== observationFilter) {
        continue;
      }
      const sidRaw = evalData.studentId || evalData.student_id || '';
      const sid = normalizeStudentId(sidRaw);

      // หากมีรายการ studentIds จาก observation_students ให้กรองตามนั้นด้วย
      if (observationFilter && allowedStudentIds && allowedStudentIds.size > 0 && !allowedStudentIds.has(sid)) {
        continue;
      }
      
      if (!sid) continue;
      
      // เก็บการประเมิน
      if (!evaluationsByStudent.has(sid)) {
        evaluationsByStudent.set(sid, []);
      }
      evaluationsByStudent.get(sid).push({
        id: evalDoc.id,
        ...evalData,
        createdAt: evalData.createdAt?.toDate?.() || null
      });
      
      // ดึงข้อมูลนักศึกษา (ถ้ายังไม่มี)
      if (!studentMap.has(sid)) {
        const profile = await resolveStudentProfile(sid);
        // fallback year from evaluation doc
        const yearFromEval = evalData.year || evalData.yearLevel || null;
        studentMap.set(sid, {
          id: sid,
          firstName: profile?.firstName || '',
          lastName: profile?.lastName || '',
          yearLevel: profile?.yearLevel || yearFromEval || null,
          email: profile?.email || ''
        });
      }
    }

    // 4. กรองตาม yearLevel และ studentId (ถ้ามี)
    const students = [];
    
    for (const [sid, student] of studentMap.entries()) {
      // กรองตาม yearLevel
      if (yearLevel && student.yearLevel?.toString() !== yearLevel) {
        continue;
      }
      
      // กรองตาม studentId
      if (studentId && sid !== studentId) {
        continue;
      }
      
      const evalDocs = evaluationsByStudent.get(sid) || [];

      // Aggregate from nested evaluations[n].answers (q1-q26)
      const evaluationData = {};
      const groupSums = {};
      const groupCounts = {};
      Object.keys(categoriesLabel).forEach(key => {
        evaluationData[key] = 0;
        groupSums[key] = 0;
        groupCounts[key] = 0;
      });

      let submittedEvalCountTotal = 0;
      let submittedEvalCountIncluded = 0;

      for (const docItem of evalDocs) {
        const evRoot = docItem || {};
        const nested = evRoot.evaluations || {};

        // Count total submitted attempts across all nested entries
        Object.values(nested).forEach(entry => {
          if (entry && entry.submitted) submittedEvalCountTotal += 1;
        });

        // Aggregate either all attempts, or a selected attempt only
        const includedEntries = (() => {
          if (evaluationNumInt === null) return Object.values(nested);
          const selected = nested[String(evaluationNumInt)] || nested[evaluationNumInt];
          return selected ? [selected] : [];
        })();

        includedEntries.forEach(entry => {
          if (!entry || !entry.submitted) return;
          submittedEvalCountIncluded += 1;
          const answers = entry.answers || {};

          Object.keys(groupQuestions).forEach(groupKey => {
            const qList = groupQuestions[groupKey] || [];
            qList.forEach(q => {
              const raw = answers[q];
              const num = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
              if (!Number.isFinite(num)) return;
              groupSums[groupKey] += num;
              groupCounts[groupKey] += 1;
            });
          });
        });
      }

      Object.keys(categoriesLabel).forEach(key => {
        evaluationData[key] = groupCounts[key] > 0 ? groupSums[key] / groupCounts[key] : 0;
      });

      students.push({
        id: sid,
        firstName: student.firstName,
        lastName: student.lastName,
        year: student.yearLevel !== null && student.yearLevel !== undefined && student.yearLevel !== ''
          ? Number(student.yearLevel)
          : null,
        evaluationData,
        // evaluationCount: number of submitted attempts INCLUDED in this report
        // - when evaluationNumInt is set: 0/1 per student (per doc)
        // - when not set: total submitted attempts
        evaluationCount: submittedEvalCountIncluded,
        // evaluationCountTotal: total submitted attempts across all 1..9 attempts
        evaluationCountTotal: submittedEvalCountTotal
      });
    }

    // 5. คำนวณค่าเฉลี่ยแต่ละหมวดหมู่ (ทั้งหมด)
    const categoryAverages = {};
    Object.keys(categoriesLabel).forEach(key => {
      const validScores = students
        .map(s => s.evaluationData[key])
        .filter(score => score > 0);
      
      if (validScores.length > 0) {
        const total = validScores.reduce((sum, val) => sum + val, 0);
        categoryAverages[key] = (total / validScores.length).toFixed(2);
      } else {
        categoryAverages[key] = '0.00';
      }
    });

    // 6. คำนวณค่าเฉลี่ยรวม
    const validAverages = Object.values(categoryAverages)
      .map(v => parseFloat(v))
      .filter(v => v > 0);
    
    const grandAverage = validAverages.length > 0
      ? (validAverages.reduce((sum, val) => sum + val, 0) / validAverages.length).toFixed(2)
      : '0.00';

    // 7. คำนวณสถิติเพิ่มเติม
    const allScores = students.flatMap(s => Object.values(s.evaluationData).filter(v => v > 0));
    const totalSubmittedEvaluations = students.reduce((sum, s) => sum + (s.evaluationCount || 0), 0);
    const stats = {
      totalStudents: students.length,
      totalEvaluations: totalSubmittedEvaluations,
      grandAverage,
      minScore: allScores.length > 0 ? Math.min(...allScores).toFixed(2) : '0.00',
      maxScore: allScores.length > 0 ? Math.max(...allScores).toFixed(2) : '0.00',
      excellentCount: allScores.filter(s => s >= 4.5).length,
      needImprovementCount: allScores.filter(s => s < 3.5).length
    };

    // 8. การกระจายตามชั้นปี
    const yearDistribution = {};
    for (let year = 1; year <= 4; year++) {
      yearDistribution[year] = students.filter(s => s.year === year).length;
    }

    res.json({
      success: true,
      data: {
        observations,
        students,
        categoriesLabel,
        categoryAverages,
        grandAverage,
        stats,
        yearDistribution,
        filters: {
          observationId: observationFilter || null,
          yearLevel: yearLevel || null,
          studentId: studentId || null,
          evaluationNum: evaluationNumInt
        }
      }
    });

  } catch (error) {
    console.error('Error loading evaluation summary:', error);
    res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในการโหลดข้อมูล',
      error: error.message
    });
  }
});

/**
 * GET /api/reports/student-evaluation-detail
 * รายงานการประเมินรายบุคคล (รายละเอียดระดับคำถาม)
 * Query params: studentId (required), observationId (optional), evaluationNum (optional 1..9)
 */
router.get('/api/reports/student-evaluation-detail', requireAdminOrTeacher, async (req, res) => {
  try {
    const { studentId, observationId, evaluationNum } = req.query;

    if (!studentId || String(studentId).trim() === '') {
      return res.status(400).json({ success: false, message: 'ต้องระบุ studentId' });
    }

    const evaluationNumInt = evaluationNum !== undefined && evaluationNum !== null && String(evaluationNum).trim() !== ''
      ? parseInt(String(evaluationNum), 10)
      : null;

    if (evaluationNumInt !== null && (!Number.isFinite(evaluationNumInt) || evaluationNumInt < 1 || evaluationNumInt > 9)) {
      return res.status(400).json({ success: false, message: 'ค่า evaluationNum ต้องอยู่ระหว่าง 1 ถึง 9' });
    }

    const categoriesLabel = {
      teacherVerbal: 'ครู - พฤติกรรมด้านภาษา (Verbal Behaviors)',
      teacherNonVerbal: 'ครู - พฤติกรรมที่ไม่ใช่ภาษา (Non-Verbal Behavior)',
      studentAcademic: 'นักเรียน - พฤติกรรมทางวิชาการของผู้เรียน',
      studentWork: 'นักเรียน - พฤติกรรมการทำงานของผู้เรียน',
      environment: 'สิ่งแวดล้อมทางการเรียนรู้ - สภาพทางกายภาพของห้องเรียน'
    };

    const groupQuestions = {
      teacherVerbal: ['q1', 'q2', 'q3', 'q4'],
      teacherNonVerbal: ['q5', 'q6', 'q7', 'q8', 'q9'],
      studentAcademic: ['q10', 'q11', 'q12', 'q13', 'q14', 'q15'],
      studentWork: ['q16', 'q17', 'q18'],
      environment: ['q19', 'q20', 'q21', 'q22', 'q23', 'q24', 'q25', 'q26']
    };

    async function resolveStudentProfile(sid) {
      if (!sid) return null;
      const id = String(sid);

      try {
        const docSnap = await db.collection('users').doc(id).get();
        if (docSnap.exists) {
          const u = docSnap.data() || {};
          return {
            id,
            firstName: u.firstName || u.firstname || '',
            lastName: u.lastName || u.lastname || '',
            yearLevel: u.yearLevel || u.year || null,
            email: u.email || ''
          };
        }
      } catch (e) {
        // ignore
      }

      let userSnapshot = await db.collection('users').where('user_id', '==', id).limit(1).get();
      if (userSnapshot.empty) userSnapshot = await db.collection('users').where('studentId', '==', id).limit(1).get();
      if (userSnapshot.empty) userSnapshot = await db.collection('users').where('student_id', '==', id).limit(1).get();

      if (!userSnapshot.empty) {
        const u = userSnapshot.docs[0].data() || {};
        return {
          id,
          firstName: u.firstName || u.firstname || '',
          lastName: u.lastName || u.lastname || '',
          yearLevel: u.yearLevel || u.year || null,
          email: u.email || ''
        };
      }

      return { id, firstName: '', lastName: '', yearLevel: null, email: '' };
    }

    function normalizeTimestampToIso(value) {
      if (!value) return null;
      try {
        if (typeof value.toDate === 'function') return value.toDate().toISOString();
      } catch (e) {
        // ignore
      }
      if (typeof value === 'string') return value;
      return null;
    }

    function computeScoresFromAnswers(answers) {
      const groupSums = {};
      const groupCounts = {};
      Object.keys(categoriesLabel).forEach(k => {
        groupSums[k] = 0;
        groupCounts[k] = 0;
      });

      Object.keys(groupQuestions).forEach(groupKey => {
        (groupQuestions[groupKey] || []).forEach(q => {
          const raw = answers ? answers[q] : undefined;
          const num = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
          if (!Number.isFinite(num)) return;
          groupSums[groupKey] += num;
          groupCounts[groupKey] += 1;
        });
      });

      const categoryScores = {};
      Object.keys(categoriesLabel).forEach(k => {
        categoryScores[k] = groupCounts[k] > 0 ? Number((groupSums[k] / groupCounts[k]).toFixed(2)) : 0;
      });

      const valid = Object.values(categoryScores).filter(v => Number.isFinite(v) && v > 0);
      const overallAverage = valid.length
        ? Number((valid.reduce((sum, v) => sum + v, 0) / valid.length).toFixed(2))
        : 0;

      return { categoryScores, overallAverage };
    }

    // Build query
    let evalQuery = db.collection('evaluations').where('studentId', '==', String(studentId).trim());
    if (observationId) evalQuery = evalQuery.where('observationId', '==', observationId);
    const snapshot = await evalQuery.get();

    const profile = await resolveStudentProfile(String(studentId).trim());

    if (snapshot.empty) {
      return res.json({
        success: true,
        data: {
          student: {
            id: profile?.id || String(studentId).trim(),
            firstName: profile?.firstName || '',
            lastName: profile?.lastName || '',
            year: profile?.yearLevel ? Number(profile.yearLevel) : null,
            email: profile?.email || ''
          },
          filters: {
            observationId: observationId || null,
            evaluationNum: evaluationNumInt
          },
          categoriesLabel,
          records: []
        }
      });
    }

    // Resolve observation names once
    const observationNameCache = new Map();
    async function resolveObservationName(obsId) {
      if (!obsId) return 'ไม่ระบุชื่อ';
      if (observationNameCache.has(obsId)) return observationNameCache.get(obsId);
      let name = 'ไม่ระบุชื่อ';
      try {
        const doc = await db.collection('observations').doc(String(obsId)).get();
        if (doc.exists) {
          const d = doc.data() || {};
          name = d.name || name;
        }
      } catch (e) {
        // ignore
      }
      observationNameCache.set(obsId, name);
      return name;
    }

    // Group by observationId
    const byObservation = new Map();

    for (const doc of snapshot.docs) {
      const d = doc.data() || {};
      const obsId = d.observationId || null;
      const nested = d.evaluations || {};
      const yearFromEval = d.year || d.yearLevel || null;

      if (!byObservation.has(obsId || 'unknown')) {
        byObservation.set(obsId || 'unknown', {
          observationId: obsId,
          observationName: await resolveObservationName(obsId),
          year: yearFromEval !== null && yearFromEval !== undefined && yearFromEval !== '' ? Number(yearFromEval) : null,
          attempts: []
        });
      }

      const container = byObservation.get(obsId || 'unknown');
      const keys = Object.keys(nested);

      keys.forEach(k => {
        const num = parseInt(String(k), 10);
        if (!Number.isFinite(num)) return;
        if (evaluationNumInt !== null && num !== evaluationNumInt) return;

        const entry = nested[k];
        if (!entry || !entry.submitted) return;

        const answers = entry.answers || {};
        const scores = computeScoresFromAnswers(answers);

        container.attempts.push({
          evaluationNum: num,
          week: entry.week || null,
          date: entry.date || null,
          submittedAt: normalizeTimestampToIso(entry.submittedAt) || null,
          answers,
          categoryScores: scores.categoryScores,
          overallAverage: scores.overallAverage
        });
      });
    }

    // Sort attempts and build records array
    const records = Array.from(byObservation.values()).map(r => {
      r.attempts.sort((a, b) => (a.evaluationNum || 0) - (b.evaluationNum || 0));
      const allCategoryKeys = Object.keys(categoriesLabel);
      const sums = {};
      const counts = {};
      allCategoryKeys.forEach(k => { sums[k] = 0; counts[k] = 0; });

      r.attempts.forEach(at => {
        allCategoryKeys.forEach(k => {
          const v = at.categoryScores ? Number(at.categoryScores[k] || 0) : 0;
          if (Number.isFinite(v) && v > 0) {
            sums[k] += v;
            counts[k] += 1;
          }
        });
      });

      const categoryAverages = {};
      allCategoryKeys.forEach(k => {
        categoryAverages[k] = counts[k] ? Number((sums[k] / counts[k]).toFixed(2)) : 0;
      });
      const valid = Object.values(categoryAverages).filter(v => Number.isFinite(v) && v > 0);
      const overallAverage = valid.length
        ? Number((valid.reduce((sum, v) => sum + v, 0) / valid.length).toFixed(2))
        : 0;

      return {
        observationId: r.observationId,
        observationName: r.observationName,
        year: r.year,
        attempts: r.attempts,
        totals: {
          attemptsSubmitted: r.attempts.length,
          categoryAverages,
          overallAverage
        }
      };
    }).sort((a, b) => String(a.observationName || '').localeCompare(String(b.observationName || '')));

    const year = profile?.yearLevel ? Number(profile.yearLevel) : (records.find(r => r.year !== null && r.year !== undefined)?.year || null);

    res.json({
      success: true,
      data: {
        student: {
          id: profile?.id || String(studentId).trim(),
          firstName: profile?.firstName || '',
          lastName: profile?.lastName || '',
          year: year,
          email: profile?.email || ''
        },
        filters: {
          observationId: observationId || null,
          evaluationNum: evaluationNumInt
        },
        categoriesLabel,
        groupQuestions,
        records
      }
    });
  } catch (error) {
    console.error('Error loading student evaluation detail:', error);
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการโหลดข้อมูล', error: error.message });
  }
});

module.exports = router;
