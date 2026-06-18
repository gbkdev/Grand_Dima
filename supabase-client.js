window.createSupabaseClient = function () {
  if (typeof supabase === 'undefined' || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    return null;
  }
  return supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
};

window.formatDate = function (d) {
  return d.toISOString().split('T')[0];
};

window.formatDisplayDate = function (value) {
  if (!value) return '—';
  return new Date(value + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

window.formatDateTime = function (value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

window.supabaseErrorMessage = function (error) {
  if (!error) return 'Something went wrong. Please try again.';
  if (error.code === '23505') return 'This record already exists.';
  if (error.code === 'PGRST205' || error.code === '42P01') {
    return 'Database not set up yet. Run supabase-schema.sql in Supabase.';
  }
  if (error.message === 'Invalid login credentials') return 'Invalid email or password.';
  return error.message || 'Something went wrong. Please try again.';
};

window.showToast = function (message, type) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast show' + (type === 'error' ? ' toast-error' : '');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
};
