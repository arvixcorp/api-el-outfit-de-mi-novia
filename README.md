# API — El outfit de mi novia

API en Node.js + Express + TypeScript para el armario digital con IA.
MySQL con Prisma, cola de trabajos respaldada por la base de datos (sin Redis), AWS S3, rembg y Claude.

## Requisitos (desarrollo local, sin Docker)

Instala y ten corriendo en tu máquina:

- Node 24+
- MySQL 8+
- Un bucket de AWS S3 (ver "Configurar S3" abajo)
- rembg en modo servidor (Fase 3): `pip install "rembg[cpu,cli]"` y `rembg s --host 0.0.0.0 --port 7000`

Crea la base de datos y el usuario, por ejemplo:

```sql
CREATE DATABASE outfit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'outfit'@'%' IDENTIFIED BY 'outfit';
GRANT ALL PRIVILEGES ON *.* TO 'outfit'@'%';
```

(`prisma migrate dev` necesita crear una base sombra, por eso el usuario de desarrollo requiere privilegios amplios. En producción usa un usuario limitado y `db:deploy`.)

## Puesta en marcha

```bash
npm install
cp .env.example .env     # ajusta DATABASE_URL y demás a tu instalación local
npm run db:migrate       # aplica migraciones (crea las tablas)
npm run dev              # http://localhost:3000
```

Comprobar: `GET http://localhost:3000/api/v1/health` → `{"success":true,"data":{"status":"ok","db":"up",...}}`

## Configurar S3

1. Crea un bucket **privado** (Block Public Access activado) en la región que prefieras.
2. Crea un usuario IAM con una política mínima sobre ese bucket:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::TU-BUCKET/*"
       },
       {
         "Effect": "Allow",
         "Action": "s3:ListBucket",
         "Resource": "arn:aws:s3:::TU-BUCKET"
       }
     ]
   }
   ```
   (`s3:ListBucket` hace que un archivo inexistente responda 404 en vez de 403; sin él, `confirm` no distingue "falta la imagen" de "sin permisos".)
3. En el `.env`: `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE=false` y `S3_ENDPOINT` **vacío**.
4. La app sube directo al bucket con `PUT`, así que el bucket necesita CORS (Permissions → CORS):
   ```json
   [{
     "AllowedMethods": ["PUT", "GET", "HEAD"],
     "AllowedOrigins": ["*"],
     "AllowedHeaders": ["*"],
     "ExposeHeaders": ["ETag"]
   }]
   ```
   (La app móvil nativa no depende de CORS, pero sí lo necesitan las pruebas desde navegador/web.)

Las imágenes se leen con URLs prefirmadas de 1 hora, así que el bucket no necesita ser público.

## Procesamiento de imágenes (rembg + sharp + IA)

Al confirmar una subida, la prenda entra en una **cola en MySQL** (sin Redis) y un worker dentro de la propia API la procesa:
normaliza (EXIF, 2048 px) → quita el fondo → recorta y centra con padding → miniatura WebP + blurhash + colores → etiqueta con Claude (JSON validado con Zod).

- **rembg** (`BG_REMOVAL_PROVIDER=rembg`, `REMBG_URL`): servicio autohospedado, `POST /api/remove`. Alternativa externa: `BG_REMOVAL_PROVIDER=external` con `BG_REMOVAL_EXTERNAL_URL`, `..._API_KEY`, `..._KEY_HEADER` (por defecto `x-api-key`), `..._FIELD` (campo de la imagen) y `..._FORM` (campos extra). Ejemplo rembg.com: URL `https://api.rembg.com/rmbg`, FIELD `image`, FORM `format=PNG` (sin eso devuelve WebP). Ejemplo remove.bg: URL `https://api.remove.bg/v1.0/removebg`, FIELD `image_file`.
- **IA**: DeepSeek por defecto (`AI_PROVIDER=deepseek`, `DEEPSEEK_API_KEY`; modelo `deepseek-flash`, o `deepseek-v4-pro` con `AI_MODEL`). Se usa para etiquetar prendas (la imagen va como `image_url` en base64, con modo JSON) y para recomendar outfits (solo texto). Todo pasa por `src/lib/ai.ts`; `AI_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` vuelve a Claude. El razonamiento viene desactivado (`AI_THINKING=false`) porque no hace falta y encarece. Si el etiquetado falla, la prenda queda `ready` sin etiquetas (se editan a mano). Si falla quitar el fondo: 3 intentos con backoff y luego `failed`; la original **siempre se conserva** y se puede reintentar con `POST /garments/:id/retry`.
- `WORKER_ENABLED=false` desactiva el worker en una instancia.

## Endpoints principales (`/api/v1`, todos con `Authorization: Bearer` salvo auth)

| | |
|---|---|
| Auth | `POST /auth/register`, `/login`, `/refresh`, `/logout`; `GET/PATCH /auth/me` |
| Prendas | `POST /garments/upload-url`, `POST /garments/:id/upload-url` (renovar), `POST /garments/:id/confirm`, `POST /garments/:id/retry`, `GET /garments`, `GET/PATCH/DELETE /garments/:id` |
| Outfits | `POST /outfits/recommend`, `POST /outfits/complete`, `GET /outfits/today`, `GET /outfits/gaps`, `POST/GET /outfits`, `GET/PATCH/DELETE /outfits/:id`, `POST /outfits/:id/feedback`, `POST /outfits/:id/wear` |
| Calendario | `GET /wear-log?desde=&hasta=`, `DELETE /wear-log/:id` |

Recomendaciones en dos etapas: reglas en el backend (clima/temporada, formalidad por ocasión, combinaciones válidas, evitar lo usado en los últimos 7 días) → la IA elige las 3 mejores solo con metadatos y con el feedback previo; el backend verifica que los IDs existan y la combinación sea válida. Se cachean 6 h y hay un límite diario (`AI_DAILY_LIMIT`); si se agota o la IA falla, se devuelven las mejores combinaciones por reglas. El clima sale de Open-Meteo (gratis, sin API key) según la ciudad del perfil.

## Scripts

`dev`, `build`, `start`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:deploy`, `db:studio`.

## Estructura

```
prisma/            schema y migraciones
src/config/        env (validado con Zod), logger
src/common/        errores de aplicacion
src/middlewares/   auth, validacion (Zod), errores
src/modules/       un directorio por feature (health, auth, garments, ...)
src/lib/           clientes compartidos (prisma, ...)
tests/             vitest
```

## Variables de entorno

Todas documentadas en [.env.example](.env.example). La API falla al arrancar con un mensaje claro si falta alguna obligatoria.

## Despliegue (Dokploy)

El `Dockerfile` es solo para producción.

1. Crear una aplicación desde este repositorio usando el `Dockerfile`.
2. Provisionar MySQL 8, el bucket de AWS S3 y el servicio rembg (imagen `danielgatis/rembg`, comando `s --host 0.0.0.0 --port 7000`).
3. Definir las variables de `.env.example` en Dokploy (con secretos reales, `NODE_ENV=production`).
4. El contenedor ejecuta `prisma migrate deploy` al arrancar.
