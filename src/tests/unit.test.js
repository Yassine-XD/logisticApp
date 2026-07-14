// Pure-function unit tests (no DB required beyond the shared connection).
const { normalizeAlbRec, computeMetrics } = require("../services/demands.service");
const { assembleRequest } = require("../services/optimizer.service");
const { planGreedy } = require("../services/greedy.service");

describe("normalizeAlbRec → canonical Demand shape", () => {
  const raw = {
    codigo: 2221666,
    estadoCod: "EN_CURSO",
    estado: "Aceptada",
    kgSolicitadosEstimados: 858,
    lineasRecogidaManual: [{ unidadesSolicitadas: 100 }],
    codigoPgnu: "G0894045",
    nombrePgnu: "SUZUKI BAILÉN",
    telefonoPgnu: " 933771294 ",
    latitud: 41.35318,
    longitud: 2.07466,
    direccion: "C/ EDUARDO GIBERT, 50",
    codigoPostal: "08940",
    municipio: "Cornellà",
    provincia: "Barcelona",
    fechaPeticion: "2025-11-14T00:00:00",
    fechaMaxima: "2025-11-28T23:59:59",
  };

  it("maps SIGNUS fields to English canonical fields", () => {
    const d = normalizeAlbRec(raw);
    expect(d.signusId).toBe(2221666);
    expect(d.garageId).toBe("G0894045");
    expect(d.garageName).toBe("SUZUKI BAILÉN");
    expect(d.kg).toBe(858);
    expect(d.unitsRequested).toBe(100);
    // geo.lng must come from longitud (the historical bug was lng=lat)
    expect(d.geo.lat).toBeCloseTo(41.35318);
    expect(d.geo.lng).toBeCloseTo(2.07466);
    expect(d.estadoCod).toBe("EN_CURSO");
    expect(d.contactPhone).toBe("933771294");
    expect(d.requestedAt).toBeInstanceOf(Date);
    expect(d.deadlineAt).toBeInstanceOf(Date);
  });

  it("computeMetrics derives urgency relative to a reference date", () => {
    const deadlineAt = new Date();
    deadlineAt.setDate(deadlineAt.getDate() + 1); // 1 day out → urgent
    const m = computeMetrics({ deadlineAt, requestedAt: new Date(), kg: 1000 }, new Date());
    expect(m.daysToDeadline).toBeLessThanOrEqual(1.1);
    expect(m.priority).toBeGreaterThan(0);
  });
});

describe("optimizer.assembleRequest", () => {
  const settings = {
    depot: { lat: 41.72, lng: 1.82 },
    capacityTargetPct: 80,
    urgencyThresholdDays: 2,
    workdayLengthHours: 9,
    workdayStartHour: 8,
    maxToursPerDriver: 3,
  };
  const demands = [
    {
      signusId: 1,
      garageId: "G1",
      garageName: "T1",
      kg: 1000,
      geo: { lat: 41.7, lng: 1.8 },
      requestedAt: new Date(),
      deadlineAt: new Date(Date.now() + 3 * 864e5),
      ageDays: 2,
      daysToDeadline: 3,
      priority: 40,
      address: { city: "Manresa" },
    },
  ];
  const drivers = [
    { _id: "d1", name: "A", maxDailyTours: 3, vehicle: { _id: "v1", plate: "1-A", capacityKg: 8000 } },
  ];

  it("builds a well-formed engine request from Mongo data", () => {
    const req = assembleRequest({ demands, drivers, settings, planDate: new Date() });
    expect(req.garages).toHaveLength(1);
    expect(req.garages[0].geo).toEqual({ lat: 41.7, lng: 1.8 });
    expect(req.vehicles[0].capacityKg).toBe(8000);
    expect(req.drivers[0].vehicleId).toBe("v1");
    expect(req.warehouseLocation).toEqual({ lat: 41.72, lng: 1.82 });
    expect(req.minCapacityUtilization).toBeCloseTo(0.8);
    expect(req.urgencyThresholdDays).toBe(2);
    expect(req.driverTimeBudgetHours).toBe(9);
  });
});

describe("greedy fallback", () => {
  const settings = { urgencyThresholdDays: 2, maxToursPerDriver: 2 };
  const depot = { lat: 41.72, lng: 1.82 };
  const mkDemand = (i, kg) => ({
    _id: `x${i}`,
    signusId: i,
    garageId: `G${i}`,
    garageName: `T${i}`,
    kg,
    geo: { lat: 41.7 + i * 0.01, lng: 1.8 + i * 0.01 },
    daysToDeadline: 5,
    priority: 50,
    address: {},
  });

  it("fills each vehicle to its OWN capacity and never exceeds it", () => {
    const demands = Array.from({ length: 10 }, (_, i) => mkDemand(i + 1, 2000));
    const drivers = [
      { _id: "d1", name: "A", maxDailyTours: 2, vehicle: { _id: "v1", plate: "1-A", capacityKg: 8000 } },
    ];
    const res = planGreedy({ demands, drivers, depot, settings });
    expect(res.algorithm).toBe("greedy-fallback");
    for (const r of res.routes) {
      expect(r.totalKg).toBeLessThanOrEqual(r.capacityKg);
      expect(r.capacityKg).toBe(8000);
    }
    // 2 tours × 8000 = 16000 capacity → 8 of 10 demands (20000kg) assigned
    const assigned = res.routes.reduce((s, r) => s + r.stops.length, 0);
    expect(assigned).toBe(8);
    expect(res.unassigned).toHaveLength(2);
  });
});
