# Clarifications: Álbum colaborativo de fotos

**Date**: 2026-09-29  
**Specification**: [spec.md](spec.md)

## Q1. Acceso por estado del evento

**Pregunta**: ¿Qué debe pasar con la galería cuando el evento cambia de estado?

**Respuesta**: `active` permite ver y subir fotografías; `closed` conserva la
galería pública pero bloquea nuevas subidas; `draft` y `archived` no son
visibles al público.

**Registrado en**: User Story 3, Edge Cases, FR-025 y Assumptions.

## Q2. Configuración que puede cambiar admin

**Pregunta**: ¿Qué configuración debe poder cambiar admin?

**Respuesta**: Admin puede cambiar el mensaje público y los límites de subida:
tamaño máximo por fotografía y cantidad máxima por envío. Owner conserva el
control del modo de publicación, formatos permitidos y datos del evento.

**Registrado en**: User Stories 2 y 4, FR-013 y Assumptions.

## Q3. Retención de fotografías

**Pregunta**: ¿Cuánto tiempo deben conservarse fotografías y registros?

**Respuesta**: Se conservan hasta que un admin o owner los elimine; no hay
borrado automático por antigüedad.

**Registrado en**: Edge Cases, FR-026 y Assumptions.
