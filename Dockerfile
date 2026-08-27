# Utilisation de l'image hébergée sur le registre interne
#FROM docker-registry.alsdmz.lan/nginx:1.21-alpine

#COPY nginx.conf /etc/nginx/conf.d/default.conf
#COPY dist/ /usr/share/nginx/html/

# L'image standard écoute sur le port 80 par défaut
#EXPOSE 80
#CMD ["nginx", "-g", "daemon off;"]


# Utilisation de l'image hébergée sur le registre interne
FROM docker-registry.alsdmz.lan/nginx:1.21-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY dist/ /usr/share/nginx/html/

# 1. Modifier les permissions pour que l'utilisateur 'nginx' puisse lire et écrire
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

# 2. Rétrograder les privilèges vers l'utilisateur standard
USER nginx

# 3. Utiliser un port supérieur à 1024 (obligatoire sans les droits root)
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]