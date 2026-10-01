# FarmConnect Hub

FarmConnect Hub is a local food marketplace app that connects buyers with nearby farms. Buyers can browse produce, add items to a cart, and track orders, while farmers can manage inventory, list products, and monitor order progress.

## Stack

- React 19
- TanStack Start
- Vite
- TypeScript
- Tailwind CSS
- Supabase for auth and data
- Drizzle ORM
- shadcn-style UI components

## Features

- Buyer marketplace with category filters and search
- Farmer inventory management and product creation/editing
- Cart and checkout flow
- Order lifecycle tracking (pending, accepted, packed, shipped, delivered)
- User profiles and role-based workspace switching
- Light/dark theme support
- File-based routing via TanStack Router

## Project structure

- `src/routes/` — app routes and page-level components
- `src/components/ui/` — reusable UI components
- `src/integrations/supabase/` — Supabase client and auth setup
- `src/lib/` — shared app logic and mock/demo data
- `drizzle/` — schema and migration files
- `supabase/` — Supabase config

## Prerequisites

- Node.js 18+ recommended
- npm or bun
- A Supabase project configured for auth and database access

## Installation

```bash
npm install
```

## Environment variables

Create a `.env.local` file in the project root with your Supabase credentials:

```bash
VITE_SUPABASE_URL="your-supabase-url"
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-anon-key"
```

The app also supports server-side fallbacks using `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.

## Run locally

```bash
npm run dev
```

Then open the local URL shown in the terminal, typically:

```bash
http://localhost:3000
```

## Production build

```bash
npm run build
```

## Linting

```bash
npm run lint
```

## Notes

This project is designed to work with a connected Supabase backend. If the environment variables are missing or the database schema is not present, the app will fail to initialize auth and marketplace data.
