const path = require('path');
const express = require('express');
const crypto = require('crypto');
const { generatePaymentReceiptPdf } = require('./paymentReceipt');
const {
  getDashboardData,
  listTenants,
  listAvailableSpots,
  listRecentPayments,
  getPaymentById,
  getLatestPaidReceiptForTenant,
  getTenantReceiptStatus,
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
  getTenantCount,
  verifyAdminCredentials
} = require('./db');

const app = express();
const port = process.env.PORT || 3000;
const ADMIN_SESSION_COOKIE = 'sage_admin_session';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const TENANT_SESSION_COOKIE = 'sage_tenant_session';
const TENANT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const adminSessions = new Map();
const tenantSessions = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((cookies, pair) => {
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = pair.slice(0, separatorIndex);
      const value = decodeURIComponent(pair.slice(separatorIndex + 1));
      cookies[key] = value;
      return cookies;
    }, {});
}

function clearExpiredAdminSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of adminSessions.entries()) {
    if (expiresAt <= now) {
      adminSessions.delete(token);
    }
  }
}

function clearExpiredTenantSessions() {
  const now = Date.now();
  for (const [token, session] of tenantSessions.entries()) {
    if (session.expiresAt <= now) {
      tenantSessions.delete(token);
    }
  }
}

function createAdminSession() {
  clearExpiredAdminSessions();
  const token = crypto.randomUUID();
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return token;
}

function createTenantSession(tenant) {
  clearExpiredTenantSessions();
  const token = crypto.randomUUID();
  tenantSessions.set(token, {
    tenantId: tenant.id,
    fullName: tenant.fullName,
    plate: tenant.plate,
    expiresAt: Date.now() + TENANT_SESSION_TTL_MS
  });
  return token;
}

function getAdminSession(req) {
  clearExpiredAdminSessions();
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[ADMIN_SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const expiresAt = adminSessions.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return null;
  }

  return token;
}

function getTenantSession(req) {
  clearExpiredTenantSessions();
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[TENANT_SESSION_COOKIE];
  if (!token) {
    return null;
  }

  const session = tenantSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    tenantSessions.delete(token);
    return null;
  }

  return session;
}

function setAdminSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.floor(ADMIN_SESSION_TTL_MS / 1000)}; Path=/; HttpOnly; SameSite=Lax`);
}

function setTenantSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${TENANT_SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${Math.floor(TENANT_SESSION_TTL_MS / 1000)}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearAdminSessionCookie(res) {
  res.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}

function clearTenantSessionCookie(res) {
  res.setHeader('Set-Cookie', `${TENANT_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
}

function requireAdminSession(req, res, next) {
  const sessionToken = getAdminSession(req);
  if (!sessionToken) {
    res.status(401).json({ error: 'Acceso de administrador requerido.' });
    return;
  }

  next();
}

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

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: Boolean(getAdminSession(req)) });
});

app.post('/api/admin/login', (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '').trim();

    if (!verifyAdminCredentials({ username, password })) {
      throw new Error('Credenciales de administrador invalidas.');
    }

    const token = createAdminSession();
    setAdminSessionCookie(res, token);
    res.json({ ok: true, authenticated: true });
  } catch (error) {
    handleError(res, error);
  }
});

function requireTenantSession(req, res, next) {
  const tenantSession = getTenantSession(req);
  if (!tenantSession) {
    clearTenantSessionCookie(res);
    res.status(401).json({ error: 'Acceso de inquilino requerido.' });
    return;
  }

  req.tenantSession = tenantSession;
  next();
}

app.post('/api/admin/logout', (req, res) => {
  const sessionToken = getAdminSession(req);
  if (sessionToken) {
    adminSessions.delete(sessionToken);
  }

  clearAdminSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'estacionamiento-admin' });
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

    const token = createTenantSession(tenant);
    setTenantSessionCookie(res, token);
    res.json(tenant);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/access/receipt.pdf', requireTenantSession, async (req, res) => {
  try {
    const tenant = findTenantAccess({
      fullName: req.tenantSession.fullName,
      plate: req.tenantSession.plate
    });

    if (!tenant || !tenant.accessEnabled) {
      clearTenantSessionCookie(res);
      return res.status(401).json({ error: 'La sesion del inquilino ya no es valida.' });
    }

    const receiptStatus = getTenantReceiptStatus(tenant.id);

    if (!receiptStatus.eligible || !receiptStatus.receiptId) {
      return res.status(400).json({ error: receiptStatus.message || 'El comprobante solo esta disponible cuando la pension esta liquidada.' });
    }

    const latestReceipt = getPaymentById(receiptStatus.receiptId);
    await generatePaymentReceiptPdf(res, latestReceipt);
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

app.use('/api', requireAdminSession);

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

app.get('/api/payments', (_req, res) => {
  res.json({ payments: listRecentPayments() });
});

app.get('/api/payments/:id/receipt.pdf', async (req, res) => {
  try {
    const payment = getPaymentById(Number(req.params.id));

    if (!payment) {
      return res.status(404).json({ error: 'Pago no encontrado.' });
    }

    if (!payment.paidInFull || payment.tenantType !== 'pension') {
      return res.status(400).json({ error: 'Ese pago no genera comprobante de pension liquidada.' });
    }

    await generatePaymentReceiptPdf(res, payment);
  } catch (error) {
    handleError(res, error);
  }
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
    const result = createPayment({
      tenantId: Number(req.params.id),
      amount: Number(req.body.amount),
      paymentMethod: String(req.body.paymentMethod || 'efectivo'),
      concept: String(req.body.concept || 'Pago de pension'),
      paidMonth: String(req.body.paidMonth || '')
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

app.get('/api/tenants/:id/receipt-status', (req, res) => {
  try {
    res.json(getTenantReceiptStatus(Number(req.params.id)));
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

app.listen(port, () => {
  console.log(`Servidor disponible en http://localhost:${port}`);
});