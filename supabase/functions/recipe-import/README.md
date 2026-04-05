## recipe-import edge function

This function fetches a recipe webpage, strips text, sends it to OpenAI, and returns structured fields for the Storecipe add/edit form.

### Required secrets

```bash
supabase secrets set OPENAI_API_KEY=your_openai_key
supabase secrets set OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_MODEL` is optional. If omitted, the function defaults to `gpt-4.1-mini`.

### Deploy

```bash
supabase functions deploy recipe-import
```

### Local serve (optional)

```bash
supabase functions serve recipe-import --env-file ./supabase/.env.local
```
