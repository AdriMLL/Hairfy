# Hairfy — Gestión de citas para peluquería

App web sencilla y segura para que los clientes reserven cita online y la
peluquería gestione su agenda.

- **Página pública** (`/`): el cliente elige servicio, profesional, día y hora
  libre, deja su nombre y teléfono, y la cita queda confirmada. Al reservar
  recibe un código de cliente (tipo `HF-7K3M`).
- **Mis citas** (`/mis-citas`): con su teléfono + código, el cliente consulta
  sus citas y puede cancelarlas online hasta 2 horas antes (configurable en
  `lib/config.js`).
- **Panel de administración** (`/admin`): con login. Agenda del día, cancelar
  citas, gestionar servicios (precio/duración), empleados y ver clientes (con
  su código, por si alguien lo pierde).

Además: al reservar se ven también las horas ya ocupadas (tachadas), si solo
hay un profesional se asigna automáticamente, el cliente puede reservar
productos de la tienda junto a su cita (se pagan al recoger), y el horario de
apertura se configura desde **Admin → Horario** (sin tocar código).

> Si vienes de una versión anterior, ejecuta también en el SQL Editor de
> Supabase: `supabase/migracion-2-codigo-cliente.sql` y
> `supabase/migracion-3-productos-horario.sql`.

**Stack:** Next.js (React) + Supabase (base de datos PostgreSQL + login).
Todo funciona con los planes **gratuitos** de Vercel y Supabase.

---

## 1. Crear el proyecto en Supabase (gratis)

1. Entra en [supabase.com](https://supabase.com) y crea una cuenta.
2. Crea un proyecto nuevo (elige la región `eu-west` para España).
3. En **SQL Editor**, pega el contenido completo de `supabase/schema.sql` y pulsa **Run**.
   Esto crea las tablas, la seguridad y unos datos de ejemplo.
4. Crea el usuario del panel de administración:
   **Authentication → Users → Add user** → pon tu email y una contraseña fuerte.
   (Desactiva también los registros públicos: **Authentication → Sign In / Up →
   desactiva "Allow new users to sign up"**, para que nadie más pueda crearse cuenta.)
5. En **Project Settings → API** copia tres valores:
   - Project URL
   - clave `anon` (pública)
   - clave `service_role` (**secreta**)

## 2. Probar en tu ordenador

```bash
cp .env.example .env.local   # y rellena los 3 valores de Supabase
npm install
npm run dev
```

- Página de reservas: http://localhost:3000
- Panel admin: http://localhost:3000/admin

## 3. Configurar tu horario

Edita `lib/config.js`: horario de apertura por día, duración de los huecos
(30 min por defecto) y con cuántos días de antelación se puede reservar.

---

## 4. Subirla a internet GRATIS

### Opción recomendada: Vercel (creadores de Next.js)

1. Sube el proyecto a un repositorio de GitHub (el `.gitignore` ya evita subir
   tus claves).
2. Entra en [vercel.com](https://vercel.com) con tu cuenta de GitHub y pulsa
   **Add New → Project** → importa el repositorio.
3. En **Environment Variables** añade las tres variables de `.env.example`
   con sus valores reales.
4. **Deploy**. Tendrás la web en `https://tu-proyecto.vercel.app` con HTTPS
   automático. Cada `git push` la actualiza sola.

Límites del plan gratuito: de sobra para una peluquería (100 GB de tráfico/mes).
Puedes conectar un dominio propio gratis (el dominio en sí cuesta ~10 €/año).

### Alternativas gratuitas

| Plataforma | Notas |
|---|---|
| **Netlify** | Muy similar a Vercel, también soporta Next.js. |
| **Cloudflare Pages** | Gratis y muy rápido; requiere un pequeño adaptador para Next.js (`@opennextjs/cloudflare`). |
| **Render** | Plan gratuito, pero la app "se duerme" tras 15 min sin uso y tarda ~30 s en despertar. |

La base de datos ya está resuelta con el plan gratuito de **Supabase**
(500 MB, decenas de miles de citas). Ojo: si el proyecto pasa ~1 semana sin
ninguna visita, Supabase lo pausa y hay que reactivarlo con un clic en su web.

---

## Seguridad (cómo está montada)

- Las tablas tienen **RLS (Row Level Security) activado sin políticas**: la
  clave pública `anon` no puede leer ni escribir NADA directamente.
- Todo el acceso a datos pasa por el servidor de Next.js (`app/api/*`), que
  valida cada petición y usa la clave `service_role`, que **solo existe en el
  servidor** (nunca llega al navegador).
- El panel `/admin` exige login (Supabase Auth) y cada llamada del panel se
  verifica en el servidor con el token de sesión.
- Una restricción en la base de datos impide físicamente que un empleado tenga
  dos citas solapadas, aunque dos clientes reserven a la vez.
- **Nunca** subas `.env.local` a git ni compartas la clave `service_role`.
- Para reservar, pedir o consultar hace falta el código del cliente: la API
  nunca revela el código de una ficha existente y **limita los intentos**
  fallidos de código (anti fuerza bruta).
- Cabeceras de seguridad HTTP activadas (anti clickjacking y sniffing) en
  `next.config.mjs`.
- **Trazabilidad**: todas las acciones (citas, pedidos, reseñas, cambios del
  admin) quedan registradas en `activity_log` y se consultan en
  **Admin → Actividad**.
