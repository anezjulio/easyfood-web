# Actualizar o trasladar Easyfood con Docker

Entrega: 11/11/2026. Las imagenes incluyen frontend, API y datos iniciales. El programa guarda sus datos persistentes en /data.

## Archivos para copiar

- PC Intel/AMD: easyfood-web-pc-amd64.tar (imagen easyfood-web:2026-11-11-amd64, tambien etiquetada latest).
- NAS ARM64: easyfood-web-nas-arm64.tar (imagen easyfood-web:2026-11-11-arm64, tambien etiquetada nas-arm64).
- IMPORTAR-IMAGEN-PC.cmd: doble clic para cargar la imagen en Docker Desktop; no cambia contenedores ni datos.
- Copia de los datos persistentes, si quieres trasladar las operaciones del Docker actual. Exportar una imagen NO exporta el volumen.

## Actualizar esta PC desde Docker Desktop

1. Abre Docker Desktop. En Containers, selecciona easyfood-web y revisa Inspect > Mounts: anota el volumen montado en /data y el puerto. En esta PC se verifico easyfood-web_easyfood-data y 8080:8080.
2. Deten el contenedor. En Volumes, selecciona ese volumen y exportalo a un archivo para respaldo. Si Docker pide iniciar sesion, inicia sesion; la exportacion desde la interfaz puede requerirlo.
3. Ejecuta IMPORTAR-IMAGEN-PC.cmd con doble clic. La imagen nueva ya esta cargada en esta PC; este paso es para cuando copies la entrega.
4. En Containers elimina solamente el contenedor anterior; conserva el volumen de datos. Si Docker ofrece borrar volumenes asociados, desmarca esa opcion.
5. En Images busca easyfood-web:2026-11-11-amd64 > Run > Optional settings. Nombre: easyfood-web. Puerto del host: 8080, puerto interno: 8080. En Volumes selecciona el MISMO volumen anotado y montalo en /data. Si tu version del formulario solo acepta carpetas del host, utiliza el metodo Compose de abajo para volver a montar el volumen existente.
6. Run. Abre http://localhost:8080 y verifica ventas, ingredientes y datos. Si el navegador conserva estilos anteriores, pulsa Ctrl+F5.

## Llevarlo a otra PC Intel/AMD

1. Copia la carpeta de entrega y el respaldo del volumen a la nueva PC. Instala y abre Docker Desktop.
2. Ejecuta IMPORTAR-IMAGEN-PC.cmd con doble clic para cargar la imagen.
3. En Volumes crea easyfood-data e importa el respaldo ANTES de iniciar Easyfood. Esto conserva bases, imagenes y recibos. Si no importas datos, la primera ejecucion usa los datos iniciales incluidos en la imagen.
4. Images > easyfood-web:2026-11-11-amd64 > Run > Optional settings: nombre easyfood-web, puerto 8080:8080 y volumen easyfood-data en /data.
5. Run y abre http://localhost:8080. Desde otra maquina de la red: http://IP_DE_LA_NUEVA_PC:8080 (permite ese puerto en el firewall si hace falta).

## NAS ARM64: Synology Container Manager

1. Copia easyfood-web-nas-arm64.tar al NAS. Conserva una copia de la carpeta o volumen que actualmente se monta en /data.
2. Container Manager > Image > Action > Import > archivo: selecciona el TAR. Verifica que aparezca easyfood-web:2026-11-11-arm64.
3. En Project, deten tu proyecto. En su YAML cambia SOLO image a easyfood-web:2026-11-11-arm64 y agrega pull_policy: never. Conserva puertos, /data y servicios adicionales como cloudflared.
4. Project > Action > Build y luego Start. Si el editor ofrece crear e iniciar el proyecto al guardar, usa esa opcion para recrear el contenedor con la imagen importada.
5. Abre la direccion y puerto que ya usabas. Reiniciar el contenedor anterior por si solo no actualiza la imagen.

## Alternativa Compose para Docker Desktop

En esta PC, desde C:\project\easyfood-web, despues de importar o construir la imagen:

~~~powershell
docker compose up -d --no-build --force-recreate
~~~

Conserva el nombre de proyecto y el mismo volumen existente. En otra PC, el volumen restaurado debe coincidir con el volumen que monta Compose. No ejecutes docker compose down -v: elimina los datos.

## Referencias

- Docker Desktop, ejecutar imagenes: https://docs.docker.com/desktop/use-desktop/images/
- Docker Desktop, exportar e importar volumenes: https://docs.docker.com/desktop/use-desktop/volumes/
- Synology, proyectos: https://kb.synology.com/en-global/DSM/help/ContainerManager/docker_project?version=7
- Synology, importar imagenes: https://kb.synology.com/en-global/DSM/help/ContainerManager/docker_image?version=7
