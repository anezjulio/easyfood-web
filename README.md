# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Configuracion de Pistola Scanner en Chrome (Windows)

Esta configuracion aplica para la pantalla de ventas (`/sales`) cuando el scanner envia `Ctrl+J` despues de leer un codigo y Chrome abre `chrome://downloads/`.

### Objetivo

- Permitir escanear codigo + Enter en la app.
- Evitar que Chrome abra Descargas por el atajo `Ctrl+J`.

### 1) Instalar AutoHotkey

1. Descargar desde el sitio oficial: `https://www.autohotkey.com/`
2. Instalar **AutoHotkey v2** (no v1).

### 2) Crear script para bloquear Ctrl+J solo en Chrome

1. Crear archivo en el escritorio: `bloquear-ctrl-j-chrome.ahk`
2. Pegar este contenido:

```ahk
#Requires AutoHotkey v2.0
#SingleInstance Force

#HotIf WinActive("ahk_exe chrome.exe")
^j::return
#HotIf
```

3. Guardar y ejecutar con doble clic.
4. Verificar que aparezca el icono verde de AutoHotkey en la bandeja del sistema.

### 3) Validacion

1. Abrir Chrome y presionar `Ctrl+J`.
2. No debe abrirse la pagina de Descargas.
3. Ir a la pantalla de ventas (`/sales`) y escanear productos.
4. Debe agregar productos sin redirigir a `chrome://downloads/`.

### 4) Inicio automatico en Windows

Para que se aplique en cada encendido de la PC:

1. Presionar `Win + R`.
2. Ejecutar: `shell:startup`
3. Crear/copy un acceso directo de `bloquear-ctrl-j-chrome.ahk` dentro de esa carpeta.
4. Reiniciar la PC y confirmar que AutoHotkey se inicie solo.

### Notas operativas

- Este bloqueo solo afecta Chrome cuando la ventana de Chrome esta activa.
- No cambia configuraciones internas de la pistola.
- Si se cierra AutoHotkey, vuelve el comportamiento normal de `Ctrl+J`.

### Enlaces adicionales

- Manual scanner 1100L/1200L (V2.3): `https://v6-file.globalso.com/upload/p/827/file/2024-11/1100l-1200l-user-manual-v2-3.pdf`
