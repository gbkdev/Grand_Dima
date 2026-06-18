/* =============================================
   GRAND DIMA HOTEL — JavaScript
   ============================================= */

// ====== SUPABASE ======
const db = createSupabaseClient();
window.publicDb = db;

function setSubmitting(form, isSubmitting) {
  const btn = form.querySelector('button[type="submit"]');
  if (btn) {
    btn.disabled = isSubmitting;
    btn.dataset.originalText = btn.dataset.originalText || btn.textContent;
    btn.textContent = isSubmitting ? 'Please wait...' : btn.dataset.originalText;
  }
}

// ====== NAVIGATION ======
const nav = document.getElementById('mainNav');
const navLinks = document.getElementById('navLinks');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  if (scrollY > 80) {
    nav.classList.add('scrolled');
  } else {
    nav.classList.remove('scrolled');
  }

  // Active nav link based on scroll
  const sections = document.querySelectorAll('section[id]');
  sections.forEach(section => {
    const top = section.offsetTop - 120;
    const bottom = top + section.offsetHeight;
    if (scrollY >= top && scrollY < bottom) {
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      const link = document.querySelector(`.nav-link[href="#${section.id}"]`);
      if (link) link.classList.add('active');
    }
  });

  lastScroll = scrollY;
});

function toggleMenu() {
  navLinks.classList.toggle('open');
  const bars = document.querySelectorAll('.nav-hamburger span');
  const isOpen = navLinks.classList.contains('open');
  bars[0].style.transform = isOpen ? 'translateY(6.5px) rotate(45deg)' : '';
  bars[1].style.opacity = isOpen ? '0' : '1';
  bars[2].style.transform = isOpen ? 'translateY(-6.5px) rotate(-45deg)' : '';
}

// Close nav on link click
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
  });
});

// ====== HERO SLIDER ======
let currentSlide = 0;
const slides = document.querySelectorAll('.hero-slide');
const dots = document.querySelectorAll('.dot');

function goSlide(index) {
  slides[currentSlide].classList.remove('active');
  dots[currentSlide].classList.remove('active');
  currentSlide = index;
  slides[currentSlide].classList.add('active');
  dots[currentSlide].classList.add('active');
}

function nextSlide() {
  goSlide((currentSlide + 1) % slides.length);
}

setInterval(nextSlide, 5500);

// ====== SCROLL REVEAL ======
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      // Animate children
      const children = entry.target.querySelectorAll('.reveal-child');
      children.forEach((child, i) => {
        setTimeout(() => child.classList.add('visible'), i * 120);
      });
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ====== COUNTER ANIMATION ======
function animateCounters() {
  document.querySelectorAll('.stat-number[data-target]').forEach(el => {
    const target = parseInt(el.dataset.target);
    const duration = 1800;
    const step = target / (duration / 16);
    let current = 0;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = Math.floor(current);
      if (current >= target) {
        el.textContent = target;
        clearInterval(timer);
      }
    }, 16);
  });
}

const counterSection = document.querySelector('.intro-stats');
const counterObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) {
    animateCounters();
    counterObserver.disconnect();
  }
}, { threshold: 0.3 });
if (counterSection) counterObserver.observe(counterSection);

// ====== BOOKING BAR DATE DEFAULTS ======
const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);
const dayAfter = new Date(today);
dayAfter.setDate(today.getDate() + 3);

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

const checkinEl = document.getElementById('checkin');
const checkoutEl = document.getElementById('checkout');
if (checkinEl) {
  checkinEl.min = formatDate(today);
  checkinEl.value = formatDate(tomorrow);
}
if (checkoutEl) {
  checkoutEl.min = formatDate(tomorrow);
  checkoutEl.value = formatDate(dayAfter);
}

function checkAvailability() {
  const ci = document.getElementById('checkin').value;
  const co = document.getElementById('checkout').value;
  const g = document.getElementById('guests').value;
  const rt = document.getElementById('roomType').value;

  if (!ci || !co) {
    showToast('Please select check-in and check-out dates.');
    return;
  }

  openBooking(rt === 'Any Room' ? '' : rt);
  if (document.getElementById('modalCheckin')) {
    document.getElementById('modalCheckin').value = ci;
    document.getElementById('modalCheckout').value = co;
    document.getElementById('modalGuests').value = g;
  }
}

// ====== BOOKING MODAL ======
function openBooking(roomType = '') {
  const modal = document.getElementById('bookingModal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (roomType) {
    const roomSelect = document.getElementById('modalRoom');
    if (roomSelect) {
      for (let opt of roomSelect.options) {
        if (opt.text.startsWith(roomType)) {
          roomSelect.value = opt.value;
          break;
        }
      }
    }
  }

  // Set dates
  const modalCI = document.getElementById('modalCheckin');
  const modalCO = document.getElementById('modalCheckout');
  if (modalCI && !modalCI.value) {
    modalCI.value = formatDate(tomorrow);
    modalCI.min = formatDate(today);
  }
  if (modalCO && !modalCO.value) {
    modalCO.value = formatDate(dayAfter);
    modalCO.min = formatDate(tomorrow);
  }
}

