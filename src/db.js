const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const parkingLayout = require('./parkingLayout');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dataDir, 'estacionamiento.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
  if (!columns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS parking_spots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spot_number INTEGER NOT NULL UNIQUE,
    zone TEXT NOT NULL,
    assigned_name TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    current_state TEXT NOT NULL DEFAULT 'libre',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    plate TEXT NOT NULL UNIQUE,
    tenant_type TEXT NOT NULL CHECK(tenant_type IN ('pension', 'temporal')),
    payment_method TEXT,
    monthly_fee REAL NOT NULL DEFAULT 0,
    pending_amount REAL NOT NULL DEFAULT 0,
    is_debtor INTEGER NOT NULL DEFAULT 0,
    assigned_spot_id INTEGER,
    access_enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'activo' CHECK(status IN ('activo', 'inactivo')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_spot_id) REFERENCES parking_spots(id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    concept TEXT NOT NULL,
    paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );

  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER,
    visitor_name TEXT,
    plate TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK(entry_type IN ('pension', 'temporal')),
    entry_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    exit_time TEXT,
    rate_applied REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'adentro' CHECK(status IN ('adentro', 'fuera', 'solicitud_salida')),
    admin_notified INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  );
`);

ensureColumn('parking_spots', 'current_state', "current_state TEXT NOT NULL DEFAULT 'libre'");
db.exec("UPDATE parking_spots SET current_state = 'libre' WHERE current_state IS NULL OR current_state = '';");

const parkingLayoutMap = new Map(parkingLayout.map((spot) => [spot.spotNumber, spot]));

const insertSpot = db.prepare(`
  INSERT OR IGNORE INTO parking_spots (spot_number, zone, assigned_name)
  VALUES (@spotNumber, @zone, @assignedName)
`);

const insertTenant = db.prepare(`
  INSERT OR IGNORE INTO tenants (
    full_name,
    plate,
    tenant_type,
    payment_method,
    monthly_fee,
    pending_amount,
    is_debtor,
    assigned_spot_id,
    notes
  ) VALUES (
    @full_name,
    @plate,
    'pension',
    @payment_method,
    800,
    @pending_amount,
    @is_debtor,
    @assigned_spot_id,
    @notes
  )
