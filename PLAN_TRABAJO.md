# Plan de trabajo

## Objetivo

Construir un sistema web para administrar el estacionamiento con mapa visual, cajones fijos, control de pensionados, entradas, salidas, pagos, adeudos y acceso por nombre y placa.

## Fases

1. Modelado del negocio
   - Definir cajones fijos y su representacion visual.
   - Separar pensionados y accesos temporales.
   - Aplicar reglas de pension mensual de 800.00 y acceso temporal de 50.00.

2. Backend y base de datos
   - Crear servidor dedicado con Express.
   - Crear base de datos SQLite administrable localmente.
   - Exponer API para inquilinos, pagos, deudas, entradas y salidas.

3. Vista administrativa
   - Mostrar tablero con metricas.
   - Renderizar el mapa del estacionamiento.
   - Permitir alta, edicion, baja y cobro de inquilinos.
   - Mostrar solicitudes de salida.

4. Portal de inquilinos
   - Validar acceso con nombre y placa.
   - Mostrar cajon y adeudo.
   - Enviar solicitud de salida al administrador.

5. Validacion
   - Verificar reglas de negocio.
   - Confirmar limite de 50 vehiculos activos.
   - Validar que los cajones no cambien mientras la pension siga activa.

## Estado actual

- Backend creado.
- Base de datos creada.
- Layout del estacionamiento modelado.
- Panel administrativo implementado.
- Portal de inquilinos implementado.
- Validacion estatica completada.
- Pendiente ejecutar en entorno con Node.js y npm instalados.