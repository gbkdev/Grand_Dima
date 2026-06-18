/* Grand Dima Hotel — Admin Panel */

const db = createSupabaseClient();
let currentUser = null;
let staffProfile = null;
let roomTypesCache = [];
let currentPage = 'overview';

const PAGE_TITLES = {
  overview: 'Dashboard Overview',
  bookings: 'Manage Bookings',
  restaurant: 'Restaurant Reservations',
  messages: 'Contact Messages',
  newsletter: 'Newsletter Subscribers',
  'room-types': 'Room Types',
  'room-units': 'Room Units',
  menu: 'Menu Items'
};

const STATUS_OPTIONS = ['pending', 'confirmed', 'cancelled', 'completed'];
const UNIT_STATUS_OPTIONS = ['available', 'occupied', 'maintenance', 'cleaning'];

async function initAdmin() {
  if (!db) {
    showLoginError('Supabase is not configured. Check supabase-config.js.');
    showScreen('login');
    hideLoading();
    return;
  }

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    await onAuthenticated(session.user);
  } else {
    showScreen('login');
  }
  hideLoading();
}

function hideLoading() {
  document.getElementById('loadingScreen').classList.add('hidden');
}

function showScreen(screen) {
  document.getElementById('loginScreen').classList.toggle('hidden', screen !== 'login');
  document.getElementById('adminApp').classList.toggle('hidden', screen !== 'admin');
}

function showLoginError(message) {
  const el = document.getElementById('loginError');
  el.textContent = message;
  el.classList.add('show');
}

function hideLoginError() {
  document.getElementById('loginError').classList.remove('show');
}

async function onAuthenticated(user) {
  currentUser = user;

  const { data: profile, error } = await db
    .from('staff')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !profile) {
    await db.auth.signOut();
    showLoginError('Your account is not authorized for admin access. Ask an administrator to add you to the staff table.');
    showScreen('login');
    return;
  }

  staffProfile = profile;
  document.getElementById('userName').textContent = profile.full_name;
  document.getElementById('userRole').textContent = profile.role;
  document.getElementById('userAvatar').textContent = profile.full_name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  showScreen('admin');
  await loadAllData();
}

async function loadAllData() {
  await Promise.all([
    loadRoomTypesCache(),
    refreshCurrentPage()
  ]);
  await updateUnreadBadge();
}

async function loadRoomTypesCache() {
  const { data } = await db.from('room_types').select('*').order('sort_order');
  roomTypesCache = data || [];
  populateRoomTypeFilters();
}

function populateRoomTypeFilters() {
  const filter = document.getElementById('roomUnitTypeFilter');
  filter.innerHTML = '<option value="">All Types</option>' +
    roomTypesCache.map(rt => `<option value="${rt.id}">${escapeHtml(rt.name)}</option>`).join('');
}

async function refreshCurrentPage() {
  switch (currentPage) {
    case 'overview': return loadOverview();
    case 'bookings': return loadBookings();
    case 'restaurant': return loadRestaurantReservations();
    case 'messages': return loadMessages();
    case 'newsletter': return loadNewsletter();
    case 'room-types': return loadRoomTypes();
    case 'room-units': return loadRoomUnits();
    case 'menu': return loadMenuItems();
  }
}

async function updateUnreadBadge() {
  const { count } = await db
    .from('contact_messages')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false);

  const badge = document.getElementById('unreadBadge');
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

