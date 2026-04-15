const accessForm = document.getElementById('accessForm');
const tenantPanel = document.getElementById('tenantPanel');
const tenantSummary = document.getElementById('tenantSummary');
const exitRequestForm = document.getElementById('exitRequestForm');

let currentTenant = null;

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

function renderTenant(tenant) {
  tenantSummary.innerHTML = `
    <p><strong>Nombre:</strong> ${tenant.fullName}</p>
    <p><strong>Placa:</strong> ${tenant.plate}</p>
    <p><strong>Cajon:</strong> ${tenant.assignedSpotNumber || 'Sin asignar'}</p>
    <p><strong>Metodo de pago:</strong> ${tenant.paymentMethod || 'Sin definir'}</p>
    <p><strong>Adeudo pendiente:</strong> ${formatMoney(tenant.pendingAmount)}</p>
    <p><strong>Estado:</strong> ${tenant.isDebtor ? 'Deudor' : 'Al corriente'}</p>
  `;
  tenantPanel.classList.remove('hidden');
}

accessForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(accessForm).entries());
  payload.plate = String(payload.plate || '').toUpperCase();

  try {
    currentTenant = await api('/api/access/login', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    renderTenant(currentTenant);
    showFlash('Acceso validado.');
  } catch (error) {
    showFlash(error.message, true);
  }
});

exitRequestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentTenant) {
    showFlash('Primero debes iniciar sesion.', true);
    return;
  }

  try {
    await api('/api/entries/request-exit', {
      method: 'POST',
      body: JSON.stringify({
        fullName: currentTenant.fullName,
        plate: currentTenant.plate
      })
    });
    showFlash('Solicitud enviada al administrador.');
  } catch (error) {
    showFlash(error.message, true);
  }
});