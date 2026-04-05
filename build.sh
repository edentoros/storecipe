#!/bin/bash
# Netlify build script: generates config.js from environment variables

if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_PUBLISHABLE_KEY" ]; then
  cat > src/js/core/config.js <<EOF
window.StorecipeConfig = {
  SUPABASE_URL: "${SUPABASE_URL}",
  SUPABASE_PUBLISHABLE_KEY: "${SUPABASE_PUBLISHABLE_KEY}"
};
EOF
  echo "config.js generated successfully."
else
  echo "Warning: SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY not set. Skipping config.js."
fi
