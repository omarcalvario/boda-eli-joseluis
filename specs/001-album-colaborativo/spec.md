# Specification: Álbum colaborativo de fotos

**Feature Branch**: `001-album-colaborativo`  
**Created**: 2026-09-29  
**Status**: Ready for planning  
**Input**: Solicitud para crear un álbum colaborativo independiente para el sitio de boda Eli & José Luis.

## User Scenarios & Testing

### User Story 1 - Compartir fotografías sin cuenta (Priority: P1)

Un invitado abre el álbum desde un QR o enlace en el navegador del teléfono,
elige tomar una fotografía o seleccionar imágenes de su galería y puede revisar
una vista previa antes de enviarlas. No necesita crear una cuenta, instalar una
aplicación ni proporcionar datos personales.

**Why this priority**: La participación sencilla desde el teléfono es el
propósito central del álbum.

**Independent Test**: Abrir el enlace en un navegador móvil sin sesión, tomar o
seleccionar imágenes, retirar una de la vista previa y completar el envío sin
introducir nombre, correo ni teléfono.

**Acceptance Scenarios**:

1. **Given** que un invitado abre el QR o enlace, **When** carga el álbum,
   **Then** puede acceder a las acciones para tomar una fotografía y elegir
   imágenes de la galería sin autenticarse.
2. **Given** que el invitado selecciona imágenes compatibles, **When** aparece
   la vista previa, **Then** puede revisar y retirar individualmente cualquier
   imagen antes de enviarla.
3. **Given** que una imagen no puede prepararse o enviarse, **When** se informa
   el error, **Then** el invitado puede volver a intentar esa imagen sin tener
   que seleccionar otra vez las demás.
4. **Given** que el invitado está usando Safari en iPhone o Chrome en Android,
   **When** abre la experiencia desde el navegador, **Then** puede completar el
   flujo sin instalar software adicional.

### User Story 2 - Revisar y publicar fotografías (Priority: P1)

Un administrador autorizado revisa fotografías recibidas y decide cuáles se
publican. El evento también puede configurarse para publicar automáticamente.

**Why this priority**: La moderación protege la galería pública y permite que
la pareja controle el contenido compartido.

**Independent Test**: Iniciar sesión como cada rol, revisar una fotografía
pendiente, aprobarla o rechazarla y verificar el acceso permitido según el
rol.

**Acceptance Scenarios**:

1. **Given** una fotografía nueva y el modo manual, **When** se completa el
   envío, **Then** permanece pendiente y no es visible para invitados.
2. **Given** una fotografía pendiente, **When** un moderator la aprueba o
   rechaza, **Then** el estado cambia y el moderator no puede cambiar la
   configuración ni administrar otros usuarios.
3. **Given** una fotografía pendiente, **When** un admin la modera, **Then**
   puede aprobarla, rechazarla o eliminarla.
4. **Given** el modo automático, **When** una imagen válida se recibe,
   **Then** queda aprobada y se publica sin revisión manual.
5. **Given** un usuario sin relación autorizada con el evento, **When** intenta
   una acción administrativa, **Then** la acción es denegada.

### User Story 3 - Ver una galería que se actualiza en vivo (Priority: P1)

Los invitados ven únicamente fotografías aprobadas. Cuando se aprueba una
fotografía, las galerías abiertas se actualizan sin recargar la página.

**Why this priority**: Ver el álbum crecer durante la celebración hace que la
experiencia sea colaborativa y útil durante el evento.

**Independent Test**: Mantener dos galerías abiertas, aprobar o publicar una
fotografía y verificar que ambas muestran el cambio sin recarga manual.

**Acceptance Scenarios**:

1. **Given** una visita anónima, **When** consulta la galería, **Then** sólo ve
   fotografías aprobadas de un evento activo o cerrado; los eventos en borrador
   o archivados no son visibles públicamente.
2. **Given** un evento activo, **When** un invitado envía fotografías,
   **Then** se aceptan según los límites vigentes.
3. **Given** un evento cerrado o archivado, **When** un invitado intenta enviar
   fotografías, **Then** no se aceptan nuevas subidas.
4. **Given** una galería conectada, **When** una fotografía pasa a aprobada,
   **Then** aparece sin recargar la página.
5. **Given** que la conexión en tiempo real se interrumpe y luego se restablece,
   **When** el cliente se reconecta, **Then** vuelve a sincronizar el estado
   actual sin duplicar elementos visibles.

### User Story 4 - Administrar el evento y el acceso (Priority: P2)

La pareja y los administradores gestionan el álbum desde un panel protegido.
El owner puede añadir o revocar administradores individualmente; cada cuenta
usa su propio acceso y no se comparten contraseñas.

**Why this priority**: El evento necesita control operativo y delegación sin
dar privilegios de owner a todos.

**Independent Test**: Invitar a una cuenta con rol admin o moderator, iniciar
sesión con el enlace recibido, verificar sus capacidades y revocar su acceso.

**Acceptance Scenarios**:

1. **Given** el correo de una cuenta autorizada, **When** solicita acceso,
   **Then** recibe un enlace de autenticación y su autorización depende de su
   relación de rol con el evento.
