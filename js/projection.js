import {
  fetchApprovedPhotos,
  getErrorMessage,
  getEventContext,
  getPhotoUrl,
  supabase,
  watchApprovedPhotos,
} from './album-core.js';
import { SUPABASE_CONFIGURED } from './supabase-config.js';

const image = document.getElementById('projection-photo');
const empty = document.getElementById('projection-empty');
const fullscreen = document.getElementById('projection-fullscreen');
const pauseButton = document.getElementById('projection-pause');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = { photos: [], index: 0, timer: null, paused: reducedMotion.matches, stopWatch: null, context: null, renderToken: 0 };

function updatePauseControl() {
  pauseButton.textContent = reducedMotion.matches ? 'Pausado: movimiento reducido' : state.paused ? 'Continuar' : 'Pausar';
  pauseButton.setAttribute('aria-pressed', String(state.paused || reducedMotion.matches));
}

function setImage(photo) {
  const token = ++state.renderToken;
  if (!photo) {
    image.classList.remove('is-visible');
    image.removeAttribute('src');
    empty.hidden = false;
    return;
  }
  image.classList.remove('is-visible');
  window.setTimeout(() => {
    if (token !== state.renderToken) return;
    image.src = getPhotoUrl(supabase, photo);
    image.alt = 'Fotografía de Eli y José Luis';
    image.onload = () => {
      if (token !== state.renderToken) return;
      empty.hidden = true;
      image.classList.add('is-visible');
    };
  }, 100);
}

function scheduleNext() {
  if (state.timer) window.clearTimeout(state.timer);
  if (state.paused || reducedMotion.matches || !state.photos.length) return;
  state.timer = window.setTimeout(() => {
    state.index = (state.index + 1) % state.photos.length;
    setImage(state.photos[state.index]);
    scheduleNext();
  }, 7000);
}

function replacePhotos(photos) {
  const currentId = state.photos[state.index]?.id;
  state.photos = photos.slice(0, 200);
  const nextIndex = Math.max(0, state.photos.findIndex((photo) => photo.id === currentId));
  state.index = nextIndex;
  setImage(state.photos[state.index]);
  scheduleNext();
}

async function refresh() {
  try {
    replacePhotos(await fetchApprovedPhotos(supabase, state.context.event.id));
  } catch (error) {
    empty.textContent = getErrorMessage(error, 'No se pudo cargar la proyección.');
    empty.hidden = false;
  }
}

async function initialize() {
  if (!SUPABASE_CONFIGURED || !supabase) {
    empty.textContent = 'La proyección está pendiente de configuración.';
    return;
  }
  try {
    state.context = await getEventContext(supabase);
    await refresh();
    state.stopWatch = watchApprovedPhotos({ client: supabase, eventId: state.context.event.id, onChange: refresh });
  } catch (error) {
    empty.textContent = getErrorMessage(error, 'No se pudo abrir la proyección.');
  }
}

function onMotionPreferenceChange(event) {
  if (event.matches) {
    state.paused = true;
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = null;
  }
  updatePauseControl();
  scheduleNext();
}

fullscreen.addEventListener('click', async () => {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
});

pauseButton.addEventListener('click', () => {
  if (reducedMotion.matches) return;
  state.paused = !state.paused;
  updatePauseControl();
  scheduleNext();
});

reducedMotion.addEventListener?.('change', onMotionPreferenceChange);
updatePauseControl();
initialize();