`);

function seed() {
  db.exec('BEGIN');

  try {
    parkingLayout.forEach((spot) => {
      insertSpot.run({
        spotNumber: spot.spotNumber,
        zone: spot.zone,
        assignedName: spot.assignedName
      });
    });

    const count = db.prepare('SELECT COUNT(*) AS total FROM tenants').get().total;
    if (count === 0) {
      const seeded = db.prepare('SELECT id, spot_number, assigned_name FROM parking_spots ORDER BY spot_number').all();

      seeded.forEach((spot) => {
        insertTenant.run({
          full_name: spot.assigned_name,
          plate: `PEN-${String(spot.spot_number).padStart(3, '0')}`,
          payment_method: 'efectivo',
          pending_amount: 0,
          is_debtor: 0,
          assigned_spot_id: spot.id,
          notes: 'Registro inicial desde layout del estacionamiento.'
        });
      });
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

seed();

function mapTenant(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fullName: row.full_name,
    plate: row.plate,
    tenantType: row.tenant_type,
    paymentMethod: row.payment_method,
    monthlyFee: row.monthly_fee,
    pendingAmount: row.pending_amount,
    isDebtor: Boolean(row.is_debtor),
    assignedSpotId: row.assigned_spot_id,
    assignedSpotNumber: row.spot_number,
    accessEnabled: Boolean(row.access_enabled),
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function updateSpotVisualState(spotId, state) {
  db.prepare(`
    UPDATE parking_spots
    SET current_state = ?
    WHERE id = ?
  `).run(state, spotId);
}

function getSpotRecord(spotId) {
  return db.prepare(`
    SELECT
      ps.id,
      ps.spot_number,
      ps.zone,
      ps.assigned_name,
      ps.current_state,
      t.id AS tenant_id,
      t.full_name,
      t.plate,
      t.tenant_type,
      t.pending_amount,
      t.is_debtor,
      t.access_enabled,
      t.status
    FROM parking_spots ps
    LEFT JOIN tenants t ON t.assigned_spot_id = ps.id AND t.status = 'activo'
    WHERE ps.id = ?
  `).get(spotId);
}

function getActiveEntryByTenantId(tenantId) {
  return db.prepare(`
    SELECT *
    FROM entries
    WHERE tenant_id = ? AND status IN ('adentro', 'solicitud_salida')
    ORDER BY entry_time DESC
    LIMIT 1
  `).get(tenantId);
}

function getDashboardData() {
  const spots = db.prepare(`
    SELECT
      ps.id,
      ps.spot_number,
      ps.zone,
      ps.assigned_name,
      ps.is_active,
      t.id AS tenant_id,
      t.full_name,
      t.plate,
      t.tenant_type,
      t.payment_method,
      t.pending_amount,
      t.is_debtor,
      t.access_enabled,
      t.status
    FROM parking_spots ps
    LEFT JOIN tenants t ON t.assigned_spot_id = ps.id AND t.status = 'activo'
    ORDER BY ps.spot_number ASC
  `).all();

  const activeEntries = db.prepare(`
    SELECT e.*, t.full_name, t.assigned_spot_id
    FROM entries e
    LEFT JOIN tenants t ON t.id = e.tenant_id
    WHERE e.status IN ('adentro', 'solicitud_salida')
    ORDER BY e.entry_time DESC
  `).all();

  const activeEntryBySpotId = new Map(
    activeEntries
      .filter((entry) => entry.assigned_spot_id)
      .map((entry) => [
        entry.assigned_spot_id,
        {
          id: entry.id,
          plate: entry.plate,
          status: entry.status,
          entryTime: entry.entry_time,
          entryType: entry.entry_type,
          totalAmount: entry.total_amount
        }
      ])
  );

  const metrics = {
    totalSpots: db.prepare('SELECT COUNT(*) AS total FROM parking_spots WHERE is_active = 1').get().total,
    activePensionTenants: db.prepare("SELECT COUNT(*) AS total FROM tenants WHERE tenant_type = 'pension' AND status = 'activo'").get().total,
    debtors: db.prepare("SELECT COUNT(*) AS total FROM tenants WHERE is_debtor = 1 AND status = 'activo'").get().total,
    activeEntries: activeEntries.length,
    incomeThisMonth: db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payments
      WHERE strftime('%Y-%m', paid_at) = strftime('%Y-%m', 'now', 'localtime')
    `).get().total
  };

  return {
    metrics,
    spots: spots.map((spot) => ({
      ...(parkingLayoutMap.get(spot.spot_number)?.placement ? { placement: parkingLayoutMap.get(spot.spot_number).placement } : {}),
      id: spot.id,
      spotNumber: spot.spot_number,
      zone: spot.zone,
      assignedName: spot.assigned_name,
      isActive: Boolean(spot.is_active),
      currentState: activeEntryBySpotId.has(spot.id)
        ? (activeEntryBySpotId.get(spot.id).status === 'solicitud_salida' ? 'salida' : 'ocupado')
        : (spot.current_state || 'libre'),
      activeEntry: activeEntryBySpotId.get(spot.id) || null,
      tenant: spot.tenant_id ? {
        id: spot.tenant_id,
        fullName: spot.full_name,
        plate: spot.plate,
        tenantType: spot.tenant_type,
        paymentMethod: spot.payment_method,
        pendingAmount: spot.pending_amount,
        isDebtor: Boolean(spot.is_debtor),
        accessEnabled: Boolean(spot.access_enabled),
        status: spot.status
      } : null
    })),
    activeEntries: activeEntries.map((entry) => ({
      id: entry.id,
      tenantId: entry.tenant_id,
      fullName: entry.full_name || entry.visitor_name,
      plate: entry.plate,
      entryType: entry.entry_type,
      entryTime: entry.entry_time,
      exitTime: entry.exit_time,
      rateApplied: entry.rate_applied,
      totalAmount: entry.total_amount,
      status: entry.status,
      adminNotified: Boolean(entry.admin_notified)
    }))
  };
}

function listTenants() {
  return db.prepare(`
    SELECT t.*, ps.spot_number
    FROM tenants t
    LEFT JOIN parking_spots ps ON ps.id = t.assigned_spot_id
    ORDER BY t.status ASC, ps.spot_number ASC, t.full_name ASC
  `).all().map(mapTenant);
}

function listAvailableSpots() {
  return db.prepare(`
    SELECT ps.id, ps.spot_number, ps.assigned_name
    FROM parking_spots ps
    LEFT JOIN tenants t ON t.assigned_spot_id = ps.id AND t.status = 'activo'
    WHERE ps.is_active = 1 AND t.id IS NULL
    ORDER BY ps.spot_number ASC
  `).all().map((row) => ({
    id: row.id,
    spotNumber: row.spot_number,
    assignedName: row.assigned_name
  }));
}

function mapPayment(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    tenantName: row.full_name,
    plate: row.plate,
    amount: row.amount,
    paymentMethod: row.payment_method,
    concept: row.concept,
    paidAt: row.paid_at
  };
}

function listRecentPayments(limit = 10) {
  return db.prepare(`
    SELECT p.*, t.full_name, t.plate
    FROM payments p
    JOIN tenants t ON t.id = p.tenant_id
    ORDER BY p.paid_at DESC, p.id DESC
    LIMIT ?
  `).all(limit).map(mapPayment);
}