2. **Given** un owner, **When** añade o revoca un admin o moderator,
   **Then** sólo cambia el acceso de esa persona a ese evento.
3. **Given** un admin, **When** administra el álbum, **Then** puede moderar,
   consultar contadores, compartir, abrir la proyección y cambiar el mensaje y
   los límites de subida, pero no administrar usuarios ni cambiar el modo de
   publicación.
4. **Given** un owner, **When** administra el evento, **Then** puede gestionar
   usuarios, configuración, evento y fotografías.

### User Story 5 - Compartir y proyectar el álbum (Priority: P2)

Un administrador muestra o descarga un QR, comparte el enlace directo y abre
una vista de proyección que presenta fotografías aprobadas en secuencia.

**Why this priority**: El QR simplifica la participación y la proyección permite
que los recuerdos se vean durante la celebración.

**Independent Test**: Generar el QR, escanearlo en un teléfono, abrir la
proyección en una pantalla y publicar una fotografía mientras el slideshow
permanece abierto.

**Acceptance Scenarios**:

1. **Given** el panel administrativo, **When** se muestra o descarga el QR,
   **Then** el código conduce al álbum público del sitio de boda.
2. **Given** un navegador con función nativa de compartir, **When** el usuario
   elige compartir, **Then** el enlace del álbum puede compartirse; si no está
   disponible, puede copiarse.
3. **Given** la vista de proyección, **When** hay fotografías aprobadas,
   **Then** se presentan en secuencia y una nueva aprobada se incorpora sin
   recargar toda la página.

## Edge Cases

- El invitado cancela la cámara o el selector de archivos.
- Se seleccionan cero imágenes o más del límite permitido.
- El archivo excede el límite por imagen, no es una imagen válida o tiene
  dimensiones excesivas.
- El navegador del invitado no puede decodificar HEIC/HEIF.
- La red se interrumpe durante la subida o durante una sesión de galería o
  proyección.
- La publicación automática intenta publicar una fotografía que no se puede
  mover al almacenamiento público.
- Un evento está en borrador, cerrado o archivado.
- Se revoca un administrador mientras su sesión sigue abierta.
- Una fotografía recibe acciones concurrentes de más de un administrador.
- Las fotografías y registros se conservan hasta que un admin o owner los
  elimine; no hay borrado automático por antigüedad.

## Requirements

### Functional Requirements

- **FR-001**: El sistema MUST permitir abrir el álbum desde un enlace directo y
  un QR sin requerir autenticación del invitado.
- **FR-002**: El sistema MUST permitir tomar una fotografía desde el navegador
  móvil o seleccionar múltiples fotografías desde la galería del dispositivo.
- **FR-003**: El sistema MUST mostrar una vista previa y permitir retirar
  individualmente fotografías antes del envío.
- **FR-004**: El sistema MUST preparar las imágenes seleccionadas para reducir
  su tamaño y eliminar metadatos innecesarios antes del envío cuando el
  navegador pueda procesarlas.
- **FR-005**: El sistema MUST permitir inicialmente JPEG, PNG y WebP, con un
  máximo de 10 MB por fotografía y sin captions.
- **FR-006**: El sistema MUST informar progreso, resultado por fotografía y
  errores, y permitir reintentar individualmente los envíos fallidos.
- **FR-007**: El sistema MUST validar en el servidor tipo, extensión, contenido,
  tamaño, dimensiones, evento y cantidad de fotografías; no debe confiar en la
  validación del navegador.
- **FR-008**: El sistema MUST almacenar separadamente fotografías recibidas y
  fotografías publicadas; el almacenamiento público sólo debe contener
  fotografías aprobadas.
- **FR-009**: El sistema MUST ofrecer modos de publicación manual y automática;
  el modo inicial es manual.
- **FR-010**: El sistema MUST mostrar públicamente sólo fotografías aprobadas
  del evento permitido y el total de fotografías aprobadas.
- **FR-011**: Las galerías y la proyección MUST reflejar aprobaciones nuevas sin
  recargar la página y sincronizarse nuevamente después de una desconexión.
- **FR-012**: El sistema MUST permitir autenticación administrativa mediante
  enlaces de acceso por correo, sin cuentas para los invitados.
- **FR-013**: El sistema MUST aplicar los roles owner, admin y moderator por
  evento. El moderator puede aprobar o rechazar; el admin puede moderar,
  eliminar, consultar estadísticas y cambiar el mensaje y los límites de
  subida; el owner puede además cambiar el modo de publicación y los formatos,
  gestionar administradores y modificar los datos del evento.
- **FR-014**: El sistema MUST permitir al owner añadir y revocar administradores
  con cuentas individuales y acceso limitado al evento asignado.
- **FR-015**: El sistema MUST mostrar contadores de total, pendientes,
  aprobadas y rechazadas en administración.
- **FR-016**: El sistema MUST permitir generar, visualizar, descargar e
  imprimir un QR para la URL pública del álbum y compartir o copiar ese enlace.
- **FR-017**: El sistema MUST proporcionar una vista de proyección a pantalla
  completa con slideshow y actualización en tiempo real.
