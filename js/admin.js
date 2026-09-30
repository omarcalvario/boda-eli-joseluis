import {
  getAlbumUrl,
  getErrorMessage,
  getEventContext,
  getPhotoUrl,
  invokeFunction,
  supabase,
} from './album-core.js';
import { SUPABASE_CONFIGURED } from './supabase-config.js';

const state = { context: null, membership: null, photos: [], filter: 'pending', previewUrls: new Map(), initializing: false, initialized: false, membershipTimer: null };
const el = {
  loginPanel: document.getElementById('login-panel'), loginForm: document.getElementById('login-form'), loginEmail: document.getElementById('login-email'), loginStatus: document.getElementById('login-status'),
  dashboard: document.getElementById('dashboard'), status: document.getElementById('admin-status'), logout: document.getElementById('logout-button'), share: document.getElementById('share-admin-button'),
  total: document.getElementById('stat-total'), pending: document.getElementById('stat-pending'), approved: document.getElementById('stat-approved'), rejected: document.getElementById('stat-rejected'), eventName: document.getElementById('event-name'), eventDate: document.getElementById('event-date'), eventStatus: document.getElementById('event-status'), saveEvent: document.getElementById('save-event'),
  list: document.getElementById('photo-list'), filter: document.getElementById('photo-filter'), mode: document.getElementById('publication-mode'), message: document.getElementById('share-message'), maxFileSize: document.getElementById('max-file-size'), maxFilesPerUpload: document.getElementById('max-files-per-upload'), allowedTypes: [...document.querySelectorAll('input[name="allowed-mime-type"]')], allowedTypesFieldset: document.getElementById('allowed-types-fieldset'), saveSettings: document.getElementById('save-settings'), settingsStatus: document.getElementById('settings-status'),
  qr: document.getElementById('qr-container'), showQr: document.getElementById('show-qr'), downloadQr: document.getElementById('download-qr'), printQr: document.getElementById('print-qr'), adminsPanel: document.getElementById('admins-panel'), adminForm: document.getElementById('admin-form'), adminEmail: document.getElementById('admin-email'), adminRole: document.getElementById('admin-role'), adminList: document.getElementById('admin-list'), adminsStatus: document.getElementById('admins-status'),
};

function setStatus(node, message, kind = '') {
  node.textContent = message;
  node.dataset.kind = kind;
}

function isOwner() { return state.membership?.role === 'owner'; }

function dateForInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function sendMagicLink(event) {
  event.preventDefault();
  if (!supabase) return;
  setStatus(el.loginStatus, 'Enviando enlace…');
  const { error } = await supabase.auth.signInWithOtp({
    email: el.loginEmail.value.trim(),
    options: { emailRedirectTo: window.location.href },
  });
  setStatus(el.loginStatus, error ? getErrorMessage(error) : 'Revisa tu correo para continuar.', error ? 'error' : 'success');
}

async function resolveUser() {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return false;
  state.context = await getEventContext(supabase);
  const { data: membership, error } = await supabase.from('album_admins').select('id, role, user_id')
    .eq('event_id', state.context.event.id).eq('user_id', userData.user.id).maybeSingle();
  if (error || !membership) throw new Error('Tu cuenta no tiene acceso a este evento.');
  state.membership = membership;
  return true;
}

async function loadStats() {
  const eventId = state.context.event.id;
  const countFor = async (status) => {
    let query = supabase.from('photos').select('id', { count: 'exact', head: true }).eq('event_id', eventId);
    if (status) query = query.eq('status', status);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  };
  const [total, pending, approved, rejected] = await Promise.all([countFor(), countFor('pending'), countFor('approved'), countFor('rejected')]);
  el.total.textContent = total;
  el.pending.textContent = pending;
  el.approved.textContent = approved;
  el.rejected.textContent = rejected;
}

async function getPreviewUrl(photo) {
  if (photo.status === 'approved') return getPhotoUrl(supabase, photo);
  if (photo.status !== 'pending') return '';
  if (state.previewUrls.has(photo.id)) return state.previewUrls.get(photo.id);
  try {
    const result = await invokeFunction(supabase, 'moderate-photo', { action: 'preview', photo_id: photo.id, event_id: photo.event_id });
    state.previewUrls.set(photo.id, result.url);
    return result.url;
  } catch {
    return '';
  }
}

function createButton(text, action, photoId, danger = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.dataset.action = action;
  button.dataset.photoId = photoId;
  if (danger) button.className = 'admin-danger';
  return button;
}

