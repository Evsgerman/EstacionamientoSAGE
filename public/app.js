const state = {
  dashboard: null,
  tenants: [],
  selectedSpotId: null
};

const STATIC_BLOCKS = [
  { text: 'BANO', x: 46.6, y: 24.0, w: 12.5, h: 13.5, className: 'center-block' },
  { text: 'CASETA', x: 35.6, y: 79.2, w: 10.6, h: 12.4, className: 'center-block caseta' }
];

const metricsContainer = document.getElementById('metrics');
const parkingMap = document.getElementById('parkingMap');
const tenantsTable = document.getElementById('tenantsTable');
const requestsList = document.getElementById('requestsList');
const tenantForm = document.getElementById('tenantForm');
const entryForm = document.getElementById('entryForm');
const spotSelect = document.getElementById('spotSelect');
const refreshButton = document.getElementById('refreshDashboard');
const resetTenantFormButton = document.getElementById('resetTenantForm');
const selectedSpotCard = document.getElementById('selectedSpotCard');

function showFlash(message, isError = false) {
  const flash = document.createElement('div');
  flash.className = 'flash';
  flash.style.background = isError ? 'rgba(180, 66, 59, 0.95)' : 'rgba(31, 26, 23, 0.92)';
  flash.textContent = message;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 2800);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'No fue posible completar la accion.');
  }
  return data;
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(Number(value || 0));
}

function getSelectedSpot() {
  return state.dashboard?.spots.find((spot) => spot.id === state.selectedSpotId) || null;
}

function renderMetrics(metrics) {
  metricsContainer.innerHTML = '';
  const items = [
    ['Cajones activos', metrics.totalSpots],
    ['Pensionados activos', metrics.activePensionTenants],
    ['Deudores', metrics.debtors],
    ['Vehiculos dentro', metrics.activeEntries],
    ['Ingreso mensual', formatMoney(metrics.incomeThisMonth)]
  ];

  items.forEach(([label, value]) => {
    const card = document.getElementById('metricCardTemplate').content.firstElementChild.cloneNode(true);
    card.querySelector('.metric-label').textContent = label;
    card.querySelector('.metric-value').textContent = value;
    metricsContainer.appendChild(card);
  });
}

function renderStaticBlocks() {
  STATIC_BLOCKS.forEach((block) => {
    const element = document.createElement('div');
    element.className = block.className;
    element.style.left = `${block.x}%`;
    element.style.top = `${block.y}%`;
    element.style.width = `${block.w}%`;
    element.style.height = `${block.h}%`;
    element.textContent = block.text;
    parkingMap.appendChild(element);
  });
}

function buildSpotMeta(spot) {
  if (spot.currentState === 'salida') {
    return 'Solicitud de salida';
  }
  if (spot.currentState === 'ocupado') {
    return spot.tenant?.plate ? `${spot.tenant.plate} dentro` : 'Cajon ocupado';
  }
  return 'Cajon libre';
}

function renderSelectedSpot() {
  const spot = getSelectedSpot();
  if (!spot) {
    selectedSpotCard.innerHTML = '<p>Selecciona un cajon del mapa para administrarlo.</p>';
    return;
  }

  const stateLabel = spot.currentState === 'ocupado'
    ? 'Ocupado'
    : spot.currentState === 'salida'
      ? 'Salida solicitada'
      : 'Libre';

  selectedSpotCard.innerHTML = `
    <h3>Cajon ${spot.spotNumber}</h3>
    <p><strong>Estado:</strong> ${stateLabel}</p>
    <p><strong>Asignado a:</strong> ${spot.tenant?.fullName || spot.assignedName || 'Sin asignacion'}</p>
    <p><strong>Placa:</strong> ${spot.tenant?.plate || 'Sin placa registrada'}</p>
    <p><strong>Adeudo:</strong> ${spot.tenant ? formatMoney(spot.tenant.pendingAmount) : formatMoney(0)}</p>
    <p><strong>Acceso:</strong> ${spot.tenant?.accessEnabled ? 'Habilitado' : 'Sin acceso'}</p>
    <p><strong>Ultimo movimiento:</strong> ${spot.activeEntry ? new Date(spot.activeEntry.entryTime).toLocaleString('es-MX') : 'Sin registro activo'}</p>
  `;
}

