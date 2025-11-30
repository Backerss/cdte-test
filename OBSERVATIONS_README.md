# 📋 Observations Management System - คู่มือระบบ

## 📌 ภาพรวม

ระบบจัดการการสังเกตุ (Observations Management) เป็นระบบที่ใช้สำหรับจัดการและติดตามการสังเกตการสอนของนักศึกษา โดยแยกระบบออกเป็นส่วนหน้าบ้าน (Frontend) และส่วนหลังบ้าน (Backend) อย่างชัดเจน

---

## 🏗️ โครงสร้างไฟล์

```
cdte-test/
│
├── routes/
│   └── observations.js          # API Routes สำหรับ observations
│
├── public/
│   ├── css/
│   │   └── observations.css     # Styles สำหรับหน้า observations
│   └── js/
│       └── observations.js      # Frontend logic + API calls
│
├── views/
│   └── dashboard/
│       └── admin/
│           └── observations.ejs # HTML structure เท่านั้น
│
├── config/
│   └── firebaseAdmin.js         # Firebase Admin SDK config
│
└── app.js                       # Main application (ลงทะเบียน routes)
```

---

## 🗄️ Firestore Schema

### Collection: `observations`
เก็บข้อมูลการสังเกตุแต่ละรอบ

```javascript
{
  name: String,              // ชื่อการสังเกตุ
  academicYear: String,      // ปีการศึกษา (เช่น "2567")
  yearLevel: Number,         // ชั้นปี (1-4)
  startDate: String,         // วันเริ่มต้น (YYYY-MM-DD)
  endDate: String,           // วันสิ้นสุด (YYYY-MM-DD)
  description: String,       // คำอธิบาย
  status: String,            // สถานะ: "active", "completed", "cancelled"
  createdBy: String,         // อีเมลผู้สร้าง
  createdAt: Timestamp,      // วันเวลาที่สร้าง
  updatedAt: Timestamp       // วันเวลาที่อัปเดตล่าสุด
}
```

**Composite Index Required:**
- `academicYear` (ASC) + `yearLevel` (ASC) + `status` (ASC)
- `createdAt` (DESC)

### Collection: `observation_students`
เก็บข้อมูลนักศึกษาในแต่ละการสังเกตุ

```javascript
{
  observationId: String,            // Foreign Key -> observations.id
  studentId: String,                // รหัสนักศึกษา
  status: String,                   // "active" หรือ "terminated"
  evaluationsCompleted: Number,     // จำนวนการประเมินที่ทำแล้ว (0-9)
  lessonPlanSubmitted: Boolean,     // ส่งแผนการสอนแล้วหรือไม่
  notes: String,                    // หมายเหตุเพิ่มเติม
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**Index Required:**
- `observationId` (ASC)

### Collection: `users`
ใช้ร่วมกับระบบอื่น (มีอยู่แล้ว)

---

## 🔌 API Endpoints

### 1. ดึงรายการ observations
```http
GET /api/observations?academicYear=2567&yearLevel=2&status=active
```

**Response:**
```json
{
  "success": true,
  "observations": [
    {
      "id": "obs123",
      "name": "การสังเกตุการสอน ปี 2 เทอม 1/2567",
      "academicYear": "2567",
      "yearLevel": 2,
      "startDate": "2024-11-01",
      "endDate": "2024-11-15",
      "status": "active",
      "totalStudents": 25,
      "completedEvaluations": 18,
      "submittedLessonPlans": 22
    }
  ]
}
```

---

### 2. ดึงรายละเอียด observation และนักศึกษา
```http
GET /api/observations/:id
```

**Response:**
```json
{
  "success": true,
  "observation": {
    "id": "obs123",
    "name": "...",
    "students": [
      {
        "id": "doc_id",
        "studentId": "6501001",
        "name": "สมชาย ใจดี",
        "status": "active",
        "evaluationsCompleted": 6,
        "lessonPlanSubmitted": true
      }
    ]
  }
}
```

---

### 3. สร้าง observation ใหม่
```http
POST /api/observations
Content-Type: application/json

