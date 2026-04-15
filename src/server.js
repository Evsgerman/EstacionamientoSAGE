const path = require('path');
const express = require('express');
const {
  getDashboardData,
  listTenants,
  listAvailableSpots,
  createTenant,
  updateTenant,
  removeTenant,
  createPayment,
  createOrUpdateDebt,
  registerEntry,
  requestExit,
  completeExit,
  setSpotState,
  findTenantAccess,
  getTenantCount
} = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function normalizeTenantPayload(body, existing = {}) {
  const tenantType = body.tenantType === 'temporal' ? 'temporal' : 'pension';
  const pendingAmount = Number(body.pendingAmount || 0);
  const fallbackPaymentMethod = tenantType === 'pension' ? 'efectivo' : 'n/a';

  return {
    full_name: String(body.fullName || existing.fullName || '').trim(),
    plate: String(body.plate || existing.plate || '').trim().toUpperCase(),
    tenant_type: tenantType,
    payment_method: String(body.paymentMethod || existing.paymentMethod || fallbackPaymentMethod),
    monthly_fee: tenantType === 'pension' ? 800 : 50,
    pending_amount: pendingAmount,
    is_debtor: pendingAmount > 0 ? 1 : 0,
    assigned_spot_id: body.assignedSpotId ? Number(body.assignedSpotId) : existing.assignedSpotId || null,
    access_enabled: body.accessEnabled === false ? 0 : 1,
    notes: String(body.notes || existing.notes || '').trim()
  };
}

function handleError(res, error) {
  res.status(400).json({ error: error.message || 'Ocurrio un error inesperado.' });
}

app.get('/api/dashboard', (_req, res) => {
  res.json(getDashboardData());
});

app.get('/api/tenants', (_req, res) => {
  res.json({
    totalActive: getTenantCount(),
    availableSpots: listAvailableSpots(),
    tenants: listTenants()
  });
});

app.post('/api/tenants', (req, res) => {
  try {
    const payload = normalizeTenantPayload(req.body);
    if (!payload.full_name || !payload.plate) {
      throw new Error('Nombre y placa son obligatorios.');
    }
    if (payload.tenant_type === 'pension' && !payload.assigned_spot_id) {
      throw new Error('Debes asignar un cajon fijo a la pension.');
    }
    const tenant = createTenant(payload);
    res.status(201).json(tenant);
  } catch (error) {
    handleError(res, error);
  }
});

app.put('/api/tenants/:id', (req, res) => {
  try {
    const existing = listTenants().find((tenant) => tenant.id === Number(req.params.id));
    if (!existing) {
      throw new Error('Inquilino no encontrado.');
    }
    const tenant = updateTenant(Number(req.params.id), {
      ...normalizeTenantPayload(req.body, existing),
      assigned_spot_id: existing.assignedSpotId || null
    });
    res.json(tenant);
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/tenants/:id', (req, res) => {
  try {
    removeTenant(Number(req.params.id));
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/tenants/:id/payment', (req, res) => {
  try {
    const tenant = createPayment({
      tenantId: Number(req.params.id),
      amount: Number(req.body.amount),
      paymentMethod: String(req.body.paymentMethod || 'efectivo'),
      concept: String(req.body.concept || 'Pago de pension')
    });
    res.json(tenant);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/tenants/:id/debt', (req, res) => {
  try {
    const tenant = createOrUpdateDebt({
      tenantId: Number(req.params.id),
      pendingAmount: Number(req.body.pendingAmount || 0),
      paymentMethod: String(req.body.paymentMethod || 'efectivo')
    });
    res.json(tenant);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/entries', (req, res) => {
  try {
    const entry = registerEntry({
      plate: String(req.body.plate || '').trim().toUpperCase(),
      fullName: String(req.body.fullName || '').trim(),
      entryType: req.body.entryType === 'temporal' ? 'temporal' : 'pension'
    });
    res.status(201).json(entry);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/entries/request-exit', (req, res) => {
  try {
    const entry = requestExit({
      plate: String(req.body.plate || '').trim().toUpperCase(),
      fullName: String(req.body.fullName || '').trim()
    });
    res.json(entry);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/entries/:id/complete-exit', (req, res) => {
  try {
    const entry = completeExit(Number(req.params.id));
    res.json(entry);
  } catch (error) {
    handleError(res, error);
  }
});

app.patch('/api/spots/:id/state', (req, res) => {
  try {
    const nextState = String(req.body.state || '').trim().toLowerCase();
    if (!['libre', 'ocupado', 'salida'].includes(nextState)) {
      throw new Error('Estado de cajon invalido.');
    }

    const spot = setSpotState(Number(req.params.id), nextState);
    res.json(spot);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/access/login', (req, res) => {
  try {
    const tenant = findTenantAccess({
      fullName: String(req.body.fullName || '').trim(),
      plate: String(req.body.plate || '').trim().toUpperCase()
    });

    if (!tenant || !tenant.accessEnabled) {
      throw new Error('Acceso invalido. Verifica nombre y placa.');
    }

    res.json(tenant);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'estacionamiento-admin' });
});

app.listen(port, () => {
  console.log(`Servidor disponible en http://localhost:${port}`);
});