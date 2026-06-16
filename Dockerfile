# Utilisation de l'image officielle sécurisée (sans droits root)
FROM nginxinc/nginx-unprivileged:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/

# Les ports inférieurs à 1024 nécessitent d'être root.
# Cette image utilise donc le port 8080 par défaut.
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]