{
  "name": "การสังเกตุการสอน ปี 3 เทอม 1/2567",
  "academicYear": "2567",
  "yearLevel": 3,
  "startDate": "2024-12-01",
  "endDate": "2024-12-15",
  "description": "รายละเอียด...",
  "studentIds": ["6501001", "6501002", "6501003"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "สร้างการสังเกตุสำเร็จ (3 คน)",
  "observationId": "obs456"
}
```

**Error (Conflict):**
```json
{
  "success": false,
  "message": "มีการสังเกตุสำหรับชั้นปีนี้ในปีการศึกษานี้แล้ว"
}
```

---

### 4. อัปเดตสถานะ observation
```http
PATCH /api/observations/:id
Content-Type: application/json

{
  "status": "cancelled"
}
```

---

### 5. อัปเดตสถานะนักศึกษา
```http
PATCH /api/observations/:observationId/students/:studentDocId
Content-Type: application/json

{
  "status": "terminated"
}
```

---

### 6. ดึงรายชื่อนักศึกษา (สำหรับเลือก)
```http
GET /api/students?yearLevel=2&search=สมชาย
```

**Response:**
```json
{
  "success": true,
  "students": [
    {
      "id": "6501001",
      "studentId": "6501001",
      "name": "สมชาย ใจดี",
      "yearLevel": 2,
      "status": "active"
    }
  ]
}
```

---

## 🎨 Frontend Structure

### `public/css/observations.css`
- ออกแบบ styles สำหรับการ์ด, โมดัล, ฟิลเตอร์, progress bars, badges
- รองรับ responsive design
- มี animations (fadeIn, slideUp)
- SweetAlert z-index fix

### `public/js/observations.js`
- จัดการ state: `selectedStudents`, `currentObservations`, `allStudents`
- เรียก API ผ่าน `fetch()`
- Render รายการ observations และนักศึกษา
- จัดการโมดัล (สร้าง, จัดการนักศึกษา)
- Form validation และ submission
- Helper functions: `formatThaiDate()`, `escapeHtml()`, `getStatusText()`

### `views/dashboard/admin/observations.ejs`
- เหลือแค่ HTML structure
- เรียกใช้ CSS และ JS จากไฟล์แยก
- ไม่มี inline styles หรือ scripts (ยกเว้น CDN ของ SweetAlert2)

---

## 🔐 Authentication & Authorization

### Middleware
- **`requireAuth`**: ตรวจสอบว่า user login แล้ว
- **`requireAdminOrTeacher`**: ตรวจสอบว่า role เป็น `admin` หรือ `teacher`

### Protected Routes
- GET `/api/observations` → requireAuth
- POST `/api/observations` → requireAdminOrTeacher
- PATCH endpoints → requireAdminOrTeacher

---

## 🚀 วิธีใช้งาน

### 1. ติดตั้ง Dependencies
```bash
npm install
```

### 2. ตั้งค่า Firebase
- ตรวจสอบว่า `prac-cdte-firebase-adminsdk-fbsvc-2952dcad04.json` อยู่ในโฟลเดอร์ root
- หรือตั้ง environment variable: `GOOGLE_APPLICATION_CREDENTIALS`

### 3. สร้าง Firestore Collections
ใน Firebase Console:
- สร้าง collection `observations`
- สร้าง collection `observation_students`
- ตั้ง indexes ตามที่ระบุใน Schema

### 4. เริ่มเซิร์ฟเวอร์
```bash
npm start
# หรือ
npm run dev  # ใช้ nodemon
```

### 5. เข้าใช้งาน
```
http://localhost:3000/dashboard/admin/observations
```

---

## 📊 Business Logic

### การสร้าง Observation
1. ตรวจสอบว่ามีการสังเกตุซ้ำหรือไม่ (academicYear + yearLevel + status=active)
2. ถ้าซ้ำ → return 409 Conflict
3. สร้าง document ใน `observations`
4. สร้าง document ใน `observation_students` สำหรับแต่ละนักศึกษา (batch write)

### การยุติการฝึก
1. อัปเดต `status = "terminated"` ใน `observation_students`
2. Frontend จะแสดงสถานะเป็น "ยุติแล้ว" และเปลี่ยนปุ่มเป็น "เปิดใหม่"

### การคำนวณความคืบหน้า
- **ประเมินเสร็จ**: นับนักศึกษาที่ `evaluationsCompleted >= 9`
- **ส่งแผนการสอน**: นับนักศึกษาที่ `lessonPlanSubmitted === true`
- **เปอร์เซ็นต์**: `(completedEvaluations / totalStudents) * 100`

---

## ⚠️ ข้อควรระวัง

1. **Timezone Issues**: ใช้ `new Date(dateStr + 'T00:00:00')` เพื่อป้องกันปัญหา timezone
2. **Security**: ใช้ `escapeHtml()` ก่อน render user input
3. **Indexes**: ต้องสร้าง composite indexes ใน Firestore (ตาม error messages ที่แสดง)
4. **Validation**: ทั้ง client-side และ server-side ต้องตรวจสอบ
5. **Conflict Detection**: ตรวจสอบ academicYear + yearLevel + status=active ก่อนสร้าง

---

## 🔧 การแก้ไขและขยายระบบ

### เพิ่ม Feature ใหม่
1. เพิ่ม endpoint ใน `routes/observations.js`
2. เพิ่ม function ใน `public/js/observations.js`
3. อัปเดต UI ใน `views/dashboard/admin/observations.ejs`
4. เพิ่ม styles ใน `public/css/observations.css`

### ตัวอย่าง: Export ข้อมูล
```javascript
// ใน public/js/observations.js
async function exportData(observationId) {
  const response = await fetch(`/api/observations/${observationId}/export`);
  const blob = await response.blob();
  // Download file...
}

// ใน routes/observations.js
router.get('/api/observations/:id/export', requireAuth, async (req, res) => {
  // Generate Excel/CSV...
});
```

---

## 📝 Checklist สำหรับ Production

- [ ] ตั้ง environment variables สำหรับ Firebase credentials
- [ ] สร้าง Firestore indexes ทั้งหมด
- [ ] เพิ่ม rate limiting สำหรับ API endpoints
- [ ] เพิ่ม logging และ error monitoring
- [ ] ทดสอบ validation ทั้งหมด
- [ ] ทดสอบ authorization (ใครเข้าถึงอะไรได้บ้าง)
- [ ] เพิ่ม pagination สำหรับรายการใหญ่
- [ ] Optimize Firestore queries (avoid N+1)
- [ ] เพิ่ม unit tests และ integration tests

---

## 🆘 Troubleshooting

### ไม่มีข้อมูลแสดง
- ตรวจสอบ Console (F12) ว่ามี error หรือไม่
- ตรวจสอบว่า Firebase credentials ถูกต้อง
- ตรวจสอบว่า user login และมี session

### Error: Missing Index
- คัดลอก URL จาก error message
- เปิดใน browser เพื่อสร้าง index อัตโนมัติ
- รอ 2-3 นาทีให้ Firestore build index เสร็จ

### ฟอร์มส่งไม่ได้
- เปิด Network tab ใน DevTools
- ดู Response จาก API
- ตรวจสอบ validation errors ใน Console

---

## 📚 เอกสารเพิ่มเติม

- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/admin/setup)
- [Firestore Query Documentation](https://firebase.google.com/docs/firestore/query-data/queries)
- [SweetAlert2 Documentation](https://sweetalert2.github.io/)

---

**สร้างโดย:** CDTE System Development Team  
**วันที่อัปเดตล่าสุด:** 30 พฤศจิกายน 2568
