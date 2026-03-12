#!/bin/bash
# Запуск ngrok tunnel для Agent Board
# Board будет доступен по: https://lemony-lorean-strategically.ngrok-free.dev

echo "Starting ngrok tunnel → https://lemony-lorean-strategically.ngrok-free.dev"
echo "Agent Board: http://localhost:3456"
echo ""

ngrok http --url=lemony-lorean-strategically.ngrok-free.dev 3456