async function loadOverview() {
  const [
    { data: bookings },
    { data: restaurant },
    { data: messages },
    { data: subscribers },
    { data: units }
  ] = await Promise.all([
    db.from('bookings').select('*').order('created_at', { ascending: false }),
    db.from('restaurant_reservations').select('*'),
    db.from('contact_messages').select('*').eq('is_read', false),
    db.from('newsletter_subscribers').select('*').eq('is_active', true),
    db.from('room_units').select('*')
  ]);

  const allBookings = bookings || [];
  const pendingBookings = allBookings.filter(b => b.status === 'pending').length;
  const confirmedBookings = allBookings.filter(b => b.status === 'confirmed').length;
  const totalRevenue = allBookings
    .filter(b => ['confirmed', 'completed'].includes(b.status))
    .reduce((sum, b) => sum + Number(b.total_amount || estimateBookingTotal(b)), 0);
  const occupiedUnits = (units || []).filter(u => u.status === 'occupied').length;
  const occupancy = units?.length ? Math.round((occupiedUnits / units.length) * 100) : 0;

  document.getElementById('overviewKpis').innerHTML = `
    <div class="kpi-card"><span class="kpi-label">Total Bookings</span><span class="kpi-num">${allBookings.length}</span><span class="kpi-meta">${pendingBookings} pending · ${confirmedBookings} confirmed</span></div>
    <div class="kpi-card"><span class="kpi-label">Revenue (Est.)</span><span class="kpi-num">$${totalRevenue.toLocaleString()}</span><span class="kpi-meta">From confirmed & completed stays</span></div>
    <div class="kpi-card"><span class="kpi-label">Occupancy</span><span class="kpi-num">${occupancy}%</span><span class="kpi-meta">${occupiedUnits} of ${units?.length || 0} rooms occupied</span></div>
    <div class="kpi-card"><span class="kpi-label">Unread Messages</span><span class="kpi-num">${messages?.length || 0}</span><span class="kpi-meta">${(subscribers || []).length} newsletter subscribers</span></div>
  `;

  document.getElementById('recentBookings').innerHTML = allBookings.slice(0, 5).map(b => `
    <div class="recent-item">
      <div><strong>${escapeHtml(b.first_name)} ${escapeHtml(b.last_name)}</strong><small>${escapeHtml(b.reference)} · ${escapeHtml(b.room_type)}</small></div>
      <span class="status ${b.status}">${b.status}</span>
    </div>
  `).join('') || '<div class="empty-state"><p>No bookings yet</p></div>';

  renderWeeklyChart(allBookings);
}

function estimateBookingTotal(booking) {
  const nights = Math.max(1, Math.ceil((new Date(booking.check_out) - new Date(booking.check_in)) / 86400000));
  const room = roomTypesCache.find(rt => booking.room_type.includes(rt.name));
  return room ? nights * Number(room.price_per_night) : nights * 200;
}

function renderWeeklyChart(bookings) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const counts = Array(7).fill(0);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);

  bookings.forEach(booking => {
    const created = new Date(booking.created_at);
    if (created >= weekStart) counts[created.getDay()]++;
  });

  const max = Math.max(...counts, 1);
  document.getElementById('weeklyChart').innerHTML = days.map((day, i) => `
    <div class="chart-bar" style="height:${Math.max(8, (counts[i] / max) * 100)}%"><span>${day}</span></div>
  `).join('');
}