function renderMap(spots) {
  parkingMap.innerHTML = '';
  renderStaticBlocks();

  spots.forEach((spot) => {
    const element = document.createElement('button');
    const orientation = spot.placement?.orientation || 'vertical';
    element.type = 'button';
    element.className = [
      'parking-spot',
      orientation,
      spot.currentState,
      state.selectedSpotId === spot.id ? 'selected' : ''
    ].join(' ');
    element.style.left = `${spot.placement?.x || 0}%`;
    element.style.top = `${spot.placement?.y || 0}%`;
    element.style.width = `${spot.placement?.w || 6}%`;
    element.style.height = `${spot.placement?.h || 10}%`;
    element.setAttribute('data-select-spot', String(spot.id));
    element.innerHTML = `
      <strong class="spot-number">${spot.spotNumber}</strong>
      <span class="spot-name">${spot.tenant?.fullName || spot.assignedName || 'Disponible'}</span>
      <span class="spot-meta">${buildSpotMeta(spot)}</span>
    `;
    parkingMap.appendChild(element);
  });

  renderSelectedSpot();
}

function renderRequests(entries) {
  requestsList.innerHTML = '';
  const requests = entries.filter((entry) => entry.status === 'solicitud_salida');

  if (!requests.length) {
    requestsList.innerHTML = '<div class="list-item"><p>No hay solicitudes pendientes.</p></div>';
    return;
  }

  requests.forEach((entry) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <h3>${entry.fullName || 'Sin nombre'} · ${entry.plate}</h3>
      <p>Entrada: ${new Date(entry.entryTime).toLocaleString('es-MX')}</p>
      <div class="actions-inline">
        <button type="button" data-complete-exit="${entry.id}">Autorizar salida</button>
      </div>
    `;
    requestsList.appendChild(item);
  });
}

function renderSpotOptions(availableSpots, currentSpotId = '') {
  spotSelect.innerHTML = '<option value="">Selecciona un cajon</option>';
  availableSpots.forEach((spot) => {
    const option = document.createElement('option');
    option.value = String(spot.id);
    option.textContent = `${spot.spotNumber} · ${spot.assignedName || 'Sin referencia'}`;
    spotSelect.appendChild(option);
  });
  spotSelect.value = currentSpotId ? String(currentSpotId) : '';
}

function renderTenants(tenants, availableSpots) {
  state.tenants = tenants;
  tenantsTable.innerHTML = '';

  tenants.filter((tenant) => tenant.status === 'activo').forEach((tenant) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${tenant.assignedSpotNumber || '-'}</td>
      <td>${tenant.fullName}</td>
      <td>${tenant.plate}</td>
      <td>${tenant.tenantType}</td>
      <td>${tenant.paymentMethod || '-'}</td>
      <td>${formatMoney(tenant.pendingAmount)}</td>
      <td><span class="status-pill ${tenant.isDebtor ? 'warn' : 'ok'}">${tenant.isDebtor ? 'Deudor' : 'Activo'}</span></td>
      <td>
        <div class="actions-inline">
          <button type="button" data-edit-tenant="${tenant.id}">Editar</button>
          <button type="button" data-pay-tenant="${tenant.id}">Registrar pago</button>
          <button type="button" data-delete-tenant="${tenant.id}">Eliminar</button>
        </div>
      </td>
    `;
    tenantsTable.appendChild(row);
  });

  renderSpotOptions(availableSpots);
}

function fillTenantForm(tenant, availableSpots) {
  tenantForm.tenantId.value = tenant.id;
  tenantForm.fullName.value = tenant.fullName;
  tenantForm.plate.value = tenant.plate;
  tenantForm.tenantType.value = tenant.tenantType;
  tenantForm.paymentMethod.value = tenant.paymentMethod || 'efectivo';
  tenantForm.pendingAmount.value = tenant.pendingAmount;
  tenantForm.notes.value = tenant.notes || '';

  const options = [...availableSpots];
  if (tenant.assignedSpotId && !options.find((spot) => spot.id === tenant.assignedSpotId)) {
    options.unshift({
      id: tenant.assignedSpotId,
      spotNumber: tenant.assignedSpotNumber,
      assignedName: tenant.fullName
    });
  }

  renderSpotOptions(options, tenant.assignedSpotId);
}

function clearTenantForm(availableSpots) {
  tenantForm.reset();
  tenantForm.tenantId.value = '';
  tenantForm.pendingAmount.value = 0;
  renderSpotOptions(availableSpots);
}

