document.addEventListener('DOMContentLoaded', function() {
    const feedbackContainer = document.getElementById('feedback-container');
    const feedbackBtn = document.getElementById('feedback-btn');
    const feedbackModal = document.getElementById('feedback-modal');
    const closeModalBtn = document.querySelector('.close-modal');
    const cancelBtn = document.querySelector('.close-modal-btn');
    const feedbackForm = document.getElementById('feedback-form');
    const questionsContainer = document.getElementById('feedback-questions');

    // JSON Data for Questions (Updated survey: acceptance of the observation assessment platform)
    const questions = [
        {
            id: 1,
            text: "Q1. ฉันสามารถใช้แพลตฟอร์มการประเมินการสังเกตการสอนได้อย่างคล่องแคล่ว",
            type: "rating",
            options: [
                { value: 5, label: "มากที่สุด" },
                { value: 4, label: "มาก" },
                { value: 3, label: "ปานกลาง" },
                { value: 2, label: "น้อย" },
                { value: 1, label: "น้อยที่สุด" }
            ]
        },
        {
            id: 2,
            text: "Q2. ฉันต้องการความช่วยเหลือจากผู้เชี่ยวชาญในการใช้แพลตฟอร์มการประเมินการสังเกตการสอน",
            type: "rating",
            options: [
                { value: 5, label: "มากที่สุด" },
                { value: 4, label: "มาก" },
                { value: 3, label: "ปานกลาง" },
                { value: 2, label: "น้อย" },
                { value: 1, label: "น้อยที่สุด" }
            ]
        },
        {
            id: 3,
            text: "Q3. ฉันสามารถใช้แพลตฟอร์มการประเมินการสังเกตการสอนได้ด้วยตนเองถึงแม้จะพบเจอปัญหา",
            type: "rating",
            options: [
                { value: 5, label: "มากที่สุด" },
                { value: 4, label: "มาก" },
                { value: 3, label: "ปานกลาง" },
                { value: 2, label: "น้อย" },
                { value: 1, label: "น้อยที่สุด" }
            ]
        },
        {
            id: 4,
            text: "Q4. ความคิดเห็นของเพื่อนมีอิทธิพลต่อการตั้งใจ/ ตัดสินใจใช้แพลตฟอร์มการประเมินการสังเกตการสอน",
            type: "rating",
            options: [
                { value: 5, label: "มากที่สุด" },
                { value: 4, label: "มาก" },
                { value: 3, label: "ปานกลาง" },
                { value: 2, label: "น้อย" },
                { value: 1, label: "น้อยที่สุด" }
            ]
        },
        {
            id: 5,
            text: "Q5. ฉันอยากลองใช้แพลตฟอร์มการประเมินการสังเกตการสอนเพราะเป็นเทรนด์เทคโนโลยี",
            type: "rating",
            options: [
                { value: 5, label: "มากที่สุด" },
                { value: 4, label: "มาก" },
                { value: 3, label: "ปานกลาง" },
                { value: 2, label: "น้อย" },
                { value: 1, label: "น้อยที่สุด" }
            ]
        },
        {
            id: 6,
            text: "Q6. ฉันติดตามข่าวสารเกี่ยวกับแพลตฟอร์มการประเมินการสังเกตการสอนความอยากรู้",
            type: "rating",
            options: [
                { value: 5, label: "มากที่สุด" },
                { value: 4, label: "มาก" },
                { value: 3, label: "ปานกลาง" },
                { value: 2, label: "น้อย" },
                { value: 1, label: "น้อยที่สุด" }
            ]
        },
        {
            id: 7,
            text: "Q7. ฉันรอไม่ไหวที่จะลองใช้แพลตฟอร์มการประเมินการสังเกตการสอน",
            type: "rating",
            options: [
                { value: 5, label: "มากที่สุด" },
                { value: 4, label: "มาก" },
                { value: 3, label: "ปานกลาง" },
                { value: 2, label: "น้อย" },
                { value: 1, label: "น้อยที่สุด" }
            ]
        },
        {
            id: 8,
            text: "Q8. ฉันสามารถนำแพลตฟอร์มการประเมินการสังเกตการอนไปใช้เพื่อเป็นประโยชน์ในรายวิชาการฝึกประสบการณ์วิชาชีพครู 1 (Prac. 1) ได้",
            type: "rating",
            options: [
                { value: 5, label: "มากที่สุด" },
                { value: 4, label: "มาก" },
                { value: 3, label: "ปานกลาง" },
                { value: 2, label: "น้อย" },
                { value: 1, label: "น้อยที่สุด" }
            ]
        },
        {
            id: 9,
            text: "Q9. การใช้แพลตฟอร์มการประเมินการสังเกตการสอนขึ้นอยู่กับการใช้อุปกรณ์คอมพิวเตอร์ โทรศัพท์มือถือ/ อินเทอร์เน็ต",
            type: "rating",
            options: [
                { value: 5, label: "มากที่สุด" },
                { value: 4, label: "มาก" },
                { value: 3, label: "ปานกลาง" },
                { value: 2, label: "น้อย" },
                { value: 1, label: "น้อยที่สุด" }
            ]
        },
        {
            id: 10,
            text: "Q10. ฉันตั้งใจจะใช้แพลตฟอร์มการประเมินการสังเกตการสอนในอนาคต (รายวิชา Prac. 2 และ Prac. 3)",
            type: "rating",
            options: [
                { value: 5, label: "มากที่สุด" },
                { value: 4, label: "มาก" },
                { value: 3, label: "ปานกลาง" },
                { value: 2, label: "น้อย" },
                { value: 1, label: "น้อยที่สุด" }
            ]
        },
        {
            id: 11,
            text: "Q11. การใช้แพลตฟอร์มการประเมินการสังเกตการสอนเป็นแนวคิดคิดที่ดีแตกต่างจากสาขาวิชาอื่น ",
            type: "rating",
            options: [
                { value: 5, label: "มากที่สุด" },
                { value: 4, label: "มาก" },
                { value: 3, label: "ปานกลาง" },
                { value: 2, label: "น้อย" },
                { value: 1, label: "น้อยที่สุด" }
            ]
        }
    ];

    // Check eligibility
    checkStatus();

    function checkStatus() {
        fetch('/feedback/check-status')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.eligible) {
                    feedbackContainer.style.display = 'flex';
                    renderQuestions();
                } else {
                    console.log('User not eligible for feedback:', data.reason);
                }
            })
            .catch(error => console.error('Error checking feedback status:', error));
    }

    function renderQuestions() {
        questionsContainer.innerHTML = '';
        questions.forEach(q => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'feedback-question';
            
            let optionsHtml = '';
            q.options.forEach(opt => {
                optionsHtml += `
                    <div class="feedback-option" data-value="${opt.value}" data-question="${q.id}">
                        <input type="radio" name="q_${q.id}" value="${opt.value}" required>
                        <div class="feedback-option-value">${opt.value}</div>
                        <div class="feedback-option-label">${opt.label}</div>
                    </div>
                `;
            });

            questionDiv.innerHTML = `
                <label>${q.id}. ${q.text}</label>
                <div class="feedback-options">
                    ${optionsHtml}
                </div>
            `;
            questionsContainer.appendChild(questionDiv);
        });

        // Add click handlers for rating options
        document.querySelectorAll('.feedback-option').forEach(option => {
            option.addEventListener('click', function() {
                const questionId = this.dataset.question;
                const value = this.dataset.value;
                
                // Remove selected class from all options in this question
                document.querySelectorAll(`[data-question="${questionId}"]`).forEach(opt => {
                    opt.classList.remove('selected');
                });
                
                // Add selected class to clicked option
                this.classList.add('selected');
                
                // Check the radio button
                this.querySelector('input[type="radio"]').checked = true;
            });
        });
    }

    // Modal Events
    feedbackBtn.addEventListener('click', () => {
        feedbackModal.style.display = 'block';
    });

    const closeModal = () => {
        feedbackModal.style.display = 'none';
    };

    closeModalBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    window.addEventListener('click', (event) => {
        if (event.target === feedbackModal) {
            closeModal();
        }
    });

    // Form Submission
    feedbackForm.addEventListener('submit', function(e) {
        e.preventDefault();

        // Collect answers
        const answers = {};
        questions.forEach(q => {
            const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
            if (selected) {
                answers[q.id] = parseInt(selected.value);
            }
        });

        const suggestions = document.getElementById('feedback-suggestions').value;

        // Confirm submission
        Swal.fire({
            title: 'ยืนยันการส่งแบบประเมิน?',
            text: "คุณสามารถส่งแบบประเมินได้เพียงครั้งเดียว",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก'
        }).then((result) => {
            if (result.isConfirmed) {
                submitFeedback(answers, suggestions);
            }
        });
    });

    function submitFeedback(answers, suggestions) {
        fetch('/feedback/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ answers, suggestions }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                Swal.fire(
                    'สำเร็จ!',
                    'ขอบคุณสำหรับการประเมิน',
                    'success'
                ).then(() => {
                    closeModal();
                    feedbackContainer.style.display = 'none'; // Hide button after success
                });
            } else {
                Swal.fire(
                    'เกิดข้อผิดพลาด',
                    data.message || 'ไม่สามารถส่งแบบประเมินได้',
                    'error'
                );
            }
        })
        .catch(error => {
            console.error('Error:', error);
            Swal.fire(
                'เกิดข้อผิดพลาด',
                'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
                'error'
            );
        });
    }
});
