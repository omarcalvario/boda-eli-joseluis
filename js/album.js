import {
  fetchApprovedPhotos,
  formatFileSize,
  getAlbumUrl,
  getAnonymousSessionId,
  getErrorMessage,
  getEventContext,
  getPhotoUrl,
  getEventSlug,
  supabase,
  watchApprovedPhotos,
} from './album-core.js';
import { SUPABASE_ANON_KEY, SUPABASE_CONFIGURED, SUPABASE_URL } from './supabase-config.js';

const state = {
  client: supabase,
  context: null,
  photos: [],
  queue: [],
  watchStop: null,
  loadingPhotos: false,
};

const elements = {
  gallery: document.getElementById('gallery-grid'),
  galleryStatus: document.getElementById('gallery-status'),
  photoCount: document.getElementById('photo-count'),
  uploadQueue: document.getElementById('upload-queue'),
  uploadStatus: document.getElementById('upload-status'),
  uploadProgress: document.getElementById('upload-progress'),
  uploadButton: document.getElementById('upload-button'),
  cameraInput: document.getElementById('camera-input'),
  galleryInput: document.getElementById('gallery-input'),
  shareButton: document.getElementById('share-button'),
  message: document.getElementById('album-message'),
  lightbox: document.getElementById('lightbox'),
  lightboxImage: document.getElementById('lightbox-image'),
  lightboxClose: document.getElementById('lightbox-close'),
};

function setStatus(element, message, kind = '') {
  element.textContent = message;
  element.dataset.kind = kind;
}

function disableUploadControls() {
  elements.cameraInput.disabled = true;
  elements.galleryInput.disabled = true;
  elements.uploadButton.disabled = true;
}

function renderGallery() {
  elements.gallery.replaceChildren();
  elements.photoCount.textContent = `${state.photos.length} ${state.photos.length === 1 ? 'fotografía aprobada' : 'fotografías aprobadas'}`;
  if (!state.photos.length) {
    const empty = document.createElement('p');
    empty.className = 'album-empty';
    empty.textContent = 'Todavía no hay fotografías aprobadas. Sé la primera persona en compartir una.';
    elements.gallery.append(empty);
    return;
  }

  state.photos.forEach((photo, index) => {
    const frame = document.createElement('article');
    frame.className = 'album-photo';
    const button = document.createElement('button');
    button.className = 'album-photo-button';
    button.type = 'button';
    button.setAttribute('aria-label', `Abrir fotografía ${index + 1}`);
    button.addEventListener('click', () => openLightbox(photo));
    const image = document.createElement('img');
    image.src = getPhotoUrl(state.client, photo);
    image.alt = `Fotografía compartida ${index + 1}`;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = photo.width;
    image.height = photo.height;
    button.append(image);
    frame.append(button);
    elements.gallery.append(frame);
  });
}

async function refreshGallery(message = '') {
  if (state.loadingPhotos) return;
  state.loadingPhotos = true;
  if (message) setStatus(elements.galleryStatus, message);
  try {
    state.photos = await fetchApprovedPhotos(state.client, state.context.event.id);
    renderGallery();
    setStatus(elements.galleryStatus, 'Galería actualizada en tiempo real.', 'success');
  } catch (error) {
    setStatus(elements.galleryStatus, getErrorMessage(error, 'No se pudo cargar la galería.'), 'error');
  } finally {
    state.loadingPhotos = false;
  }
}

function openLightbox(photo) {
  elements.lightboxImage.src = getPhotoUrl(state.client, photo);
  elements.lightboxImage.alt = 'Fotografía de la boda';
  if (typeof elements.lightbox.showModal === 'function') elements.lightbox.showModal();
}

function closeLightbox() {
  if (elements.lightbox.open) elements.lightbox.close();
  elements.lightboxImage.removeAttribute('src');
}

function fileBaseName(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 50) || 'fotografia';
}

