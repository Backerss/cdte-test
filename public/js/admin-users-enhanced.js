(function () {
// Wrap in IIFE to avoid polluting global scope and prevent duplicate declarations
  // Local pagination variables
  const _ITEMS_PER_PAGE = (typeof ITEMS_PER_PAGE !== 'undefined') ? ITEMS_PER_PAGE : 5;
  let currentPage = 1;
  let totalPages = 1;
  let currentUserForEdit = null;

  // Override renderUsers to support pagination
  const originalRenderUsers = window.renderUsers;
  window.renderUsers = function() {
    const tbody = document.getElementById('usersTableBody');

    if (filteredUsers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;padding:40px;color:var(--color-muted)">
            <div style="font-size:3rem;margin-bottom:16px">🔍</div>
            <div>ไม่พบข้อมูลผู้ใช้ที่ค้นหา</div>
          </td>
        </tr>
      `;
      const paginationEl = document.getElementById('paginationContainer');
      if (paginationEl) paginationEl.style.display = 'none';
      return;
    }

    // Calculate pagination
    totalPages = Math.ceil(filteredUsers.length / _ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * _ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + _ITEMS_PER_PAGE, filteredUsers.length);
    const pageUsers = filteredUsers.slice(startIndex, endIndex);

    tbody.innerHTML = pageUsers.map(user => {
      const displayId = user.studentId || user.id;
      const yearLevel = user.year || user.yearLevel;

      // Escape JSON for onclick
      const userJson = JSON.stringify(user).replace(/"/g, '&quot;').replace(/'/g, '&#39;');

      return `
      <tr>
        <td style="padding:12px;">${displayId}</td>
        <td style="padding:12px;">
          <div style="font-weight:500;">${user.firstName} ${user.lastName}</div>
        </td>
        <td style="padding:12px;">${user.email}</td>
        <td style="padding:12px;">
          <span class="role-badge ${user.role}">
            ${getRoleText(user.role)}
          </span>
        </td>
        <td style="padding:12px;text-align:center;">
          ${user.role === 'student' && yearLevel ? `ปี ${yearLevel}` : '-'}
        </td>
        <td style="padding:12px;text-align:center;">
          <span class="status-badge ${user.status || 'active'}">
            ${getStatusText(user.status || 'active')}
          </span>
        </td>
        <td style="padding:12px;text-align:center;">
          <div style="display:flex;gap:8px;justify-content:center;">
            <button class="btn btn--secondary btn--sm" onclick='viewUserDetail(${userJson})' title="ดูรายละเอียด">
              👁️
            </button>
            <button class="btn btn--primary btn--sm" onclick='openEditUserModal(${userJson})' title="แก้ไข">
              ✏️
            </button>
          </div>
        </td>
      </tr>
    `;
    }).join('');

    renderPagination();
    const paginationEl = document.getElementById('paginationContainer');
    if (paginationEl) paginationEl.style.display = 'flex';
  };

  // Render pagination controls
  function renderPagination() {
    const container = document.getElementById('paginationButtons');
    const startIndex = (currentPage - 1) * _ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + _ITEMS_PER_PAGE, filteredUsers.length);

    const showingStartEl = document.getElementById('showingStart');
    const showingEndEl = document.getElementById('showingEnd');
    const totalUsersEl = document.getElementById('totalUsers');
    if (showingStartEl) showingStartEl.textContent = filteredUsers.length > 0 ? startIndex + 1 : 0;
    if (showingEndEl) showingEndEl.textContent = endIndex;
    if (totalUsersEl) totalUsersEl.textContent = filteredUsers.length;

    let html = '';

    // Previous button
    html += `
      <button class="btn btn--secondary btn--sm" 
              onclick="changePage(${currentPage - 1})" 
              ${currentPage === 1 ? 'disabled' : ''}
              style="${currentPage === 1 ? 'opacity:0.5;cursor:not-allowed;' : ''}">
        ◀
      </button>
    `;

    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
      html += `
        <button class="btn btn--secondary btn--sm" onclick="changePage(1)">1</button>
        ${startPage > 2 ? '<span style="padding:0 8px;">...</span>' : ''}
      `;
    }

    for (let i = startPage; i <= endPage; i++) {
      html += `
        <button class="btn btn--sm ${i === currentPage ? 'btn--primary' : 'btn--secondary'}" 
                onclick="changePage(${i})"
                style="${i === currentPage ? 'font-weight:600;' : ''}">
          ${i}
        </button>
      `;
    }

    if (endPage < totalPages) {
      html += `
        ${endPage < totalPages - 1 ? '<span style="padding:0 8px;">...</span>' : ''}
        <button class="btn btn--secondary btn--sm" onclick="changePage(${totalPages})">${totalPages}</button>
      `;
    }

    // Next button
    html += `
      <button class="btn btn--secondary btn--sm" 
              onclick="changePage(${currentPage + 1})" 
              ${currentPage === totalPages ? 'disabled' : ''}
              style="${currentPage === totalPages ? 'opacity:0.5;cursor:not-allowed;' : ''}">
        ▶
      </button>
    `;

    if (container) container.innerHTML = html;
  }

  // Change page
  window.changePage = function(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderUsers();
  };

  // Open edit user modal
  window.openEditUserModal = function(user) {
    currentUserForEdit = user;

    const idEl = document.getElementById('editUserId');
    if (idEl) idEl.value = user.docId || user.id;
    const roleEl = document.getElementById('editUserRole'); if (roleEl) roleEl.value = user.role;
    const fnEl = document.getElementById('editUserFirstName'); if (fnEl) fnEl.value = user.firstName || '';
    const lnEl = document.getElementById('editUserLastName'); if (lnEl) lnEl.value = user.lastName || '';
    const emailEl = document.getElementById('editUserEmail'); if (emailEl) emailEl.value = user.email || '';
    const statusEl = document.getElementById('editUserStatus'); if (statusEl) statusEl.value = user.status || 'active';
    const pwdEl = document.getElementById('editUserPassword'); if (pwdEl) pwdEl.value = '';

    if (user.role === 'student') {
      const sidEl = document.getElementById('editUserStudentId'); if (sidEl) sidEl.value = user.studentId || '';
      const yEl = document.getElementById('editUserYearLevel'); if (yEl) yEl.value = user.year || user.yearLevel || '';
    } else {
      // no staffCode field in this deployment
    }

    window.toggleEditStudentFields && window.toggleEditStudentFields();
    const modal = document.getElementById('editUserModal'); if (modal) modal.style.display = 'flex';
  };

  // Open edit modal from detail modal
  window.openEditModalFromDetail = function() {
    if (currentUserForEdit) {
      closeUserDetailModal();
      window.openEditUserModal && window.openEditUserModal(currentUserForEdit);
    }
  };

  // Close edit modal
  window.closeEditUserModal = function() {
    const modal = document.getElementById('editUserModal'); if (modal) modal.style.display = 'none';
    const editForm = document.getElementById('editUserForm'); if (editForm) editForm.reset();
    currentUserForEdit = null;
  };

  // Toggle student/staff fields in edit modal
  window.toggleEditStudentFields = function() {
    const role = document.getElementById('editUserRole')?.value;
    const studentIdGroup = document.getElementById('editStudentIdGroup');
    const yearLevelGroup = document.getElementById('editYearLevelGroup');

    if (role === 'student') {
      if (studentIdGroup) studentIdGroup.style.display = 'block';
      if (yearLevelGroup) yearLevelGroup.style.display = 'block';
      document.getElementById('editUserStudentId')?.setAttribute('required', 'required');
      document.getElementById('editUserYearLevel')?.setAttribute('required', 'required');
    } else {
      if (studentIdGroup) studentIdGroup.style.display = 'none';
      if (yearLevelGroup) yearLevelGroup.style.display = 'none';
      document.getElementById('editUserStudentId')?.removeAttribute('required');
      document.getElementById('editUserYearLevel')?.removeAttribute('required');
    }
  };

  // Submit edit form
  document.addEventListener('DOMContentLoaded', function() {
    const editForm = document.getElementById('editUserForm');
    if (editForm) {
      editForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const userId = document.getElementById('editUserId').value;
        const role = document.getElementById('editUserRole').value;
        const password = document.getElementById('editUserPassword').value;

        const formData = {
          firstName: document.getElementById('editUserFirstName').value,
          lastName: document.getElementById('editUserLastName').value,
          email: document.getElementById('editUserEmail').value,
          role: role,
          status: document.getElementById('editUserStatus').value
        };

        // Add role-specific fields
        if (role === 'student') {
          formData.studentId = document.getElementById('editUserStudentId').value;
          formData.yearLevel = document.getElementById('editUserYearLevel').value;
        } else {
          // staffCode not used; do not include
        }

        // Add password if changed
        if (password && password.length >= 8) {
          formData.password = password;
        }

        try {
          showLoading();

          const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || 'เกิดข้อผิดพลาด');
          }

          if (data.success) {
            showToast(`แก้ไขข้อมูล ${formData.firstName} ${formData.lastName} สำเร็จ`, 'success');
            closeEditUserModal();
            await loadUsers();
          } else {
            showToast(data.message || 'ไม่สามารถแก้ไขข้อมูลได้', 'error');
          }
        } catch (error) {
          console.error('Error updating user:', error);
          showToast(error.message || 'เกิดข้อผิดพลาดในการแก้ไขข้อมูล', 'error');
        } finally {
          hideLoading();
        }
      });
    }
  });

  // Confirm delete user
  window.confirmDeleteUser = async function() {
    if (!currentUserForEdit) return;

    const confirmed = confirm(`คุณต้องการลบผู้ใช้ ${currentUserForEdit.firstName} ${currentUserForEdit.lastName} หรือไม่?\n\nการดำเนินการนี้จะทำให้บัญชีถูกปิดใช้งาน`);

    if (!confirmed) return;

    try {
      showLoading();

      const userId = document.getElementById('editUserId').value;
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'เกิดข้อผิดพลาด');
      }

      if (data.success) {
        showToast(`ลบผู้ใช้สำเร็จ`, 'success');
        closeEditUserModal();
        await loadUsers();
      } else {
        showToast(data.message || 'ไม่สามารถลบผู้ใช้ได้', 'error');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      showToast(error.message || 'เกิดข้อผิดพลาดในการลบผู้ใช้', 'error');
    } finally {
      hideLoading();
    }
  };

  // Close edit modal when clicking outside
  document.addEventListener('DOMContentLoaded', function() {
    const editModal = document.getElementById('editUserModal');
    if (editModal) {
      editModal.addEventListener('click', function(e) {
        if (e.target === this) {
          closeEditUserModal();
        }
      });
    }
  });

  // Update viewUserDetail to save current user for edit button
  const originalViewUserDetail = window.viewUserDetail;
  window.viewUserDetail = async function(user) {
    currentUserForEdit = user;
    await originalViewUserDetail(user);
  };

})();
