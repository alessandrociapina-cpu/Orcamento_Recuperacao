# Orçamento de Recuperação Estrutural - OVMS

Aplicação Web Progressiva (PWA) Offline-First desenvolvida para agilizar o levantamento de patologias estruturais e trincas, auxiliando engenheiros e técnicos na geração automática de orçamentos e memórias de cálculo na Sabesp - São José dos Campos.

## Funcionalidades
- **100% Client-Side:** Processamento e geração do relatório acontecem no navegador, sem uso de servidores.
- **Banco de Dados Local:** Motor de Auto-Save via `IndexedDB` que previne a perda de fotos no campo.
- **Editor de Imagens Integrado:** Insira cotas/réguas e o design de armaduras em "Z" direto na fotografia.
- **Cálculo Automático:** Converte extensão de trincas na tabela de orçamento de reparo (Grampeamento, Ranhuras, Telas e Pintura).
- **PDF Responsivo:** Motor de impressão configurado para manter o rodapé e cabeçalho fixos nativamente em todas as páginas do PDF.