function closeBooking() {
  document.getElementById('bookingModal').classList.remove('open');
  document.body.style.overflow = '';
}

async function confirmBooking(e) {
  e.preventDefault();
  const form = e.target;
  const ref = 'GD-' + Math.floor(10000 + Math.random() * 90000);
  setSubmitting(form, true);

  try {
    if (!db) throw new Error('Supabase is not connected.');

    const roomTypeValue = document.getElementById('modalRoom').value;
    const checkIn = document.getElementById('modalCheckin').value;
    const checkOut = document.getElementById('modalCheckout').value;
    const nights = Math.max(1, Math.ceil((new Date(checkOut) - new Date(checkIn)) / 86400000));
    const matchedRoom = (window.roomTypesCache || []).find(rt => roomTypeValue.includes(rt.name));
    const total_amount = matchedRoom ? nights * Number(matchedRoom.price_per_night) : nights * 200;

    const { error } = await db.from('bookings').insert({
      reference: ref,
      check_in: checkIn,
      check_out: checkOut,
      guests: document.getElementById('modalGuests').value,
      room_type: roomTypeValue,
      first_name: document.getElementById('modalBookingFirstName').value.trim(),
      last_name: document.getElementById('modalBookingLastName').value.trim(),
      email: document.getElementById('modalBookingEmail').value.trim(),
      phone: document.getElementById('modalBookingPhone').value.trim() || null,
      special_requests: document.getElementById('modalBookingNotes').value.trim() || null,
      status: 'pending',
      total_amount
    });

    if (error) throw error;

    showToast(`✦ Reservation Confirmed! Reference: ${ref}`);
    form.reset();
    closeBooking();
  } catch (err) {
    console.error(err);
    showToast(`✦ ${supabaseErrorMessage(err)}`);
  } finally {
    setSubmitting(form, false);
  }
}

function closeModalOutside(e) {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// ====== RESTAURANT RESERVATION ======
function openReservation() {
  document.getElementById('restaurantModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeRestaurant() {
  document.getElementById('restaurantModal').classList.remove('open');
  document.body.style.overflow = '';
}
async function confirmRestaurant(e) {
  e.preventDefault();
  const form = e.target;
  setSubmitting(form, true);

  try {
    if (!db) throw new Error('Supabase is not connected.');

    const { error } = await db.from('restaurant_reservations').insert({
      restaurant: document.getElementById('restaurantSelect').value,
      reservation_date: document.getElementById('restaurantDate').value,
      reservation_time: document.getElementById('restaurantTime').value,
      guests: document.getElementById('restaurantGuests').value,
      guest_name: document.getElementById('restaurantName').value.trim(),
      phone: document.getElementById('restaurantPhone').value.trim(),
      status: 'pending'
    });

    if (error) throw error;

    showToast('✦ Table Reserved! You will receive a confirmation shortly.');
    form.reset();
    closeRestaurant();
  } catch (err) {
    console.error(err);
    showToast(`✦ ${supabaseErrorMessage(err)}`);
  } finally {
    setSubmitting(form, false);
  }
}

// ====== MENU MODAL ======
const MENU_RESTAURANTS = {
  habesha: 'Dima Habesha',
  maison: 'La Maison',
  skybar: 'Sky Bar'
};

let menuItemsCache = [];

async function loadMenuItems() {
  if (!db) return;
  const { data } = await db.from('menu_items').select('*').eq('is_active', true).order('sort_order');
  menuItemsCache = data || [];
}

function renderMenuItems(restaurantName) {
  const content = document.getElementById('menuContent');
  const items = menuItemsCache.filter(item => item.restaurant === restaurantName);
  const categories = [...new Set(items.map(item => item.category))];

  let html = '<div class="menu-section"><div class="menu-qr"><div class="qr-placeholder"><svg viewBox="0 0 100 100" fill="currentColor" width="120"><rect x="10" y="10" width="35" height="35" rx="3" fill="none" stroke="currentColor" stroke-width="4"/><rect x="18" y="18" width="19" height="19" fill="currentColor" opacity="0.3"/><rect x="55" y="10" width="35" height="35" rx="3" fill="none" stroke="currentColor" stroke-width="4"/><rect x="63" y="18" width="19" height="19" fill="currentColor" opacity="0.3"/><rect x="10" y="55" width="35" height="35" rx="3" fill="none" stroke="currentColor" stroke-width="4"/><rect x="18" y="63" width="19" height="19" fill="currentColor" opacity="0.3"/><rect x="55" y="55" width="10" height="10" fill="currentColor"/><rect x="70" y="55" width="10" height="10" fill="currentColor"/><rect x="55" y="70" width="10" height="10" fill="currentColor"/><rect x="70" y="70" width="10" height="10" fill="currentColor" opacity="0.5"/></svg><p>Scan to view full menu</p></div></div><div class="menu-items">';

  if (!categories.length) {
    html += '<div class="empty-state"><p>Menu items will appear here once added in the admin panel.</p></div>';
  } else {
    categories.forEach(category => {
      html += `<div class="menu-category"><h4>${category}</h4>`;
      items.filter(item => item.category === category).forEach(item => {
        html += `<div class="menu-item"><span>${item.name}</span><span>${item.price}</span></div>`;
      });
      html += '</div>';
    });
  }

  html += '</div></div>';
  content.innerHTML = html;
}

async function openMenu() {
  document.getElementById('menuModal').classList.add('open');
  document.body.style.overflow = 'hidden';
  await loadMenuItems();
  renderMenuItems(MENU_RESTAURANTS.habesha);
}
function closeMenu() {
  document.getElementById('menuModal').classList.remove('open');
  document.body.style.overflow = '';
}
function switchMenu(type, btn) {
  document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderMenuItems(MENU_RESTAURANTS[type]);
}

// ====== GALLERY ======
function openLightbox(el) {
  const img = el.querySelector('img');
  const caption = el.querySelector('.gallery-hover span');
  document.getElementById('lightboxImg').src = img.src;
  document.getElementById('lightboxCaption').textContent = caption ? caption.textContent : '';
  document.getElementById('lightbox').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
}

// Gallery filter
document.querySelectorAll('.gf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const filter = btn.dataset.filter;
    document.querySelectorAll('.gallery-item').forEach(item => {
      if (filter === 'all' || item.dataset.cat === filter) {
        item.style.display = 'block';
        item.style.animation = 'fadeUp 0.4s ease forwards';
      } else {
        item.style.display = 'none';
      }
    });
  });
});

