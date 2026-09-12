# Noor Scanner — Inventario Inteligente

App web de inventario para **Noor Fashion**. Escanea códigos de barras con la cámara, describe productos, captura fotos y exporta todo a Excel.

## Funcionalidades

- 📷 **Escáner de códigos de barras** — Usa la cámara del dispositivo (EAN-13, UPC, Code 128, QR, etc.)
- 📝 **Registro de productos** — Nombre, descripción, categoría, cantidad, precio y foto
- 🔍 **Detección de duplicados** — Detecta productos ya registrados y permite sumar cantidades
- 📸 **Fotos de productos** — Captura o sube fotos, almacenadas en IndexedDB
- 📥 **Exportar a Excel** — Descarga un ZIP con archivo `.xlsx` + carpeta de fotos
- 🔎 **Búsqueda y filtros** — Busca por nombre, código o categoría
- 💾 **Almacenamiento persistente** — IndexedDB + Supabase (nube)

## Tecnologías

- HTML5, CSS3, JavaScript (vanilla)
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) — Escáner de códigos de barras
- [SheetJS](https://sheetjs.com/) — Exportación a Excel
- [JSZip](https://stuk.github.io/jszip/) — Empaquetado ZIP
- [Supabase](https://supabase.com/) — Base de datos y almacenamiento en la nube
- IndexedDB — Almacenamiento local offline

## Uso

1. Abre `index.html` en un navegador
2. Escanea un código de barras o ingresa uno manualmente
3. Completa el formulario del producto (con foto opcional)
4. Exporta el inventario a Excel cuando lo necesites

## Diseño

Estética **Noor Fashion** — negro, dorado, tipografía serif premium.
