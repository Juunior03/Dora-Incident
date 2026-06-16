# On utilise uniquement Nginx pour servir les fichiers statiques
FROM nginx:alpine

# On copie la configuration Nginx (si tu en as une spécifique)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# On copie le dossier 'dist' (le résultat de ton 'npm run build' local)
# vers le dossier public de Nginx
COPY dist/ /usr/share/nginx/html/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]