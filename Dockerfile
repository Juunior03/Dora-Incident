# ==========================================
# Étape 1 : Build de l'application (Node)
# ==========================================
FROM node:22-alpine AS builder

# Définir le dossier de travail dans le conteneur
WORKDIR /app

# Copier les fichiers de dépendances
COPY package.json package-lock.json ./

# Installer les dépendances (npm ci est plus strict et propre que npm install pour la CI/CD)
RUN npm ci

# Copier le reste du code source
COPY . .

# Déclarer les arguments d'environnement nécessaires pour Vite/Supabase au moment du build
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Compiler l'application (ça va générer le dossier /dist)
RUN npm run build

# ==========================================
# Étape 2 : Serveur Web (Nginx)
# ==========================================
FROM nginx:alpine

# Copier la configuration Nginx qu'on a créée
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier les fichiers compilés depuis l'étape 1 vers le dossier public de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Exposer le port 80
EXPOSE 80

# Lancer Nginx
CMD ["nginx", "-g", "daemon off;"]