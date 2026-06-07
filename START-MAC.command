#!/bin/bash
cd "$(dirname "$0")"
clear
echo "============================================"
echo " Локальный запуск магазина"
echo "============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js не найден. Установите Node.js версии 18 или новее: https://nodejs.org/"
  echo "После установки снова откройте этот файл."
  read -n 1 -s -r -p "Нажмите любую клавишу..."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm не найден. Обычно npm устанавливается вместе с Node.js."
  read -n 1 -s -r -p "Нажмите любую клавишу..."
  exit 1
fi

if [ ! -f ".env" ]; then
  echo "Создаю файл настроек .env из .env.example..."
  cp ".env.example" ".env"
fi

if [ ! -d "node_modules" ]; then
  echo "Устанавливаю зависимости. Это нужно сделать только один раз..."
  npm install || {
    echo
    echo "Ошибка установки зависимостей. Проверьте интернет и права доступа к папке проекта."
    read -n 1 -s -r -p "Нажмите любую клавишу..."
    exit 1
  }
fi

echo
echo "Магазин будет доступен по адресу: http://localhost:3000"
echo "Админка: http://localhost:3000/admin"
echo "Пароль по умолчанию: admin123"
echo
echo "Для остановки сервера нажмите Ctrl+C."
echo

if command -v open >/dev/null 2>&1; then
  open "http://localhost:3000" >/dev/null 2>&1 &
fi
npm start

echo
read -n 1 -s -r -p "Сервер остановлен. Нажмите любую клавишу..."