- **FR-018**: El sistema MUST impedir mediante controles del lado servidor que
  visitantes anónimos consulten fotografías pendientes o rechazadas, modifiquen
  datos, administren usuarios o ejecuten acciones de moderación.
- **FR-019**: El sistema MUST aislar los datos y permisos por evento.
- **FR-020**: El sistema MUST aplicar protección server-side básica contra
  envíos abusivos.
- **FR-021**: El sistema MUST funcionar desde GitHub Pages bajo la ruta
  `/boda-eli-joseluis/`, sin depender de rutas desde la raíz del dominio.
- **FR-022**: El sistema MUST utilizar infraestructura Supabase exclusiva para
  este sitio y no reutilizar bases de datos, autenticación, código ni secretos
  de otros proyectos.
- **FR-023**: El sistema MUST evitar solicitar a invitados nombre, correo,
  teléfono u otra información personal que no sea necesaria para compartir
  fotografías.
- **FR-024**: El sistema MUST respetar navegación por teclado, foco visible,
  etiquetas accesibles y preferencia de movimiento reducido.
- **FR-025**: Un evento activo MUST permitir consultar la galería y recibir
  nuevas fotografías; un evento cerrado MUST conservar visible la galería pero
  bloquear nuevas subidas; los eventos en borrador o archivados MUST ser
  inaccesibles al público.
- **FR-026**: El sistema MUST conservar fotografías y sus registros hasta que un
  admin o owner los elimine; no debe borrar contenido automáticamente por
  antigüedad.

### Key Entities

- **Evento**: boda o celebración, con estado y slug público; es el límite de
  aislamiento para álbum, configuración, fotografías y administradores.
- **Configuración del álbum**: modo de publicación y límites propios de un
  evento.
- **Fotografía**: imagen enviada asociada a un evento, con estado pendiente,
  aprobada o rechazada y referencias a su ubicación privada y/o publicada.
- **Administrador del evento**: usuario autenticado relacionado con un evento
  mediante uno de los roles owner, admin o moderator.

## Assumptions

- La instancia Supabase y las credenciales de frontend pertenecen únicamente a
  este repositorio; la clave privilegiada nunca se distribuye al navegador.
- El evento inicial tiene slug `boda-eli-joseluis` y la cuenta owner inicial es
  `bellartestudiografico@gmail.com`; el correo no define autorización en el
  cliente.
- Se usa inicialmente un máximo de cinco fotografías por envío y 30 solicitudes
  por IP/sesión en 15 minutos como protección básica, con parámetros
  administrables cuando la política del evento lo permita.
- Cuando un navegador no puede leer HEIC/HEIF, el sistema explica el problema
  y ofrece usar una imagen JPEG compatible; HEIC/HEIF no se añade inicialmente
  a los formatos aceptados.
- Las fotografías y los registros rechazados se conservan para estadísticas
  hasta que un admin o owner los elimine; no existe borrado automático por
  antigüedad.
- Admin puede cambiar el mensaje público y los límites de subida (tamaño máximo
  por fotografía y cantidad por envío). Owner controla el modo de publicación,
  los formatos permitidos y los datos del evento.
- Un evento `active` permite ver y subir; `closed` permite ver pero no subir;
  `draft` y `archived` no son visibles al público.
- No se solicita caption, nombre ni otro dato personal al invitado.
- La fecha del evento no se presupone: el contenido actual del sitio contiene
  referencias a 2020 y un contador para 2026; el owner debe confirmar la fecha.

## Success Criteria

- **SC-001**: Un invitado puede llegar desde QR/enlace a la selección de fotos
  sin crear cuenta ni proporcionar datos personales.
- **SC-002**: En pruebas compatibles de iPhone Safari y Android Chrome, el
  invitado puede tomar o seleccionar, previsualizar y enviar al menos una
  fotografía desde el navegador.
- **SC-003**: Una imagen válida de hasta 10 MB se acepta o muestra progreso y un
  resultado final; un archivo inválido se rechaza con una explicación concreta.
- **SC-004**: Una fotografía pendiente no aparece en la galería pública, y una
  fotografía aprobada aparece en las galerías conectadas en un máximo de cinco
  segundos mientras exista conectividad.
- **SC-005**: Un usuario anónimo no puede leer fotografías pendientes o
  rechazadas ni alterar datos del evento, configuración, administradores o
  fotografías.
- **SC-006**: Cada rol puede completar todas las acciones autorizadas y ninguna
  de las acciones expresamente prohibidas para su rol.
- **SC-007**: El QR abre la URL pública del álbum bajo
  `/boda-eli-joseluis/` y puede descargarse o imprimirse.
- **SC-008**: Una proyección abierta incorpora fotografías aprobadas nuevas sin
  recarga y mantiene una cantidad acotada de elementos visuales en pantalla.
- **SC-009**: El sitio principal y el RSVP existentes siguen cargando y
  funcionando después de publicar las páginas del álbum.
- **SC-010**: Ninguna clave privilegiada de Supabase aparece en HTML, JavaScript
  o recursos enviados al navegador.
