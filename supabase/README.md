# Album colaborativo

Esta carpeta pertenece exclusivamente al proyecto `boda-eli-joseluis`. No
utiliza la instancia, las credenciales ni las migraciones de ningun otro
proyecto.

## Provision inicial

1. Crear una instancia nueva de Supabase.
2. Ejecutar las migraciones `001_album.sql` y `002_album_hardening.sql` mediante `supabase db push` (o en ese orden desde SQL Editor).
3. Activar el proveedor Email en Authentication. El panel usa magic links.
4. Crear o dejar que se cree el usuario owner `bellartestudiografico@gmail.com`.
5. Obtener el UUID de ese usuario en `auth.users` y crear su relacion:

```sql
insert into public.album_admins (event_id, user_id, role)
select e.id, u.id, 'owner'
from public.events e
cross join auth.users u
where e.slug = 'boda-eli-joseluis'
  and lower(u.email) = lower('bellartestudiografico@gmail.com');
```

El correo no se utiliza en JavaScript. La autorizacion depende de
`album_admins`.

La fecha del evento queda inicialmente vacia porque el HTML existente tiene
texto de 2020 y un contador configurado para 2026. El owner debe confirmar la
fecha desde `admin.html` antes de publicarla.

## Edge Functions

Desplegar desde la raiz del repositorio:

```text
supabase link --project-ref <project-ref-nuevo>
supabase db push
supabase functions deploy submit-photo --no-verify-jwt
supabase functions deploy moderate-photo
supabase functions deploy manage-admin
```

`submit-photo` es publico para invitados anonimos y realiza su propia
validacion. Las otras dos funciones requieren JWT de Supabase Auth.
`moderate-photo` reserva cada fila de foto mediante `moderation_token` para
serializar acciones concurrentes y devuelve HTTP 409 si la fila ya cambio o
esta siendo procesada.

Las funciones utilizan las variables administradas por Supabase:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Configurar tambien `ALLOWED_ORIGINS` como:

```text
https://omarcalvario.github.io,http://localhost:8000,http://127.0.0.1:8000
```

La `SUPABASE_SERVICE_ROLE_KEY` solo debe existir como secreto de las Edge
Functions. Nunca copiarla a `js/supabase-config.js`.

Rechazar conserva el registro `photos` para las estadisticas y elimina el
archivo de `album-inbox`. Eliminar es una eliminacion permanente del registro
y de cualquier objeto en ambos buckets.

El rate limiting inicial usa hashes de IP y de sesion anonima, con hasta 30
envios por clave en una ventana de 15 minutos. Es una proteccion basica, no
una sustitucion de CAPTCHA o moderacion.

## Limites y permisos de configuracion

El bucket de Storage y el valor inicial de `album_settings.max_file_size` son
10 MiB (10485760 bytes). Supabase aplica el limite del bucket antes de que la
Edge Function procese el archivo; por eso la migracion de hardening impide
configurar un limite por evento superior a 10 MiB. La funcion `submit-photo`
valida el menor entre el limite configurado y 10 MiB. No se cambia el limite
inicial ni se supone que el limite del bucket pueda variar por evento.

Admin puede cambiar `share_message`, `max_file_size` y
`max_files_per_upload`; owner puede cambiar esos campos y además
`publication_mode` y `allowed_mime_types`. Moderator no puede actualizar
configuración. La migracion `002_album_hardening.sql` aplica la restriccion
de campos mediante trigger además de RLS, por lo que una llamada directa a la
API no puede permitir que admin cambie `allowed_mime_types`.

La aprobación crea primero el objeto público, confirma el cambio de estado
con una actualización condicional y compensa la escritura pública si falla.
Los errores de limpieza de Storage se reportan en logs; un duplicado que quede
en el bucket privado no es público. Rechazar conserva el registro y elimina
su objeto privado. Las acciones de moderación serializadas impiden que una
acción obsoleta sobrescriba otra.

## Frontend

Actualizar `js/supabase-config.js` con la URL y la publishable/anon key de
esta instancia nueva. Es normal que esa clave publica llegue al navegador;
RLS, Storage policies y las Edge Functions son las fronteras de seguridad.

Configurar en Authentication > URL Configuration el redirect:

```text
https://omarcalvario.github.io/boda-eli-joseluis/admin.html
```

Para pruebas locales utilizar un servidor HTTP, por ejemplo:

```text
python -m http.server 8000
```

No abrir los HTML con `file://`, porque los modulos ES y CORS no tendran un
origen permitido.

## HEIC/HEIF

El backend acepta inicialmente JPEG, PNG y WebP. El navegador intenta
decodificar cada seleccion y re-encodearla a JPEG para corregir orientacion,
reducir tamano y eliminar EXIF. Si Safari no puede decodificar un HEIC/HEIF,
el invitado recibe un mensaje explicito y no se amplia silenciosamente la
lista de formatos.

En iPhone, la alternativa compatible es usar Camara > Formatos > Mas
compatible, o seleccionar un JPEG exportado desde Fotos.

## VenoBox

El bundle existente contiene VenoBox, pero su inicializacion depende de la
estructura estatica `.gallery-grid a` y no expone una API modular en este
repositorio. El album usa el elemento nativo `dialog` para fotografias
dinamicas; asi se evita agregar otra dependencia y se conserva soporte de
teclado y movil.

## Pruebas RLS recomendadas

Con una sesion anonima, confirmar que solo devuelve fotos aprobadas:

```sql
select status from public.photos;
```

Intentos anonimos de `insert`, `update` y `delete` sobre `photos`,
con moderator, admin y owner verificando las capacidades descritas en el
panel.