async function preparePhoto(file, allowedTypes) {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = sourceUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('La imagen no tiene dimensiones válidas.');

    const maxDimension = 2400;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Este navegador no puede procesar la imagen.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const outputType = allowedTypes.includes('image/jpeg')
      ? 'image/jpeg'
      : allowedTypes.includes(file.type) ? file.type : allowedTypes[0];
    if (!allowedTypes.includes(outputType)) throw new Error('El formato de esta fotografía no está permitido por el álbum.');
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outputType, .86));
    if (!blob) throw new Error('No se pudo preparar la imagen.');
    const extension = outputType === 'image/png' ? 'png' : outputType === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `${fileBaseName(file.name)}.${extension}`, { type: outputType, lastModified: Date.now() });
  } catch (error) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.heic') || name.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
      throw new Error('Este navegador entregó una imagen HEIC/HEIF que no pudo convertirse. En iPhone, cambia Cámara > Formatos a Más compatible o elige un JPEG.');
    }
    throw error;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function renderQueue() {
  elements.uploadQueue.replaceChildren();
  const readyCount = state.queue.filter((item) => item.status === 'ready' || item.status === 'error').length;
  elements.uploadButton.disabled = !readyCount || state.queue.some((item) => item.status === 'uploading');

  state.queue.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'album-queue-item';
    const preview = document.createElement('img');
    preview.src = item.previewUrl;
    preview.alt = '';
    const details = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'album-queue-name';
    name.textContent = item.file.name;
    const meta = document.createElement('div');
    meta.className = 'album-queue-meta';
    const labels = {
      preparing: 'Preparando…', ready: formatFileSize(item.file.size), uploading: `Subiendo… ${item.progress}%`,
      done: item.serverStatus === 'approved' ? 'Publicada' : 'Enviada para revisión', error: item.error || 'No se pudo subir',
    };
    meta.textContent = labels[item.status] || item.status;
    details.append(name, meta);
    const action = document.createElement('button');
    action.className = 'album-queue-remove';
    action.type = 'button';
    if (item.status === 'error') {
      action.textContent = 'Reintentar';
      action.addEventListener('click', () => uploadItem(item));
    } else if (item.status !== 'uploading' && item.status !== 'done') {
      action.textContent = 'Quitar';
      action.addEventListener('click', () => removeQueueItem(item.id));
    } else {
      action.hidden = true;
    }
    row.append(preview, details, action);
    elements.uploadQueue.append(row);
  });
}

async function addFiles(fileList) {
  const files = [...fileList];
  const maximum = state.context.settings?.max_files_per_upload ?? 5;
  const remaining = Math.max(0, maximum - state.queue.filter((item) => item.status !== 'done').length);
  if (files.length > remaining) {
    setStatus(elements.uploadStatus, `Puedes preparar hasta ${maximum} fotografías por envío.`, 'error');
  }
  for (const file of files.slice(0, remaining)) {
    const item = { id: crypto.randomUUID(), file, status: 'preparing', progress: 0, previewUrl: URL.createObjectURL(file) };
    state.queue.push(item);
    renderQueue();
    try {
      const allowedTypes = state.context.settings?.allowed_mime_types ?? ['image/jpeg', 'image/png', 'image/webp'];
      item.file = await preparePhoto(file, allowedTypes);
      const maxSize = Number(state.context.settings?.max_file_size ?? 10485760);
      if (item.file.size > maxSize) throw new Error(`La fotografía preparada supera el máximo de ${formatFileSize(maxSize)}.`);
      URL.revokeObjectURL(item.previewUrl);
      item.previewUrl = URL.createObjectURL(item.file);
      item.status = 'ready';
    } catch (error) {
      item.status = 'error';
      item.error = getErrorMessage(error, 'No se pudo preparar la fotografía.');
    }
    renderQueue();
  }
}

function removeQueueItem(id) {
  const item = state.queue.find((entry) => entry.id === id);
  if (item) URL.revokeObjectURL(item.previewUrl);
  state.queue = state.queue.filter((entry) => entry.id !== id);
  renderQueue();
}

