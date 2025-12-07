/**
 * Thai Font Base64 for jsPDF
 * ฟอนต์ Sarabun สำหรับใช้ใน jsPDF
 * เนื่องจาก jsPDF ต้องการ base64 encoded font เพื่อรองรับภาษาไทย
 * 
 * หมายเหตุ: นี่คือตัวอย่างการประกาศ - ในการใช้งานจริงควรโหลดจาก CDN หรือใช้ THSarabunNew
 */

// สำหรับการใช้งานจริง แนะนำให้ใช้ฟอนต์ THSarabunNew หรือ Sarabun จาก Google Fonts
// และแปลงเป็น base64 ด้วย tools อย่าง https://products.aspose.app/font/base64

window.ThaiFont = {
  // ใช้ระบบ fallback ถ้าไม่สามารถโหลดฟอนต์ได้
  // jsPDF จะใช้ฟอนต์ default ที่รองรับ Unicode
  name: 'THSarabunNew',
  
  // ฟังก์ชันสำหรับเพิ่มฟอนต์ไทยใน jsPDF
  addToDoc: function(doc) {
    try {
      // ใช้ฟอนต์ default ที่รองรับ Unicode
      // สำหรับการใช้งานจริง อาจต้องเพิ่ม custom font base64
      doc.setFont('helvetica');
      return true;
    } catch (error) {
      console.warn('Could not add Thai font, using default:', error);
      return false;
    }
  }
};
