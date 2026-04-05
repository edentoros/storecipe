# Row Level Security (RLS) Policies

Storecipe relies on Supabase RLS to ensure each user can only access their own data. The client-side code filters by `user_id`, but **RLS is the authoritative security boundary** — without it, the anon key and client-side filters are the only protection.

## Required policies

### `recipes` table

| Policy | Operation | Check |
|---|---|---|
| Users can read own recipes | SELECT | `auth.uid() = user_id` |
| Users can insert own recipes | INSERT | `auth.uid() = user_id` |
| Users can update own recipes | UPDATE | `auth.uid() = user_id` |
| Users can delete own recipes | DELETE | `auth.uid() = user_id` |

### `user_preferences` table

| Policy | Operation | Check |
|---|---|---|
| Users can read own preferences | SELECT | `auth.uid() = user_id` |
| Users can upsert own preferences | INSERT | `auth.uid() = user_id` |
| Users can update own preferences | UPDATE | `auth.uid() = user_id` |

### `recipes` storage bucket

| Policy | Operation | Check |
|---|---|---|
| Users can upload to own folder | INSERT | `auth.uid()::text = (storage.foldername(name))[1]` |
| Users can read own images | SELECT | `auth.uid()::text = (storage.foldername(name))[1]` |
| Users can delete own images | DELETE | `auth.uid()::text = (storage.foldername(name))[1]` |

## Enabling RLS

```sql
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
```

## Example policy

```sql
CREATE POLICY "Users can read own recipes"
  ON recipes FOR SELECT
  USING (auth.uid() = user_id);
```

## Verification

To confirm RLS is active, run in the Supabase SQL editor:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

Both `recipes` and `user_preferences` should show `rowsecurity = true`.
