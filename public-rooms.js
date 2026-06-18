/* Grand Dima Hotel — Public room catalog from Supabase */

window.roomTypesCache = [];

async function loadPublicRooms() {
  const db = window.publicDb || createSupabaseClient();
  if (!db) return;

  const { data, error } = await db
    .from('room_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    console.error('Failed to load rooms:', error);
    return;
  }

  window.roomTypesCache = data || [];
  renderPublicRooms(window.roomTypesCache);
  populateBookingRoomOptions(window.roomTypesCache);
}

function renderPublicRooms(rooms) {
  const grid = document.getElementById('roomsGrid');
  if (!grid || !rooms.length) return;

  grid.innerHTML = rooms.map((room, index) => {
    const isPresidential = room.slug === 'presidential';
    const amenities = (room.amenities || []).map(a => `<span>${escapePublicHtml(a)}</span>`).join('');
    const badgeClass = room.badge_type || 'available';
    const badgeText = room.badge || 'Available';

    return `
      <div class="room-card reveal-child${isPresidential ? ' presidential' : ''}">
        <div class="room-img-wrap">
          <img src="${escapePublicHtml(room.image_url)}" alt="${escapePublicHtml(room.name)}" loading="lazy">
          <span class="room-badge ${badgeClass}">${escapePublicHtml(badgeText)}</span>
          <div class="room-overlay">
            <button class="btn btn-gold" onclick="openBooking('${escapePublicHtml(room.name)}')">${isPresidential ? 'Reserve' : 'Book Now'}</button>
            <button class="btn btn-outline-light" onclick="openRoomDetail('${escapePublicHtml(room.slug)}')">View Details</button>
          </div>
        </div>
        <div class="room-info">
          <div class="room-meta">
            <span class="room-size">${room.size_sqm} m²</span>
            <span class="room-guests">${room.max_guests} Guest${room.max_guests > 1 ? 's' : ''}</span>
            <span class="room-bed">${escapePublicHtml(room.bed_type)}</span>
          </div>
          <h3 class="room-name">${escapePublicHtml(room.name)}</h3>
          <p class="room-desc">${escapePublicHtml(room.description)}</p>
          <div class="room-amenities">${amenities}</div>
          <div class="room-price">
            <span class="price-from">From</span>
            <span class="price-amount">$${Number(room.price_per_night).toLocaleString()}</span>
            <span class="price-per">/night</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.reveal-child').forEach((child, i) => {
    setTimeout(() => child.classList.add('visible'), i * 120);
  });
}

function populateBookingRoomOptions(rooms) {
  const barSelect = document.getElementById('roomType');
  const modalSelect = document.getElementById('modalRoom');

  if (barSelect && rooms.length) {
    barSelect.innerHTML = '<option>Any Room</option>' +
      rooms.map(room => `<option>${escapePublicHtml(room.name)}</option>`).join('');
  }

  if (modalSelect && rooms.length) {
    modalSelect.innerHTML = rooms.map(room =>
      `<option>${escapePublicHtml(room.name)} — from $${Number(room.price_per_night).toLocaleString()}</option>`
    ).join('');
  }
}

function escapePublicHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', loadPublicRooms);