// ====== TESTIMONIALS ======
let currentTestimonial = 0;
const testimonialTrack = document.getElementById('testimonialTrack');
const tnDots = document.querySelectorAll('.tn-dot');
const totalTestimonials = document.querySelectorAll('.testimonial-card').length;

function updateTestimonial() {
  if (!testimonialTrack) return;
  const cardWidth = testimonialTrack.querySelector('.testimonial-card')?.offsetWidth + 32 || 0;
  testimonialTrack.style.transform = `translateX(-${currentTestimonial * cardWidth}px)`;
  tnDots.forEach((d, i) => d.classList.toggle('active', i === currentTestimonial));
}

function nextTestimonial() {
  currentTestimonial = (currentTestimonial + 1) % totalTestimonials;
  updateTestimonial();
}
function prevTestimonial() {
  currentTestimonial = (currentTestimonial - 1 + totalTestimonials) % totalTestimonials;
  updateTestimonial();
}

tnDots.forEach((dot, i) => {
  dot.addEventListener('click', () => {
    currentTestimonial = i;
    updateTestimonial();
  });
});

setInterval(nextTestimonial, 6000);

// ====== LIVE CHAT ======
function toggleChat() {
  const win = document.getElementById('chatWindow');
  win.classList.toggle('open');
  const badge = document.querySelector('.chat-badge');
  if (badge) badge.style.display = 'none';
}

const chatReplies = [
  "Thank you for reaching out to Grand Dima Hotel! I'd be happy to assist you with that. 😊",
  "Of course! Our team is dedicated to making your stay absolutely perfect. Could you provide more details?",
  "Wonderful choice! I can arrange that for you right away. Is there anything else you'd like?",
  "Our concierge team is available 24/7 to assist you. Would you like me to connect you with them directly?",
  "Absolutely! Grand Dima prides itself on providing world-class service. Let me look into that for you.",
  "That's a great question! Allow me one moment to get you the most accurate information."
];
let replyIndex = 0;

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const messages = document.getElementById('chatMessages');
  const text = input.value.trim();
  if (!text) return;

  // User message
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  userMsg.innerHTML = `<p>${text}</p>`;
  messages.appendChild(userMsg);
  input.value = '';
  messages.scrollTop = messages.scrollHeight;

  // Bot reply
  setTimeout(() => {
    const botMsg = document.createElement('div');
    botMsg.className = 'chat-msg bot';
    botMsg.innerHTML = `<p>${chatReplies[replyIndex % chatReplies.length]}</p>`;
    messages.appendChild(botMsg);
    messages.scrollTop = messages.scrollHeight;
    replyIndex++;
  }, 900 + Math.random() * 500);
}

