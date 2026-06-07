#!/bin/bash
cd "$(dirname "$0")"
echo "============================================"
echo " Локальный запуск магазина"
echo "============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установите Node.js версии 18 или новее: https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm не найден. Обычно npm устанавливается вместе с Node.js."
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "Создаю файл настроек .env из .env.example..."
  cp ".env.example" ".env"
fi

if [ ! -d "node_modules" ]; then
  echo "Устанавливаю зависимости. Это нужно сделать только один раз..."
  npm install || exit 1
fi

echo
echo "Магазин: http://localhost:3000"
echo "Админка: http://localhost:3000/admin"
echo "Пароль по умолчанию: admin123"
echo

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:3000" >/dev/null 2>&1 &
fi
npm start
