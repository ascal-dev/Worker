npx wrangler pages deploy public --project-name=tv    


git add .
git commit -m "Fix Supabase init, add pagination controls, remove visit button"
git push origin master
npx wrangler pages deploy public --project-name=tv --commit-dirty=true