function getTenantCount() {
  return db.prepare("SELECT COUNT(*) AS total FROM tenants WHERE status = 'activo'").get().total;
}

function createTenant(payload) {
  if (getTenantCount() >= 50) {
    throw new Error('Se alcanzo el maximo de 50 vehiculos activos.');
  }

  if (payload.tenant_type === 'pension' && payload.assigned_spot_id) {
    const occupiedSpot = db.prepare(`
      SELECT id
      FROM tenants
      WHERE assigned_spot_id = ? AND status = 'activo'
    `).get(payload.assigned_spot_id);

    if (occupiedSpot) {
      throw new Error('Ese cajon fijo ya tiene una pension activa.');
    }
  }

  const insert = db.prepare(`
    INSERT INTO tenants (
      full_name,
      plate,
      tenant_type,
      payment_method,
      monthly_fee,
      pending_amount,
      is_debtor,
      assigned_spot_id,
      access_enabled,
      notes,
      updated_at
    ) VALUES (
      @full_name,
      @plate,
      @tenant_type,
      @payment_method,
      @monthly_fee,
      @pending_amount,
      @is_debtor,
      @assigned_spot_id,
      @access_enabled,
      @notes,
      CURRENT_TIMESTAMP
    )
  `);

  const result = insert.run(payload);
  return getTenantById(result.lastInsertRowid);
}

function getTenantById(id) {
  const row = db.prepare(`
    SELECT t.*, ps.spot_number
    FROM tenants t
    LEFT JOIN parking_spots ps ON ps.id = t.assigned_spot_id
    WHERE t.id = ?
  `).get(id);
  return mapTenant(row);
}