async function renderPhotos() {
  el.list.replaceChildren();
  const photos = state.photos.filter((photo) => state.filter === 'all' || photo.status === state.filter);
  if (!photos.length) {
    const empty = document.createElement('p');
    empty.className = 'album-empty';
    empty.textContent = 'No hay fotografías en este filtro.';
    el.list.append(empty);
    return;
  }
  for (const photo of photos) {
    const row = document.createElement('article');
    row.className = 'admin-photo';
    const image = document.createElement('img');
    image.alt = '';
    const url = await getPreviewUrl(photo);
    if (url) image.src = url;
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = photo.original_filename || 'Fotografía sin nombre';
    const meta = document.createElement('div');
    meta.className = 'admin-photo-meta';
    meta.textContent = `${photo.status} · ${new Date(photo.created_at).toLocaleString('es-MX')}`;
    details.append(name, meta);
    const actions = document.createElement('div');
    actions.className = 'admin-photo-actions';
    if (photo.status === 'pending') {
      actions.append(createButton('Aprobar', 'approve', photo.id), createButton('Rechazar', 'reject', photo.id));
    }
    if (['owner', 'admin'].includes(state.membership.role)) actions.append(createButton('Eliminar', 'delete', photo.id, true));
    row.append(image, details, actions);
    el.list.append(row);
  }
}

async function loadPhotos() {
  const { data, error } = await supabase.from('photos').select('id, event_id, status, published_path, storage_path, original_filename, mime_type, width, height, created_at')
    .eq('event_id', state.context.event.id).order('created_at', { ascending: false }).range(0, 499);
  if (error) throw error;
  state.photos = data ?? [];
  await renderPhotos();
}

async function moderate(action, photoId) {
  setStatus(el.status, 'Guardando cambio…');
  try {
    await invokeFunction(supabase, 'moderate-photo', { action, photo_id: photoId, event_id: state.context.event.id });
    await Promise.all([loadStats(), loadPhotos()]);
    setStatus(el.status, action === 'approve' ? 'Fotografía aprobada.' : action === 'reject' ? 'Fotografía rechazada.' : 'Fotografía eliminada.', 'success');
  } catch (error) {
    setStatus(el.status, getErrorMessage(error), 'error');
  }
}

async function saveSettings() {
  el.saveSettings.disabled = true;
  try {
    const maxFileSize = Math.round(Number(el.maxFileSize.value) * 1024 * 1024);
    const maxFilesPerUpload = Number(el.maxFilesPerUpload.value);
    if (!Number.isFinite(maxFileSize) || maxFileSize < 1024 || maxFileSize > 10 * 1024 * 1024) {
      throw new Error('El tamaño máximo debe estar entre 0.001 y 10 MiB.');
    }
    if (!Number.isInteger(maxFilesPerUpload) || maxFilesPerUpload < 1 || maxFilesPerUpload > 20) {
      throw new Error('La cantidad debe estar entre 1 y 20 fotografías.');
    }
    const updates = {
      share_message: el.message.value.trim(),
      max_file_size: maxFileSize,
      max_files_per_upload: maxFilesPerUpload,
    };
    if (isOwner()) {
      const allowedMimeTypes = el.allowedTypes.filter((input) => input.checked).map((input) => input.value);
      if (!allowedMimeTypes.length) throw new Error('Selecciona al menos un formato permitido.');
      updates.publication_mode = el.mode.value;
      updates.allowed_mime_types = allowedMimeTypes;
    }
    const { error } = await supabase.from('album_settings').update(updates).eq('event_id', state.context.event.id);
    if (error) throw error;
    Object.assign(state.context.settings, updates);
    setStatus(el.settingsStatus, 'Configuración guardada.', 'success');
  } catch (error) {
    setStatus(el.settingsStatus, getErrorMessage(error), 'error');
  } finally {
    el.saveSettings.disabled = false;
  }
}

async function saveEvent() {
  if (!isOwner()) return;
  el.saveEvent.disabled = true;
  try {
    const { error } = await supabase.from('events').update({
      name: el.eventName.value.trim(),
      event_date: el.eventDate.value ? new Date(el.eventDate.value).toISOString() : null,
      status: el.eventStatus.value,
    }).eq('id', state.context.event.id);
    if (error) throw error;
    state.context.event.name = el.eventName.value.trim();
    state.context.event.event_date = el.eventDate.value;
    state.context.event.status = el.eventStatus.value;
    setStatus(el.settingsStatus, 'Evento guardado.', 'success');
  } catch (error) {
    setStatus(el.settingsStatus, getErrorMessage(error), 'error');
  } finally {
    el.saveEvent.disabled = false;
  }
}

async function shareAlbum() {
  const url = getAlbumUrl();
  try {
    if (navigator.share) await navigator.share({ title: 'Álbum de Eli & José Luis', text: 'Mira las fotografías de la boda.', url });
    else throw new Error('fallback');
  } catch (error) {
    if (error?.name === 'AbortError') return;
    await copyAlbumUrl(url);
  }
}

