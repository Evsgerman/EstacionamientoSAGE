# Sistema de Estacionamiento

Aplicacion web para administrar un estacionamiento con cajones fijos, inquilinos pensionados, control de entradas y salidas, pagos y adeudos.

## Incluye

- Mapa visual del estacionamiento basado en el diagrama compartido.
- Alta, edicion y baja de inquilinos.
- Cajones fijos para pensionados.
- Control de acceso por nombre y placa.
- Registro de entrada y solicitud de salida.
- Notificaciones de salida para el administrador.
- Pagos y adeudos de pension.
- Base de datos SQLite local administrable.

## Costos configurados

- Pension mensual: $800.00
- Acceso temporal: $50.00

## Ejecutar

```bash
npm install
npm start
```

Abre http://localhost:3000

## Base de datos

El archivo se crea en [data/estacionamiento.db](data/estacionamiento.db).

## Notas del modelo

- Se sembraron los cajones vistos en el diagrama.
- Los cajones estan fijos y solo se liberan cuando se elimina la pension del inquilino.
- El limite maximo del sistema es de 50 vehiculos activos.