function updateTenant(id, payload) {
  const update = db.prepare(`
    UPDATE tenants SET
      full_name = @full_name,
      plate = @plate,
      tenant_type = @tenant_type,
      payment_method = @payment_method,
      monthly_fee = @monthly_fee,
      pending_amount = @pending_amount,
      is_debtor = @is_debtor,
      assigned_spot_id = @assigned_spot_id,
      access_enabled = @access_enabled,
      notes = @notes,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);

  update.run({ ...payload, id });
  return getTenantById(id);
}

function removeTenant(id) {
  db.prepare(`
    UPDATE tenants
    SET status = 'inactivo', access_enabled = 0, assigned_spot_id = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
}

function createPayment({ tenantId, amount, paymentMethod, concept }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('El monto del pago debe ser mayor a cero.');
  }

  const tenant = db.prepare(`
    SELECT id, status
    FROM tenants
    WHERE id = ?
  `).get(tenantId);

  if (!tenant || tenant.status !== 'activo') {
    throw new Error('Inquilino no encontrado para registrar el pago.');
  }

  db.exec('BEGIN');

  try {
    const result = db.prepare(`
      INSERT INTO payments (tenant_id, amount, payment_method, concept)
      VALUES (?, ?, ?, ?)
    `).run(tenantId, amount, paymentMethod, concept);

    db.prepare(`
      UPDATE tenants
      SET pending_amount = MAX(0, pending_amount - ?),
          is_debtor = CASE WHEN MAX(0, pending_amount - ?) > 0 THEN 1 ELSE 0 END,
          payment_method = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(amount, amount, paymentMethod, tenantId);

    db.exec('COMMIT');

    return {
      payment: mapPayment(db.prepare(`
        SELECT p.*, t.full_name, t.plate
        FROM payments p
        JOIN tenants t ON t.id = p.tenant_id
        WHERE p.id = ?
      `).get(result.lastInsertRowid)),
      tenant: getTenantById(tenantId)
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function createOrUpdateDebt({ tenantId, pendingAmount, paymentMethod }) {
  db.prepare(`
    UPDATE tenants
    SET pending_amount = ?,
        is_debtor = CASE WHEN ? > 0 THEN 1 ELSE 0 END,
        payment_method = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(pendingAmount, pendingAmount, paymentMethod, tenantId);

  return getTenantById(tenantId);
}

function registerEntry({ plate, fullName, entryType }) {
  const existingEntry = db.prepare(`
    SELECT id
    FROM entries
    WHERE plate = ? AND status IN ('adentro', 'solicitud_salida')
    ORDER BY entry_time DESC
    LIMIT 1
  `).get(plate);

  if (existingEntry) {
    throw new Error('Esa placa ya tiene una entrada activa.');
  }

  let tenant = db.prepare(`
    SELECT t.*, ps.spot_number
    FROM tenants t
    LEFT JOIN parking_spots ps ON ps.id = t.assigned_spot_id
    WHERE t.plate = ? AND t.access_enabled = 1 AND t.status = 'activo'
  `).get(plate);

  if (entryType === 'pension' && !tenant) {
    throw new Error('No existe un inquilino activo con esa placa o el acceso esta deshabilitado.');
  }

  const rateApplied = entryType === 'pension' ? 800 : 50;
  const result = db.prepare(`
    INSERT INTO entries (tenant_id, visitor_name, plate, entry_type, rate_applied, total_amount)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(tenant ? tenant.id : null, tenant ? null : fullName, plate, entryType, rateApplied);

  if (tenant?.assigned_spot_id) {
    updateSpotVisualState(tenant.assigned_spot_id, 'ocupado');
  }

  return db.prepare('SELECT * FROM entries WHERE id = ?').get(result.lastInsertRowid);
}

function requestExit({ plate, fullName }) {
  const entry = db.prepare(`
    SELECT e.*, t.full_name
    FROM entries e
    LEFT JOIN tenants t ON t.id = e.tenant_id
    WHERE e.plate = ? AND e.status = 'adentro'
    ORDER BY e.entry_time DESC
    LIMIT 1
  `).get(plate);

  if (!entry) {
    throw new Error('No hay un registro de entrada activo para esa placa.');
  }

  db.prepare(`
    UPDATE entries
    SET status = 'solicitud_salida', admin_notified = 1, visitor_name = COALESCE(visitor_name, ?)
    WHERE id = ?
  `).run(fullName || null, entry.id);

  if (entry.tenant_id) {
    const tenant = db.prepare('SELECT assigned_spot_id FROM tenants WHERE id = ?').get(entry.tenant_id);
    if (tenant?.assigned_spot_id) {
      updateSpotVisualState(tenant.assigned_spot_id, 'salida');
    }
  }

  return db.prepare('SELECT * FROM entries WHERE id = ?').get(entry.id);
}

function completeExit(entryId) {
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId);
  if (!entry) {
    throw new Error('Registro de salida no encontrado.');
  }

  const totalAmount = entry.entry_type === 'temporal' ? 50 : 0;

  db.prepare(`
    UPDATE entries
    SET status = 'fuera', exit_time = CURRENT_TIMESTAMP, total_amount = ?
    WHERE id = ?
  `).run(totalAmount, entryId);

  if (entry.tenant_id) {
    const tenant = db.prepare('SELECT assigned_spot_id FROM tenants WHERE id = ?').get(entry.tenant_id);
    if (tenant?.assigned_spot_id) {
      updateSpotVisualState(tenant.assigned_spot_id, 'libre');
    }
  }

  return db.prepare('SELECT * FROM entries WHERE id = ?').get(entryId);
}

function setSpotState(spotId, nextState) {
  const spot = getSpotRecord(spotId);
  if (!spot) {
    throw new Error('Cajon no encontrado.');
  }

  const activeEntry = spot.tenant_id ? getActiveEntryByTenantId(spot.tenant_id) : null;

  if (nextState === 'ocupado') {
    if (activeEntry && activeEntry.status === 'solicitud_salida') {
      db.prepare(`
        UPDATE entries
        SET status = 'adentro', admin_notified = 0
        WHERE id = ?
      `).run(activeEntry.id);
    } else if (!activeEntry && spot.tenant_id) {
      registerEntry({
        plate: spot.plate,
        fullName: spot.full_name,
        entryType: spot.tenant_type
      });
    }

    updateSpotVisualState(spotId, 'ocupado');
  }

  if (nextState === 'salida') {
    if (activeEntry && activeEntry.status === 'adentro') {
      requestExit({ plate: spot.plate, fullName: spot.full_name });
    } else if (!activeEntry && spot.tenant_id) {
      registerEntry({
        plate: spot.plate,
        fullName: spot.full_name,
        entryType: spot.tenant_type
      });
      requestExit({ plate: spot.plate, fullName: spot.full_name });
    } else {
      updateSpotVisualState(spotId, 'salida');
    }
  }

  if (nextState === 'libre') {
    if (activeEntry) {
      completeExit(activeEntry.id);
    }
    updateSpotVisualState(spotId, 'libre');
  }

  return getDashboardData().spots.find((item) => item.id === spotId);
}

function findTenantAccess({ fullName, plate }) {
  const row = db.prepare(`
    SELECT t.*, ps.spot_number
    FROM tenants t
    LEFT JOIN parking_spots ps ON ps.id = t.assigned_spot_id
    WHERE lower(t.full_name) = lower(?) AND upper(t.plate) = upper(?) AND t.status = 'activo'
  `).get(fullName, plate);

  return mapTenant(row);
}

module.exports = {
  db,
  getDashboardData,
  listTenants,
  listAvailableSpots,
  listRecentPayments,
  createTenant,
  getTenantById,
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
};