function uploadOne(item) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const form = new FormData();
    form.append('event_slug', getEventSlug());
    form.append('anonymous_session', getAnonymousSessionId());
    form.append('files', item.file, item.file.name);
    request.open('POST', `${SUPABASE_URL}/functions/v1/submit-photo`);
    request.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    request.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        item.progress = Math.round((event.loaded / event.total) * 100);
        renderQueue();
      }
    });
    request.addEventListener('load', () => {
      let payload;
      try { payload = JSON.parse(request.responseText); } catch { payload = {}; }
      if (request.status >= 200 && request.status < 300 && payload.results?.[0]?.id) {
        resolve(payload.results[0]);
      } else {
        reject(new Error(payload.results?.[0]?.error || payload.error || 'No se pudo subir la fotografía.'));
      }
    });
    request.addEventListener('error', () => reject(new Error('No hay conexión. Intenta de nuevo.')));
    request.addEventListener('timeout', () => reject(new Error('La subida tardó demasiado.')));
    request.timeout = 120000;
    request.send(form);
  });
}

async function uploadItem(item) {
  if (!item.file || item.status === 'uploading' || item.status === 'done') return;
  item.status = 'uploading';
  item.error = '';
  item.progress = 0;
  renderQueue();
  const total = state.queue.filter((entry) => entry.status !== 'done').length;
  const completed = state.queue.filter((entry) => entry.status === 'done').length;
  setStatus(elements.uploadStatus, `Subiendo fotografía ${completed + 1} de ${completed + total}…`);
  try {
    const result = await uploadOne(item);
    item.status = 'done';
    item.serverStatus = result.status;
    item.progress = 100;
    setStatus(elements.uploadStatus, result.status === 'approved' ? 'La fotografía ya está en la galería.' : 'La fotografía fue enviada para revisión.', 'success');
  } catch (error) {
    item.status = 'error';
    item.error = getErrorMessage(error);
    setStatus(elements.uploadStatus, item.error, 'error');
  }
  renderQueue();
  const done = state.queue.filter((entry) => entry.status === 'done').length;
  const progress = state.queue.length ? Math.round((done / state.queue.length) * 100) : 0;
  elements.uploadProgress.style.width = `${progress}%`;
}

async function uploadAll() {
  const pending = state.queue.filter((item) => item.status === 'ready');
  for (const item of pending) await uploadItem(item);
}

async function shareAlbum() {
  const url = getAlbumUrl();
  const shareData = { title: 'Álbum de Eli & José Luis', text: 'Comparte y mira las fotografías de la boda.', url };
  try {
    if (navigator.share) await navigator.share(shareData);
    else throw new Error('fallback');
  } catch (error) {
    if (error?.name === 'AbortError') return;
    await navigator.clipboard?.writeText(url);
    setStatus(elements.galleryStatus, 'Enlace copiado al portapapeles.', 'success');
  }
}

async function initialize() {
  if (!SUPABASE_CONFIGURED || !state.client) {
    disableUploadControls();
    setStatus(elements.galleryStatus, 'El álbum está pendiente de configuración.', 'error');
    setStatus(elements.uploadStatus, 'Falta configurar la instancia independiente de Supabase.', 'error');
    return;
  }
  try {
    state.context = await getEventContext(state.client);
    elements.message.textContent = state.context.settings?.share_message || elements.message.textContent;
    if (state.context.event.status !== 'active') {
      disableUploadControls();
      setStatus(elements.uploadStatus, 'El álbum está cerrado para nuevos envíos.');
    }
    await refreshGallery();
    state.watchStop = watchApprovedPhotos({
      client: state.client,
      eventId: state.context.event.id,
      onChange: () => refreshGallery(),
      onStatus: (status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setStatus(elements.galleryStatus, 'Reconectando la galería…');
      },
    });
  } catch (error) {
    disableUploadControls();
    setStatus(elements.galleryStatus, getErrorMessage(error, 'No se pudo abrir el álbum.'), 'error');
  }
}

elements.cameraInput.addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });
elements.galleryInput.addEventListener('change', (event) => { addFiles(event.target.files); event.target.value = ''; });
elements.uploadButton.addEventListener('click', uploadAll);
elements.shareButton.addEventListener('click', shareAlbum);
elements.lightboxClose.addEventListener('click', closeLightbox);
elements.lightbox.addEventListener('click', (event) => { if (event.target === elements.lightbox) closeLightbox(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeLightbox(); });

initialize();
