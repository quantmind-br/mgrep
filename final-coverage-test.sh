#!/bin/bash
echo "Executando todos os testes..."
npm run test:unit -- --coverage 2>&1 | tail -20
echo ""
echo "Verificando cobertura de commands e install..."
npm run test:unit -- --coverage 2>&1 | grep -E "commands|install" | grep -v "^All"
echo ""
echo "Total de testes:"
npm run test:unit 2>&1 | grep "Test Files"