function handleChatKey(e) {
  if (e.key === 'Enter') sendChatMessage();
}

// ====== SEARCH ======
const searchData = [
  { title: 'Deluxe Room', type: 'Room', action: () => { document.getElementById('rooms').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'Junior Suite', type: 'Room', action: () => { document.getElementById('rooms').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'Grand Suite', type: 'Room', action: () => { document.getElementById('rooms').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'Presidential Suite', type: 'Room', action: () => { document.getElementById('rooms').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'Dima Habesha Restaurant', type: 'Dining', action: () => { document.getElementById('restaurant').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'La Maison Brasserie', type: 'Dining', action: () => { document.getElementById('restaurant').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'Sky Bar & Lounge', type: 'Dining', action: () => { document.getElementById('restaurant').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'Conference Centre', type: 'Amenity', action: () => { document.getElementById('amenities').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'Fitness Centre & Spa', type: 'Amenity', action: () => { document.getElementById('amenities').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'Airport Transfer', type: 'Service', action: () => { document.getElementById('amenities').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'Make a Reservation', type: 'Booking', action: () => openBooking() },
  { title: 'Contact Us', type: 'Info', action: () => { document.getElementById('contact').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'Gallery', type: 'Page', action: () => { document.getElementById('gallery').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'About Grand Dima', type: 'Page', action: () => { document.getElementById('about').scrollIntoView({ behavior: 'smooth' }); } },
  { title: 'Staff Portal', type: 'Admin', action: () => { window.location.href = 'admin.html'; } },
];

function openSearch() {
  document.getElementById('searchOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('searchInput').focus(), 100);
}
function closeSearch() {
  document.getElementById('searchOverlay').classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSearch();
    closeLightbox();
    document.getElementById('bookingModal').classList.remove('open');
    document.getElementById('restaurantModal').classList.remove('open');
    document.getElementById('menuModal').classList.remove('open');
    document.body.style.overflow = '';
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openSearch();
  }
});

function doSearch(query) {
  const results = document.getElementById('searchResults');
  if (!query.trim()) { results.innerHTML = ''; return; }
  const q = query.toLowerCase();
  const filtered = searchData.filter(item => item.title.toLowerCase().includes(q));
  if (filtered.length === 0) {
    results.innerHTML = '<div class="search-result-item">No results found</div>';
    return;
  }
  results.innerHTML = filtered.map(item =>
    `<div class="search-result-item" onclick="selectSearchResult(${searchData.indexOf(item)})">
      ${item.title}
      <span>${item.type}</span>
    </div>`
  ).join('');
}

function selectSearchResult(index) {
  closeSearch();
  setTimeout(() => searchData[index].action(), 300);
}

// ====== CONTACT FORM ======
async function submitContact(e) {
  e.preventDefault();
  const form = e.target;
  setSubmitting(form, true);

  try {
    if (!db) throw new Error('Supabase is not connected.');

    const { error } = await db.from('contact_messages').insert({
      first_name: document.getElementById('contactFirstName').value.trim(),
      last_name: document.getElementById('contactLastName').value.trim(),
      email: document.getElementById('contactEmail').value.trim(),
      subject: document.getElementById('contactSubject').value,
      message: document.getElementById('contactMessage').value.trim()
    });

    if (error) throw error;

    showToast('✦ Message sent! We will respond within 24 hours.');
    form.reset();
  } catch (err) {
    console.error(err);
    showToast(`✦ ${supabaseErrorMessage(err)}`);
  } finally {
    setSubmitting(form, false);
  }
}

async function subscribeNewsletter(e) {
  e.preventDefault();
  const form = e.target;
  setSubmitting(form, true);

  try {
    if (!db) throw new Error('Supabase is not connected.');

    const { error } = await db.from('newsletter_subscribers').insert({
      email: document.getElementById('newsletterEmail').value.trim()
    });

    if (error) throw error;

    showToast('✦ Subscribed! Welcome to the Grand Dima community.');
    form.reset();
  } catch (err) {
    console.error(err);
    showToast(`✦ ${supabaseErrorMessage(err)}`);
  } finally {
    setSubmitting(form, false);
  }
}

// ====== ROOM DETAIL ======
function openRoomDetail(slug) {
  const room = (window.roomTypesCache || []).find(rt => rt.slug === slug);
  if (room) {
    showToast(`${room.name}: ${room.description.slice(0, 90)}...`);
    return;
  }
  showToast('Room details are loading. Please try again in a moment.');
}

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
  // Set initial nav state
  if (window.scrollY > 80) nav.classList.add('scrolled');
});

// Resize testimonials
window.addEventListener('resize', updateTestimonial);