async function copyAlbumUrl(url = getAlbumUrl()) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      setStatus(el.status, 'Enlace copiado al portapapeles.', 'success');
      return;
    }
  } catch {
    // Continue with the legacy selection/copy fallback.
  }

  const input = document.createElement('textarea');
  input.value = url;
  input.setAttribute('readonly', '');
  input.className = 'copy-url-fallback';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (copied) setStatus(el.status, 'Enlace copiado al portapapeles.', 'success');
  else window.prompt('Copia el enlace del álbum:', url);
}

function showQr() {
  if (typeof window.qrcode !== 'function') {
    setStatus(el.status, 'No se pudo cargar el generador de QR.', 'error');
    return;
  }
  const qr = window.qrcode(0, 'M');
  qr.addData(getAlbumUrl());
  qr.make();
  el.qr.replaceChildren();
  el.qr.insertAdjacentHTML('beforeend', qr.createSvgTag(5, 0));
  const svg = el.qr.querySelector('svg');
  svg?.setAttribute('role', 'img');
  svg?.setAttribute('aria-label', 'Código QR para abrir el álbum de fotografías');
  el.qr.hidden = false;
  el.downloadQr.hidden = false;
  el.printQr.hidden = false;
}

function downloadQr() {
  const svg = el.qr.querySelector('svg');
  if (!svg) return;
  const blob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'qr-album-eli-jose-luis.svg';
  link.click();
  URL.revokeObjectURL(link.href);
}

function printQr() {
  if (!el.qr.querySelector('svg')) return;
  document.body.classList.add('printing-qr');
  window.print();
  window.setTimeout(() => document.body.classList.remove('printing-qr'), 1000);
}

async function loadAdmins() {
  if (!isOwner()) return;
  el.adminsPanel.hidden = false;
  try {
    const result = await invokeFunction(supabase, 'manage-admin', { action: 'list', event_id: state.context.event.id });
    const table = document.createElement('table');
    table.className = 'admin-table';
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    ['Correo', 'Rol', 'Acción'].forEach((text) => { const cell = document.createElement('th'); cell.textContent = text; headRow.append(cell); });
    head.append(headRow);
    const body = document.createElement('tbody');
    for (const member of result.administrators ?? []) {
      const row = document.createElement('tr');
      const email = document.createElement('td'); email.textContent = member.email || 'Invitación pendiente';
      const role = document.createElement('td'); role.textContent = member.role;
      const action = document.createElement('td');
      if (member.role !== 'owner') {
        const revoke = document.createElement('button'); revoke.className = 'admin-queue-remove'; revoke.type = 'button'; revoke.textContent = 'Revocar'; revoke.dataset.revoke = member.user_id;
        action.append(revoke);
      }
      row.append(email, role, action); body.append(row);
    }
    table.append(head, body);
    el.adminList.replaceChildren(table);
  } catch (error) {
    setStatus(el.adminsStatus, getErrorMessage(error), 'error');
  }
}

async function addAdmin(event) {
  event.preventDefault();
  try {
    await invokeFunction(supabase, 'manage-admin', { action: 'add', event_id: state.context.event.id, email: el.adminEmail.value, role: el.adminRole.value });
    el.adminForm.reset();
    setStatus(el.adminsStatus, 'Acceso agregado. Se enviará un enlace de invitación si es necesario.', 'success');
    await loadAdmins();
  } catch (error) {
    setStatus(el.adminsStatus, getErrorMessage(error), 'error');
  }
}

async function revokeAdmin(userId) {
  try {
    await invokeFunction(supabase, 'manage-admin', { action: 'revoke', event_id: state.context.event.id, user_id: userId });
    await loadAdmins();
    setStatus(el.adminsStatus, 'Acceso revocado.', 'success');
  } catch (error) {
    setStatus(el.adminsStatus, getErrorMessage(error), 'error');
  }
}

