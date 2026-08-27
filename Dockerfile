# Utilisation de l'image hébergée sur le registre interne
FROM docker-registry.alsdmz.lan/nginx:1.21-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/

# L'image standard écoute sur le port 80 par défaut
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]