async function loadBookings() {
  let query = db.from('bookings').select('*').order('created_at', { ascending: false });
  const status = document.getElementById('bookingStatusFilter').value;
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return showToast(supabaseErrorMessage(error), 'error');

  const search = document.getElementById('bookingSearch').value.trim().toLowerCase();
  const rows = (data || []).filter(b => {
    if (!search) return true;
    const haystack = `${b.reference} ${b.first_name} ${b.last_name} ${b.email} ${b.room_type}`.toLowerCase();
    return haystack.includes(search);
  });

  document.getElementById('bookingsTableBody').innerHTML = rows.map(b => `
    <tr>
      <td>${escapeHtml(b.reference)}</td>
      <td>${escapeHtml(b.first_name)} ${escapeHtml(b.last_name)}<br><small>${escapeHtml(b.email)}</small></td>
      <td>${escapeHtml(b.room_type)}</td>
      <td>${formatDisplayDate(b.check_in)}</td>
      <td>${formatDisplayDate(b.check_out)}</td>
      <td><span class="status ${b.status}">${b.status}</span></td>
      <td>$${Number(b.total_amount || estimateBookingTotal(b)).toLocaleString()}</td>
      <td>
        <div class="admin-actions">
          <button class="tbl-btn" onclick="editBooking('${b.id}')">Edit</button>
          <select onchange="updateBookingStatus('${b.id}', this.value)" class="tbl-btn">
            ${STATUS_OPTIONS.map(s => `<option value="${s}" ${b.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <button class="tbl-btn danger" onclick="deleteRecord('bookings', '${b.id}', 'booking')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="8"><div class="empty-state"><p>No bookings found</p></div></td></tr>`;
}

async function loadRestaurantReservations() {
  let query = db.from('restaurant_reservations').select('*').order('reservation_date', { ascending: false });
  const status = document.getElementById('restaurantStatusFilter').value;
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return showToast(supabaseErrorMessage(error), 'error');

  const search = document.getElementById('restaurantSearch').value.trim().toLowerCase();
  const rows = (data || []).filter(r => {
    if (!search) return true;
    return `${r.guest_name} ${r.restaurant} ${r.phone}`.toLowerCase().includes(search);
  });

  document.getElementById('restaurantTableBody').innerHTML = rows.map(r => `
    <tr>
      <td>${escapeHtml(r.guest_name)}<br><small>${escapeHtml(r.phone)}</small></td>
      <td>${escapeHtml(r.restaurant)}</td>
      <td>${formatDisplayDate(r.reservation_date)}</td>
      <td>${escapeHtml(r.reservation_time)}</td>
      <td>${escapeHtml(r.guests)}</td>
      <td><span class="status ${r.status}">${r.status}</span></td>
      <td>
        <div class="admin-actions">
          <select onchange="updateRestaurantStatus('${r.id}', this.value)" class="tbl-btn">
            ${STATUS_OPTIONS.map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <button class="tbl-btn danger" onclick="deleteRecord('restaurant_reservations', '${r.id}', 'reservation')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="7"><div class="empty-state"><p>No reservations found</p></div></td></tr>`;
}

async function loadMessages() {
  const { data, error } = await db.from('contact_messages').select('*').order('created_at', { ascending: false });
  if (error) return showToast(supabaseErrorMessage(error), 'error');

  const search = document.getElementById('messageSearch').value.trim().toLowerCase();
  const readFilter = document.getElementById('messageReadFilter').value;

  const rows = (data || []).filter(m => {
    if (readFilter === 'unread' && m.is_read) return false;
    if (readFilter === 'read' && !m.is_read) return false;
    if (!search) return true;
    return `${m.first_name} ${m.last_name} ${m.email} ${m.subject} ${m.message}`.toLowerCase().includes(search);
  });

  document.getElementById('messagesTableBody').innerHTML = rows.map(m => `
    <tr class="${m.is_read ? '' : 'row-unread'}">
      <td>${escapeHtml(m.first_name)} ${escapeHtml(m.last_name)}<br><small>${escapeHtml(m.email)}</small></td>
      <td>${escapeHtml(m.subject)}</td>
      <td>${escapeHtml(m.message.slice(0, 80))}${m.message.length > 80 ? '...' : ''}</td>
      <td>${formatDateTime(m.created_at)}</td>
      <td>
        <div class="admin-actions">
          ${m.is_read ? '' : `<button class="tbl-btn gold" onclick="markMessageRead('${m.id}')">Mark Read</button>`}
          <button class="tbl-btn danger" onclick="deleteRecord('contact_messages', '${m.id}', 'message')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5"><div class="empty-state"><p>No messages found</p></div></td></tr>`;
}

async function loadNewsletter() {
  const { data, error } = await db.from('newsletter_subscribers').select('*').order('created_at', { ascending: false });
  if (error) return showToast(supabaseErrorMessage(error), 'error');

  const search = document.getElementById('newsletterSearch').value.trim().toLowerCase();
  const rows = (data || []).filter(s => !search || s.email.toLowerCase().includes(search));

  document.getElementById('newsletterTableBody').innerHTML = rows.map(s => `
    <tr>
      <td>${escapeHtml(s.email)}</td>
      <td>${formatDateTime(s.created_at)}</td>
      <td><span class="status ${s.is_active ? 'confirmed' : 'cancelled'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div class="admin-actions">
          <button class="tbl-btn" onclick="toggleSubscriber('${s.id}', ${!s.is_active})">${s.is_active ? 'Deactivate' : 'Activate'}</button>
          <button class="tbl-btn danger" onclick="deleteRecord('newsletter_subscribers', '${s.id}', 'subscriber')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="4"><div class="empty-state"><p>No subscribers found</p></div></td></tr>`;
}

async function loadRoomTypes() {
  const { data, error } = await db.from('room_types').select('*').order('sort_order');
  if (error) return showToast(supabaseErrorMessage(error), 'error');
  roomTypesCache = data || [];

  document.getElementById('roomTypesTableBody').innerHTML = roomTypesCache.map(rt => `
    <tr>
      <td><strong>${escapeHtml(rt.name)}</strong><br><small>${escapeHtml(rt.slug)}</small></td>
      <td>$${Number(rt.price_per_night).toLocaleString()}</td>
      <td>${rt.size_sqm} m²</td>
      <td>${rt.max_guests}</td>
      <td>${rt.badge ? `<span class="status ${rt.badge_type || 'available'}">${escapeHtml(rt.badge)}</span>` : '—'}</td>
      <td><span class="status ${rt.is_active ? 'confirmed' : 'cancelled'}">${rt.is_active ? 'Yes' : 'No'}</span></td>
      <td>
        <div class="admin-actions">
          <button class="tbl-btn" onclick="editRoomType('${rt.id}')">Edit</button>
          <button class="tbl-btn danger" onclick="deleteRecord('room_types', '${rt.id}', 'room type')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="7"><div class="empty-state"><p>No room types found</p></div></td></tr>`;
}

async function loadRoomUnits() {
  const typeFilter = document.getElementById('roomUnitTypeFilter').value;
  const statusFilter = document.getElementById('roomUnitStatusFilter').value;

  let query = db.from('room_units').select('*, room_types(name, slug)').order('room_number');
  if (typeFilter) query = query.eq('room_type_id', typeFilter);
  if (statusFilter) query = query.eq('status', statusFilter);

  const { data, error } = await query;
  if (error) return showToast(supabaseErrorMessage(error), 'error');

  document.getElementById('roomUnitsGrid').innerHTML = (data || []).map(unit => `
    <div class="room-admin-card ${unit.status}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
        <span class="room-num">${escapeHtml(unit.room_number)}</span>
        <span class="status ${unit.status}">${unit.status}</span>
      </div>
      <h4>${escapeHtml(unit.room_types?.name || 'Room')}</h4>
      <p>${escapeHtml(unit.notes || 'No notes')}</p>
      <div class="admin-actions" style="margin-top:1rem">
        <select onchange="updateRoomUnitStatus('${unit.id}', this.value)" class="tbl-btn">
          ${UNIT_STATUS_OPTIONS.map(s => `<option value="${s}" ${unit.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="tbl-btn" onclick="editRoomUnit('${unit.id}')">Edit</button>
        <button class="tbl-btn danger" onclick="deleteRecord('room_units', '${unit.id}', 'room unit')">Delete</button>
      </div>
    </div>
  `).join('') || '<div class="empty-state"><p>No room units found</p></div>';
}

async function loadMenuItems() {
  let query = db.from('menu_items').select('*').order('restaurant').order('sort_order');
  const restaurant = document.getElementById('menuRestaurantFilter').value;
  if (restaurant) query = query.eq('restaurant', restaurant);

  const { data, error } = await query;
  if (error) return showToast(supabaseErrorMessage(error), 'error');

  const restaurants = [...new Set((data || []).map(item => item.restaurant))];
  const filter = document.getElementById('menuRestaurantFilter');
  const current = filter.value;
  filter.innerHTML = '<option value="">All Restaurants</option>' +
    restaurants.map(r => `<option value="${escapeHtml(r)}" ${r === current ? 'selected' : ''}>${escapeHtml(r)}</option>`).join('');

  document.getElementById('menuTableBody').innerHTML = (data || []).map(item => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.restaurant)}</td>
      <td>${escapeHtml(item.price)}</td>
      <td><span class="status ${item.is_active ? 'confirmed' : 'cancelled'}">${item.is_active ? 'Yes' : 'No'}</span></td>
      <td>
        <div class="admin-actions">
          <button class="tbl-btn" onclick="editMenuItem('${item.id}')">Edit</button>
          <button class="tbl-btn danger" onclick="deleteRecord('menu_items', '${item.id}', 'menu item')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="6"><div class="empty-state"><p>No menu items found</p></div></td></tr>`;
}

async function updateBookingStatus(id, status) {
  const { data: booking } = await db.from('bookings').select('*').eq('id', id).single();
  const total_amount = ['confirmed', 'completed'].includes(status)
    ? estimateBookingTotal(booking)
    : booking.total_amount;

  const { error } = await db.from('bookings').update({ status, total_amount }).eq('id', id);
  if (error) return showToast(supabaseErrorMessage(error), 'error');
  showToast('Booking status updated.');
  await refreshCurrentPage();
}

async function updateRestaurantStatus(id, status) {
  const { error } = await db.from('restaurant_reservations').update({ status }).eq('id', id);
  if (error) return showToast(supabaseErrorMessage(error), 'error');
  showToast('Reservation status updated.');
  await refreshCurrentPage();
}

async function updateRoomUnitStatus(id, status) {
  const { error } = await db.from('room_units').update({ status }).eq('id', id);
  if (error) return showToast(supabaseErrorMessage(error), 'error');
  showToast('Room status updated.');
  await loadRoomUnits();
}

async function markMessageRead(id) {
  const { error } = await db.from('contact_messages').update({ is_read: true }).eq('id', id);
  if (error) return showToast(supabaseErrorMessage(error), 'error');
  await loadMessages();
  await updateUnreadBadge();
}

async function toggleSubscriber(id, isActive) {
  const { error } = await db.from('newsletter_subscribers').update({ is_active: isActive }).eq('id', id);
  if (error) return showToast(supabaseErrorMessage(error), 'error');
  await loadNewsletter();
}

async function deleteRecord(table, id, label) {
  if (!confirm(`Delete this ${label}?`)) return;
  const { error } = await db.from(table).delete().eq('id', id);
  if (error) return showToast(supabaseErrorMessage(error), 'error');
  showToast(`${label[0].toUpperCase()}${label.slice(1)} deleted.`);
  await loadAllData();
}

function openModal(title, html, wide) {
  document.getElementById('adminModalTitle').textContent = title;
  document.getElementById('adminModalForm').innerHTML = html;
  document.getElementById('adminModalBox').classList.toggle('wide', !!wide);
  document.getElementById('adminModal').classList.add('open');
}

function closeModal() {
  document.getElementById('adminModal').classList.remove('open');
  document.getElementById('adminModalForm').innerHTML = '';
}

function formField(label, name, value, type = 'text', options = {}) {
  const required = options.required ? 'required' : '';
  if (type === 'textarea') {
    return `<div class="form-group"><label>${label}</label><textarea name="${name}" rows="${options.rows || 3}" ${required}>${escapeHtml(value || '')}</textarea></div>`;
  }
  if (type === 'select') {
    return `<div class="form-group"><label>${label}</label><select name="${name}" ${required}>${options.choices.map(c => `<option value="${escapeHtml(c.value)}" ${String(value) === String(c.value) ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}</select></div>`;
  }
  if (type === 'checkbox') {
    return `<div class="form-group"><label><input type="checkbox" name="${name}" ${value ? 'checked' : ''}> ${label}</label></div>`;
  }
  return `<div class="form-group"><label>${label}</label><input type="${type}" name="${name}" value="${escapeHtml(value || '')}" ${required} ${options.step ? `step="${options.step}"` : ''}></div>`;
}

async function editBooking(id) {
  const { data: b } = await db.from('bookings').select('*').eq('id', id).single();
  if (!b) return;

  openModal('Edit Booking', `
    ${formField('Reference', 'reference', b.reference)}
    <div class="form-row">${formField('First Name', 'first_name', b.first_name, 'text', { required: true })}${formField('Last Name', 'last_name', b.last_name, 'text', { required: true })}</div>
    ${formField('Email', 'email', b.email, 'email', { required: true })}
    ${formField('Phone', 'phone', b.phone)}
    <div class="form-row">${formField('Check-In', 'check_in', b.check_in, 'date', { required: true })}${formField('Check-Out', 'check_out', b.check_out, 'date', { required: true })}</div>
    ${formField('Guests', 'guests', b.guests)}
    ${formField('Room Type', 'room_type', b.room_type)}
    ${formField('Status', 'status', b.status, 'select', { choices: STATUS_OPTIONS.map(s => ({ value: s, label: s })) })}
    ${formField('Special Requests', 'special_requests', b.special_requests, 'textarea')}
    <div class="admin-form-actions"><button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-gold">Save Changes</button></div>
  `, true);

  document.getElementById('adminModalForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    const { error } = await db.from('bookings').update(payload).eq('id', id);
    if (error) return showToast(supabaseErrorMessage(error), 'error');
    closeModal();
    showToast('Booking updated.');
    await loadBookings();
  };
}

function addBooking() {
  openModal('New Booking', `
    ${formField('Reference', 'reference', 'GD-' + Math.floor(10000 + Math.random() * 90000))}
    <div class="form-row">${formField('First Name', 'first_name', '', 'text', { required: true })}${formField('Last Name', 'last_name', '', 'text', { required: true })}</div>
    ${formField('Email', 'email', '', 'email', { required: true })}
    ${formField('Phone', 'phone', '')}
    <div class="form-row">${formField('Check-In', 'check_in', formatDate(new Date(Date.now() + 86400000)), 'date', { required: true })}${formField('Check-Out', 'check_out', formatDate(new Date(Date.now() + 259200000)), 'date', { required: true })}</div>
    ${formField('Guests', 'guests', '2 Guests')}
    ${formField('Room Type', 'room_type', roomTypesCache[0]?.name || 'Deluxe Room')}
    ${formField('Status', 'status', 'pending', 'select', { choices: STATUS_OPTIONS.map(s => ({ value: s, label: s })) })}
    ${formField('Special Requests', 'special_requests', '', 'textarea')}
    <div class="admin-form-actions"><button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-gold">Create Booking</button></div>
  `, true);

  document.getElementById('adminModalForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    payload.total_amount = estimateBookingTotal(payload);
    const { error } = await db.from('bookings').insert(payload);
    if (error) return showToast(supabaseErrorMessage(error), 'error');
    closeModal();
    showToast('Booking created.');
    await loadAllData();
  };
}

async function editRoomType(id) {
  const { data: rt } = await db.from('room_types').select('*').eq('id', id).single();
  if (!rt) return;

  openModal('Edit Room Type', `
    ${formField('Name', 'name', rt.name, 'text', { required: true })}
    ${formField('Slug', 'slug', rt.slug, 'text', { required: true })}
    ${formField('Description', 'description', rt.description, 'textarea', { required: true, rows: 4 })}
    <div class="form-row">${formField('Size (m²)', 'size_sqm', rt.size_sqm, 'number', { required: true })}${formField('Max Guests', 'max_guests', rt.max_guests, 'number', { required: true })}</div>
    <div class="form-row">${formField('Bed Type', 'bed_type', rt.bed_type, 'text', { required: true })}${formField('Price / Night', 'price_per_night', rt.price_per_night, 'number', { required: true, step: '0.01' })}</div>
    ${formField('Amenities (comma separated)', 'amenities', (rt.amenities || []).join(', '))}
    ${formField('Image URL', 'image_url', rt.image_url, 'url', { required: true })}
    <div class="form-row">${formField('Badge Text', 'badge', rt.badge)}${formField('Badge Type', 'badge_type', rt.badge_type || 'available', 'select', { choices: [{ value: 'available', label: 'Available' }, { value: 'limited', label: 'Limited' }, { value: 'gold', label: 'Gold' }] })}</div>
    ${formField('Sort Order', 'sort_order', rt.sort_order, 'number')}
    ${formField('Active on website', 'is_active', rt.is_active, 'checkbox')}
    <div class="admin-form-actions"><button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-gold">Save Room Type</button></div>
  `, true);

  document.getElementById('adminModalForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      slug: fd.get('slug'),
      description: fd.get('description'),
      size_sqm: Number(fd.get('size_sqm')),
      max_guests: Number(fd.get('max_guests')),
      bed_type: fd.get('bed_type'),
      price_per_night: Number(fd.get('price_per_night')),
      amenities: String(fd.get('amenities')).split(',').map(v => v.trim()).filter(Boolean),
      image_url: fd.get('image_url'),
      badge: fd.get('badge') || null,
      badge_type: fd.get('badge_type') || null,
      sort_order: Number(fd.get('sort_order') || 0),
      is_active: fd.get('is_active') === 'on'
    };
    const { error } = await db.from('room_types').update(payload).eq('id', id);
    if (error) return showToast(supabaseErrorMessage(error), 'error');
    closeModal();
    showToast('Room type updated.');
    await loadAllData();
  };
}

function addRoomType() {
  openModal('Add Room Type', `
    ${formField('Name', 'name', '', 'text', { required: true })}
    ${formField('Slug', 'slug', '', 'text', { required: true })}
    ${formField('Description', 'description', '', 'textarea', { required: true, rows: 4 })}
    <div class="form-row">${formField('Size (m²)', 'size_sqm', 42, 'number', { required: true })}${formField('Max Guests', 'max_guests', 2, 'number', { required: true })}</div>
    <div class="form-row">${formField('Bed Type', 'bed_type', 'King Bed', 'text', { required: true })}${formField('Price / Night', 'price_per_night', 185, 'number', { required: true, step: '0.01' })}</div>
    ${formField('Amenities (comma separated)', 'amenities', 'Free WiFi, Smart TV')}
    ${formField('Image URL', 'image_url', '', 'url', { required: true })}
    <div class="form-row">${formField('Badge Text', 'badge', 'Available')}${formField('Badge Type', 'badge_type', 'available', 'select', { choices: [{ value: 'available', label: 'Available' }, { value: 'limited', label: 'Limited' }, { value: 'gold', label: 'Gold' }] })}</div>
    ${formField('Sort Order', 'sort_order', roomTypesCache.length + 1, 'number')}
    ${formField('Active on website', 'is_active', true, 'checkbox')}
    <div class="admin-form-actions"><button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-gold">Create Room Type</button></div>
  `, true);

  document.getElementById('adminModalForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      slug: fd.get('slug'),
      description: fd.get('description'),
      size_sqm: Number(fd.get('size_sqm')),
      max_guests: Number(fd.get('max_guests')),
      bed_type: fd.get('bed_type'),
      price_per_night: Number(fd.get('price_per_night')),
      amenities: String(fd.get('amenities')).split(',').map(v => v.trim()).filter(Boolean),
      image_url: fd.get('image_url'),
      badge: fd.get('badge') || null,
      badge_type: fd.get('badge_type') || null,
      sort_order: Number(fd.get('sort_order') || 0),
      is_active: fd.get('is_active') === 'on'
    };
    const { error } = await db.from('room_types').insert(payload);
    if (error) return showToast(supabaseErrorMessage(error), 'error');
    closeModal();
    showToast('Room type created.');
    await loadAllData();
  };
}

async function editRoomUnit(id) {
  const { data: unit } = await db.from('room_units').select('*').eq('id', id).single();
  if (!unit) return;

  openModal('Edit Room Unit', `
    ${formField('Room Number', 'room_number', unit.room_number, 'text', { required: true })}
    ${formField('Room Type', 'room_type_id', unit.room_type_id, 'select', { required: true, choices: roomTypesCache.map(rt => ({ value: rt.id, label: rt.name })) })}
    ${formField('Status', 'status', unit.status, 'select', { choices: UNIT_STATUS_OPTIONS.map(s => ({ value: s, label: s })) })}
    ${formField('Notes', 'notes', unit.notes, 'textarea')}
    <div class="admin-form-actions"><button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-gold">Save Room Unit</button></div>
  `);

  document.getElementById('adminModalForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { error } = await db.from('room_units').update(Object.fromEntries(fd.entries())).eq('id', id);
    if (error) return showToast(supabaseErrorMessage(error), 'error');
    closeModal();
    showToast('Room unit updated.');
    await loadRoomUnits();
  };
}

function addRoomUnit() {
  openModal('Add Room Unit', `
    ${formField('Room Number', 'room_number', '', 'text', { required: true })}
    ${formField('Room Type', 'room_type_id', roomTypesCache[0]?.id, 'select', { required: true, choices: roomTypesCache.map(rt => ({ value: rt.id, label: rt.name })) })}
    ${formField('Status', 'status', 'available', 'select', { choices: UNIT_STATUS_OPTIONS.map(s => ({ value: s, label: s })) })}
    ${formField('Notes', 'notes', '', 'textarea')}
    <div class="admin-form-actions"><button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-gold">Create Room Unit</button></div>
  `);

  document.getElementById('adminModalForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const { error } = await db.from('room_units').insert(Object.fromEntries(fd.entries()));
    if (error) return showToast(supabaseErrorMessage(error), 'error');
    closeModal();
    showToast('Room unit created.');
    await loadRoomUnits();
  };
}

async function editMenuItem(id) {
  const { data: item } = await db.from('menu_items').select('*').eq('id', id).single();
  if (!item) return;

  openModal('Edit Menu Item', `
    ${formField('Name', 'name', item.name, 'text', { required: true })}
    ${formField('Restaurant', 'restaurant', item.restaurant, 'text', { required: true })}
    ${formField('Category', 'category', item.category, 'text', { required: true })}
    ${formField('Price', 'price', item.price, 'text', { required: true })}
    ${formField('Sort Order', 'sort_order', item.sort_order, 'number')}
    ${formField('Active', 'is_active', item.is_active, 'checkbox')}
    <div class="admin-form-actions"><button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-gold">Save Menu Item</button></div>
  `);

  document.getElementById('adminModalForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      restaurant: fd.get('restaurant'),
      category: fd.get('category'),
      price: fd.get('price'),
      sort_order: Number(fd.get('sort_order') || 0),
      is_active: fd.get('is_active') === 'on'
    };
    const { error } = await db.from('menu_items').update(payload).eq('id', id);
    if (error) return showToast(supabaseErrorMessage(error), 'error');
    closeModal();
    showToast('Menu item updated.');
    await loadMenuItems();
  };
}

function addMenuItem() {
  openModal('Add Menu Item', `
    ${formField('Name', 'name', '', 'text', { required: true })}
    ${formField('Restaurant', 'restaurant', 'Dima Habesha', 'text', { required: true })}
    ${formField('Category', 'category', 'Main Course', 'text', { required: true })}
    ${formField('Price', 'price', 'ETB 500', 'text', { required: true })}
    ${formField('Sort Order', 'sort_order', 1, 'number')}
    ${formField('Active', 'is_active', true, 'checkbox')}
    <div class="admin-form-actions"><button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-gold">Create Menu Item</button></div>
  `);

  document.getElementById('adminModalForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      name: fd.get('name'),
      restaurant: fd.get('restaurant'),
      category: fd.get('category'),
      price: fd.get('price'),
      sort_order: Number(fd.get('sort_order') || 0),
      is_active: fd.get('is_active') === 'on'
    };
    const { error } = await db.from('menu_items').insert(payload);
    if (error) return showToast(supabaseErrorMessage(error), 'error');
    closeModal();
    showToast('Menu item created.');
    await loadMenuItems();
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function switchPage(page) {
  currentPage = page;
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page];
  document.querySelectorAll('.admin-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  document.querySelectorAll('.admin-page-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `page-${page}`);
  });
  refreshCurrentPage();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideLoginError();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  btn.disabled = false;

  if (error) {
    showLoginError(supabaseErrorMessage(error));
    return;
  }

  await onAuthenticated(data.user);
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await db.auth.signOut();
  currentUser = null;
  staffProfile = null;
  showScreen('login');
});

document.getElementById('refreshBtn').addEventListener('click', loadAllData);
document.getElementById('adminModalClose').addEventListener('click', closeModal);
document.getElementById('adminModal').addEventListener('click', (e) => {
  if (e.target.id === 'adminModal') closeModal();
});

document.querySelectorAll('.admin-nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

document.getElementById('addBookingBtn').addEventListener('click', addBooking);
document.getElementById('addRoomTypeBtn').addEventListener('click', addRoomType);
document.getElementById('addRoomUnitBtn').addEventListener('click', addRoomUnit);
document.getElementById('addMenuItemBtn').addEventListener('click', addMenuItem);

['bookingSearch', 'bookingStatusFilter'].forEach(id => {
  document.getElementById(id).addEventListener('input', loadBookings);
  document.getElementById(id).addEventListener('change', loadBookings);
});
['restaurantSearch', 'restaurantStatusFilter'].forEach(id => {
  document.getElementById(id).addEventListener('input', loadRestaurantReservations);
  document.getElementById(id).addEventListener('change', loadRestaurantReservations);
});
['messageSearch', 'messageReadFilter'].forEach(id => {
  document.getElementById(id).addEventListener('input', loadMessages);
  document.getElementById(id).addEventListener('change', loadMessages);
});
document.getElementById('newsletterSearch').addEventListener('input', loadNewsletter);
['roomUnitTypeFilter', 'roomUnitStatusFilter'].forEach(id => {
  document.getElementById(id).addEventListener('change', loadRoomUnits);
});
document.getElementById('menuRestaurantFilter').addEventListener('change', loadMenuItems);

window.editBooking = editBooking;
window.updateBookingStatus = updateBookingStatus;
window.updateRestaurantStatus = updateRestaurantStatus;
window.updateRoomUnitStatus = updateRoomUnitStatus;
window.markMessageRead = markMessageRead;
window.toggleSubscriber = toggleSubscriber;
window.deleteRecord = deleteRecord;
window.editRoomType = editRoomType;
window.editRoomUnit = editRoomUnit;
window.editMenuItem = editMenuItem;
window.closeModal = closeModal;

initAdmin();
