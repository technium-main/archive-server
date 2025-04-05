# 1. Базовый образ с Node.js
FROM node:20

# 2. Рабочая папка внутри контейнера
WORKDIR /app

# 3. Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install

# 4. Копируем остальной код
COPY . .

# 5. Устанавливаем системные утилиты для распаковки архивов
RUN apt-get update && \
    apt-get install -y unzip p7zip-full unrar-free

# 6. Указываем порт
EXPOSE 3000

# 7. Запускаем сервер
CMD ["npm", "start"]
