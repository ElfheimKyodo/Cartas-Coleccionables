# Configuración de Supabase para Elfheim

Este documento explica cómo conectar la app a Supabase para guardar datos de todos los usuarios.

## Paso 1: Crear proyecto en Supabase

1. Ir a [supabase.com](https://supabase.com) y registrarse
2. Click en **"New Project"**
3. Elegir una organización, poner nombre y contraseña de base de datos
4. Esperar 1-2 minutos a que se cree

## Paso 2: Obtener credenciales

Una vez creado el proyecto:
1. Ir a **Settings** (ícono de engranaje inferior izquierdo)
2. Ir a **API**
3. Copiar:
   - **Project URL** (ej: `https://xxxxx.supabase.co`)
   - **anon/public key** (la key larga que empieza con `eyJ...`)

## Paso 3: Configurar la base de datos

1. Ir a **SQL Editor** (ícono de base de datos en la barra lateral)
2. Hacer clic en **"New query"**
3. Pegar este código y hacer clic en **Run**:

```sql
-- Tabla de perfiles de usuario (monedas)
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  monedas integer default 50,
  updated_at timestamp with time zone,
  constraint email_unique unique (email)
);

-- Tabla de inventario (cartas de cada usuario)
create table public.inventory (
  user_id uuid not null references auth.users on delete cascade,
  carta_id text not null,
  cantidad integer not null default 0,
  primary key (user_id, carta_id)
);

-- Función para agregar monedas
create or replace function public.add_coins(p_user_id uuid, p_amount integer)
returns void as $$
begin
  update public.profiles
  set monedas = monedas + p_amount, updated_at = now()
  where id = p_user_id;
end;
$$ language plpgsql security definer;

-- Función para descontar monedas
create or replace function public.deduct_coins(p_user_id uuid, p_amount integer)
returns void as $$
begin
  update public.profiles
  set monedas = monedas - p_amount, updated_at = now()
  where id = p_user_id
  and monedas >= p_amount;
end;
$$ language plpgsql security definer;

-- Habilitar Row Level Security
alter table public.profiles enable row level security;
alter table public.inventory enable row level security;

-- Políticas de seguridad para profiles
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Políticas de seguridad para inventory
create policy "Users can insert own inventory" on public.inventory
  for insert with check (auth.uid() = user_id);

create policy "Users can update own inventory" on public.inventory
  for update using (auth.uid() = user_id);

create policy "Users can read own inventory" on public.inventory
  for select using (auth.uid() = user_id);
```

## Paso 4: Configurar las credenciales en la app

Abrir `js/supabase.js` y reemplazar las constantes con tus credenciales:

```javascript
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...TU_KEY...';
```

## Paso 5: Configurar dominio permitido (opcional pero recomendado)

1. En Supabase, ir a **Authentication** > **URL Configuration**
2. En **"Redirect URLs"** agregar:
   - `http://localhost:8080/**` (para desarrollo)
   - Tu dominio cuando subas la app (ej: `https://miapp.netlify.app/**`)

## Paso 6: Verificar funcionamiento

1. Abrir `http://localhost:8080/index.html`
2. Hacer clic en **"Registrarse"**
3. Ingresar email y contraseña
4. Abrir sobres y verificar que los datos se guardan

Para verificar en Supabase:
- Ir a **Table Editor** > **profiles** para ver usuarios
- Ir a **Table Editor** > **inventory** para ver cartas

## Notas importantes

- Cada usuario ve solo sus propios datos (gracias a Row Level Security)
- El email se usa como identificador único
- Las contraseñas se guardan encriptadas en Supabase
- El plan gratuito de Supabase incluye 50,000 usuarios/mes y 500MB de storage
- Si Supabase no está configurado, la app usa localStorage como fallback

## Troubleshooting

**Error: "Invalid API key"**
- Verificar que la key sea la "anon/public" key, no la "service_role" key
- Verificar que la URL no tenga `/` al final

**Error: "Email not confirmed"**
- Ir a **Authentication** > **Users** y verificar que el usuario esté confirmado
- En desarrollo podés desactivar la confirmación de email en **Authentication** > **Providers** > **Email**

**Los datos no se guardan**
- Verificar que las tablas `profiles` e `inventory` existan
- Verificar que las políticas RLS estén aplicadas
- Revisar la consola del navegador (F12) para ver errores específicos