async function loadDashboard() {
  const [dashboard, tenantsPayload] = await Promise.all([
    api('/api/dashboard'),
    api('/api/tenants')
  ]);

  state.dashboard = dashboard;
  if (!state.selectedSpotId && dashboard.spots.length) {
    state.selectedSpotId = dashboard.spots[0].id;
  }
  if (state.selectedSpotId && !dashboard.spots.find((spot) => spot.id === state.selectedSpotId)) {
    state.selectedSpotId = dashboard.spots[0]?.id || null;
  }
  renderMetrics(dashboard.metrics);
  renderMap(dashboard.spots);
  renderRequests(dashboard.activeEntries);
  renderTenants(tenantsPayload.tenants, tenantsPayload.availableSpots);
}

tenantForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(tenantForm);
  const payload = Object.fromEntries(formData.entries());
  payload.pendingAmount = Number(payload.pendingAmount || 0);
  payload.accessEnabled = true;

  try {
    if (payload.tenantId) {
      await api(`/api/tenants/${payload.tenantId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showFlash('Inquilino actualizado.');
    } else {
      await api('/api/tenants', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showFlash('Inquilino registrado.');
    }

    await loadDashboard();
    clearTenantForm((await api('/api/tenants')).availableSpots);
  } catch (error) {
    showFlash(error.message, true);
  }
});

entryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(entryForm).entries());

  try {
    await api('/api/entries', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    entryForm.reset();
    showFlash('Entrada registrada correctamente.');
    await loadDashboard();
  } catch (error) {
    showFlash(error.message, true);
  }
});

refreshButton.addEventListener('click', () => {
  loadDashboard().catch((error) => showFlash(error.message, true));
});

resetTenantFormButton.addEventListener('click', async () => {
  const payload = await api('/api/tenants');
  clearTenantForm(payload.availableSpots);
});

document.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit-tenant]');
  const deleteButton = event.target.closest('[data-delete-tenant]');
  const payButton = event.target.closest('[data-pay-tenant]');
  const completeExitButton = event.target.closest('[data-complete-exit]');
  const selectSpotButton = event.target.closest('[data-select-spot]');
  const stateButton = event.target.closest('[data-spot-state]');
  const editId = editButton?.getAttribute('data-edit-tenant');
  const deleteId = deleteButton?.getAttribute('data-delete-tenant');
  const payId = payButton?.getAttribute('data-pay-tenant');
  const completeExitId = completeExitButton?.getAttribute('data-complete-exit');
  const selectSpotId = selectSpotButton?.getAttribute('data-select-spot');
  const targetState = stateButton?.getAttribute('data-spot-state');

  try {
    if (selectSpotId) {
      state.selectedSpotId = Number(selectSpotId);
      renderMap(state.dashboard.spots);
      return;
    }

    if (targetState) {
      const selectedSpot = getSelectedSpot();
      if (!selectedSpot) {
        showFlash('Selecciona primero un cajon.', true);
        return;
      }

      await api(`/api/spots/${selectedSpot.id}/state`, {
        method: 'PATCH',
        body: JSON.stringify({ state: targetState })
      });
      showFlash(`Cajon ${selectedSpot.spotNumber} actualizado a ${targetState}.`);
      await loadDashboard();
      return;
    }

    if (editId) {
      const tenantsPayload = await api('/api/tenants');
      const tenant = tenantsPayload.tenants.find((item) => item.id === Number(editId));
      fillTenantForm(tenant, tenantsPayload.availableSpots);
    }

    if (deleteId) {
      await api(`/api/tenants/${deleteId}`, { method: 'DELETE' });
      showFlash('Inquilino eliminado y cajon liberado.');
      await loadDashboard();
    }

    if (payId) {
      const amount = Number(window.prompt('Monto pagado', '800'));
      if (!Number.isNaN(amount) && amount > 0) {
        await api(`/api/tenants/${payId}/payment`, {
          method: 'POST',
          body: JSON.stringify({
            amount,
            paymentMethod: 'efectivo',
            concept: 'Pago registrado desde administrador'
          })
        });
        showFlash('Pago registrado.');
        await loadDashboard();
      }
    }

    if (completeExitId) {
      await api(`/api/entries/${completeExitId}/complete-exit`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      showFlash('Salida autorizada.');
      await loadDashboard();
    }
  } catch (error) {
    showFlash(error.message, true);
  }
});

loadDashboard().catch((error) => showFlash(error.message, true));