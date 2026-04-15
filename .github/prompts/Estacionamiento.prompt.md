---
description: "Plan de trabajo y alcance funcional del sistema web de administracion del estacionamiento."
---

# Plan de trabajo del sistema de estacionamiento

## Objetivo

Construir un sistema web para administrar el estacionamiento con cajones fijos, control de pensionados, entradas, salidas, pagos, adeudos y acceso por nombre y placa.

## Requerimientos principales

1. Mostrar el diagrama del estacionamiento en la web de forma visual.
2. Registrar entradas y salidas de vehiculos.
3. Identificar si el vehiculo es pensionado o temporal.
4. Si es pensionado, guardar su metodo de pago.
5. Registrar pagos y controlar adeudos.
6. Mostrar cuanto debe y cuanto le falta por pagar.
7. Aplicar cuota mensual de 800.00 para pension.
8. Aplicar cuota de 50.00 para acceso temporal.
9. Dar acceso a cada inquilino por nombre y placa.
10. Cuando el inquilino quiera salir, enviar notificacion al administrador.
11. Permitir agregar y eliminar inquilinos.
12. Respetar un maximo de 50 vehiculos activos.
13. Mantener cajones fijos ya asignados y solo liberarlos cuando se elimine la pension.
14. Trabajar con HTML, servidor dedicado y base de datos administrable.

## Fases de trabajo

### 1. Modelado del negocio

- Definir los cajones fijos del diagrama.
- Relacionar cajon, inquilino, placa, acceso y estado de pago.
- Separar reglas de pension y acceso temporal.

### 2. Backend y base de datos

- Crear servidor con Node.js y Express.
- Crear base de datos SQLite para inquilinos, cajones, entradas, pagos y adeudos.
- Crear API para consultas y operaciones del sistema.

### 3. Vista del administrador

- Mostrar metricas generales del estacionamiento.
- Mostrar mapa visual del estacionamiento.
- Registrar entrada de pensionados o visitas temporales.
- Gestionar inquilinos, pagos, adeudos y solicitudes de salida.

### 4. Portal de inquilinos

- Permitir acceso por nombre y placa.
- Mostrar su informacion, cajon y adeudo actual.
- Enviar solicitud de salida al administrador.

### 5. Validacion

- Confirmar limite de 50 vehiculos.
- Confirmar que los cajones no cambian mientras la pension siga activa.
- Confirmar que las salidas se notifican al administrador.

## Implementacion actual

- Backend creado con Express.
- Base de datos creada con SQLite.
- Mapa visual modelado a partir del diagrama compartido.
- Panel administrativo implementado.
- Portal de inquilinos implementado.
- Reglas de pension, adeudos y cajones fijos implementadas.

## Observacion de entorno

La ejecucion local completa queda pendiente en esta maquina hasta contar con Node.js y npm instalados en la terminal.