async function initializeDashboard() {
  if (state.initializing) return;
  state.initializing = true;
  if (!SUPABASE_CONFIGURED || !supabase) {
    setStatus(el.loginStatus, 'Falta configurar la instancia independiente de Supabase.', 'error');
    state.initializing = false;
    return;
  }
  try {
    if (!await resolveUser()) {
      clearAdministrativeState('Inicia sesión para administrar el evento.');
      return;
    }
    el.loginPanel.hidden = true;
    el.dashboard.hidden = false;
    el.mode.value = state.context.settings?.publication_mode || 'manual';
    el.message.value = state.context.settings?.share_message || '';
    el.maxFileSize.value = (Number(state.context.settings?.max_file_size || 10485760) / (1024 * 1024)).toString();
    el.maxFilesPerUpload.value = String(state.context.settings?.max_files_per_upload || 5);
    const allowedTypes = state.context.settings?.allowed_mime_types || ['image/jpeg', 'image/png', 'image/webp'];
    el.allowedTypes.forEach((input) => { input.checked = allowedTypes.includes(input.value); });
    el.eventName.value = state.context.event.name || '';
    el.eventDate.value = dateForInput(state.context.event.event_date);
    el.eventStatus.value = state.context.event.status || 'active';
    el.eventName.disabled = !isOwner();
    el.eventDate.disabled = !isOwner();
    el.eventStatus.disabled = !isOwner();
    el.saveEvent.disabled = !isOwner();
    el.mode.disabled = !isOwner();
    const canConfigure = ['owner', 'admin'].includes(state.membership.role);
    el.message.disabled = !canConfigure;
    el.maxFileSize.disabled = !canConfigure;
    el.maxFilesPerUpload.disabled = !canConfigure;
    el.saveSettings.disabled = !canConfigure;
    el.allowedTypesFieldset.disabled = !isOwner();
    await Promise.all([loadStats(), loadPhotos(), loadAdmins()]);
    state.initialized = true;
    if (!state.membershipTimer) state.membershipTimer = window.setInterval(checkMembership, 15000);
  } catch (error) {
    setStatus(el.loginStatus, getErrorMessage(error), 'error');
    clearAdministrativeState('No se pudo verificar tu acceso.');
  } finally {
    state.initializing = false;
  }
}

function clearAdministrativeState(message) {
  state.membership = null;
  state.photos = [];
  state.context = null;
  state.initialized = false;
  for (const url of state.previewUrls.values()) URL.revokeObjectURL(url);
  state.previewUrls.clear();
  el.list.replaceChildren();
  el.adminList.replaceChildren();
  el.adminsPanel.hidden = true;
  el.dashboard.hidden = true;
  el.loginPanel.hidden = false;
  el.total.textContent = '0';
  el.pending.textContent = '0';
  el.approved.textContent = '0';
  el.rejected.textContent = '0';
  el.eventName.value = '';
  el.eventDate.value = '';
  el.eventStatus.value = 'draft';
  el.mode.value = 'manual';
  el.message.value = '';
  el.maxFileSize.value = '';
  el.maxFilesPerUpload.value = '';
  el.allowedTypes.forEach((input) => { input.checked = false; });
  el.adminForm.reset();
  el.status.textContent = '';
  el.settingsStatus.textContent = '';
  el.adminsStatus.textContent = '';
  el.qr.replaceChildren();
  el.qr.hidden = true;
  el.downloadQr.hidden = true;
  el.printQr.hidden = true;
  setStatus(el.loginStatus, message, 'error');
}

async function checkMembership() {
  if (!state.initialized || !state.context || document.visibilityState === 'hidden') return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      clearAdministrativeState('Tu sesión terminó. Inicia sesión nuevamente.');
      return;
    }
    const { data: membership, error } = await supabase.from('album_admins').select('id, role, user_id')
      .eq('event_id', state.context.event.id).eq('user_id', userData.user.id).maybeSingle();
    if (error || !membership) {
      clearAdministrativeState('Tu acceso a este evento fue revocado.');
      return;
    }
    if (membership.role !== state.membership?.role) await initializeDashboard();
  } catch {
    // Transient network failures do not grant new permissions; Edge Functions
    // and RLS remain the authority for every privileged action.
  }
}

el.loginForm.addEventListener('submit', sendMagicLink);
el.logout.addEventListener('click', () => supabase.auth.signOut().then(() => window.location.reload()));
el.share.addEventListener('click', shareAlbum);
el.filter.addEventListener('change', () => { state.filter = el.filter.value; renderPhotos(); });
el.saveSettings.addEventListener('click', saveSettings);
el.saveEvent.addEventListener('click', saveEvent);
el.showQr.addEventListener('click', showQr);
el.downloadQr.addEventListener('click', downloadQr);
el.printQr.addEventListener('click', printQr);
el.adminForm.addEventListener('submit', addAdmin);
el.list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (button) moderate(button.dataset.action, button.dataset.photoId);
});
el.adminList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-revoke]');
  if (button && window.confirm('¿Revocar el acceso de este administrador?')) revokeAdmin(button.dataset.revoke);
});

initializeDashboard();
supabase?.auth.onAuthStateChange((event) => {
  if (['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
    window.setTimeout(() => {
      if (event === 'SIGNED_OUT') clearAdministrativeState('La sesión se cerró.');
      else void initializeDashboard();
    }, 0);
  }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkMembership(); });
