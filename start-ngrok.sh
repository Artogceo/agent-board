#!/bin/bash
# Запуск ngrok tunnel для Agent Board
# Board доступен по: https://agentos.ngrok.app

echo "Starting ngrok tunnel → https://agentos.ngrok.app"
echo "Agent Board: http://localhost:3456"
echo ""

ngrok http --url=agentos.ngrok.app 3456
